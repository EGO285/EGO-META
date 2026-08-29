/* =========================================================================
   EGO-META — Couche d'accès aux données (wrapper Supabase)
   Toutes les fonctions retournent { data, error } ou lèvent via toast().
   ========================================================================= */

/* ---------------- AUTH ---------------- */

async function authSignUp(email, password, username, displayName, inviteCode) {
  // Pré-vérification côté client : juste pour un message d'erreur rapide et agréable.
  // La VRAIE vérification (sécurité) se fait côté serveur, dans le trigger de création
  // de compte, à partir du invite_code transmis ci-dessous dans les métadonnées —
  // un code manquant ou invalide met désormais le compte en attente d'activation
  // automatiquement (voir activateAccountWithInvite), impossible à contourner en
  // appelant l'API directement.
  const valid = await authValidateInvite(inviteCode);
  if (!valid) return { error: { message: "Code d'invitation invalide ou expiré." } };

  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { username, display_name: displayName, invite_code: inviteCode } }
  });
  return { data, error };
}

// Connexion via un fournisseur OAuth (Google, GitHub...). Les comptes créés ainsi
// n'ont pas pu transmettre de code d'invitation au moment de la création (limite
// technique des fournisseurs OAuth) — ils démarrent donc "en attente d'activation"
// et doivent appeler activateAccountWithInvite() juste après leur première connexion.
async function authSignInWithOAuth(provider) {
  return await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

async function activateAccountWithInvite(code) {
  const { error } = await sb.rpc('activate_account_with_invite', { p_code: code });
  if (error) return { error };
  return { data: true };
}

async function authValidateInvite(code) {
  if (!code) return false;
  const { data } = await sb.from('invite_codes').select('*').eq('code', code).maybeSingle();
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  if (data.uses >= data.max_uses) return false;
  return true;
}

async function authRedeemPendingInviteIfAny() {
  const code = localStorage.getItem('ego_pending_invite');
  if (code) {
    await sb.rpc('redeem_invite_code', { p_code: code });
    localStorage.removeItem('ego_pending_invite');
  }
}

async function authSignIn(email, password) {
  return await sb.auth.signInWithPassword({ email, password });
}

async function authSignOut() {
  await sb.auth.signOut();
}

async function authResetPassword(email) {
  return await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
}

async function authUpdatePassword(newPassword) {
  return await sb.auth.updateUser({ password: newPassword });
}

/* ---------------- PROFILE ---------------- */

async function getMyProfile() {
  const { data: sess } = await sb.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', uid).single();
  return data;
}

async function getProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  return data;
}

async function updateMyProfile(fields) {
  const me = await getMyProfile();
  const { data, error } = await sb.from('profiles').update(fields).eq('id', me.id).select().single();
  if (error) toast('Erreur : ' + error.message, 'error');
  return { data, error };
}

async function searchProfiles(query) {
  if (!query || query.length < 2) return [];
  const { data } = await sb.from('profiles')
    .select('*')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(20);
  return data || [];
}

async function uploadAvatar(file) {
  const me = await getMyProfile();
  const ext = file.name.split('.').pop();
  const path = `${me.id}/avatar_${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
  if (upErr) { toast('Échec envoi photo : ' + upErr.message, 'error'); return null; }
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  await updateMyProfile({ avatar_url: data.publicUrl });
  return data.publicUrl;
}

async function uploadAttachment(file) {
  const me = await getMyProfile();
  const ext = file.name.split('.').pop();
  const path = `${me.id}/${Date.now()}_${randHex(4)}.${ext}`;
  const { error: upErr } = await sb.storage.from('attachments').upload(path, file);
  if (upErr) { toast('Échec envoi fichier : ' + upErr.message, 'error'); return null; }
  const { data } = sb.storage.from('attachments').getPublicUrl(path);
  return { url: data.publicUrl, type: file.type };
}

/* ---------------- CONVERSATIONS (liste unifiée) ---------------- */

async function listMyConversations() {
  const me = await getMyProfile();
  const { data, error } = await sb
    .from('conversation_members')
    .select(`
      conversation_id, last_read_at, muted, muted_until, pinned, archived, role,
      conversations ( id, type, created_at )
    `)
    .eq('user_id', me.id);
  if (error) { console.error(error); return []; }
  return data || [];
}

async function listDMs() {
  const rows = await listMyConversations();
  const dmRows = rows.filter(r => r.conversations?.type === 'dm' && !r.archived);
  const me = await getMyProfile();
  const results = [];
  for (const row of dmRows) {
    const { data: members } = await sb.from('conversation_members')
      .select('user_id, profiles(*)')
      .eq('conversation_id', row.conversation_id);
    const other = (members || []).find(m => m.user_id !== me.id);
    if (!other) continue;
    const lastMsg = await getLastMessage(row.conversation_id);
    const unread = await countUnread(row.conversation_id, row.last_read_at);
    results.push({ conversation_id: row.conversation_id, other: other.profiles, lastMsg, unread, muted: row.muted, pinned: row.pinned });
  }
  results.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.lastMsg?.created_at || 0) - new Date(a.lastMsg?.created_at || 0)));
  return results;
}

async function listGroups() {
  const rows = await listMyConversations();
  const groupRows = rows.filter(r => r.conversations?.type === 'group' && !r.archived);
  const results = [];
  for (const row of groupRows) {
    const { data: group } = await sb.from('groups').select('*').eq('conversation_id', row.conversation_id).single();
    if (!group) continue;
    const lastMsg = await getLastMessage(row.conversation_id);
    const unread = await countUnread(row.conversation_id, row.last_read_at);
    results.push({ conversation_id: row.conversation_id, group, lastMsg, unread, role: row.role, muted: row.muted, pinned: row.pinned });
  }
  results.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.lastMsg?.created_at || 0) - new Date(a.lastMsg?.created_at || 0)));
  return results;
}

/* ---------------- CONVERSATIONS ARCHIVÉES (v3) ---------------- */

// Archive/désarchive une conversation (DM ou groupe) pour l'utilisateur courant
// uniquement — n'affecte pas les autres membres. Une conversation archivée disparaît
// de la liste principale (listDMs/listGroups) mais reste ouvrable normalement.
async function setConversationArchived(conversationId, archived) {
  const me = await getMyProfile();
  const { error } = await sb.from('conversation_members').update({ archived }).eq('conversation_id', conversationId).eq('user_id', me.id);
  if (error) toast(error.message, 'error');
}

async function getConversationType(conversationId) {
  const { data } = await sb.from('conversations').select('type').eq('id', conversationId).maybeSingle();
  return data?.type || null;
}

async function getChannelByConversationId(conversationId) {
  const { data } = await sb.from('channels').select('id, community_id').eq('conversation_id', conversationId).maybeSingle();
  return data;
}

async function listArchivedConversations() {
  const rows = await listMyConversations();
  const archivedRows = rows.filter(r => r.archived && (r.conversations?.type === 'dm' || r.conversations?.type === 'group'));
  const me = await getMyProfile();
  const results = [];
  for (const row of archivedRows) {
    const lastMsg = await getLastMessage(row.conversation_id);
    if (row.conversations?.type === 'dm') {
      const { data: members } = await sb.from('conversation_members').select('user_id, profiles(*)').eq('conversation_id', row.conversation_id);
      const other = (members || []).find(m => m.user_id !== me.id);
      if (!other) continue;
      results.push({ conversation_id: row.conversation_id, kind: 'dm', other: other.profiles, lastMsg });
    } else {
      const { data: group } = await sb.from('groups').select('*').eq('conversation_id', row.conversation_id).single();
      if (!group) continue;
      results.push({ conversation_id: row.conversation_id, kind: 'group', group, lastMsg });
    }
  }
  results.sort((a, b) => new Date(b.lastMsg?.created_at || 0) - new Date(a.lastMsg?.created_at || 0));
  return results;
}

async function getLastMessage(conversationId) {
  const { data } = await sb.from('messages')
    .select('content, created_at, sender_id, deleted')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function countUnread(conversationId, lastReadAt) {
  const { count } = await sb.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .gt('created_at', lastReadAt || '1970-01-01');
  return count || 0;
}

async function markRead(conversationId) {
  await sb.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

async function createDM(otherUserId) {
  const { data, error } = await sb.rpc('create_dm', { p_other_user: otherUserId });
  if (error) { toast(error.message, 'error'); return null; }
  return data;
}

async function leaveConversation(conversationId) {
  const { error } = await sb.rpc('leave_conversation', { p_conversation_id: conversationId });
  if (error) toast(error.message, 'error'); else toast('Conversation quittée');
}

// Épingler/désépingler une conversation en haut de sa propre liste
async function togglePinConversation(conversationId, pinned) {
  const me = await getMyProfile();
  const { error } = await sb.from('conversation_members').update({ pinned }).eq('conversation_id', conversationId).eq('user_id', me.id);
  if (error) toast(error.message, 'error');
}

// Mettre en sourdine avec une durée (null = pour toujours tant que non réactivé, undefined/false = désactiver)
async function setConversationMute(conversationId, mutedUntil) {
  const me = await getMyProfile();
  const { error } = await sb.from('conversation_members')
    .update({ muted: !!mutedUntil || mutedUntil === null, muted_until: mutedUntil || null })
    .eq('conversation_id', conversationId).eq('user_id', me.id);
  if (error) toast(error.message, 'error');
}
async function unmuteConversation(conversationId) {
  const me = await getMyProfile();
  const { error } = await sb.from('conversation_members').update({ muted: false, muted_until: null }).eq('conversation_id', conversationId).eq('user_id', me.id);
  if (error) toast(error.message, 'error');
}

/* ---------------- GROUPES ---------------- */

async function createGroup(name, description) {
  const { data, error } = await sb.rpc('create_group', { p_name: name, p_description: description || '' });
  if (error) { toast(error.message, 'error'); return null; }
  return data;
}

async function joinGroupByInvite(code) {
  const { data, error } = await sb.rpc('join_group_by_invite', { p_invite_code: code });
  if (error) { toast(error.message, 'error'); return null; }
  toast('Groupe rejoint ✓', 'success');
  return data;
}

async function getGroup(conversationId) {
  const { data } = await sb.from('groups').select('*').eq('conversation_id', conversationId).single();
  return data;
}

async function updateGroup(conversationId, fields) {
  const { error } = await sb.from('groups').update(fields).eq('conversation_id', conversationId);
  if (error) toast(error.message, 'error'); else toast('Groupe mis à jour ✓', 'success');
}

async function uploadGroupIcon(conversationId, file) {
  const ext = file.name.split('.').pop();
  const path = `group/${conversationId}/icon_${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('media').upload(path, file, { upsert: true });
  if (upErr) { toast('Échec envoi image : ' + upErr.message, 'error'); return null; }
  const { data } = sb.storage.from('media').getPublicUrl(path);
  await updateGroup(conversationId, { icon_url: data.publicUrl });
  return data.publicUrl;
}

async function listConversationMembers(conversationId) {
  const { data } = await sb.from('conversation_members')
    .select('user_id, role, nickname, joined_at, profiles(*)')
    .eq('conversation_id', conversationId);
  return data || [];
}

async function kickMember(conversationId, userId) {
  const { error } = await sb.rpc('kick_member', { p_conversation_id: conversationId, p_user_id: userId });
  if (error) toast(error.message, 'error'); else toast('Membre exclu');
}

async function setConversationRole(conversationId, userId, role) {
  const { error } = await sb.rpc('set_conversation_role', { p_conversation_id: conversationId, p_user_id: userId, p_role: role });
  if (error) toast(error.message, 'error'); else toast('Rôle mis à jour ✓', 'success');
}

/* ---------------- COMMUNAUTÉS ---------------- */

async function createCommunity(name, description, isPublic) {
  const { data, error } = await sb.rpc('create_community', { p_name: name, p_description: description || '', p_is_public: isPublic });
  if (error) { toast(error.message, 'error'); return null; }
  return data;
}

async function listMyCommunities() {
  const me = await getMyProfile();
  const { data } = await sb.from('community_members')
    .select('role, communities(*)')
    .eq('user_id', me.id);
  return (data || []).map(r => ({ ...r.communities, myRole: r.role }));
}

async function discoverPublicCommunities() {
  const { data } = await sb.from('communities').select('*').eq('is_public', true).order('created_at', { ascending: false });
  return data || [];
}

async function joinCommunity(communityId) {
  const { error } = await sb.rpc('join_community', { p_community_id: communityId });
  if (error) toast(error.message, 'error'); else toast('Communauté rejointe ✓', 'success');
}

async function joinCommunityByInvite(code) {
  const { data, error } = await sb.rpc('join_community_by_invite', { p_invite_code: code });
  if (error) { toast(error.message, 'error'); return null; }
  toast('Communauté rejointe ✓', 'success');
  return data;
}

async function getCommunity(id) {
  const { data } = await sb.from('communities').select('*').eq('id', id).single();
  return data;
}

async function updateCommunity(id, fields) {
  const { error } = await sb.from('communities').update(fields).eq('id', id);
  if (error) toast(error.message, 'error'); else toast('Communauté mise à jour ✓', 'success');
}

async function uploadCommunityIcon(communityId, file) {
  const ext = file.name.split('.').pop();
  const path = `community/${communityId}/icon_${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('media').upload(path, file, { upsert: true });
  if (upErr) { toast('Échec envoi image : ' + upErr.message, 'error'); return null; }
  const { data } = sb.storage.from('media').getPublicUrl(path);
  await updateCommunity(communityId, { icon_url: data.publicUrl });
  return data.publicUrl;
}
async function uploadCommunityBanner(communityId, file) {
  const ext = file.name.split('.').pop();
  const path = `community/${communityId}/banner_${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('media').upload(path, file, { upsert: true });
  if (upErr) { toast('Échec envoi image : ' + upErr.message, 'error'); return null; }
  const { data } = sb.storage.from('media').getPublicUrl(path);
  await updateCommunity(communityId, { banner_url: data.publicUrl });
  return data.publicUrl;
}

async function listChannels(communityId) {
  const { data } = await sb.from('channels')
    .select('*, channel_categories(name, position)')
    .eq('community_id', communityId)
    .order('position');
  return data || [];
}

async function listCategories(communityId) {
  const { data } = await sb.from('channel_categories').select('*').eq('community_id', communityId).order('position');
  return data || [];
}

async function createChannel(communityId, name, categoryId, description) {
  const { data, error } = await sb.rpc('create_channel', {
    p_community_id: communityId, p_name: name, p_category_id: categoryId || null, p_description: description || ''
  });
  if (error) { toast(error.message, 'error'); return null; }
  return data;
}

async function updateChannel(channelId, fields) {
  const { error } = await sb.from('channels').update(fields).eq('id', channelId);
  if (error) toast(error.message, 'error'); else toast('Salon mis à jour ✓', 'success');
}

async function listCommunityMembers(communityId) {
  const { data } = await sb.from('community_members').select('user_id, role, nickname, profiles(*)').eq('community_id', communityId);
  return data || [];
}

async function setCommunityRole(communityId, userId, role) {
  const { error } = await sb.rpc('set_community_role', { p_community_id: communityId, p_user_id: userId, p_role: role });
  if (error) toast(error.message, 'error'); else toast('Rôle mis à jour ✓', 'success');
}

async function kickCommunityMember(communityId, userId) {
  const { error } = await sb.rpc('kick_community_member', { p_community_id: communityId, p_user_id: userId });
  if (error) toast(error.message, 'error'); else toast('Membre exclu');
}

/* ---------------- MESSAGES ---------------- */

async function listMessages(conversationId, before = null, limit = 50) {
  let q = sb.from('messages')
    .select(`
      *, profiles!messages_sender_id_fkey(*),
      message_reactions(user_id, emoji),
      reply:reply_to_id ( id, content, sender_id, profiles!messages_sender_id_fkey(display_name) )
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  const hiddenIds = new Set(await listHiddenMessageIds(conversationId));
  return (data || []).filter(m => !hiddenIds.has(m.id)).reverse();
}

async function sendMessage(conversationId, content, { replyToId = null, attachment = null, isTagAll = false, mentionedUserIds = [] } = {}) {
  const me = await getMyProfile();
  const { data, error } = await sb.from('messages').insert({
    conversation_id: conversationId,
    sender_id: me.id,
    content,
    reply_to_id: replyToId,
    attachment_url: attachment?.url || null,
    attachment_type: attachment?.type || null,
    is_tag_all: isTagAll
  }).select().single();
  if (error) { toast(error.message, 'error'); return null; }
  if (mentionedUserIds.length) {
    await sb.from('message_mentions').insert(mentionedUserIds.map(uid => ({ message_id: data.id, user_id: uid })));
  }
  return data;
}

async function editMessage(messageId, content) {
  const { error } = await sb.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', messageId);
  if (error) toast(error.message, 'error');
}

// Supprime le message pour tout le monde (auteur ou modérateur uniquement, via RLS)
async function deleteMessageForEveryone(messageId) {
  const { error } = await sb.from('messages')
    .update({ deleted: true, content: '', attachment_url: null, attachment_type: null })
    .eq('id', messageId);
  if (error) toast(error.message, 'error');
}

// Masque le message uniquement pour l'utilisateur courant (les autres le voient toujours)
async function deleteMessageForMe(messageId) {
  const me = await getMyProfile();
  const { error } = await sb.from('message_hidden_for').insert({ message_id: messageId, user_id: me.id });
  if (error) toast(error.message, 'error');
}

// Rétro-compatibilité (ancien nom) : équivaut à "supprimer pour tout le monde"
async function deleteMessage(messageId) {
  return deleteMessageForEveryone(messageId);
}

async function listHiddenMessageIds(conversationId) {
  const me = await getMyProfile();
  const { data } = await sb.from('message_hidden_for')
    .select('message_id, messages!inner(conversation_id)')
    .eq('user_id', me.id)
    .eq('messages.conversation_id', conversationId);
  return (data || []).map(r => r.message_id);
}

async function togglePin(messageId, pinned) {
  const { error } = await sb.from('messages').update({ pinned }).eq('id', messageId);
  if (error) toast(error.message, 'error');
}

async function listPinned(conversationId) {
  const { data } = await sb.from('messages').select('*, profiles!messages_sender_id_fkey(*)').eq('conversation_id', conversationId).eq('pinned', true).order('created_at', { ascending: false });
  return data || [];
}

async function toggleReaction(messageId, emoji) {
  const me = await getMyProfile();
  const { data: existing } = await sb.from('message_reactions').select('*').eq('message_id', messageId).eq('user_id', me.id).eq('emoji', emoji).maybeSingle();
  if (existing) {
    await sb.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me.id).eq('emoji', emoji);
  } else {
    await sb.from('message_reactions').insert({ message_id: messageId, user_id: me.id, emoji });
  }
}

/* ---------------- TRANSFERT DE MESSAGE (v3) ---------------- */

// Transfère un message vers une ou plusieurs conversations dont l'utilisateur est déjà
// membre (RLS l'exige de toute façon). Le contenu et la pièce jointe sont copiés dans de
// nouveaux messages ; forwarded_from_id pointe vers le message d'origine pour afficher
// le tag "Transféré" dans l'interface.
async function forwardMessage(messageId, targetConversationIds) {
  const { data: original, error: readErr } = await sb.from('messages').select('*').eq('id', messageId).single();
  if (readErr || !original) { toast('Message introuvable.', 'error'); return false; }
  const me = await getMyProfile();
  const rows = targetConversationIds.map(convId => ({
    conversation_id: convId,
    sender_id: me.id,
    content: original.content,
    attachment_url: original.attachment_url,
    attachment_type: original.attachment_type,
    forwarded_from_id: original.id
  }));
  const { error } = await sb.from('messages').insert(rows);
  if (error) { toast(error.message, 'error'); return false; }
  toast(targetConversationIds.length > 1 ? 'Message transféré ✓' : 'Message transféré ✓', 'success');
  return true;
}

/* ---------------- MESSAGES FAVORIS (v3) ---------------- */

async function toggleStar(messageId, starred) {
  const me = await getMyProfile();
  if (starred) {
    const { error } = await sb.from('starred_messages').insert({ user_id: me.id, message_id: messageId });
    if (error && !/duplicate/i.test(error.message)) toast(error.message, 'error');
  } else {
    const { error } = await sb.from('starred_messages').delete().eq('user_id', me.id).eq('message_id', messageId);
    if (error) toast(error.message, 'error');
  }
}

async function listStarredMessageIds() {
  const me = await getMyProfile();
  const { data } = await sb.from('starred_messages').select('message_id').eq('user_id', me.id);
  return new Set((data || []).map(r => r.message_id));
}

async function listStarredMessages() {
  const me = await getMyProfile();
  const { data, error } = await sb.from('starred_messages')
    .select('starred_at, messages(*, profiles!messages_sender_id_fkey(*))')
    .eq('user_id', me.id)
    .order('starred_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return (data || []).filter(r => r.messages).map(r => ({ ...r.messages, starred_at: r.starred_at }));
}

/* ---------------- SONDAGES (v3) ---------------- */

async function createPoll(conversationId, question, options, allowMultiple, closesAt) {
  const me = await getMyProfile();
  const { data, error } = await sb.from('polls').insert({
    conversation_id: conversationId,
    created_by: me.id,
    question,
    options,
    allow_multiple: !!allowMultiple,
    closes_at: closesAt || null
  }).select().single();
  if (error) { toast(error.message, 'error'); return null; }
  return data;
}

async function listPolls(conversationId) {
  const { data, error } = await sb.from('polls')
    .select('*, poll_votes(user_id, option_index)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function castPollVote(pollId, optionIndex) {
  const { error } = await sb.rpc('cast_poll_vote', { p_poll_id: pollId, p_option_index: optionIndex });
  if (error) toast(error.message, 'error');
}

async function removePollVote(pollId, optionIndex) {
  const me = await getMyProfile();
  const { error } = await sb.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', me.id).eq('option_index', optionIndex);
  if (error) toast(error.message, 'error');
}

async function searchMessages(conversationId, query) {
  const { data } = await sb.from('messages')
    .select('*, profiles!messages_sender_id_fkey(*)')
    .eq('conversation_id', conversationId)
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(30);
  return data || [];
}

/* ---------------- AMIS / BLOCAGE / SIGNALEMENT ---------------- */

async function sendFriendRequest(userId) {
  const { error } = await sb.rpc('send_friend_request', { p_to_user: userId });
  if (error) toast(error.message, 'error'); else toast('Demande envoyée ✓', 'success');
}

async function acceptFriendRequest(requestId) {
  const { error } = await sb.rpc('accept_friend_request', { p_request_id: requestId });
  if (error) toast(error.message, 'error'); else toast('Ami ajouté ✓', 'success');
}

async function declineFriendRequest(requestId) {
  await sb.rpc('decline_friend_request', { p_request_id: requestId });
}

async function listFriends() {
  const me = await getMyProfile();
  const { data } = await sb.from('friendships')
    .select('user_a, user_b, profiles_a:profiles!friendships_user_a_fkey(*), profiles_b:profiles!friendships_user_b_fkey(*)')
    .or(`user_a.eq.${me.id},user_b.eq.${me.id}`);
  return (data || []).map(r => r.user_a === me.id ? r.profiles_b : r.profiles_a);
}

async function listIncomingFriendRequests() {
  const me = await getMyProfile();
  const { data } = await sb.from('friend_requests').select('*, profiles!friend_requests_from_user_fkey(*)').eq('to_user', me.id).eq('status', 'pending');
  return data || [];
}

async function removeFriend(otherUserId) {
  const me = await getMyProfile();
  const a = me.id < otherUserId ? me.id : otherUserId;
  const b = me.id < otherUserId ? otherUserId : me.id;
  await sb.from('friendships').delete().eq('user_a', a).eq('user_b', b);
  toast('Ami retiré');
}

async function blockUser(userId) {
  const me = await getMyProfile();
  await sb.from('blocks').insert({ blocker_id: me.id, blocked_id: userId });
  toast('Utilisateur bloqué');
}

async function unblockUser(userId) {
  const me = await getMyProfile();
  await sb.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', userId);
  toast('Utilisateur débloqué');
}

async function listBlocked() {
  const me = await getMyProfile();
  const { data } = await sb.from('blocks').select('blocked_id, profiles!blocks_blocked_id_fkey(*)').eq('blocker_id', me.id);
  return data || [];
}

async function reportContent({ targetType, targetUserId, targetMessageId, reason, details }) {
  const me = await getMyProfile();
  const { error } = await sb.from('reports').insert({
    reporter_id: me.id, target_type: targetType, target_user_id: targetUserId || null,
    target_message_id: targetMessageId || null, reason, details: details || ''
  });
  if (error) toast(error.message, 'error'); else toast('Signalement envoyé, merci', 'success');
}

/* ---------------- NOTIFICATIONS ---------------- */

async function listNotifications() {
  const { data } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  return data || [];
}

async function unreadNotifCount() {
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
  return count || 0;
}

async function markNotifRead(id) {
  await sb.from('notifications').update({ is_read: true }).eq('id', id);
}

async function markAllNotifRead() {
  const me = await getMyProfile();
  await sb.from('notifications').update({ is_read: true }).eq('user_id', me.id).eq('is_read', false);
}

/* ---------------- SITE SETTINGS / ADMIN ---------------- */

async function getSiteSettings() {
  const { data } = await sb.from('site_settings').select('*').eq('id', true).single();
  return data;
}

async function adminListUsers() {
  const { data } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  return data || [];
}

async function adminBanUser(userId, reason) {
  const { error } = await sb.rpc('admin_ban_user', { p_user_id: userId, p_reason: reason });
  if (error) toast(error.message, 'error'); else toast('Utilisateur banni');
}

async function adminUnbanUser(userId) {
  const { error } = await sb.rpc('admin_unban_user', { p_user_id: userId });
  if (error) toast(error.message, 'error'); else toast('Utilisateur débanni');
}

async function adminListReports() {
  const { data } = await sb.from('reports')
    .select('*, reporter:profiles!reports_reporter_id_fkey(*), target_user:profiles!reports_target_user_id_fkey(*)')
    .order('created_at', { ascending: false });
  return data || [];
}

async function adminResolveReport(id, status) {
  const { error } = await sb.rpc('admin_resolve_report', { p_report_id: id, p_status: status });
  if (error) toast(error.message, 'error'); else toast('Signalement mis à jour');
}

async function adminSetAnnouncement(text, active) {
  const { error } = await sb.rpc('admin_set_announcement', { p_text: text, p_active: active });
  if (error) toast(error.message, 'error'); else toast('Annonce mise à jour ✓', 'success');
}

async function adminToggleMaintenance(active) {
  const { error } = await sb.rpc('admin_toggle_maintenance', { p_active: active });
  if (error) toast(error.message, 'error'); else toast('Mode maintenance mis à jour ✓', 'success');
}

async function adminCreateInviteCode(code, maxUses, expiresAt) {
  const { error } = await sb.rpc('admin_create_invite_code', { p_code: code, p_max_uses: maxUses, p_expires_at: expiresAt });
  if (error) toast(error.message, 'error'); else toast('Code créé ✓', 'success');
}

async function adminListInviteCodes() {
  const { data } = await sb.from('invite_codes').select('*').order('created_at', { ascending: false });
  return data || [];
}

async function adminListAuditLog() {
  const { data } = await sb.from('audit_log').select('*, profiles(*)').order('created_at', { ascending: false }).limit(100);
  return data || [];
}

/* ---------------- Accès admin aux conversations (voir sql/migration_v4.sql) ----------------
   À la demande explicite de Kylian, l'administrateur du site peut parcourir n'importe quelle
   conversation (DM, groupe, salon de communauté), à tout moment — voir privacy.html qui
   documente honnêtement cet accès aux membres. */
async function adminListConversations() {
  const { data, error } = await sb.from('conversations')
    .select('id, type, created_at, conversation_members(user_id, profiles(display_name, username)), groups(name), channels(name, communities(name))')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) { console.error(error); return []; }
  return (data || []).map(c => {
    let label;
    if (c.type === 'dm') {
      label = (c.conversation_members || []).map(m => m.profiles?.display_name).filter(Boolean).join(' & ') || 'Conversation privée';
    } else if (c.type === 'group') {
      label = c.groups?.name || 'Groupe';
    } else {
      label = (c.channels?.communities?.name ? c.channels.communities.name + ' — ' : '') + (c.channels?.name || 'Salon');
    }
    return { id: c.id, type: c.type, label, memberCount: (c.conversation_members || []).length, created_at: c.created_at };
  });
}

async function adminListConversationMessages(conversationId) {
  const { data, error } = await sb.from('messages')
    .select('*, profiles(display_name, username)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) { console.error(error); return []; }
  return data || [];
}

async function adminStats() {
  const [{ count: users }, { count: messages }, { count: groups }, { count: communities }, { count: openReports }] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }),
    sb.from('messages').select('id', { count: 'exact', head: true }),
    sb.from('groups').select('conversation_id', { count: 'exact', head: true }),
    sb.from('communities').select('id', { count: 'exact', head: true }),
    sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open')
  ]);
  return { users, messages, groups, communities, openReports };
}

/* ---------------- STORIES (24h) ---------------- */

async function uploadStoryMedia(file) {
  const me = await getMyProfile();
  const ext = file.name.split('.').pop();
  const path = `${me.id}/${Date.now()}_${randHex(4)}.${ext}`;
  const { error: upErr } = await sb.storage.from('stories').upload(path, file);
  if (upErr) { toast('Échec envoi : ' + upErr.message, 'error'); return null; }
  const { data } = sb.storage.from('stories').getPublicUrl(path);
  return data.publicUrl;
}

async function createStory({ mediaUrl = null, mediaType = 'text', caption = '', bgColor = '#4c86d6' } = {}) {
  const me = await getMyProfile();
  const { data, error } = await sb.from('stories').insert({
    user_id: me.id, media_url: mediaUrl, media_type: mediaType, caption, bg_color: bgColor
  }).select().single();
  if (error) { toast(error.message, 'error'); return null; }
  toast('Story publiée ✓ (visible 24h)', 'success');
  return data;
}

// Récupère toutes les stories actives (non expirées), groupées par auteur, triées
// pour que "mes stories" apparaissent en premier puis les autres par récence.
async function listActiveStoriesByUser() {
  const me = await getMyProfile();
  const { data, error } = await sb.from('stories')
    .select('*, profiles(*)')
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  const byUser = {};
  (data || []).forEach(s => {
    (byUser[s.user_id] = byUser[s.user_id] || []).push(s);
  });
  const groups = Object.values(byUser).map(stories => ({ user: stories[0].profiles, stories }));
  groups.sort((a, b) => (b.user?.id === me.id) - (a.user?.id === me.id));
  return groups;
}

async function listMyStories() {
  const me = await getMyProfile();
  const { data } = await sb.from('stories').select('*').eq('user_id', me.id).order('created_at', { ascending: false });
  return data || [];
}

async function deleteStory(storyId) {
  const { error } = await sb.from('stories').delete().eq('id', storyId);
  if (error) toast(error.message, 'error'); else toast('Story supprimée');
}

async function markStoryViewed(storyId) {
  await sb.rpc('mark_story_viewed', { p_story_id: storyId });
}

async function listStoryViewers(storyId) {
  const { data } = await sb.from('story_views').select('viewer_id, viewed_at, profiles(*)').eq('story_id', storyId).order('viewed_at', { ascending: false });
  return data || [];
}

async function hasUnseenStories(stories) {
  const me = await getMyProfile();
  const ids = stories.map(s => s.id);
  if (!ids.length) return false;
  const { data } = await sb.from('story_views').select('story_id').eq('viewer_id', me.id).in('story_id', ids);
  const seen = new Set((data || []).map(r => r.story_id));
  return stories.some(s => !seen.has(s.id));
}

/* ---------------- LEADERBOARD ---------------- */

async function globalLeaderboard(limit = 20) {
  const { data } = await sb.from('profiles').select('*').order('xp', { ascending: false }).limit(limit);
  return data || [];
}
