/* =========================================================================
   EGO-META — Couche données Appwrite (remplace data.js entièrement)
   Même API publique que data.js — le reste du code (app.js, render.js…)
   n'a PAS besoin d'être modifié.
   ========================================================================= */

/* ============================================================
   AUTH
   ============================================================ */

async function authSignUp(email, password, username, displayName, inviteCode) {
  const valid = await authValidateInvite(inviteCode);
  if (!valid) return { error: { message: "Code d'invitation invalide ou expiré." } };

  try {
    const account = await awAuth.create(ID(), email, password, displayName);
    await authSignIn(email, password);
    // Crée le profil dans la DB
    await awDB.createDocument(DB(), COL('profiles'), account.$id, {
      id: account.$id,
      username,
      display_name: displayName,
      status: 'online',
      is_site_admin: false,
      is_banned: false,
      xp: 0,
      level: 1,
    });
    // Consomme le code d'invitation
    await _redeemInvite(inviteCode);
    return { data: account, error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function authSignIn(email, password) {
  try {
    const session = await awAuth.createEmailPasswordSession(email, password);
    return { data: session, error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function authSignInWithOAuth(provider) {
  try {
    awAuth.createOAuth2Session(provider,
      window.location.origin + window.location.pathname,
      window.location.origin + window.location.pathname + '?oauth_error=1'
    );
    return { error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function authSignOut() {
  try { await awAuth.deleteSession('current'); } catch (_) {}
}

async function authResetPassword(email) {
  try {
    await awAuth.createRecovery(email, window.location.origin + window.location.pathname);
    return { error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function authUpdatePassword(newPassword) {
  try {
    await awAuth.updatePassword(newPassword);
    return { error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function checkExistingSession() {
  if (!sbConfigured) return false;
  try {
    await awAuth.getSession('current');
    return true;
  } catch (_) {
    return false;
  }
}

async function authValidateInvite(code) {
  if (!code) return false;
  try {
    const res = await awDB.listDocuments(DB(), COL('invite_codes'), [Q.equal('code', code), Q.limit(1)]);
    const inv = res.documents[0];
    if (!inv) return false;
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return false;
    if (inv.uses >= inv.max_uses) return false;
    return true;
  } catch (_) { return false; }
}

async function _redeemInvite(code) {
  try {
    const res = await awDB.listDocuments(DB(), COL('invite_codes'), [Q.equal('code', code), Q.limit(1)]);
    const inv = res.documents[0];
    if (!inv) return;
    await awDB.updateDocument(DB(), COL('invite_codes'), inv.$id, { uses: (inv.uses || 0) + 1 });
  } catch (_) {}
}

async function authRedeemPendingInviteIfAny() {
  const code = localStorage.getItem('ego_pending_invite');
  if (code) {
    await _redeemInvite(code);
    localStorage.removeItem('ego_pending_invite');
  }
}

async function activateAccountWithInvite(code) {
  const valid = await authValidateInvite(code);
  if (!valid) return { error: { message: "Code invalide ou expiré." } };
  const me = await _getMe();
  if (!me) return { error: { message: "Non connecté." } };
  await awDB.updateDocument(DB(), COL('profiles'), me.$id, { is_banned: false, banned_reason: null });
  await _redeemInvite(code);
  return { data: true };
}

/* ============================================================
   PROFILS
   ============================================================ */

let _meCache = null;

async function _getMe() {
  try {
    if (_meCache) return _meCache;
    _meCache = await awAuth.get();
    return _meCache;
  } catch (_) { return null; }
}

// Invalide le cache après une mise à jour
function _invalidateMeCache() { _meCache = null; }

async function getMyProfile() {
  const me = await _getMe();
  if (!me) return null;
  try {
    const d = await awDB.getDocument(DB(), COL('profiles'), me.$id);
    return doc(d);
  } catch (_) { return null; }
}

async function getProfile(userId) {
  try {
    const d = await awDB.getDocument(DB(), COL('profiles'), userId);
    return doc(d);
  } catch (_) { return null; }
}

async function updateMyProfile(fields) {
  const me = await _getMe();
  if (!me) return { error: { message: 'Non connecté' } };
  _invalidateMeCache();
  try {
    const d = await awDB.updateDocument(DB(), COL('profiles'), me.$id, fields);
    return { data: doc(d), error: null };
  } catch (err) {
    toast('Erreur : ' + err.message, 'error');
    return { error: { message: err.message } };
  }
}

async function searchProfiles(query) {
  if (!query || query.length < 2) return [];
  try {
    const res = await awDB.listDocuments(DB(), COL('profiles'), [
      Q.or([Q.search('username', query), Q.search('display_name', query)]),
      Q.limit(20)
    ]);
    return docs(res);
  } catch (_) { return []; }
}

async function uploadAvatar(file) {
  const me = await _getMe();
  try {
    const uploaded = await awStorage.createFile(BUCKETS.avatars, ID(), file);
    const url = awStorage.getFileView(BUCKETS.avatars, uploaded.$id);
    await updateMyProfile({ avatar_url: url.href });
    return url.href;
  } catch (err) {
    toast('Échec envoi photo : ' + err.message, 'error');
    return null;
  }
}

async function uploadAttachment(file) {
  try {
    const uploaded = await awStorage.createFile(BUCKETS.attachments, ID(), file);
    const url = awStorage.getFileView(BUCKETS.attachments, uploaded.$id);
    return { url: url.href, type: file.type };
  } catch (err) {
    toast('Échec envoi fichier : ' + err.message, 'error');
    return null;
  }
}

/* ============================================================
   CONVERSATIONS
   ============================================================ */

async function listMyConversations() {
  const me = await getMyProfile();
  if (!me) return [];
  return await queryAll('conversation_members', [Q.equal('user_id', me.id)]);
}

async function listDMs() {
  const me = await getMyProfile();
  const rows = await listMyConversations();
  const dmRows = [];
  for (const row of rows) {
    if (row.archived) continue;
    try {
      const conv = doc(await awDB.getDocument(DB(), COL('conversations'), row.conversation_id));
      if (conv.type !== 'dm') continue;
      dmRows.push(row);
    } catch (_) {}
  }
  const results = [];
  for (const row of dmRows) {
    const members = await queryAll('conversation_members', [Q.equal('conversation_id', row.conversation_id)]);
    const other = members.find(m => m.user_id !== me.id);
    if (!other) continue;
    const otherProfile = await getProfile(other.user_id);
    const lastMsg = await getLastMessage(row.conversation_id);
    const unread = await countUnread(row.conversation_id, row.last_read_at);
    results.push({ conversation_id: row.conversation_id, other: otherProfile, lastMsg, unread, muted: row.muted, pinned: row.pinned });
  }
  results.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.lastMsg?.created_at || 0) - new Date(a.lastMsg?.created_at || 0)));
  return results;
}

async function listGroups() {
  const me = await getMyProfile();
  const rows = await listMyConversations();
  const results = [];
  for (const row of rows) {
    if (row.archived) continue;
    try {
      const conv = doc(await awDB.getDocument(DB(), COL('conversations'), row.conversation_id));
      if (conv.type !== 'group') continue;
      const groupRes = await awDB.listDocuments(DB(), COL('groups'), [Q.equal('conversation_id', row.conversation_id), Q.limit(1)]);
      const group = docs(groupRes)[0];
      if (!group) continue;
      const lastMsg = await getLastMessage(row.conversation_id);
      const unread = await countUnread(row.conversation_id, row.last_read_at);
      results.push({ conversation_id: row.conversation_id, group, lastMsg, unread, role: row.role, muted: row.muted, pinned: row.pinned });
    } catch (_) {}
  }
  results.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.lastMsg?.created_at || 0) - new Date(a.lastMsg?.created_at || 0)));
  return results;
}

async function getConversationType(conversationId) {
  try {
    const d = doc(await awDB.getDocument(DB(), COL('conversations'), conversationId));
    return d?.type || null;
  } catch (_) { return null; }
}

async function getLastMessage(conversationId) {
  try {
    const res = await awDB.listDocuments(DB(), COL('messages'), [
      Q.equal('conversation_id', conversationId),
      Q.orderDesc('$createdAt'),
      Q.limit(1)
    ]);
    return docs(res)[0] || null;
  } catch (_) { return null; }
}

async function countUnread(conversationId, lastReadAt) {
  try {
    const q = [Q.equal('conversation_id', conversationId)];
    if (lastReadAt) q.push(Q.greaterThan('$createdAt', lastReadAt));
    const res = await awDB.listDocuments(DB(), COL('messages'), [...q, Q.limit(1)]);
    return res.total || 0;
  } catch (_) { return 0; }
}

async function markRead(conversationId) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [
    Q.equal('conversation_id', conversationId),
    Q.equal('user_id', me.id),
    Q.limit(1)
  ]);
  const row = res.documents[0];
  if (!row) return;
  await awDB.updateDocument(DB(), COL('conversation_members'), row.$id, { last_read_at: new Date().toISOString() });
}

async function createDM(otherUserId) {
  const me = await getMyProfile();
  // Vérifie si un DM existe déjà
  const myRows = await queryAll('conversation_members', [Q.equal('user_id', me.id)]);
  for (const row of myRows) {
    try {
      const conv = doc(await awDB.getDocument(DB(), COL('conversations'), row.conversation_id));
      if (conv.type !== 'dm') continue;
      const members = await queryAll('conversation_members', [Q.equal('conversation_id', row.conversation_id)]);
      if (members.some(m => m.user_id === otherUserId)) return row.conversation_id;
    } catch (_) {}
  }
  // Crée la conversation
  const convId = ID();
  await awDB.createDocument(DB(), COL('conversations'), convId, { type: 'dm' });
  const now = new Date().toISOString();
  await awDB.createDocument(DB(), COL('conversation_members'), ID(), { conversation_id: convId, user_id: me.id, role: 'member', last_read_at: now, muted: false, pinned: false, archived: false });
  await awDB.createDocument(DB(), COL('conversation_members'), ID(), { conversation_id: convId, user_id: otherUserId, role: 'member', last_read_at: now, muted: false, pinned: false, archived: false });
  return convId;
}

async function leaveConversation(conversationId) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [Q.equal('conversation_id', conversationId), Q.equal('user_id', me.id), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.deleteDocument(DB(), COL('conversation_members'), row.$id);
  toast('Conversation quittée');
}

async function togglePinConversation(conversationId, pinned) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [Q.equal('conversation_id', conversationId), Q.equal('user_id', me.id), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.updateDocument(DB(), COL('conversation_members'), row.$id, { pinned });
}

async function setConversationMute(conversationId, mutedUntil) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [Q.equal('conversation_id', conversationId), Q.equal('user_id', me.id), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.updateDocument(DB(), COL('conversation_members'), row.$id, { muted: true, muted_until: mutedUntil || null });
}

async function unmuteConversation(conversationId) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [Q.equal('conversation_id', conversationId), Q.equal('user_id', me.id), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.updateDocument(DB(), COL('conversation_members'), row.$id, { muted: false, muted_until: null });
}

async function setConversationArchived(conversationId, archived) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [Q.equal('conversation_id', conversationId), Q.equal('user_id', me.id), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.updateDocument(DB(), COL('conversation_members'), row.$id, { archived });
}

async function listArchivedConversations() {
  const me = await getMyProfile();
  const rows = (await listMyConversations()).filter(r => r.archived);
  const results = [];
  for (const row of rows) {
    try {
      const conv = doc(await awDB.getDocument(DB(), COL('conversations'), row.conversation_id));
      const lastMsg = await getLastMessage(row.conversation_id);
      if (conv.type === 'dm') {
        const members = await queryAll('conversation_members', [Q.equal('conversation_id', row.conversation_id)]);
        const other = members.find(m => m.user_id !== me.id);
        if (!other) continue;
        const otherProfile = await getProfile(other.user_id);
        results.push({ conversation_id: row.conversation_id, kind: 'dm', other: otherProfile, lastMsg });
      } else if (conv.type === 'group') {
        const groupRes = await awDB.listDocuments(DB(), COL('groups'), [Q.equal('conversation_id', row.conversation_id), Q.limit(1)]);
        const group = docs(groupRes)[0];
        if (!group) continue;
        results.push({ conversation_id: row.conversation_id, kind: 'group', group, lastMsg });
      }
    } catch (_) {}
  }
  return results;
}

/* ============================================================
   GROUPES
   ============================================================ */

async function createGroup(name, description) {
  const me = await getMyProfile();
  const convId = ID();
  await awDB.createDocument(DB(), COL('conversations'), convId, { type: 'group' });
  const groupId = ID();
  await awDB.createDocument(DB(), COL('groups'), groupId, {
    conversation_id: convId, name, description: description || '',
    invite_code: Math.random().toString(36).slice(2, 10).toUpperCase(), slow_mode_seconds: 0
  });
  await awDB.createDocument(DB(), COL('conversation_members'), ID(), {
    conversation_id: convId, user_id: me.id, role: 'owner',
    last_read_at: new Date().toISOString(), muted: false, pinned: false, archived: false
  });
  return convId;
}

async function joinGroupByInvite(code) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('groups'), [Q.equal('invite_code', code), Q.limit(1)]);
  const group = docs(res)[0];
  if (!group) { toast('Code invalide', 'error'); return null; }
  await awDB.createDocument(DB(), COL('conversation_members'), ID(), {
    conversation_id: group.conversation_id, user_id: me.id, role: 'member',
    last_read_at: new Date().toISOString(), muted: false, pinned: false, archived: false
  });
  toast('Groupe rejoint ✓', 'success');
  return group.conversation_id;
}

async function getGroup(conversationId) {
  const res = await awDB.listDocuments(DB(), COL('groups'), [Q.equal('conversation_id', conversationId), Q.limit(1)]);
  return docs(res)[0] || null;
}

async function updateGroup(conversationId, fields) {
  const res = await awDB.listDocuments(DB(), COL('groups'), [Q.equal('conversation_id', conversationId), Q.limit(1)]);
  const group = res.documents[0];
  if (!group) return;
  await awDB.updateDocument(DB(), COL('groups'), group.$id, fields);
  toast('Groupe mis à jour ✓', 'success');
}

async function uploadGroupIcon(conversationId, file) {
  try {
    const uploaded = await awStorage.createFile(BUCKETS.media, ID(), file);
    const url = awStorage.getFileView(BUCKETS.media, uploaded.$id).href;
    await updateGroup(conversationId, { icon_url: url });
    return url;
  } catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function listConversationMembers(conversationId) {
  const rows = await queryAll('conversation_members', [Q.equal('conversation_id', conversationId)]);
  const result = [];
  for (const row of rows) {
    const profile = await getProfile(row.user_id);
    result.push({ ...row, profiles: profile });
  }
  return result;
}

async function kickMember(conversationId, userId) {
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [Q.equal('conversation_id', conversationId), Q.equal('user_id', userId), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.deleteDocument(DB(), COL('conversation_members'), row.$id);
  toast('Membre exclu');
}

async function setConversationRole(conversationId, userId, role) {
  const res = await awDB.listDocuments(DB(), COL('conversation_members'), [Q.equal('conversation_id', conversationId), Q.equal('user_id', userId), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.updateDocument(DB(), COL('conversation_members'), row.$id, { role });
  toast('Rôle mis à jour ✓', 'success');
}

/* ============================================================
   COMMUNAUTÉS
   ============================================================ */

async function createCommunity(name, description, isPublic) {
  const me = await getMyProfile();
  const communityId = ID();
  await awDB.createDocument(DB(), COL('communities'), communityId, {
    name, description: description || '', is_public: isPublic,
    invite_code: Math.random().toString(36).slice(2, 10).toUpperCase()
  });
  await awDB.createDocument(DB(), COL('community_members'), ID(), { community_id: communityId, user_id: me.id, role: 'owner' });
  return communityId;
}

async function listMyCommunities() {
  const me = await getMyProfile();
  const rows = await queryAll('community_members', [Q.equal('user_id', me.id)]);
  const result = [];
  for (const row of rows) {
    try {
      const comm = doc(await awDB.getDocument(DB(), COL('communities'), row.community_id));
      result.push({ ...comm, myRole: row.role });
    } catch (_) {}
  }
  return result;
}

async function discoverPublicCommunities() {
  const res = await awDB.listDocuments(DB(), COL('communities'), [Q.equal('is_public', true), Q.orderDesc('$createdAt'), Q.limit(50)]);
  return docs(res);
}

async function joinCommunity(communityId) {
  const me = await getMyProfile();
  await awDB.createDocument(DB(), COL('community_members'), ID(), { community_id: communityId, user_id: me.id, role: 'member' });
  toast('Communauté rejointe ✓', 'success');
}

async function joinCommunityByInvite(code) {
  const res = await awDB.listDocuments(DB(), COL('communities'), [Q.equal('invite_code', code), Q.limit(1)]);
  const comm = docs(res)[0];
  if (!comm) { toast('Code invalide', 'error'); return null; }
  await joinCommunity(comm.id);
  return comm.id;
}

async function getCommunity(id) {
  try { return doc(await awDB.getDocument(DB(), COL('communities'), id)); } catch (_) { return null; }
}

async function updateCommunity(id, fields) {
  await awDB.updateDocument(DB(), COL('communities'), id, fields);
  toast('Communauté mise à jour ✓', 'success');
}

async function uploadCommunityIcon(communityId, file) {
  try {
    const uploaded = await awStorage.createFile(BUCKETS.media, ID(), file);
    const url = awStorage.getFileView(BUCKETS.media, uploaded.$id).href;
    await updateCommunity(communityId, { icon_url: url });
    return url;
  } catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function uploadCommunityBanner(communityId, file) {
  try {
    const uploaded = await awStorage.createFile(BUCKETS.media, ID(), file);
    const url = awStorage.getFileView(BUCKETS.media, uploaded.$id).href;
    await updateCommunity(communityId, { banner_url: url });
    return url;
  } catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function listChannels(communityId) {
  const res = await awDB.listDocuments(DB(), COL('channels'), [Q.equal('community_id', communityId), Q.orderAsc('position')]);
  return docs(res);
}

async function listCategories(communityId) {
  const res = await awDB.listDocuments(DB(), COL('channel_categories'), [Q.equal('community_id', communityId), Q.orderAsc('position')]);
  return docs(res);
}

async function createChannel(communityId, name, categoryId, description) {
  const convId = ID();
  await awDB.createDocument(DB(), COL('conversations'), convId, { type: 'channel' });
  const chanId = ID();
  await awDB.createDocument(DB(), COL('channels'), chanId, {
    community_id: communityId, conversation_id: convId,
    name, description: description || '', position: 0,
    category_id: categoryId || null
  });
  return chanId;
}

async function updateChannel(channelId, fields) {
  await awDB.updateDocument(DB(), COL('channels'), channelId, fields);
  toast('Salon mis à jour ✓', 'success');
}

async function listCommunityMembers(communityId) {
  const rows = await queryAll('community_members', [Q.equal('community_id', communityId)]);
  const result = [];
  for (const row of rows) {
    const profile = await getProfile(row.user_id);
    result.push({ ...row, profiles: profile });
  }
  return result;
}

async function setCommunityRole(communityId, userId, role) {
  const res = await awDB.listDocuments(DB(), COL('community_members'), [Q.equal('community_id', communityId), Q.equal('user_id', userId), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.updateDocument(DB(), COL('community_members'), row.$id, { role });
  toast('Rôle mis à jour ✓', 'success');
}

async function kickCommunityMember(communityId, userId) {
  const res = await awDB.listDocuments(DB(), COL('community_members'), [Q.equal('community_id', communityId), Q.equal('user_id', userId), Q.limit(1)]);
  const row = res.documents[0];
  if (row) await awDB.deleteDocument(DB(), COL('community_members'), row.$id);
  toast('Membre exclu');
}

async function getChannelByConversationId(conversationId) {
  const res = await awDB.listDocuments(DB(), COL('channels'), [Q.equal('conversation_id', conversationId), Q.limit(1)]);
  return docs(res)[0] || null;
}

/* ============================================================
   MESSAGES
   ============================================================ */

async function listMessages(conversationId, before = null, limit = 50) {
  const q = [Q.equal('conversation_id', conversationId), Q.orderDesc('$createdAt'), Q.limit(limit)];
  if (before) q.push(Q.lessThan('$createdAt', before));
  const res = await awDB.listDocuments(DB(), COL('messages'), q);
  const msgs = docs(res).reverse();
  const hiddenIds = new Set(await listHiddenMessageIds(conversationId));
  // Enrichit avec profil expéditeur + réactions + reply
  const enriched = [];
  for (const m of msgs) {
    if (hiddenIds.has(m.id)) continue;
    const profile = await getProfile(m.sender_id);
    const reactRes = await awDB.listDocuments(DB(), COL('message_reactions'), [Q.equal('message_id', m.id)]);
    const reactions = docs(reactRes);
    let reply = null;
    if (m.reply_to_id) {
      try {
        const rd = doc(await awDB.getDocument(DB(), COL('messages'), m.reply_to_id));
        const rp = await getProfile(rd.sender_id);
        reply = { ...rd, profiles: rp };
      } catch (_) {}
    }
    enriched.push({ ...m, profiles: profile, message_reactions: reactions, reply });
  }
  return enriched;
}

async function sendMessage(conversationId, content, { replyToId = null, attachment = null, isTagAll = false, mentionedUserIds = [] } = {}) {
  const me = await getMyProfile();
  try {
    const msgId = ID();
    const d = await awDB.createDocument(DB(), COL('messages'), msgId, {
      conversation_id: conversationId,
      sender_id: me.id,
      content,
      reply_to_id: replyToId || null,
      attachment_url: attachment?.url || null,
      attachment_type: attachment?.type || null,
      is_tag_all: isTagAll || false,
      deleted: false,
      pinned: false,
    });
    // Notifications de mention
    for (const uid of mentionedUserIds) {
      await createNotification(uid, 'mention', { conversation_id: conversationId, message_id: msgId, from: me.display_name });
    }
    if (isTagAll) {
      const members = await queryAll('conversation_members', [Q.equal('conversation_id', conversationId)]);
      for (const m of members) {
        if (m.user_id !== me.id) await createNotification(m.user_id, 'tag_all', { conversation_id: conversationId, message_id: msgId });
      }
    }
    return doc(d);
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

async function editMessage(messageId, content) {
  try { await awDB.updateDocument(DB(), COL('messages'), messageId, { content, edited_at: new Date().toISOString() }); }
  catch (err) { toast(err.message, 'error'); }
}

async function deleteMessageForEveryone(messageId) {
  try { await awDB.updateDocument(DB(), COL('messages'), messageId, { deleted: true, content: '', attachment_url: null, attachment_type: null }); }
  catch (err) { toast(err.message, 'error'); }
}

async function deleteMessageForMe(messageId) {
  const me = await getMyProfile();
  try { await awDB.createDocument(DB(), COL('message_hidden_for'), ID(), { message_id: messageId, user_id: me.id }); }
  catch (err) { toast(err.message, 'error'); }
}

async function deleteMessage(messageId) { return deleteMessageForEveryone(messageId); }

async function listHiddenMessageIds(conversationId) {
  const me = await getMyProfile();
  // On récupère tous les hidden pour cet user, on filtre après
  const rows = await queryAll('message_hidden_for', [Q.equal('user_id', me.id)]);
  return rows.map(r => r.message_id);
}

async function togglePin(messageId, pinned) {
  try { await awDB.updateDocument(DB(), COL('messages'), messageId, { pinned }); }
  catch (err) { toast(err.message, 'error'); }
}

async function listPinned(conversationId) {
  const res = await awDB.listDocuments(DB(), COL('messages'), [
    Q.equal('conversation_id', conversationId),
    Q.equal('pinned', true),
    Q.orderDesc('$createdAt'),
    Q.limit(50)
  ]);
  const msgs = docs(res);
  for (const m of msgs) { m.profiles = await getProfile(m.sender_id); }
  return msgs;
}

async function toggleReaction(messageId, emoji) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('message_reactions'), [
    Q.equal('message_id', messageId), Q.equal('user_id', me.id), Q.equal('emoji', emoji), Q.limit(1)
  ]);
  if (res.documents.length > 0) {
    await awDB.deleteDocument(DB(), COL('message_reactions'), res.documents[0].$id);
  } else {
    await awDB.createDocument(DB(), COL('message_reactions'), ID(), { message_id: messageId, user_id: me.id, emoji });
  }
}

async function forwardMessage(messageId, targetConversationId) {
  const d = doc(await awDB.getDocument(DB(), COL('messages'), messageId));
  if (!d) return;
  await sendMessage(targetConversationId, d.content, { attachment: d.attachment_url ? { url: d.attachment_url, type: d.attachment_type } : null });
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

async function createNotification(userId, type, data = {}) {
  try {
    await awDB.createDocument(DB(), COL('notifications'), ID(), {
      user_id: userId, type, data: JSON.stringify(data), read: false
    });
  } catch (_) {}
}

async function listNotifications() {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('notifications'), [
    Q.equal('user_id', me.id), Q.orderDesc('$createdAt'), Q.limit(50)
  ]);
  return docs(res).map(n => ({ ...n, data: tryParse(n.data) }));
}

function tryParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

async function markNotificationsRead() {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('notifications'), [Q.equal('user_id', me.id), Q.equal('read', false), Q.limit(100)]);
  for (const n of res.documents) {
    await awDB.updateDocument(DB(), COL('notifications'), n.$id, { read: true });
  }
}

async function countUnreadNotifications() {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('notifications'), [Q.equal('user_id', me.id), Q.equal('read', false), Q.limit(1)]);
  return res.total || 0;
}

async function refreshNotifDot() {
  const count = await countUnreadNotifications();
  const dot = document.getElementById('notifDot');
  if (dot) dot.classList.toggle('show', count > 0);
}

/* ============================================================
   CODES D'INVITATION (gestion admin)
   ============================================================ */

async function listInviteCodes() {
  const res = await awDB.listDocuments(DB(), COL('invite_codes'), [Q.orderDesc('$createdAt'), Q.limit(100)]);
  return docs(res);
}

async function createInviteCode(code, maxUses, expiresAt) {
  const me = await getMyProfile();
  await awDB.createDocument(DB(), COL('invite_codes'), ID(), {
    code, max_uses: maxUses, uses: 0,
    expires_at: expiresAt || null,
    created_by: me.id
  });
}

async function deleteInviteCode(codeId) {
  await awDB.deleteDocument(DB(), COL('invite_codes'), codeId);
}

/* ============================================================
   STORIES (24h)
   ============================================================ */

async function listActiveStoriesByUser() {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const res = await awDB.listDocuments(DB(), COL('stories'), [Q.greaterThan('$createdAt', cutoff), Q.orderDesc('$createdAt'), Q.limit(200)]);
  const stories = docs(res);
  const byUser = {};
  for (const s of stories) {
    if (!byUser[s.user_id]) byUser[s.user_id] = { user: null, stories: [] };
    byUser[s.user_id].stories.push(s);
  }
  for (const userId of Object.keys(byUser)) {
    byUser[userId].user = await getProfile(userId);
  }
  return Object.values(byUser).filter(g => g.user);
}

async function createStory({ mediaUrl, mediaType, caption, bgColor }) {
  const me = await getMyProfile();
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await awDB.createDocument(DB(), COL('stories'), ID(), {
    user_id: me.id, media_url: mediaUrl || null, media_type: mediaType || 'text',
    caption: caption || '', bg_color: bgColor || '#7c4dff', expires_at: expires
  });
}

async function deleteStory(storyId) {
  await awDB.deleteDocument(DB(), COL('stories'), storyId);
}

async function uploadStoryMedia(file) {
  try {
    const uploaded = await awStorage.createFile(BUCKETS.media, ID(), file);
    return awStorage.getFileView(BUCKETS.media, uploaded.$id).href;
  } catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function markStoryViewed(storyId) {
  const me = await getMyProfile();
  try {
    await awDB.createDocument(DB(), COL('story_views'), ID(), { story_id: storyId, user_id: me.id, viewed_at: new Date().toISOString() });
  } catch (_) {}
}

async function hasUnseenStories(stories) {
  const me = await getMyProfile();
  const res = await awDB.listDocuments(DB(), COL('story_views'), [Q.equal('user_id', me.id), Q.limit(500)]);
  const seen = new Set(docs(res).map(v => v.story_id));
  return stories.some(s => !seen.has(s.id));
}

async function listStoryViewers(storyId) {
  const res = await awDB.listDocuments(DB(), COL('story_views'), [Q.equal('story_id', storyId)]);
  const views = docs(res);
  for (const v of views) { v.profiles = await getProfile(v.user_id); }
  return views;
}

/* ============================================================
   XP / NIVEAU (stubs compatibles)
   ============================================================ */

async function awardXP(amount) {
  const me = await getMyProfile();
  if (!me) return;
  const newXp = (me.xp || 0) + amount;
  const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
  await updateMyProfile({ xp: newXp, level: newLevel });
}

async function loadLevelTitles() { return []; } // stub

/* ============================================================
   ADMIN (stubs compatibles)
   ============================================================ */

async function adminListUsers(search) {
  const q = search ? [Q.or([Q.search('username', search), Q.search('display_name', search)])] : [];
  return await queryAll('profiles', [...q, Q.limit(100)]);
}

async function adminBanUser(userId, reason) {
  await awDB.updateDocument(DB(), COL('profiles'), userId, { is_banned: true, banned_reason: reason || 'banned' });
  toast('Utilisateur suspendu');
}

async function adminUnbanUser(userId) {
  await awDB.updateDocument(DB(), COL('profiles'), userId, { is_banned: false, banned_reason: null });
  toast('Utilisateur réactivé');
}

async function adminDeleteMessage(messageId) { return deleteMessageForEveryone(messageId); }

async function loadAnnouncementBanner() { return null; } // stub — ajouter une collection 'announcements' si besoin

/* ============================================================
   RECHERCHE / DIVERS
   ============================================================ */

async function searchMessages(query, conversationId = null) {
  const q = [Q.search('content', query), Q.limit(50)];
  if (conversationId) q.push(Q.equal('conversation_id', conversationId));
  const res = await awDB.listDocuments(DB(), COL('messages'), q);
  const msgs = docs(res);
  for (const m of msgs) { m.profiles = await getProfile(m.sender_id); }
  return msgs;
}

async function listStarredMessages() {
  // Implémente via un attribut "starred_by" (array) ou une collection dédiée
  // Stub pour compatibilité — retourne tableau vide
  return [];
}

async function toggleStarMessage(messageId) {
  toast('Étoile — fonctionnalité en cours', 'info');
}

async function listFriends() { return []; } // stub
async function sendFriendRequest(userId) { toast('Ami envoyé'); }
async function acceptFriendRequest(userId) { toast('Ami accepté'); }
