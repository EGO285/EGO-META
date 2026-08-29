/* =========================================================================
   EGO-META — Backend 100 % local (IndexedDB + localStorage)
   Même API publique que appwrite-data.js — app.js / render.js / auth.js
   / stories.js n'ont PAS besoin d'être modifiés.
   ========================================================================= */

/* ── Config ─────────────────────────────────────────────────────────────── */
const EGO_CONFIG = {
  siteName: "EGO-META",
  inviteHint: "Demandez un code d'invitation à l'administrateur."
};

// Compatibilité : signale que le backend est opérationnel
let sbConfigured = true;
function initSupabase() { /* rien à faire, tout est local */ }

/* ── UUID ────────────────────────────────────────────────────────────────── */
function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _nowISO() { return new Date().toISOString(); }

/* ── IndexedDB engine ───────────────────────────────────────────────────── */
const _IDB_NAME    = 'ego_meta_v4';
const _IDB_VERSION = 2;
const _STORES = [
  'profiles','users_auth','conversations','conversation_members',
  'groups','communities','community_members','channels','channel_categories',
  'messages','message_reactions','message_hidden_for',
  'notifications','invite_codes','stories','story_views',
  'blocks','friend_requests'
];

let _idb = null;

function _openDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, _IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      _STORES.forEach(s => {
        if (!db.objectStoreNames.contains(s))
          db.createObjectStore(s, { keyPath: 'id' });
      });
    };
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function _idbGet(store, id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbPut(store, obj) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(obj);
    req.onsuccess = () => resolve(obj);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbDel(store, id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function _idbAll(store) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function _query(store, filter) {
  const all = await _idbAll(store);
  return filter ? all.filter(filter) : all;
}

/* ── Broadcast realtime (entre onglets) ─────────────────────────────────── */
function _broadcast(type, payload) {
  try {
    const bc = new BroadcastChannel('ego_realtime');
    bc.postMessage({ type, payload });
    bc.close();
  } catch(_) {}
}

/* ── Password hash (SubtleCrypto SHA-256) ───────────────────────────────── */
async function _hashPw(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ── Session (localStorage) ─────────────────────────────────────────────── */
const _SESSION_KEY = 'ego_local_session';

function _getSession() {
  try { return JSON.parse(localStorage.getItem(_SESSION_KEY)); } catch(_) { return null; }
}
function _setSession(s) { localStorage.setItem(_SESSION_KEY, JSON.stringify(s)); }
function _clearSession()  { localStorage.removeItem(_SESSION_KEY); }

/* ── Fichiers → base64 (avatars / pièces jointes) ──────────────────────── */
function _fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ============================================================
   AUTH
   ============================================================ */

async function authSignUp(email, password, username, displayName, inviteCode) {
  const valid = await authValidateInvite(inviteCode);
  if (!valid) return { error: { message: "Code d'invitation invalide ou expiré." } };

  // Vérifie que l'email n'est pas déjà pris
  const existing = await _query('users_auth', u => u.email === email.toLowerCase());
  if (existing.length > 0) return { error: { message: 'Cet email est déjà utilisé.' } };

  const usernameUsed = await _query('profiles', p => p.username === username);
  if (usernameUsed.length > 0) return { error: { message: "Ce nom d'utilisateur est déjà pris." } };

  try {
    const userId   = _uuid();
    const pwHash   = await _hashPw(password);
    const now      = _nowISO();

    await _idbPut('users_auth', { id: userId, email: email.toLowerCase(), pw_hash: pwHash });
    await _idbPut('profiles', {
      id: userId, username, display_name: displayName, email: email.toLowerCase(),
      avatar_url: null, bio: '', status: 'online',
      is_site_admin: false, is_banned: false, banned_reason: null,
      xp: 0, level: 1, created_at: now, updated_at: now
    });

    _setSession({ id: userId, email: email.toLowerCase(), display_name: displayName });
    await _redeemInvite(inviteCode);
    return { data: { id: userId }, error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function authSignIn(email, password) {
  try {
    const user = (await _query('users_auth', u => u.email === email.toLowerCase()))[0];
    if (!user) return { error: { message: 'Email ou mot de passe incorrect.' } };
    const hash = await _hashPw(password);
    if (hash !== user.pw_hash) return { error: { message: 'Email ou mot de passe incorrect.' } };
    const profile = await _idbGet('profiles', user.id);
    if (!profile) return { error: { message: 'Profil introuvable.' } };
    if (profile.is_banned) return { error: { message: 'Compte suspendu : ' + (profile.banned_reason || '') } };
    _setSession({ id: user.id, email: user.email, display_name: profile.display_name });
    return { data: { id: user.id }, error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function authSignInWithOAuth() {
  return { error: { message: 'OAuth non disponible en mode local.' } };
}

async function authSignOut() {
  _clearSession();
}

async function authResetPassword(email) {
  // En mode local, on ne peut pas envoyer d'email
  toast('Mode local : réinitialisation par email impossible. Contactez l\'admin.', 'info');
  return { error: null };
}

async function authUpdatePassword(newPassword) {
  const sess = _getSession();
  if (!sess) return { error: { message: 'Non connecté.' } };
  try {
    const hash = await _hashPw(newPassword);
    const user = await _idbGet('users_auth', sess.id);
    if (!user) return { error: { message: 'Utilisateur introuvable.' } };
    await _idbPut('users_auth', { ...user, pw_hash: hash });
    return { error: null };
  } catch (err) { return { error: { message: err.message } }; }
}

async function checkExistingSession() {
  const sess = _getSession();
  if (!sess) return false;
  const profile = await _idbGet('profiles', sess.id);
  if (!profile) { _clearSession(); return false; }
  return true;
}

async function authValidateInvite(code) {
  if (!code) return false;
  const invites = await _query('invite_codes', i => i.code === code);
  const inv = invites[0];
  if (!inv) return false;
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return false;
  if (inv.uses >= inv.max_uses) return false;
  return true;
}

async function _redeemInvite(code) {
  const invites = await _query('invite_codes', i => i.code === code);
  const inv = invites[0];
  if (!inv) return;
  await _idbPut('invite_codes', { ...inv, uses: (inv.uses || 0) + 1 });
}

async function authRedeemPendingInviteIfAny() {
  const code = localStorage.getItem('ego_pending_invite');
  if (code) { await _redeemInvite(code); localStorage.removeItem('ego_pending_invite'); }
}

async function activateAccountWithInvite(code) {
  const valid = await authValidateInvite(code);
  if (!valid) return { error: { message: 'Code invalide ou expiré.' } };
  const me = await _getMe();
  if (!me) return { error: { message: 'Non connecté.' } };
  const profile = await _idbGet('profiles', me.id);
  await _idbPut('profiles', { ...profile, is_banned: false, banned_reason: null });
  await _redeemInvite(code);
  return { data: true };
}

/* ============================================================
   PROFILS
   ============================================================ */

async function _getMe() {
  const sess = _getSession();
  return sess || null;
}

async function getMyProfile() {
  const sess = _getSession();
  if (!sess) return null;
  return _idbGet('profiles', sess.id);
}

async function getProfile(userId) {
  return _idbGet('profiles', userId);
}

async function updateMyProfile(fields) {
  const me = await getMyProfile();
  if (!me) return { error: { message: 'Non connecté.' } };
  const updated = { ...me, ...fields, updated_at: _nowISO() };
  await _idbPut('profiles', updated);
  if (fields.display_name) {
    const sess = _getSession();
    _setSession({ ...sess, display_name: fields.display_name });
  }
  return { data: updated, error: null };
}

async function searchProfiles(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return _query('profiles', p =>
    (p.username || '').toLowerCase().includes(q) ||
    (p.display_name || '').toLowerCase().includes(q)
  );
}

async function uploadAvatar(file) {
  try {
    const dataUrl = await _fileToDataURL(file);
    await updateMyProfile({ avatar_url: dataUrl });
    return dataUrl;
  } catch (err) { toast('Échec envoi photo : ' + err.message, 'error'); return null; }
}

async function uploadAttachment(file) {
  try {
    const dataUrl = await _fileToDataURL(file);
    return { url: dataUrl, type: file.type };
  } catch (err) { toast('Échec envoi fichier : ' + err.message, 'error'); return null; }
}

/* ============================================================
   CONVERSATIONS
   ============================================================ */

async function listMyConversations() {
  const me = await getMyProfile();
  if (!me) return [];
  return _query('conversation_members', m => m.user_id === me.id);
}

async function _getConv(id) { return _idbGet('conversations', id); }

async function listDMs() {
  const me = await getMyProfile();
  const rows = await listMyConversations();
  const results = [];
  for (const row of rows) {
    if (row.archived) continue;
    const conv = await _getConv(row.conversation_id);
    if (!conv || conv.type !== 'dm') continue;
    const members = await _query('conversation_members', m => m.conversation_id === row.conversation_id);
    const other = members.find(m => m.user_id !== me.id);
    if (!other) continue;
    const otherProfile = await getProfile(other.user_id);
    const lastMsg = await getLastMessage(row.conversation_id);
    const unread  = await countUnread(row.conversation_id, row.last_read_at);
    results.push({ conversation_id: row.conversation_id, other: otherProfile, lastMsg, unread, muted: row.muted, pinned: row.pinned });
  }
  results.sort((a,b) => (b.pinned-a.pinned) || (new Date(b.lastMsg?.created_at||0)-new Date(a.lastMsg?.created_at||0)));
  return results;
}

async function listGroups() {
  const me = await getMyProfile();
  const rows = await listMyConversations();
  const results = [];
  for (const row of rows) {
    if (row.archived) continue;
    const conv = await _getConv(row.conversation_id);
    if (!conv || conv.type !== 'group') continue;
    const groups = await _query('groups', g => g.conversation_id === row.conversation_id);
    const group  = groups[0];
    if (!group) continue;
    const lastMsg = await getLastMessage(row.conversation_id);
    const unread  = await countUnread(row.conversation_id, row.last_read_at);
    results.push({ conversation_id: row.conversation_id, group, lastMsg, unread, role: row.role, muted: row.muted, pinned: row.pinned });
  }
  results.sort((a,b) => (b.pinned-a.pinned) || (new Date(b.lastMsg?.created_at||0)-new Date(a.lastMsg?.created_at||0)));
  return results;
}

async function getConversationType(conversationId) {
  const conv = await _getConv(conversationId);
  return conv?.type || null;
}

async function getLastMessage(conversationId) {
  const msgs = await _query('messages', m => m.conversation_id === conversationId && !m.deleted);
  if (!msgs.length) return null;
  return msgs.sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
}

async function countUnread(conversationId, lastReadAt) {
  const msgs = await _query('messages', m => {
    if (m.conversation_id !== conversationId) return false;
    if (!lastReadAt) return true;
    return new Date(m.created_at) > new Date(lastReadAt);
  });
  return msgs.length;
}

async function markRead(conversationId) {
  const me = await getMyProfile();
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === me.id);
  const row = rows[0];
  if (row) await _idbPut('conversation_members', { ...row, last_read_at: _nowISO() });
}

async function createDM(otherUserId) {
  const me = await getMyProfile();
  // Cherche un DM existant
  const myRows = await listMyConversations();
  for (const row of myRows) {
    const conv = await _getConv(row.conversation_id);
    if (!conv || conv.type !== 'dm') continue;
    const members = await _query('conversation_members', m => m.conversation_id === row.conversation_id);
    if (members.some(m => m.user_id === otherUserId)) return row.conversation_id;
  }
  const convId = _uuid();
  const now    = _nowISO();
  await _idbPut('conversations', { id: convId, type: 'dm', created_at: now });
  await _idbPut('conversation_members', { id: _uuid(), conversation_id: convId, user_id: me.id,       role: 'member', last_read_at: now, muted: false, pinned: false, archived: false });
  await _idbPut('conversation_members', { id: _uuid(), conversation_id: convId, user_id: otherUserId, role: 'member', last_read_at: now, muted: false, pinned: false, archived: false });
  return convId;
}

async function leaveConversation(conversationId) {
  const me = await getMyProfile();
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === me.id);
  if (rows[0]) await _idbDel('conversation_members', rows[0].id);
  toast('Conversation quittée');
}

async function togglePinConversation(conversationId, pinned) {
  const me = await getMyProfile();
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === me.id);
  if (rows[0]) await _idbPut('conversation_members', { ...rows[0], pinned });
}

async function setConversationMute(conversationId, mutedUntil) {
  const me = await getMyProfile();
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === me.id);
  if (rows[0]) await _idbPut('conversation_members', { ...rows[0], muted: true, muted_until: mutedUntil || null });
}

async function unmuteConversation(conversationId) {
  const me = await getMyProfile();
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === me.id);
  if (rows[0]) await _idbPut('conversation_members', { ...rows[0], muted: false, muted_until: null });
}

async function setConversationArchived(conversationId, archived) {
  const me = await getMyProfile();
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === me.id);
  if (rows[0]) await _idbPut('conversation_members', { ...rows[0], archived });
}

async function listArchivedConversations() {
  const me = await getMyProfile();
  const rows = (await listMyConversations()).filter(r => r.archived);
  const results = [];
  for (const row of rows) {
    const conv = await _getConv(row.conversation_id);
    const lastMsg = await getLastMessage(row.conversation_id);
    if (conv.type === 'dm') {
      const members = await _query('conversation_members', m => m.conversation_id === row.conversation_id);
      const other = members.find(m => m.user_id !== me.id);
      if (!other) continue;
      results.push({ conversation_id: row.conversation_id, kind: 'dm', other: await getProfile(other.user_id), lastMsg });
    } else if (conv.type === 'group') {
      const groups = await _query('groups', g => g.conversation_id === row.conversation_id);
      const group  = groups[0];
      if (!group) continue;
      results.push({ conversation_id: row.conversation_id, kind: 'group', group, lastMsg });
    }
  }
  return results;
}

/* ============================================================
   GROUPES
   ============================================================ */

async function createGroup(name, description) {
  const me = await getMyProfile();
  const convId = _uuid();
  const now    = _nowISO();
  await _idbPut('conversations', { id: convId, type: 'group', created_at: now });
  const groupId = _uuid();
  await _idbPut('groups', {
    id: groupId, conversation_id: convId, name, description: description || '',
    invite_code: Math.random().toString(36).slice(2,10).toUpperCase(),
    slow_mode_seconds: 0, icon_url: null, created_at: now
  });
  await _idbPut('conversation_members', {
    id: _uuid(), conversation_id: convId, user_id: me.id, role: 'owner',
    last_read_at: now, muted: false, pinned: false, archived: false
  });
  return convId;
}

async function joinGroupByInvite(code) {
  const me = await getMyProfile();
  const groups = await _query('groups', g => g.invite_code === code);
  const group  = groups[0];
  if (!group) { toast('Code invalide', 'error'); return null; }
  const already = await _query('conversation_members', m => m.conversation_id === group.conversation_id && m.user_id === me.id);
  if (already.length) { toast('Déjà membre de ce groupe'); return group.conversation_id; }
  await _idbPut('conversation_members', {
    id: _uuid(), conversation_id: group.conversation_id, user_id: me.id, role: 'member',
    last_read_at: _nowISO(), muted: false, pinned: false, archived: false
  });
  toast('Groupe rejoint ✓', 'success');
  return group.conversation_id;
}

async function getGroup(conversationId) {
  const groups = await _query('groups', g => g.conversation_id === conversationId);
  return groups[0] || null;
}

async function updateGroup(conversationId, fields) {
  const groups = await _query('groups', g => g.conversation_id === conversationId);
  const group  = groups[0];
  if (!group) return;
  await _idbPut('groups', { ...group, ...fields });
  toast('Groupe mis à jour ✓', 'success');
}

async function uploadGroupIcon(conversationId, file) {
  try {
    const url = await _fileToDataURL(file);
    await updateGroup(conversationId, { icon_url: url });
    return url;
  } catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function listConversationMembers(conversationId) {
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId);
  return Promise.all(rows.map(async r => ({ ...r, profiles: await getProfile(r.user_id) })));
}

async function kickMember(conversationId, userId) {
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === userId);
  if (rows[0]) await _idbDel('conversation_members', rows[0].id);
  toast('Membre exclu');
}

async function setConversationRole(conversationId, userId, role) {
  const rows = await _query('conversation_members', m => m.conversation_id === conversationId && m.user_id === userId);
  if (rows[0]) await _idbPut('conversation_members', { ...rows[0], role });
  toast('Rôle mis à jour ✓', 'success');
}

/* ============================================================
   COMMUNAUTÉS
   ============================================================ */

async function createCommunity(name, description, isPublic) {
  const me = await getMyProfile();
  const communityId = _uuid();
  const now = _nowISO();
  await _idbPut('communities', {
    id: communityId, name, description: description || '', is_public: isPublic,
    invite_code: Math.random().toString(36).slice(2,10).toUpperCase(),
    icon_url: null, banner_url: null, created_at: now
  });
  await _idbPut('community_members', { id: _uuid(), community_id: communityId, user_id: me.id, role: 'owner', created_at: now });
  return communityId;
}

async function listMyCommunities() {
  const me = await getMyProfile();
  const rows = await _query('community_members', m => m.user_id === me.id);
  const result = [];
  for (const row of rows) {
    const comm = await _idbGet('communities', row.community_id);
    if (comm) result.push({ ...comm, myRole: row.role });
  }
  return result;
}

async function discoverPublicCommunities() {
  return _query('communities', c => c.is_public);
}

async function joinCommunity(communityId) {
  const me = await getMyProfile();
  const already = await _query('community_members', m => m.community_id === communityId && m.user_id === me.id);
  if (already.length) { toast('Déjà membre'); return; }
  await _idbPut('community_members', { id: _uuid(), community_id: communityId, user_id: me.id, role: 'member', created_at: _nowISO() });
  toast('Communauté rejointe ✓', 'success');
}

async function joinCommunityByInvite(code) {
  const comms = await _query('communities', c => c.invite_code === code);
  const comm  = comms[0];
  if (!comm) { toast('Code invalide', 'error'); return null; }
  await joinCommunity(comm.id);
  return comm.id;
}

async function getCommunity(id) { return _idbGet('communities', id); }

async function updateCommunity(id, fields) {
  const comm = await _idbGet('communities', id);
  if (!comm) return;
  await _idbPut('communities', { ...comm, ...fields });
  toast('Communauté mise à jour ✓', 'success');
}

async function uploadCommunityIcon(communityId, file) {
  try { const url = await _fileToDataURL(file); await updateCommunity(communityId, { icon_url: url }); return url; }
  catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function uploadCommunityBanner(communityId, file) {
  try { const url = await _fileToDataURL(file); await updateCommunity(communityId, { banner_url: url }); return url; }
  catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function listChannels(communityId) {
  const channels = await _query('channels', c => c.community_id === communityId);
  return channels.sort((a,b) => (a.position||0)-(b.position||0));
}

async function listCategories(communityId) {
  const cats = await _query('channel_categories', c => c.community_id === communityId);
  return cats.sort((a,b) => (a.position||0)-(b.position||0));
}

async function createChannel(communityId, name, categoryId, description) {
  const convId = _uuid();
  const now    = _nowISO();
  await _idbPut('conversations', { id: convId, type: 'channel', created_at: now });
  const chanId = _uuid();
  await _idbPut('channels', {
    id: chanId, community_id: communityId, conversation_id: convId,
    name, description: description || '', position: 0, category_id: categoryId || null, created_at: now
  });
  return chanId;
}

async function updateChannel(channelId, fields) {
  const channel = await _idbGet('channels', channelId);
  if (!channel) return;
  await _idbPut('channels', { ...channel, ...fields });
  toast('Salon mis à jour ✓', 'success');
}

async function listCommunityMembers(communityId) {
  const rows = await _query('community_members', m => m.community_id === communityId);
  return Promise.all(rows.map(async r => ({ ...r, profiles: await getProfile(r.user_id) })));
}

async function setCommunityRole(communityId, userId, role) {
  const rows = await _query('community_members', m => m.community_id === communityId && m.user_id === userId);
  if (rows[0]) await _idbPut('community_members', { ...rows[0], role });
  toast('Rôle mis à jour ✓', 'success');
}

async function kickCommunityMember(communityId, userId) {
  const rows = await _query('community_members', m => m.community_id === communityId && m.user_id === userId);
  if (rows[0]) await _idbDel('community_members', rows[0].id);
  toast('Membre exclu');
}

async function getChannelByConversationId(conversationId) {
  const channels = await _query('channels', c => c.conversation_id === conversationId);
  return channels[0] || null;
}

/* ============================================================
   MESSAGES
   ============================================================ */

async function listMessages(conversationId, before = null, limit = 50) {
  let msgs = await _query('messages', m => m.conversation_id === conversationId && !m.deleted);
  if (before) msgs = msgs.filter(m => new Date(m.created_at) < new Date(before));
  msgs.sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
  msgs = msgs.slice(-limit);

  const hidden = new Set(await listHiddenMessageIds(conversationId));
  const enriched = [];
  for (const m of msgs) {
    if (hidden.has(m.id)) continue;
    const profile  = await getProfile(m.sender_id);
    const reactions = await _query('message_reactions', r => r.message_id === m.id);
    let reply = null;
    if (m.reply_to_id) {
      const rd = await _idbGet('messages', m.reply_to_id);
      if (rd) reply = { ...rd, profiles: await getProfile(rd.sender_id) };
    }
    enriched.push({ ...m, profiles: profile, message_reactions: reactions, reply });
  }
  return enriched;
}

async function sendMessage(conversationId, content, { replyToId = null, attachment = null, isTagAll = false, mentionedUserIds = [] } = {}) {
  const me = await getMyProfile();
  try {
    const msgId = _uuid();
    const now   = _nowISO();
    const msg = {
      id: msgId, conversation_id: conversationId, sender_id: me.id, content,
      created_at: now, edited_at: null, reply_to_id: replyToId || null,
      attachment_url: attachment?.url || null, attachment_type: attachment?.type || null,
      is_tag_all: isTagAll || false, deleted: false, pinned: false
    };
    await _idbPut('messages', msg);

    // Broadcast realtime
    _broadcast('message_create', { ...msg, profiles: me, message_reactions: [], reply: null });

    // Notifications mention
    for (const uid of mentionedUserIds) {
      await createNotification(uid, 'mention', { conversation_id: conversationId, message_id: msgId, from: me.display_name });
    }
    if (isTagAll) {
      const members = await _query('conversation_members', m => m.conversation_id === conversationId);
      for (const m of members) {
        if (m.user_id !== me.id)
          await createNotification(m.user_id, 'tag_all', { conversation_id: conversationId, message_id: msgId });
      }
    }
    return msg;
  } catch (err) { toast(err.message, 'error'); return null; }
}

async function editMessage(messageId, content) {
  const msg = await _idbGet('messages', messageId);
  if (!msg) return;
  const updated = { ...msg, content, edited_at: _nowISO() };
  await _idbPut('messages', updated);
  _broadcast('message_update', updated);
}

async function deleteMessageForEveryone(messageId) {
  const msg = await _idbGet('messages', messageId);
  if (!msg) return;
  const updated = { ...msg, deleted: true, content: '', attachment_url: null, attachment_type: null };
  await _idbPut('messages', updated);
  _broadcast('message_update', updated);
}

async function deleteMessageForMe(messageId) {
  const me = await getMyProfile();
  await _idbPut('message_hidden_for', { id: _uuid(), message_id: messageId, user_id: me.id });
}

async function deleteMessage(messageId) { return deleteMessageForEveryone(messageId); }

async function listHiddenMessageIds() {
  const me = await getMyProfile();
  const rows = await _query('message_hidden_for', r => r.user_id === me.id);
  return rows.map(r => r.message_id);
}

async function togglePin(messageId, pinned) {
  const msg = await _idbGet('messages', messageId);
  if (!msg) return;
  await _idbPut('messages', { ...msg, pinned });
}

async function listPinned(conversationId) {
  const msgs = await _query('messages', m => m.conversation_id === conversationId && m.pinned && !m.deleted);
  for (const m of msgs) { m.profiles = await getProfile(m.sender_id); }
  return msgs.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
}

async function toggleReaction(messageId, emoji) {
  const me  = await getMyProfile();
  const rows = await _query('message_reactions', r => r.message_id === messageId && r.user_id === me.id && r.emoji === emoji);
  if (rows.length > 0) {
    await _idbDel('message_reactions', rows[0].id);
    _broadcast('reaction_change', { message_id: messageId, action: 'delete', user_id: me.id, emoji });
  } else {
    const reaction = { id: _uuid(), message_id: messageId, user_id: me.id, emoji };
    await _idbPut('message_reactions', reaction);
    _broadcast('reaction_change', { ...reaction, action: 'create' });
  }
}

async function forwardMessage(messageId, targetConversationId) {
  const msg = await _idbGet('messages', messageId);
  if (!msg) return;
  await sendMessage(targetConversationId, msg.content, {
    attachment: msg.attachment_url ? { url: msg.attachment_url, type: msg.attachment_type } : null
  });
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

async function createNotification(userId, type, data = {}) {
  try {
    await _idbPut('notifications', {
      id: _uuid(), user_id: userId, type,
      data: JSON.stringify(data), read: false, created_at: _nowISO()
    });
    _broadcast('notification', { user_id: userId, type });
  } catch(_) {}
}

async function listNotifications() {
  const me = await getMyProfile();
  const all = await _query('notifications', n => n.user_id === me.id);
  return all
    .sort((a,b) => new Date(b.created_at)-new Date(a.created_at))
    .slice(0, 50)
    .map(n => ({ ...n, data: _tryParse(n.data) }));
}

function _tryParse(s) { try { return JSON.parse(s); } catch(_) { return {}; } }
function tryParse(s) { return _tryParse(s); }

async function markNotificationsRead() {
  const me  = await getMyProfile();
  const all = await _query('notifications', n => n.user_id === me.id && !n.read);
  for (const n of all) await _idbPut('notifications', { ...n, read: true });
}

async function countUnreadNotifications() {
  const me  = await getMyProfile();
  const all = await _query('notifications', n => n.user_id === me.id && !n.read);
  return all.length;
}

async function refreshNotifDot() {
  const count = await countUnreadNotifications();
  const dot   = document.getElementById('notifDot');
  if (dot) dot.classList.toggle('show', count > 0);
}

/* ============================================================
   CODES D'INVITATION
   ============================================================ */

async function listInviteCodes() {
  return (await _idbAll('invite_codes')).sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0));
}

async function createInviteCode(code, maxUses, expiresAt) {
  const me = await getMyProfile();
  await _idbPut('invite_codes', {
    id: _uuid(), code, max_uses: maxUses, uses: 0,
    expires_at: expiresAt || null, created_by: me?.id || null, created_at: _nowISO()
  });
}

async function deleteInviteCode(codeId) {
  await _idbDel('invite_codes', codeId);
}

/* ============================================================
   STORIES
   ============================================================ */

async function listActiveStoriesByUser() {
  const cutoff = new Date(Date.now() - 24*3600*1000).toISOString();
  const all    = await _query('stories', s => s.created_at > cutoff);
  all.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  const byUser = {};
  for (const s of all) {
    if (!byUser[s.user_id]) byUser[s.user_id] = { user: null, stories: [] };
    byUser[s.user_id].stories.push(s);
  }
  for (const uid of Object.keys(byUser)) {
    byUser[uid].user = await getProfile(uid);
  }
  return Object.values(byUser).filter(g => g.user);
}

async function createStory({ mediaUrl, mediaType, caption, bgColor }) {
  const me   = await getMyProfile();
  const now  = _nowISO();
  await _idbPut('stories', {
    id: _uuid(), user_id: me.id, media_url: mediaUrl || null,
    media_type: mediaType || 'text', caption: caption || '',
    bg_color: bgColor || '#7c4dff', created_at: now,
    expires_at: new Date(Date.now() + 24*3600*1000).toISOString()
  });
}

async function deleteStory(storyId) { await _idbDel('stories', storyId); }

async function uploadStoryMedia(file) {
  try { return _fileToDataURL(file); }
  catch (err) { toast('Échec : ' + err.message, 'error'); return null; }
}

async function markStoryViewed(storyId) {
  const me = await getMyProfile();
  try {
    await _idbPut('story_views', { id: _uuid(), story_id: storyId, user_id: me.id, viewed_at: _nowISO() });
  } catch(_) {}
}

async function hasUnseenStories(stories) {
  const me   = await getMyProfile();
  const seen = new Set((await _query('story_views', v => v.user_id === me.id)).map(v => v.story_id));
  return stories.some(s => !seen.has(s.id));
}

async function listStoryViewers(storyId) {
  const views = await _query('story_views', v => v.story_id === storyId);
  for (const v of views) { v.profiles = await getProfile(v.user_id); }
  return views;
}

/* ============================================================
   XP / NIVEAU
   ============================================================ */

async function awardXP(amount) {
  const me = await getMyProfile();
  if (!me) return;
  const newXp    = (me.xp || 0) + amount;
  const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
  await updateMyProfile({ xp: newXp, level: newLevel });
}

async function loadLevelTitles() { return []; }

/* ============================================================
   ADMIN
   ============================================================ */

async function adminListUsers(search) {
  if (!search) return _idbAll('profiles');
  const q = search.toLowerCase();
  return _query('profiles', p =>
    (p.username||'').toLowerCase().includes(q) ||
    (p.display_name||'').toLowerCase().includes(q)
  );
}

async function adminBanUser(userId, reason) {
  const p = await _idbGet('profiles', userId);
  if (!p) return;
  await _idbPut('profiles', { ...p, is_banned: true, banned_reason: reason || 'banned' });
  toast('Utilisateur suspendu');
}

async function adminUnbanUser(userId) {
  const p = await _idbGet('profiles', userId);
  if (!p) return;
  await _idbPut('profiles', { ...p, is_banned: false, banned_reason: null });
  toast('Utilisateur réactivé');
}

async function adminDeleteMessage(messageId) { return deleteMessageForEveryone(messageId); }

async function loadAnnouncementBanner() { return null; }

/* ============================================================
   RECHERCHE / DIVERS
   ============================================================ */

async function searchMessages(query, conversationId = null) {
  const q = query.toLowerCase();
  let msgs = await _query('messages', m => !m.deleted && (m.content||'').toLowerCase().includes(q));
  if (conversationId) msgs = msgs.filter(m => m.conversation_id === conversationId);
  msgs = msgs.slice(0, 50);
  for (const m of msgs) { m.profiles = await getProfile(m.sender_id); }
  return msgs;
}

async function listStarredMessages() { return []; }
async function toggleStarMessage()   { toast('Fonctionnalité en cours', 'info'); }
async function listFriends()         { return []; }
async function sendFriendRequest()   { toast('Demande envoyée'); }
async function acceptFriendRequest() { toast('Ami accepté'); }
async function listIncomingFriendRequests() { return []; }
async function removeFriend()        { toast('Ami retiré'); }
async function declineFriendRequest(){ /* stub */ }

/* ============================================================
   BLOCAGE D'UTILISATEURS
   ============================================================ */

async function blockUser(userId) {
  const me = await getMyProfile();
  if (!me) return;
  const existing = await _query('blocks', b => b.blocker_id === me.id && b.blocked_id === userId);
  if (existing.length) return; // déjà bloqué
  await _idbPut('blocks', { id: _uuid(), blocker_id: me.id, blocked_id: userId, created_at: _nowISO() });
  toast('Utilisateur bloqué');
}

async function unblockUser(userId) {
  const me = await getMyProfile();
  if (!me) return;
  const rows = await _query('blocks', b => b.blocker_id === me.id && b.blocked_id === userId);
  for (const r of rows) await _idbDel('blocks', r.id);
  toast('Utilisateur débloqué');
}

async function listBlocked() {
  const me = await getMyProfile();
  if (!me) return [];
  const rows = await _query('blocks', b => b.blocker_id === me.id);
  const result = [];
  for (const r of rows) {
    const profile = await getProfile(r.blocked_id);
    result.push({ ...r, profiles: profile });
  }
  return result;
}

/* ============================================================
   PARAMÈTRES DU SITE
   ============================================================ */

async function getSiteSettings() {
  // Retourne des valeurs par défaut — tout est local, pas de BDD distante
  return {
    id: true,
    maintenance_mode: false,
    registration_open: true,
    require_invite: true,
    site_name: EGO_CONFIG.siteName,
    max_file_size_mb: 10
  };
}

/* ============================================================
   SIGNALEMENT DE CONTENU
   ============================================================ */

async function reportContent({ targetType, targetUserId, targetMessageId, reason, details } = {}) {
  // Stocke localement pour que l'admin puisse voir les signalements
  await _idbPut('notifications', {
    id: _uuid(),
    user_id: 'system',
    type: 'report',
    data: JSON.stringify({ targetType, targetUserId, targetMessageId, reason, details }),
    read: false,
    created_at: _nowISO()
  });
  toast('Signalement envoyé, merci', 'success');
}

/* ============================================================
   INITIALISATION — crée un code invite admin par défaut
   ============================================================ */
async function _ensureDefaultInvite() {
  const existing = await _query('invite_codes', i => i.code === 'ADMIN2024');
  if (!existing.length) {
    await _idbPut('invite_codes', {
      id: _uuid(), code: 'ADMIN2024', max_uses: 999, uses: 0,
      expires_at: null, created_by: null, created_at: _nowISO()
    });
  }
}

_openDB().then(_ensureDefaultInvite).catch(console.error);

/* ============================================================
   EXPORT / IMPORT des données (multi-appareils)
   ============================================================ */

async function exportAllData() {
  const dump = {};
  for (const store of _STORES) {
    dump[store] = await _idbAll(store);
  }
  dump._session  = _getSession();
  dump._exported = _nowISO();
  dump._version  = 1;

  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'egometa-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Export téléchargé ✓', 'success');
}

async function importAllData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const dump = JSON.parse(e.target.result);
        if (!dump._version) throw new Error('Fichier invalide.');

        for (const store of _STORES) {
          if (!Array.isArray(dump[store])) continue;
          const db = await _openDB();
          await new Promise((res, rej) => {
            const tx  = db.transaction(store, 'readwrite');
            const os  = tx.objectStore(store);
            // On fusionne : on n'écrase pas ce qui existe déjà sauf si plus récent
            dump[store].forEach(obj => {
              const req = os.get(obj.id);
              req.onsuccess = () => {
                const existing = req.result;
                if (!existing || (obj.updated_at && existing.updated_at && obj.updated_at > existing.updated_at) || !existing.updated_at) {
                  os.put(obj);
                }
              };
            });
            tx.oncomplete = res;
            tx.onerror    = () => rej(tx.error);
          });
        }

        // Restaure la session si aucune session active
        if (dump._session && !_getSession()) {
          _setSession(dump._session);
        }

        toast('Import réussi — rechargement…', 'success');
        setTimeout(() => location.reload(), 1200);
        resolve();
      } catch (err) {
        toast('Erreur import : ' + err.message, 'error');
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// Injecte les boutons Export/Import dans les paramètres si la page est prête
function _injectSyncButtons() {
  // On cherche un conteneur settings existant ; sinon on crée un bouton flottant discret
  const existing = document.getElementById('egoSyncButtons');
  if (existing) return;

  const wrap = document.createElement('div');
  wrap.id = 'egoSyncButtons';
  wrap.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:9000;display:flex;flex-direction:column;gap:8px;';

  const btnExport = document.createElement('button');
  btnExport.textContent = '⬇ Exporter';
  btnExport.title = 'Exporter toutes les données pour les importer sur un autre appareil';
  btnExport.style.cssText = 'background:var(--accent,#7c4dff);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);';
  btnExport.onclick = exportAllData;

  const btnImport = document.createElement('button');
  btnImport.textContent = '⬆ Importer';
  btnImport.title = 'Importer un fichier exporté depuis un autre appareil';
  btnImport.style.cssText = 'background:var(--bg-panel,#1a1a2e);color:var(--text,#fff);border:1px solid var(--border,#333);border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);';
  btnImport.onclick = () => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json';
    input.onchange = e => { if (e.target.files[0]) importAllData(e.target.files[0]); };
    input.click();
  };

  wrap.appendChild(btnExport);
  wrap.appendChild(btnImport);
  document.body.appendChild(wrap);
}

// Injecte les boutons dès que le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _injectSyncButtons);
} else {
  // DOM déjà prêt, on attend un tick pour que app.js ait rendu l'UI
  setTimeout(_injectSyncButtons, 500);
}
