/* =========================================================================
   EGO-META — Orchestrateur principal de l'application
   ========================================================================= */

const App = {
  me: null,
  view: 'dms',
  activeConversationId: null,
  activeKind: null, // 'dm' | 'group' | 'channel'
  activeGroup: null,
  activeCommunity: null,
  activeChannelId: null,
  replyTo: null,
  typingUsers: {},
  accentPalette: ['#7c4dff', '#e5555c', '#00e5a0', '#ffb547', '#4fd6e8', '#e05fb0', '#34c98e'],
  mentionCandidates: []
};

document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  initBrowserNotify();
  if (!sbConfigured) return;
  initAuthScreen();
  wireGlobalUI();

  const hasSession = await checkExistingSession();
  if (hasSession) { await onLoginSuccess(); }
});

async function onLoginSuccess() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appShell').classList.add('show');

  App.me = await getMyProfile();
  if (!App.me) { toast('Erreur de chargement du profil.', 'error'); return; }

  if (App.me.is_banned) {
    document.getElementById('appShell').classList.remove('show');
    document.getElementById('authScreen').style.display = 'flex';
    if (App.me.banned_reason === 'invite_required') {
      // Compte créé via Google/GitHub (ou API directe) sans code d'invitation transmis :
      // on le GARDE connecté (activate_account_with_invite() a besoin de auth.uid()) mais
      // on l'affiche comme "en attente d'activation" plutôt que "banni".
      showAuthForm('activateForm');
      return;
    }
    authError('Votre compte a été suspendu' + (App.me.banned_reason ? ' : ' + App.me.banned_reason : '.'));
    await authSignOut();
    return;
  }

  await loadLevelTitles();
  applyTheme(App.me.theme, App.me.accent_color);
  renderMyAvatar();
  await loadAnnouncementBanner();

  if (App.me.is_site_admin) document.getElementById('adminRailBtn').classList.remove('hidden');

  subscribeToNotifications(App.me.id, onIncomingNotification);
  subscribeGlobalPresence(App.me.id, App.me.display_name, () => {});
  refreshNotifDot();
  setInterval(refreshNotifDot, 30000);

  applyDensity(localStorage.getItem('ego_density') || 'comfortable');
  toggleNotifSound(localStorage.getItem('ego_notif_sound') !== 'off');
  initIdleDetection();

  switchView('dms');
  maybeShowOnboarding();
}

function applyTheme(theme, accent) {
  document.body.classList.toggle('theme-light', theme === 'light');
  if (accent) document.documentElement.style.setProperty('--accent', accent);
}

function applyDensity(density) {
  document.body.classList.toggle('density-compact', density === 'compact');
  localStorage.setItem('ego_density', density);
}

/* Passage automatique au statut "absent" après 5 min d'inactivité (souris/clavier) */
function initIdleDetection() {
  let idleTimer;
  const goAway = async () => {
    if (App.me.status === 'online') { await updateMyProfile({ status: 'away' }); App.me.status = 'away'; }
  };
  const goActive = async () => {
    clearTimeout(idleTimer);
    if (App.me.status === 'away') { await updateMyProfile({ status: 'online' }); App.me.status = 'online'; }
    idleTimer = setTimeout(goAway, 5 * 60 * 1000);
  };
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => document.addEventListener(ev, debounce(goActive, 1000)));
  idleTimer = setTimeout(goAway, 5 * 60 * 1000);
}

function maybeShowOnboarding() {
  if (localStorage.getItem('ego_onboarded')) return;
  let step = 1;
  const total = document.querySelectorAll('.onboarding-step').length;
  document.getElementById('onb_dots').innerHTML = Array.from({ length: total }, (_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('');
  document.getElementById('onb_next').onclick = () => {
    step++;
    if (step > total) { localStorage.setItem('ego_onboarded', '1'); closeModal('modalOnboarding'); return; }
    document.querySelectorAll('.onboarding-step').forEach(s => s.classList.toggle('active', +s.dataset.onb === step));
    document.querySelectorAll('#onb_dots span').forEach((d, i) => d.classList.toggle('active', i === step - 1));
    document.getElementById('onb_next').textContent = step === total ? 'Commencer !' : 'Suivant';
  };
  openModal('modalOnboarding');
}

function renderMyAvatar() {
  document.getElementById('myAvatarBtn').innerHTML = avatarHtml(App.me);
}

async function loadAnnouncementBanner() {
  const settings = await getSiteSettings();
  if (settings?.announcement_active && settings.announcement) {
    document.getElementById('announcementText').innerHTML = icon('megaphone') + ' ' + esc(settings.announcement);
    document.getElementById('announcementBanner').classList.add('show');
  }
  if (settings?.site_name) document.querySelectorAll('[data-site-name]').forEach(el => el.textContent = settings.site_name);
}

/* ================= NAVIGATION / VUES ================= */

function closeMoreSheet() {
  document.getElementById('railMoreGroup')?.classList.remove('show');
  document.getElementById('railMoreBackdrop')?.classList.remove('show');
}

function switchView(view) {
  App.view = view;
  closeMoreSheet();
  document.querySelectorAll('.rail-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('communityChannelHeader').classList.add('hidden');
  document.getElementById('storiesBar').classList.toggle('hidden', view !== 'dms');

  const titles = { dms: 'Messages', groups: 'Groupes', communities: 'Communautés', friends: 'Amis', notifications: 'Notifications', stories: 'Stories', starred: 'Messages favoris', archived: 'Conversations archivées' };
  document.getElementById('sidebarTitle').textContent = titles[view] || '';
  document.getElementById('sidebarAddBtn').classList.toggle('hidden', view === 'notifications' || view === 'stories' || view === 'starred' || view === 'archived');

  if (view === 'dms') { loadDMsView(); loadStoriesBar(); }
  else if (view === 'groups') loadGroupsView();
  else if (view === 'communities') loadCommunitiesView();
  else if (view === 'friends') loadFriendsView();
  else if (view === 'notifications') loadNotificationsView();
  else if (view === 'stories') loadStoriesFullView();
  else if (view === 'starred') loadStarredView();
  else if (view === 'archived') loadArchivedView();

  showMobileSidebar();
}

async function loadStoriesFullView() {
  const container = document.getElementById('sidebarList');
  container.innerHTML = `<div class="stories-bar" id="storiesGrid" style="flex-wrap:wrap;border:none;padding:14px;"></div>`;
  const groups = await listActiveStoriesByUser();
  const grid = document.getElementById('storiesGrid');
  let html = `<div class="story-bubble story-add" data-add-story title="Ajouter une story">
    <div class="story-ring none"><div class="avatar">+</div></div><span>Nouvelle</span></div>`;
  for (const g of groups) html += await storyBubbleHtml(g, g.user?.id === App.me.id);
  grid.innerHTML = html;
  grid.querySelectorAll('[data-add-story]').forEach(b => b.addEventListener('click', openCreateStoryModal));
  grid.querySelectorAll('[data-open-story-group]').forEach(b => b.addEventListener('click', () => openStoryViewer(groups, groups.findIndex(g => g.user?.id === b.dataset.openStoryGroup))));
  if (!groups.length) container.insertAdjacentHTML('beforeend', `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="4"/></svg></div><p>Aucune story active pour le moment.<br>Les stories disparaissent après 24h.</p></div>`);
}

/* ================= NAVIGATION MOBILE (panneaux plein écran) ================= */

function isMobileViewport() { return window.matchMedia('(max-width: 760px)').matches; }

function showMobileSidebar() {
  if (!isMobileViewport()) return;
  document.querySelector('.sidebar').classList.remove('mobile-hidden');
  document.querySelector('.main-panel').classList.remove('mobile-active');
}
function showMobileMain() {
  if (!isMobileViewport()) return;
  document.querySelector('.sidebar').classList.add('mobile-hidden');
  document.querySelector('.main-panel').classList.add('mobile-active');
}

async function loadDMsView() {
  const dms = await listDMs();
  renderDMList(document.getElementById('sidebarList'), dms, App.activeConversationId);
}
async function loadGroupsView() {
  const groups = await listGroups();
  renderGroupList(document.getElementById('sidebarList'), groups, App.activeConversationId);
}
async function loadCommunitiesView() {
  const communities = await listMyCommunities();
  renderCommunityList(document.getElementById('sidebarList'), communities, App.activeCommunity?.id);
}
async function loadFriendsView() {
  const friends = await listFriends();
  renderFriendList(document.getElementById('sidebarList'), friends);
}
async function loadNotificationsView() {
  const notifs = await listNotifications();
  renderNotifications(document.getElementById('sidebarList'), notifs);
  await markAllNotifRead();
  refreshNotifDot();
}
async function loadStarredView() {
  const starred = await listStarredMessages();
  renderStarredList(document.getElementById('sidebarList'), starred);
}
async function loadArchivedView() {
  const archived = await listArchivedConversations();
  App._archivedCache = archived;
  renderArchivedList(document.getElementById('sidebarList'), archived);
}

// Ouvre une conversation par son id + type (utilisé pour "aller au message" depuis les
// favoris, où on ne sait a priori pas s'il s'agit d'un DM, d'un groupe ou d'un salon).
async function openConversationById(conversationId, type) {
  if (type === 'dm') {
    switchView('dms');
    const members = await listConversationMembers(conversationId);
    const other = members.find(m => m.user_id !== App.me.id);
    if (other) await openDM(conversationId, other.profiles);
  } else if (type === 'group') {
    switchView('groups');
    await openGroup(conversationId);
  } else if (type === 'channel') {
    const ch = await getChannelByConversationId(conversationId);
    if (ch) {
      App.activeChannelId = null;
      switchView('communities');
      await openCommunity(ch.community_id);
      await openChannel(conversationId, ch.id);
    } else {
      toast("Ce salon n'existe plus.");
    }
  }
}

async function openConversationAndJump(messageId, conversationId) {
  const type = await getConversationType(conversationId);
  if (!type) { toast('Conversation introuvable.'); return; }
  await openConversationById(conversationId, type);
  setTimeout(() => jumpToMessage(messageId), 300);
}

async function refreshNotifDot() {
  const n = await unreadNotifCount();
  document.getElementById('notifDot').classList.toggle('show', n > 0);
}

/* ================= OUVERTURE D'UNE CONVERSATION ================= */

async function openDM(conversationId, otherProfile) {
  App.activeConversationId = conversationId;
  App.activeKind = 'dm';
  showTopbar({ title: otherProfile.display_name, sub: (otherProfile.status_message || otherProfile.status), avatar: avatarHtml(otherProfile) });
  document.getElementById('convSettingsBtn').classList.add('hidden');
  await enterConversation(conversationId);
  loadDMsView();
  showMobileMain();
}

async function openDMWithUser(userId) {
  const convId = await createDM(userId);
  if (!convId) return;
  const profile = await getProfile(userId);
  switchView('dms');
  await openDM(convId, profile);
}

async function openGroup(conversationId) {
  const group = await getGroup(conversationId);
  App.activeConversationId = conversationId;
  App.activeKind = 'group';
  App.activeGroup = group;
  showTopbar({ title: group.name, sub: 'Groupe', avatar: avatarHtml({ display_name: group.name, avatar_url: group.icon_url }) });
  document.getElementById('convSettingsBtn').classList.remove('hidden');
  await enterConversation(conversationId);
  loadGroupsView();
  showMobileMain();
}

async function openCommunity(communityId) {
  const community = await getCommunity(communityId);
  App.activeCommunity = community;
  document.getElementById('communityChannelHeader').classList.remove('hidden');
  document.getElementById('sidebarTitle').textContent = community.name;
  document.getElementById('sidebarAddBtn').classList.remove('hidden');
  const [categories, channels] = await Promise.all([listCategories(communityId), listChannels(communityId)]);
  App._communityCategories = categories;
  App._communityChannels = channels;
  renderChannelList(document.getElementById('sidebarList'), categories, channels, App.activeChannelId);
  if (channels.length && !App.activeChannelId) {
    openChannel(channels[0].conversation_id, channels[0].id);
  }
}

async function openChannel(conversationId, channelId) {
  const ch = (App._communityChannels || []).find(c => c.id === channelId);
  App.activeConversationId = conversationId;
  App.activeKind = 'channel';
  App.activeChannelId = channelId;
  App.activeChannelSlowMode = ch?.slow_mode_seconds || 0;
  App.lastSentAt = 0;
  showTopbar({ title: '# ' + (ch?.name || ''), sub: App.activeCommunity?.name || '', avatar: '' });
  document.getElementById('topbarAvatar').innerHTML = '';
  document.getElementById('convSettingsBtn').classList.remove('hidden');
  await enterConversation(conversationId);
  renderChannelList(document.getElementById('sidebarList'), App._communityCategories, App._communityChannels, App.activeChannelId);
  showMobileMain();
}

function showTopbar({ title, sub, avatar }) {
  document.getElementById('panelTopbar').style.display = 'flex';
  document.getElementById('mainEmptyState').classList.add('hidden');
  document.getElementById('messageList').classList.remove('hidden');
  document.getElementById('composerWrap').classList.remove('hidden');
  document.getElementById('topbarTitle').textContent = title;
  document.getElementById('topbarSub').textContent = sub || '';
  document.getElementById('topbarAvatar').innerHTML = avatar || '';
}

async function getOtherDmReadAt(conversationId) {
  if (App.activeKind !== 'dm') return null;
  const members = await listConversationMembers(conversationId);
  const other = members.find(m => m.user_id !== App.me.id);
  return other?.last_read_at || null;
}

async function enterConversation(conversationId) {
  App.replyTo = null;
  document.getElementById('replyBar').classList.remove('show');
  const list = document.getElementById('messageList');
  list.innerHTML = `<p class="muted center" style="margin-top:20px;">Chargement...</p>`;
  const messages = await listMessages(conversationId);
  const otherReadAt = await getOtherDmReadAt(conversationId);
  const starredIds = await listStarredMessageIds();
  renderMessages(list, messages, App.me.id, otherReadAt, starredIds);
  list.scrollTop = list.scrollHeight;
  await markRead(conversationId);

  subscribeToConversation(conversationId, {
    myId: App.me.id,
    onNewMessage: async (msg) => {
      const full = (await listMessages(conversationId, null, 1))[0];
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      list.insertAdjacentHTML('beforeend', renderOneMessage(full || msg, App.me.id, false));
      if (atBottom) list.scrollTop = list.scrollHeight;
      if (msg.sender_id !== App.me.id) {
        markRead(conversationId);
        fireBrowserNotification(msg.sender_id === App.me.id ? '' : 'Nouveau message', (full?.content || 'Pièce jointe').slice(0, 80));
      }
    },
    onUpdateMessage: async () => {
      const messages = await listMessages(conversationId);
      const otherReadAt2 = await getOtherDmReadAt(conversationId);
      const starredIds2 = await listStarredMessageIds();
      renderMessages(list, messages, App.me.id, otherReadAt2, starredIds2);
    },
    onReactionChange: async () => {
      const messages = await listMessages(conversationId);
      const otherReadAt2 = await getOtherDmReadAt(conversationId);
      const starredIds2 = await listStarredMessageIds();
      renderMessages(list, messages, App.me.id, otherReadAt2, starredIds2);
    },
    onMembersChange: async () => {
      // last_read_at de l'autre membre a changé -> rafraîchir les accusés de lecture
      const messages = await listMessages(conversationId);
      const otherReadAt2 = await getOtherDmReadAt(conversationId);
      const starredIds2 = await listStarredMessageIds();
      renderMessages(list, messages, App.me.id, otherReadAt2, starredIds2);
    },
    onTypingChange: (typers) => {
      const el = document.getElementById('typingIndicator');
      el.textContent = typers.length ? `${typers.map(t => t.name).join(', ')} écrit...` : '';
    }
  });

  loadMembersPanel(conversationId);
}

async function loadMembersPanel(conversationId) {
  const panel = document.getElementById('membersPanel');
  if (App.activeKind === 'dm') { panel.classList.add('hidden'); return; }
  const members = await listConversationMembers(conversationId);
  renderMembersPanel(panel, members, null, App.me.id, App.activeKind);
}

/* ================= ENVOI DE MESSAGE ================= */

function parseMentionsAndTagAll(content, candidates) {
  const isTagAll = /@everyone\b/i.test(content);
  const mentioned = [];
  candidates.forEach(c => {
    if (new RegExp('@' + c.username + '\\b', 'i').test(content)) mentioned.push(c.id);
  });
  return { isTagAll, mentioned };
}

async function handleSend() {
  const input = document.getElementById('composerInput');
  const content = input.value.trim();
  if (!content || !App.activeConversationId) return;

  if (App.activeKind === 'channel' && App.activeChannelSlowMode > 0 && !App.me.is_site_admin) {
    const elapsed = (Date.now() - (App.lastSentAt || 0)) / 1000;
    if (elapsed < App.activeChannelSlowMode) {
      toast(`Mode lent actif : attendez encore ${Math.ceil(App.activeChannelSlowMode - elapsed)}s.`, 'error');
      return;
    }
  }

  const { isTagAll, mentioned } = parseMentionsAndTagAll(content, App.mentionCandidates);
  await sendMessage(App.activeConversationId, content, {
    replyToId: App.replyTo?.id || null,
    isTagAll,
    mentionedUserIds: mentioned
  });

  input.value = '';
  autoResizeComposer();
  App.replyTo = null;
  App.lastSentAt = Date.now();
  document.getElementById('replyBar').classList.remove('show');
  sendTypingSignal(false, App.me.id, App.me.display_name);
}

function autoResizeComposer() {
  const el = document.getElementById('composerInput');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

/* ================= EVENEMENTS GLOBAUX ================= */

function wireGlobalUI() {
  // Navigation rail
  document.querySelectorAll('.rail-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('leaderboardBtn').addEventListener('click', () => { openLeaderboard(); closeMoreSheet(); });
  document.getElementById('myAvatarBtn').addEventListener('click', openMySettings);
  document.getElementById('adminRailBtn').addEventListener('click', () => { window.location.href = 'admin.html'; });

  // Panneau mobile "Plus" (icônes secondaires repliées pour ne pas surcharger la barre du bas)
  document.getElementById('railMoreToggle').addEventListener('click', () => {
    document.getElementById('railMoreGroup').classList.toggle('show');
    document.getElementById('railMoreBackdrop').classList.toggle('show');
  });
  document.getElementById('railMoreBackdrop').addEventListener('click', closeMoreSheet);

  document.getElementById('backToCommunitiesBtn').addEventListener('click', () => {
    App.activeCommunity = null; App.activeChannelId = null;
    switchView('communities');
  });

  document.getElementById('mobileBackBtn').addEventListener('click', showMobileSidebar);

  document.getElementById('sidebarAddBtn').addEventListener('click', onSidebarAddClick);

  document.getElementById('sidebarSearch').addEventListener('input', debounce(onSidebarSearch, 250));

  // Délégation clic liste latérale
  document.getElementById('sidebarList').addEventListener('click', onSidebarListClick);

  // Composer
  const input = document.getElementById('composerInput');
  input.addEventListener('input', () => {
    autoResizeComposer();
    sendTypingSignal(true, App.me.id, App.me.display_name);
    handleMentionAutocomplete();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !document.getElementById('mentionPopup').classList.contains('show')) {
      e.preventDefault(); handleSend();
    }
  });
  document.getElementById('sendBtn').addEventListener('click', handleSend);
  document.getElementById('cancelReplyBtn').addEventListener('click', () => {
    App.replyTo = null; document.getElementById('replyBar').classList.remove('show');
  });

  // Emoji
  document.getElementById('emojiBtn').addEventListener('click', toggleEmojiPicker);
  const picker = document.getElementById('emojiPicker');
  picker.innerHTML = EMOJI_LIST.map(e => `<button type="button">${e}</button>`).join('');
  picker.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      document.getElementById('composerInput').value += e.target.textContent;
      picker.classList.remove('show');
      document.getElementById('composerInput').focus();
    }
  });

  // Pièce jointe
  document.getElementById('attachBtn').addEventListener('click', () => document.getElementById('attachInput').click());
  document.getElementById('attachInput').addEventListener('change', onAttachmentChosen);

  // Actions message (délégation)
  document.getElementById('messageList').addEventListener('click', onMessageAction);

  // Topbar actions
  document.getElementById('membersToggleBtn').addEventListener('click', () => document.getElementById('membersPanel').classList.toggle('hidden'));
  document.getElementById('membersPanel').addEventListener('click', (e) => {
    const row = e.target.closest('[data-open-member-profile]');
    if (row) openUserProfileModal(row.dataset.openMemberProfile);
  });
  document.getElementById('pinnedBtn').addEventListener('click', openPinnedModal);
  document.getElementById('searchMsgBtn').addEventListener('click', () => openModal('modalSearchMsg'));
  document.getElementById('convSettingsBtn').addEventListener('click', openConvSettings);

  // New topbar actions (features.js handles the actual logic)
  document.getElementById('exportChatBtn')?.addEventListener('click', () => {}); // wired in features.js
  document.getElementById('focusModeBtn')?.addEventListener('click', () => {});  // wired in features.js
  document.getElementById('wallpaperBtn')?.addEventListener('click', () => {});  // wired in features.js

  // Mobile bottom nav: sync nav state on switchView calls handled via features.js patch
  document.querySelectorAll('#mobileBottomNav [data-mobile-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.mobile_view || btn.getAttribute('data-mobile-view');
      if (view && view !== 'more') switchView(view);
    });
  });

  // Fermeture générique des modales
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  wireCreateModals();
  wireSettingsModal();
  wireGroupSettingsModal();
  wireCommunitySettingsModal();
  wireReportModal();
  wireSearchMsgModal();
  wireNewChannelModal();
  wireStoryModals();
  wireVoiceUI();
  wireConvContextMenu();
  wireCommandPalette();
  wireDragDrop();
  wireForwardModal();
  wirePollsModal();

  document.getElementById('sv_close').addEventListener('click', closeStoryViewer);
  document.getElementById('sv_prev_zone').addEventListener('click', prevStory);
  document.getElementById('sv_next_zone').addEventListener('click', nextStory);
}

/* ================= MESSAGES VOCAUX ================= */

function wireVoiceUI() {
  document.getElementById('micBtn').addEventListener('click', startVoiceRecording);
  document.getElementById('voiceCancelBtn').addEventListener('click', cancelVoiceRecording);
  document.getElementById('voiceSendBtn').addEventListener('click', () => stopVoiceRecording(true));
}

/* ================= MENU CONTEXTUEL DE CONVERSATION (épingler / muet) ================= */

function wireConvContextMenu() {
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  document.addEventListener('click', (e) => { if (menuEl && !e.target.closest('.conv-context-menu') && !e.target.closest('[data-conv-menu]')) closeMenu(); });

  document.getElementById('sidebarList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-conv-menu]');
    if (!btn) return;
    e.stopPropagation();
    closeMenu();
    const convId = btn.dataset.convMenu;
    const pinned = btn.dataset.convPinned === 'true';
    const muted = btn.dataset.convMuted === 'true';
    const rect = btn.getBoundingClientRect();
    menuEl = document.createElement('div');
    menuEl.className = 'conv-context-menu show';
    menuEl.style.top = (rect.bottom + 4) + 'px';
    menuEl.style.left = Math.max(8, rect.right - 190) + 'px';
    menuEl.innerHTML = `
      <button data-menu-pin>${pinned ? '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="2"/></svg> Désépingler' : '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="2"/></svg> Épingler en haut'}</button>
      <button data-menu-mute>${muted ? '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg> Réactiver les sons' : '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.7 5A6 6 0 0 1 18 11c0 3.3.9 4.9 1.5 5.6"/><path d="M6 8a6 6 0 0 0-.4 3c0 5-2 6-2 6h13"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M2 2l20 20"/></svg> Mettre en sourdine'}</button>
      <button data-menu-archive><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/></svg> Archiver</button>
    `;
    document.body.appendChild(menuEl);
    menuEl.querySelector('[data-menu-pin]').addEventListener('click', async () => {
      await togglePinConversation(convId, !pinned);
      closeMenu();
      if (App.view === 'dms') loadDMsView(); else if (App.view === 'groups') loadGroupsView();
    });
    menuEl.querySelector('[data-menu-mute]').addEventListener('click', async () => {
      if (muted) await unmuteConversation(convId); else await setConversationMute(convId, null);
      closeMenu();
      if (App.view === 'dms') loadDMsView(); else if (App.view === 'groups') loadGroupsView();
    });
    menuEl.querySelector('[data-menu-archive]').addEventListener('click', async () => {
      await setConversationArchived(convId, true);
      closeMenu();
      toast('Conversation archivée', 'success');
      if (App.view === 'dms') loadDMsView(); else if (App.view === 'groups') loadGroupsView();
    });
  });
}

/* ================= PALETTE DE COMMANDES (Ctrl/Cmd+K) ================= */

function wireCommandPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openModal('modalCommandPalette');
      setTimeout(() => document.getElementById('cmdkInput').focus(), 50);
    }
  });
  document.getElementById('cmdkInput').addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    const results = document.getElementById('cmdkResults');
    if (q.length < 2) { results.innerHTML = ''; return; }
    const [people, groups, communities] = await Promise.all([searchProfiles(q), listGroups(), listMyCommunities()]);
    const matchedGroups = groups.filter(g => g.group.name.toLowerCase().includes(q.toLowerCase()));
    const matchedComms = communities.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
    results.innerHTML = [
      ...people.filter(p => p.id !== App.me.id).map(p => `<div class="list-item" data-cmdk-dm="${p.id}">${avatarHtml(p)}<div class="list-item-body"><div class="list-item-title">${esc(p.display_name)}</div><div class="list-item-sub">@${esc(p.username)}</div></div></div>`),
      ...matchedGroups.map(g => `<div class="list-item" data-cmdk-group="${g.conversation_id}">${avatarHtml({ display_name: g.group.name, avatar_url: g.group.icon_url })}<div class="list-item-body"><div class="list-item-title">${esc(g.group.name)}</div><div class="list-item-sub">Groupe</div></div></div>`),
      ...matchedComms.map(c => `<div class="list-item" data-cmdk-community="${c.id}">${avatarHtml({ display_name: c.name, avatar_url: c.icon_url })}<div class="list-item-body"><div class="list-item-title">${esc(c.name)}</div><div class="list-item-sub">Communauté</div></div></div>`)
    ].join('') || `<p class="muted center" style="padding:16px;">Aucun résultat.</p>`;

    results.querySelectorAll('[data-cmdk-dm]').forEach(el => el.addEventListener('click', () => { closeModal('modalCommandPalette'); switchView('dms'); openDMWithUser(el.dataset.cmdkDm); }));
    results.querySelectorAll('[data-cmdk-group]').forEach(el => el.addEventListener('click', () => { closeModal('modalCommandPalette'); switchView('groups'); openGroup(el.dataset.cmdkGroup); }));
    results.querySelectorAll('[data-cmdk-community]').forEach(el => el.addEventListener('click', () => { closeModal('modalCommandPalette'); App.activeChannelId = null; switchView('communities'); openCommunity(el.dataset.cmdkCommunity); }));
  }, 250));
}

/* ================= GLISSER-DÉPOSER UN FICHIER DANS LE COMPOSITEUR ================= */

function wireDragDrop() {
  const dropZone = document.getElementById('composerWrap');
  ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.style.outline = '2px dashed var(--accent)'; }));
  ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.style.outline = 'none'; }));
  dropZone.addEventListener('drop', async (e) => {
    const file = e.dataTransfer.files[0];
    if (!file || !App.activeConversationId) return;
    toast('Envoi du fichier...');
    const uploaded = await uploadAttachment(file);
    if (uploaded) await sendMessage(App.activeConversationId, '', { attachment: uploaded });
  });
}

function onSidebarListClick(e) {
  const dm = e.target.closest('[data-open-dm]');
  const dmUser = e.target.closest('[data-open-dm-user]');
  const group = e.target.closest('[data-open-group]');
  const community = e.target.closest('[data-open-community]');
  const channel = e.target.closest('[data-open-channel]');
  const removeFriendBtn = e.target.closest('[data-remove-friend]');
  const notif = e.target.closest('[data-notif-id]');
  const starredItem = e.target.closest('[data-open-starred]');
  const unarchiveBtn = e.target.closest('[data-unarchive]');
  const archivedItem = e.target.closest('[data-archived-item]');

  if (removeFriendBtn) { removeFriend(removeFriendBtn.dataset.removeFriend).then(loadFriendsView); return; }
  if (unarchiveBtn) { e.stopPropagation(); setConversationArchived(unarchiveBtn.dataset.unarchive, false).then(loadArchivedView); return; }
  if (archivedItem) {
    const item = (App._archivedCache || []).find(a => a.conversation_id === archivedItem.dataset.archivedItem);
    if (!item) return;
    if (item.kind === 'dm') { switchView('dms'); openDM(item.conversation_id, item.other); }
    else { switchView('groups'); openGroup(item.conversation_id); }
    return;
  }
  if (starredItem) { openConversationAndJump(starredItem.dataset.openStarred, starredItem.dataset.starredConv); return; }
  if (dmUser) { openDMWithUser(dmUser.dataset.openDmUser); return; }
  if (dm) {
    getProfile(dm.dataset.openDm).then(() => {}); // no-op placeholder
    listDMs().then(dms => {
      const row = dms.find(d => d.conversation_id === dm.dataset.openDm);
      if (row) openDM(row.conversation_id, row.other);
    });
    return;
  }
  if (group) { openGroup(group.dataset.openGroup); return; }
  if (community) { App.activeChannelId = null; openCommunity(community.dataset.openCommunity); return; }
  if (channel) { openChannel(channel.dataset.openChannel, channel.closest('[data-channel-id]').dataset.channelId); return; }
  if (notif) { onNotificationClick(notif); return; }
}

async function onNotificationClick(el) {
  const type    = el.dataset.notifType;
  const payload = JSON.parse(el.dataset.notifPayload || '{}');
  await markNotifRead(el.dataset.notifId);

  if (type === 'friend_request') {
    openFriendRequestsModal();
  } else if (type === 'mention' || type === 'tag_all') {
    const convId = payload.conversation_id;
    if (convId) {
      const convType = await getConversationType(convId);
      if (convType) {
        closeModal?.('modalNotifications');
        await openConversationById(convId, convType);
        if (payload.message_id) setTimeout(() => jumpToMessage(payload.message_id), 350);
      } else {
        toast('Conversation introuvable.');
      }
    } else {
      toast('Ouvrez la conversation concernée pour voir le message.');
    }
  }
  refreshNotifDot();
}

async function onSidebarSearch(e) {
  const q = e.target.value.trim();
  if (App.view === 'dms' || App.view === 'friends') {
    if (!q) { App.view === 'dms' ? loadDMsView() : loadFriendsView(); return; }
    const results = await searchProfiles(q);
    const container = document.getElementById('sidebarList');
    container.innerHTML = results.filter(r => r.id !== App.me.id).map(r => `
      <div class="list-item" data-open-dm-user="${r.id}">
        ${avatarHtml(r)}
        <div class="list-item-body"><div class="list-item-title">${esc(r.display_name)}</div><div class="list-item-sub">@${esc(r.username)}</div></div>
        ${App.view === 'friends' ? `<button class="btn btn-ghost btn-sm" data-add-friend="${r.id}">+ Ami</button>` : ''}
      </div>
    `).join('') || `<p class="muted center" style="padding:20px;">Aucun résultat</p>`;
    container.querySelectorAll('[data-add-friend]').forEach(b => b.addEventListener('click', (ev) => {
      ev.stopPropagation(); sendFriendRequest(b.dataset.addFriend);
    }));
  }
}

function onSidebarAddClick() {
  if (App.view === 'dms') { document.getElementById('sidebarSearch').focus(); toast('Recherchez un pseudo pour démarrer une conversation.'); }
  else if (App.view === 'groups') openModal('modalCreateGroup');
  else if (App.view === 'communities') {
    if (App.activeCommunity) { openModal('modalNewChannel'); }
    else openModal('modalCreateCommunity');
  }
  else if (App.view === 'friends') { document.getElementById('sidebarSearch').focus(); toast('Recherchez un pseudo pour lui envoyer une demande.'); }
}

/* ================= MENTIONS / EMOJI ================= */

async function handleMentionAutocomplete() {
  const input = document.getElementById('composerInput');
  const popup = document.getElementById('mentionPopup');
  const cursor = input.selectionStart;
  const textBefore = input.value.slice(0, cursor);
  const match = textBefore.match(/@([a-zA-Z0-9_\.]*)$/);
  if (!match || !App.activeConversationId) { popup.classList.remove('show'); return; }

  const q = match[1].toLowerCase();
  const members = await listConversationMembers(App.activeConversationId);
  App.mentionCandidates = members.map(m => m.profiles).filter(Boolean);
  const filtered = App.mentionCandidates.filter(c => c.username.toLowerCase().startsWith(q));
  const everyoneOpt = 'everyone'.startsWith(q) ? [{ username: 'everyone', display_name: 'Tout le monde', special: true }] : [];
  const list = [...everyoneOpt, ...filtered].slice(0, 8);

  if (!list.length) { popup.classList.remove('show'); return; }
  popup.innerHTML = list.map(c => `
    <div class="mention-item" data-mention="${esc(c.username)}">${avatarHtml(c, 'sm')} <span>${esc(c.display_name)} <span class="muted">@${esc(c.username)}</span></span></div>
  `).join('');
  popup.classList.add('show');
  popup.querySelectorAll('[data-mention]').forEach(item => {
    item.addEventListener('click', () => {
      const uname = item.dataset.mention;
      input.value = textBefore.replace(/@([a-zA-Z0-9_\.]*)$/, '@' + uname + ' ') + input.value.slice(cursor);
      popup.classList.remove('show');
      input.focus();
    });
  });
}

function toggleEmojiPicker() { document.getElementById('emojiPicker').classList.toggle('show'); }

async function onAttachmentChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  toast('Envoi du fichier...');
  const uploaded = await uploadAttachment(file);
  if (uploaded) await sendMessage(App.activeConversationId, '', { attachment: uploaded });
  e.target.value = '';
}

/* ================= ACTIONS SUR MESSAGE ================= */

async function onMessageAction(e) {
  const react = e.target.closest('[data-action-react]');
  const reply = e.target.closest('[data-action-reply]');
  const edit = e.target.closest('[data-action-edit]');
  const del = e.target.closest('[data-action-delete]');
  const hideMe = e.target.closest('[data-action-hide-me]');
  const copy = e.target.closest('[data-action-copy]');
  const pin = e.target.closest('[data-action-pin]');
  const report = e.target.closest('[data-action-report]');
  const forward = e.target.closest('[data-action-forward]');
  const star = e.target.closest('[data-action-star]');
  const reactionPill = e.target.closest('[data-react]');
  const avatarClick = e.target.closest('.msg-avatar-col, .msg-author');
  const lightboxImg = e.target.closest('[data-lightbox]');
  const replyQuote = e.target.closest('.msg-reply-preview');

  if (react) { toggleEmojiPickerForReact(react.dataset.actionReact); return; }
  if (reactionPill) { toggleReaction(reactionPill.dataset.react, reactionPill.dataset.emoji); return; }
  if (lightboxImg) { openLightbox(lightboxImg.dataset.lightbox); return; }
  if (replyQuote) { jumpToMessage(replyQuote.dataset.jumpTo); return; }
  if (reply) {
    App.replyTo = { id: reply.dataset.actionReply };
    document.getElementById('replyBar').classList.add('show');
    document.getElementById('replyBarText').innerHTML = icon('corner-up-left') + ' Réponse à ce message';
    document.getElementById('composerInput').focus();
    return;
  }
  if (copy) {
    const row = e.target.closest('.msg-row');
    copyToClipboard(row.querySelector('.msg-content')?.textContent || '');
    return;
  }
  if (edit) {
    const row = e.target.closest('.msg-row');
    const contentEl = row.querySelector('.msg-content');
    const current = contentEl.textContent;
    const newContent = prompt('Modifier le message :', current);
    if (newContent != null && newContent.trim()) await editMessage(edit.dataset.actionEdit, newContent.trim());
    return;
  }
  if (del) { openDeleteChoiceMenu(del, del.dataset.actionDelete); return; }
  if (hideMe) { if (confirm('Masquer ce message pour vous uniquement ?')) { await deleteMessageForMe(hideMe.dataset.actionHideMe); enterConversation(App.activeConversationId); } return; }
  if (pin) { await togglePin(pin.dataset.actionPin, pin.dataset.pinned !== 'true'); return; }
  if (report) { openReportModal({ targetType: 'message', targetMessageId: report.dataset.actionReport }); return; }
  if (forward) { openForwardModal(forward.dataset.actionForward); return; }
  if (star) {
    const id = star.dataset.actionStar;
    const isStarred = star.dataset.starred === 'true';
    await toggleStar(id, !isStarred);
    star.dataset.starred = (!isStarred).toString();
    star.innerHTML = icon('star', { class: !isStarred ? 'icon-filled' : '' });
    star.title = !isStarred ? 'Retirer des favoris' : 'Ajouter aux favoris';
    return;
  }
  if (avatarClick) {
    const row = e.target.closest('.msg-row');
    openUserProfileModal(row.dataset.senderId);
  }
}

function jumpToMessage(messageId) {
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!el) { toast("Ce message n'est plus dans l'historique visible."); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('highlight-jump');
  setTimeout(() => el.classList.remove('highlight-jump'), 1400);
}

function openDeleteChoiceMenu(anchorEl, messageId) {
  document.querySelectorAll('.delete-choice-menu').forEach(m => m.remove());
  const rect = anchorEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'delete-choice-menu show';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = Math.max(8, rect.right - 220) + 'px';
  menu.innerHTML = `
    <button data-choice="me">Supprimer pour moi</button>
    <button data-choice="everyone" class="danger">Supprimer pour tout le monde</button>
  `;
  document.body.appendChild(menu);
  const close = () => menu.remove();
  setTimeout(() => document.addEventListener('click', function h(ev) { if (!ev.target.closest('.delete-choice-menu')) { close(); document.removeEventListener('click', h); } }), 0);
  menu.querySelector('[data-choice="me"]').addEventListener('click', async () => { close(); await deleteMessageForMe(messageId); enterConversation(App.activeConversationId); });
  menu.querySelector('[data-choice="everyone"]').addEventListener('click', async () => { close(); if (confirm('Supprimer définitivement pour tout le monde ?')) await deleteMessageForEveryone(messageId); });
}

function toggleEmojiPickerForReact(messageId) {
  const picker = document.getElementById('emojiPicker');
  picker.classList.add('show');
  picker.dataset.reactTarget = messageId;
  const onPick = (e) => {
    if (e.target.tagName === 'BUTTON') {
      toggleReaction(messageId, e.target.textContent);
      picker.classList.remove('show');
      picker.removeEventListener('click', onPick);
    }
  };
  picker.addEventListener('click', onPick);
}

/* ================= TRANSFÉRER UN MESSAGE ================= */

async function openForwardModal(messageId) {
  App._forwardMessageId = messageId;
  const [dms, groups] = await Promise.all([listDMs(), listGroups()]);
  const list = document.getElementById('forwardTargetList');
  const rows = [
    ...dms.map(d => `<label class="list-item" style="cursor:pointer;">
        <input type="checkbox" value="${d.conversation_id}" style="margin-right:10px;">
        ${avatarHtml(d.other)}
        <div class="list-item-body"><div class="list-item-title">${esc(d.other?.display_name || 'Utilisateur')}</div></div>
      </label>`),
    ...groups.map(g => `<label class="list-item" style="cursor:pointer;">
        <input type="checkbox" value="${g.conversation_id}" style="margin-right:10px;">
        ${avatarHtml({ display_name: g.group.name, avatar_url: g.group.icon_url })}
        <div class="list-item-body"><div class="list-item-title">${esc(g.group.name)}</div></div>
      </label>`)
  ];
  list.innerHTML = rows.join('') || `<p class="muted center">Aucune conversation disponible.</p>`;
  openModal('modalForward');
}

function wireForwardModal() {
  document.getElementById('forward_submit').addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('#forwardTargetList input[type=checkbox]:checked')].map(c => c.value);
    if (!checked.length) return toast('Choisissez au moins une conversation.', 'error');
    const ok = await forwardMessage(App._forwardMessageId, checked);
    if (ok) closeModal('modalForward');
  });
}

/* ================= SONDAGES ================= */

async function refreshPollsList() {
  const polls = await listPolls(App.activeConversationId);
  App._pollsCache = polls;
  document.getElementById('pollsList').innerHTML = polls.length
    ? polls.map(p => pollItemHtml(p, App.me.id)).join('')
    : `<p class="muted center" style="padding:14px 0;">Aucun sondage pour l'instant.</p>`;
}

function wirePollsModal() {
  document.getElementById('pollsBtn').addEventListener('click', async () => {
    if (!App.activeConversationId) { toast('Ouvrez une conversation pour voir ses sondages.'); return; }
    openModal('modalPolls');
    await refreshPollsList();
  });

  document.getElementById('pollsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-poll-vote]');
    if (!btn || btn.disabled) return;
    const pollId = btn.dataset.pollVote;
    const optionIndex = parseInt(btn.dataset.pollOption, 10);
    const poll = (App._pollsCache || []).find(p => p.id === pollId);
    if (!poll) return;
    const myVotes = (poll.poll_votes || []).filter(v => v.user_id === App.me.id).map(v => v.option_index);
    if (myVotes.includes(optionIndex)) await removePollVote(pollId, optionIndex);
    else await castPollVote(pollId, optionIndex);
    await refreshPollsList();
  });

  document.getElementById('poll_submit').addEventListener('click', async () => {
    const question = document.getElementById('poll_question').value.trim();
    const options = document.getElementById('poll_options').value.split('\n').map(o => o.trim()).filter(Boolean);
    const allowMultiple = document.getElementById('poll_allow_multiple').checked;
    if (!question) return toast('Merci de saisir une question.', 'error');
    if (options.length < 2) return toast('Il faut au moins 2 options.', 'error');
    const poll = await createPoll(App.activeConversationId, question, options, allowMultiple, null);
    if (poll) {
      document.getElementById('poll_question').value = '';
      document.getElementById('poll_options').value = '';
      document.getElementById('poll_allow_multiple').checked = false;
      toast('Sondage créé ✓', 'success');
      await refreshPollsList();
    }
  });
}

/* ================= MODALES : CRÉATION / REJOINDRE ================= */

function wireCreateModals() {
  document.getElementById('cg_submit').addEventListener('click', async () => {
    const name = document.getElementById('cg_name').value.trim();
    if (!name) return toast('Merci de donner un nom au groupe.', 'error');
    const convId = await createGroup(name, document.getElementById('cg_desc').value.trim());
    if (convId) { closeModal('modalCreateGroup'); document.getElementById('cg_name').value = ''; document.getElementById('cg_desc').value = ''; switchView('groups'); openGroup(convId); }
  });

  document.getElementById('cc_submit').addEventListener('click', async () => {
    const name = document.getElementById('cc_name').value.trim();
    if (!name) return toast('Merci de donner un nom à la communauté.', 'error');
    const isPublic = document.getElementById('cc_public').checked;
    const id = await createCommunity(name, document.getElementById('cc_desc').value.trim(), isPublic);
    if (id) { closeModal('modalCreateCommunity'); document.getElementById('cc_name').value = ''; document.getElementById('cc_desc').value = ''; switchView('communities'); openCommunity(id); }
  });

  document.querySelectorAll('[data-jointab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-jointab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('[data-jointabpanel]').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`[data-jointabpanel="${tab.dataset.jointab}"]`).classList.add('active');
      if (tab.dataset.jointab === 'discover') loadDiscoverList();
    });
  });

  document.getElementById('join_submit').addEventListener('click', async () => {
    const code = document.getElementById('join_code').value.trim();
    if (!code) return;
    let result = await joinGroupByInvite(code);
    if (!result) result = await joinCommunityByInvite(code);
    if (result) { closeModal('modalJoin'); document.getElementById('join_code').value = ''; switchView('groups'); }
  });
}

async function loadDiscoverList() {
  const list = await discoverPublicCommunities();
  const container = document.getElementById('discoverList');
  container.innerHTML = list.map(c => `
    <div class="list-item">
      ${avatarHtml({ display_name: c.name, avatar_url: c.icon_url })}
      <div class="list-item-body"><div class="list-item-title">${esc(c.name)}</div><div class="list-item-sub">${esc(c.description || '')}</div></div>
      <button class="btn btn-primary btn-sm" data-join-public="${c.id}">Rejoindre</button>
    </div>
  `).join('') || `<p class="muted center">Aucune communauté publique pour le moment.</p>`;
  container.querySelectorAll('[data-join-public]').forEach(b => b.addEventListener('click', async () => {
    await joinCommunity(b.dataset.joinPublic);
    closeModal('modalJoin');
    switchView('communities');
  }));
}

// Le bouton rail "+" pour groupes ouvre créer ; on ajoute un accès "rejoindre" via clic droit / bouton dédié
document.addEventListener('DOMContentLoaded', () => {
  const sidebarHeader = document.querySelector('.sidebar-header');
  if (sidebarHeader) {
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn-icon';
    joinBtn.title = 'Rejoindre avec un code';
    joinBtn.innerHTML = icon('link');
    joinBtn.id = 'sidebarJoinBtn';
    joinBtn.addEventListener('click', () => openModal('modalJoin'));
    sidebarHeader.appendChild(joinBtn);
  }
});

/* ================= PARAMÈTRES PERSONNELS ================= */

function openMySettings() {
  document.getElementById('sp_avatar_preview').innerHTML = avatarHtml(App.me, 'lg');
  document.getElementById('sp_displayname').value = App.me.display_name || '';
  document.getElementById('sp_pronouns').value = App.me.pronouns || '';
  document.getElementById('sp_rpcharacter').value = App.me.rp_character || '';
  document.getElementById('sp_bio').value = App.me.bio || '';
  document.getElementById('sp_statusmsg').value = App.me.status_message || '';
  document.getElementById('sp_status').value = App.me.status || 'online';
  document.getElementById('sp_theme_dark').checked = App.me.theme !== 'light';
  document.getElementById('sp_dm_privacy').value = App.me.dm_privacy || 'everyone';
  document.getElementById('sp_density').value = localStorage.getItem('ego_density') || 'comfortable';
  document.getElementById('sp_notif_sound').checked = localStorage.getItem('ego_notif_sound') !== 'off';

  const swatches = document.getElementById('accentSwatches');
  swatches.innerHTML = App.accentPalette.map(c => `<div class="accent-swatch ${c === App.me.accent_color ? 'sel' : ''}" style="background:${c};" data-accent="${c}"></div>`).join('');

  loadBlockedList();
  openModal('modalSettings');
}

function wireSettingsModal() {
  document.querySelectorAll('[data-sptab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-sptab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('[data-sptabpanel]').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`[data-sptabpanel="${tab.dataset.sptab}"]`).classList.add('active');
    });
  });

  document.getElementById('sp_avatar_upload_btn').addEventListener('click', () => document.getElementById('sp_avatar_input').click());
  document.getElementById('sp_avatar_input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadAvatar(file);
    if (url) { App.me.avatar_url = url; document.getElementById('sp_avatar_preview').innerHTML = avatarHtml(App.me, 'lg'); renderMyAvatar(); toast('Photo mise à jour ✓', 'success'); }
  });

  document.getElementById('sp_save_profile').addEventListener('click', async () => {
    const fields = {
      display_name: document.getElementById('sp_displayname').value.trim(),
      pronouns: document.getElementById('sp_pronouns').value.trim(),
      rp_character: document.getElementById('sp_rpcharacter').value.trim(),
      bio: document.getElementById('sp_bio').value.trim(),
      status_message: document.getElementById('sp_statusmsg').value.trim(),
      status: document.getElementById('sp_status').value
    };
    const { data } = await updateMyProfile(fields);
    if (data) { App.me = data; toast('Profil mis à jour ✓', 'success'); }
  });

  document.getElementById('sp_density').addEventListener('change', (e) => applyDensity(e.target.value));
  document.getElementById('sp_notif_sound').addEventListener('change', (e) => toggleNotifSound(e.target.checked));
  document.getElementById('sp_ask_notif_perm').addEventListener('click', async () => {
    const perm = await requestNotificationPermission();
    if (perm === 'granted') toast('Notifications activées ✓', 'success');
    else if (perm === 'denied') toast('Notifications bloquées par le navigateur.', 'error');
    else toast("Votre navigateur ne supporte pas les notifications.", 'error');
  });

  document.getElementById('sp_theme_dark').addEventListener('change', async (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    applyTheme(theme, App.me.accent_color);
    const { data } = await updateMyProfile({ theme });
    if (data) App.me = data;
  });

  document.getElementById('accentSwatches').addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-accent]');
    if (!sw) return;
    document.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('sel'));
    sw.classList.add('sel');
    applyTheme(App.me.theme, sw.dataset.accent);
    const { data } = await updateMyProfile({ accent_color: sw.dataset.accent });
    if (data) App.me = data;
  });

  document.getElementById('sp_save_privacy').addEventListener('click', async () => {
    const { data } = await updateMyProfile({ dm_privacy: document.getElementById('sp_dm_privacy').value });
    if (data) { App.me = data; toast('Confidentialité mise à jour ✓', 'success'); }
  });

  document.getElementById('sp_change_password').addEventListener('click', async () => {
    const pwd = document.getElementById('sp_new_password').value;
    if (pwd.length < 8) return toast('8 caractères minimum.', 'error');
    const { error } = await authUpdatePassword(pwd);
    if (error) toast(error.message, 'error'); else { toast('Mot de passe changé ✓', 'success'); document.getElementById('sp_new_password').value = ''; }
  });

  document.getElementById('sp_logout').addEventListener('click', async () => {
    await authSignOut();
    window.location.reload();
  });
}

async function loadBlockedList() {
  const blocked = await listBlocked();
  const container = document.getElementById('sp_blocked_list');
  container.innerHTML = blocked.length ? blocked.map(b => `
    <div class="list-item">
      ${avatarHtml(b.profiles)}
      <div class="list-item-body"><div class="list-item-title">${esc(b.profiles?.display_name)}</div></div>
      <button class="btn btn-ghost btn-sm" data-unblock="${b.blocked_id}">Débloquer</button>
    </div>
  `).join('') : `<p class="muted" style="font-size:.85rem;">Aucun utilisateur bloqué.</p>`;
  container.querySelectorAll('[data-unblock]').forEach(b => b.addEventListener('click', async () => { await unblockUser(b.dataset.unblock); loadBlockedList(); }));
}

/* ================= PROFIL D'UN AUTRE UTILISATEUR ================= */

async function openUserProfileModal(userId) {
  const p = await getProfile(userId);
  if (!p) return;
  const progress = xpProgress(p.xp, p.level);
  const isMe = p.id === App.me.id;
  const isFriend = (await listFriends()).some(f => f.id === p.id);
  document.getElementById('userProfileBody').innerHTML = `
    ${avatarHtml(p, 'lg')}
    <h3 style="margin:12px 0 2px;">${esc(p.display_name)}</h3>
    <p class="muted">@${esc(p.username)} · ${statusDotHtml(p.status)} ${esc(p.status_message || p.status)}</p>
    ${levelBadgeHtml(p.level, p.title)}
    <div class="xp-bar-track" style="margin:10px 0;"><div class="xp-bar-fill" style="width:${progress.pct}%;"></div></div>
    <p class="muted" style="font-size:.78rem;">${progress.next ? `${progress.remaining} XP avant "${progress.next.title}"` : 'Niveau maximum atteint'}</p>
    ${p.bio ? `<p style="margin-top:10px;">${esc(p.bio)}</p>` : ''}
    ${!isMe ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" data-profile-dm="${p.id}"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4.2-1.1L3 20l1.1-5.3A8.38 8.38 0 0 1 3 11.5 8.38 8.38 0 0 1 11.5 3a8.38 8.38 0 0 1 9.5 8.5Z"/></svg> Message</button>
      ${!isFriend ? `<button class="btn btn-ghost btn-sm" data-profile-addfriend="${p.id}"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12 4.5 8.5a2 2 0 0 1 2.8-2.8L11 9"/><path d="M13 9l3.7-3.3a2 2 0 0 1 2.8 2.8L15 13"/><path d="M8 12l3 3 2-2"/><path d="M11 15l2 2 5-5"/><path d="M2 15l3 3 2-2-3-3Z"/></svg> Ajouter</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-profile-block="${p.id}"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/></svg> Bloquer</button>
      <button class="btn btn-danger-outline btn-sm" data-profile-report="${p.id}"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3v18"/><path d="M5 4h11l-2 4 2 4H5"/></svg> Signaler</button>
    </div>` : ''}
  `;
  document.getElementById('userProfileBody').querySelectorAll('[data-profile-dm]').forEach(b => b.addEventListener('click', () => { closeModal('modalUserProfile'); openDMWithUser(b.dataset.profileDm); }));
  document.getElementById('userProfileBody').querySelectorAll('[data-profile-addfriend]').forEach(b => b.addEventListener('click', () => sendFriendRequest(b.dataset.profileAddfriend)));
  document.getElementById('userProfileBody').querySelectorAll('[data-profile-block]').forEach(b => b.addEventListener('click', async () => { await blockUser(b.dataset.profileBlock); closeModal('modalUserProfile'); }));
  document.getElementById('userProfileBody').querySelectorAll('[data-profile-report]').forEach(b => b.addEventListener('click', () => { closeModal('modalUserProfile'); openReportModal({ targetType: 'user', targetUserId: b.dataset.profileReport }); }));
  openModal('modalUserProfile');
}

/* ================= SIGNALEMENT ================= */

let reportContext = null;
function openReportModal(ctx) { reportContext = ctx; openModal('modalReport'); }
function wireReportModal() {
  document.getElementById('rp_submit').addEventListener('click', async () => {
    await reportContent({
      targetType: reportContext.targetType,
      targetUserId: reportContext.targetUserId,
      targetMessageId: reportContext.targetMessageId,
      reason: document.getElementById('rp_reason').value,
      details: document.getElementById('rp_details').value.trim()
    });
    closeModal('modalReport');
    document.getElementById('rp_details').value = '';
  });
}

/* ================= GROUPE : PARAMÈTRES ================= */

function wireGroupSettingsModal() {
  document.querySelectorAll('[data-gstab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-gstab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('[data-gstabpanel]').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`[data-gstabpanel="${tab.dataset.gstab}"]`).classList.add('active');
    });
  });
  document.getElementById('gs_save').addEventListener('click', async () => {
    await updateGroup(App.activeConversationId, {
      name: document.getElementById('gs_name').value.trim(),
      description: document.getElementById('gs_desc').value.trim(),
      only_admins_can_tag_all: document.getElementById('gs_tagall').checked
    });
    closeModal('modalGroupSettings');
    loadGroupsView();
  });
  document.getElementById('gs_copy_invite').addEventListener('click', () => copyToClipboard(document.getElementById('gs_invite').value));
  document.getElementById('gs_icon_upload_btn').addEventListener('click', () => document.getElementById('gs_icon_input').click());
  document.getElementById('gs_icon_input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadGroupIcon(App.activeConversationId, file);
    if (url) { App.activeGroup.icon_url = url; document.getElementById('gs_icon_preview').innerHTML = avatarHtml({ display_name: App.activeGroup.name, avatar_url: url }, 'lg'); loadGroupsView(); }
  });
  document.getElementById('gs_leave').addEventListener('click', async () => {
    if (!confirm('Quitter ce groupe ?')) return;
    await leaveConversation(App.activeConversationId);
    closeModal('modalGroupSettings');
    resetMainPanel();
    switchView('groups');
  });
}

async function openConvSettings() {
  if (App.activeKind === 'group') return openGroupSettings();
  if (App.activeKind === 'channel') return openCommunitySettings();
}

async function openGroupSettings() {
  const group = App.activeGroup;
  document.getElementById('gs_title').innerHTML = icon('settings') + ' ' + esc(group.name);
  document.getElementById('gs_icon_preview').innerHTML = avatarHtml({ display_name: group.name, avatar_url: group.icon_url }, 'lg');
  document.getElementById('gs_name').value = group.name;
  document.getElementById('gs_desc').value = group.description || '';
  document.getElementById('gs_tagall').checked = group.only_admins_can_tag_all;
  document.getElementById('gs_invite').value = group.invite_code;
  const members = await listConversationMembers(App.activeConversationId);
  document.getElementById('gs_members_list').innerHTML = members.map(m => `
    <div class="list-item">
      ${avatarHtml(m.profiles)}
      <div class="list-item-body"><div class="list-item-title">${esc(m.profiles?.display_name)}</div><div class="list-item-sub">${roleLabel(m.role)}</div></div>
      ${m.user_id !== App.me.id ? `
        <select data-role-select="${m.user_id}" style="background:var(--bg-panel-2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px;">
          <option value="member" ${m.role === 'member' ? 'selected' : ''}>Membre</option>
          <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        <button class="btn-icon" data-kick="${m.user_id}" title="Exclure"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6Z"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      ` : '<span class="pill pill-owner">Vous</span>'}
    </div>
  `).join('');
  document.getElementById('gs_members_list').querySelectorAll('[data-role-select]').forEach(sel => {
    sel.addEventListener('change', () => setConversationRole(App.activeConversationId, sel.dataset.roleSelect, sel.value));
  });
  document.getElementById('gs_members_list').querySelectorAll('[data-kick]').forEach(b => {
    b.addEventListener('click', async () => { await kickMember(App.activeConversationId, b.dataset.kick); openGroupSettings(); });
  });
  openModal('modalGroupSettings');
}

/* ================= COMMUNAUTÉ : PARAMÈTRES ================= */

function wireCommunitySettingsModal() {
  document.querySelectorAll('[data-cstab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-cstab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('[data-cstabpanel]').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`[data-cstabpanel="${tab.dataset.cstab}"]`).classList.add('active');
    });
  });
  document.getElementById('cs_save').addEventListener('click', async () => {
    await updateCommunity(App.activeCommunity.id, {
      name: document.getElementById('cs_name').value.trim(),
      description: document.getElementById('cs_desc').value.trim(),
      is_public: document.getElementById('cs_public').checked
    });
    closeModal('modalCommunitySettings');
    switchView('communities');
  });
  document.getElementById('cs_copy_invite').addEventListener('click', () => copyToClipboard(document.getElementById('cs_invite').value));
  document.getElementById('cs_icon_upload_btn').addEventListener('click', () => document.getElementById('cs_icon_input').click());
  document.getElementById('cs_icon_input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadCommunityIcon(App.activeCommunity.id, file);
    if (url) { App.activeCommunity.icon_url = url; document.getElementById('cs_icon_preview').innerHTML = avatarHtml({ display_name: App.activeCommunity.name, avatar_url: url }, 'lg'); }
  });
  document.getElementById('cs_add_channel').addEventListener('click', async () => {
    const name = document.getElementById('cs_new_channel').value.trim();
    if (!name) return;
    const id = await createChannel(App.activeCommunity.id, name);
    if (id) { document.getElementById('cs_new_channel').value = ''; openCommunitySettings(); openCommunity(App.activeCommunity.id); }
  });
  document.getElementById('cs_leave').addEventListener('click', async () => {
    if (!confirm('Quitter cette communauté ?')) return;
    await kickCommunityMember(App.activeCommunity.id, App.me.id).catch(() => {});
    closeModal('modalCommunitySettings');
    App.activeCommunity = null;
    resetMainPanel();
    switchView('communities');
  });
}

async function openCommunitySettings() {
  const c = App.activeCommunity;
  document.getElementById('cs_title').innerHTML = icon('settings') + ' ' + esc(c.name);
  document.getElementById('cs_icon_preview').innerHTML = avatarHtml({ display_name: c.name, avatar_url: c.icon_url }, 'lg');
  document.getElementById('cs_name').value = c.name;
  document.getElementById('cs_desc').value = c.description || '';
  document.getElementById('cs_public').checked = c.is_public;
  document.getElementById('cs_invite').value = c.invite_code;

  const channels = await listChannels(c.id);
  document.getElementById('cs_channels_list').innerHTML = channels.map(ch => `
    <div class="list-item">
      <div class="list-item-body">#&nbsp;${esc(ch.name)} ${ch.slow_mode_seconds ? `<span class="pill pill-private"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg> ${ch.slow_mode_seconds}s</span>` : ''}</div>
      <button class="btn-icon" data-edit-channel="${ch.id}" data-channel-name="${esc(ch.name)}" data-channel-slow="${ch.slow_mode_seconds || 0}" title="Modifier"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
    </div>`).join('');
  document.getElementById('cs_channels_list').querySelectorAll('[data-edit-channel]').forEach(b => b.addEventListener('click', async () => {
    const newName = prompt('Nom du salon :', b.dataset.channelName);
    if (newName == null) return;
    const slowRaw = prompt('Mode lent : délai minimum entre deux messages par membre, en secondes (0 = désactivé) :', b.dataset.channelSlow);
    if (slowRaw == null) return;
    const slow = Math.max(0, parseInt(slowRaw, 10) || 0);
    await updateChannel(b.dataset.editChannel, { name: newName.trim() || b.dataset.channelName, slow_mode_seconds: slow });
    openCommunitySettings();
  }));

  const members = await listCommunityMembers(c.id);
  document.getElementById('cs_members_list').innerHTML = members.map(m => `
    <div class="list-item">
      ${avatarHtml(m.profiles)}
      <div class="list-item-body"><div class="list-item-title">${esc(m.profiles?.display_name)}</div><div class="list-item-sub">${roleLabel(m.role)}</div></div>
      ${m.user_id !== App.me.id ? `
        <select data-crole-select="${m.user_id}" style="background:var(--bg-panel-2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px;">
          <option value="member" ${m.role === 'member' ? 'selected' : ''}>Membre</option>
          <option value="moderator" ${m.role === 'moderator' ? 'selected' : ''}>Modérateur</option>
          <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        <button class="btn-icon" data-ckick="${m.user_id}" title="Exclure"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6Z"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      ` : '<span class="pill pill-owner">Vous</span>'}
    </div>
  `).join('');
  document.getElementById('cs_members_list').querySelectorAll('[data-crole-select]').forEach(sel => {
    sel.addEventListener('change', () => setCommunityRole(c.id, sel.dataset.croleSelect, sel.value));
  });
  document.getElementById('cs_members_list').querySelectorAll('[data-ckick]').forEach(b => {
    b.addEventListener('click', async () => { await kickCommunityMember(c.id, b.dataset.ckick); openCommunitySettings(); });
  });
  openModal('modalCommunitySettings');
}

function wireNewChannelModal() {
  document.getElementById('nc_submit').addEventListener('click', async () => {
    const name = document.getElementById('nc_name').value.trim();
    if (!name || !App.activeCommunity) return;
    const id = await createChannel(App.activeCommunity.id, name);
    if (id) { closeModal('modalNewChannel'); document.getElementById('nc_name').value = ''; openCommunity(App.activeCommunity.id); }
  });
}

/* ================= ÉPINGLÉS / RECHERCHE / CLASSEMENT ================= */

async function openPinnedModal() {
  if (!App.activeConversationId) return;
  const pinned = await listPinned(App.activeConversationId);
  document.getElementById('pinnedBody').innerHTML = pinned.length ? pinned.map(m => `
    <div class="msg-row"><div class="msg-avatar-col">${avatarHtml(m.profiles)}</div>
      <div class="msg-body"><div class="msg-head"><span class="msg-author">${esc(m.profiles?.display_name)}</span><span class="msg-time">${fmtTime(m.created_at)}</span></div>
      <div class="msg-content">${renderMessageContent(m.content)}</div></div></div>
  `).join('') : `<p class="muted center">Aucun message épinglé.</p>`;
  openModal('modalPinned');
}

function wireSearchMsgModal() {
  document.getElementById('searchMsgInput').addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    if (q.length < 2 || !App.activeConversationId) { document.getElementById('searchMsgResults').innerHTML = ''; return; }
    const results = await searchMessages(App.activeConversationId, q);
    document.getElementById('searchMsgResults').innerHTML = results.map(m => `
      <div class="msg-row"><div class="msg-avatar-col">${avatarHtml(m.profiles)}</div>
        <div class="msg-body"><div class="msg-head"><span class="msg-author">${esc(m.profiles?.display_name)}</span><span class="msg-time">${fmtRelative(m.created_at)}</span></div>
        <div class="msg-content">${renderMessageContent(m.content)}</div></div></div>
    `).join('') || `<p class="muted center">Aucun résultat.</p>`;
  }, 300));
}

async function openLeaderboard() {
  const top = await globalLeaderboard(20);
  document.getElementById('leaderboardBody').innerHTML = top.map((p, i) => `
    <div class="leaderboard-row">
      <div class="leaderboard-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</div>
      ${avatarHtml(p)}
      <div class="list-item-body"><div class="list-item-title">${esc(p.display_name)}</div><div class="list-item-sub">${esc(p.title)}</div></div>
      <div class="pill pill-admin">${p.xp} XP</div>
    </div>
  `).join('');
  openModal('modalLeaderboard');
}

async function openFriendRequestsModal() {
  const reqs = await listIncomingFriendRequests();
  document.getElementById('friendRequestsBody').innerHTML = reqs.length ? reqs.map(r => `
    <div class="list-item">
      ${avatarHtml(r.profiles)}
      <div class="list-item-body"><div class="list-item-title">${esc(r.profiles?.display_name)}</div></div>
      <button class="btn btn-primary btn-sm" data-accept-req="${r.id}">Accepter</button>
      <button class="btn btn-ghost btn-sm" data-decline-req="${r.id}">Refuser</button>
    </div>
  `).join('') : `<p class="muted center">Aucune demande en attente.</p>`;
  document.getElementById('friendRequestsBody').querySelectorAll('[data-accept-req]').forEach(b => b.addEventListener('click', async () => { await acceptFriendRequest(b.dataset.acceptReq); openFriendRequestsModal(); }));
  document.getElementById('friendRequestsBody').querySelectorAll('[data-decline-req]').forEach(b => b.addEventListener('click', async () => { await declineFriendRequest(b.dataset.declineReq); openFriendRequestsModal(); }));
  openModal('modalFriendRequests');
}

/* ================= NOTIFICATIONS TEMPS RÉEL ================= */

function onIncomingNotification(notif) {
  refreshNotifDot();
  const labels = {
    mention: 'Vous avez été mentionné(e)',
    tag_all: 'Quelqu\'un a mentionné tout le monde',
    friend_request: 'Nouvelle demande d\'ami',
    friend_accept: 'Demande d\'ami acceptée'
  };
  const label = labels[notif.type] || 'Nouvelle notification';
  toast(label);
  fireBrowserNotification('EGO-META', label);
  // features.js patches this function after DOMContentLoaded to add nav support
}

function resetMainPanel() {
  App.activeConversationId = null;
  App.activeKind = null;
  unsubscribeFromConversation();
  document.getElementById('panelTopbar').style.display = 'none';
  document.getElementById('messageList').classList.add('hidden');
  document.getElementById('composerWrap').classList.add('hidden');
  document.getElementById('mainEmptyState').classList.remove('hidden');
  document.getElementById('membersPanel').classList.add('hidden');
}
