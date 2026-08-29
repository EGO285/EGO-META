/* =========================================================================
   EGO-META — Realtime Appwrite (remplace realtime.js)
   Même API publique : subscribeToConversation / sendTypingSignal /
   subscribeToNotifications / subscribeGlobalPresence
   ========================================================================= */

let _convUnsub = null;
let _presUnsub = null;
let _notifUnsub = null;
let _globalPresUnsub = null;
let typingTimeout = null;

// Clé de présence dans localStorage (partagée entre onglets)
const _TYPING_KEY = (convId) => `ego_typing_${convId}`;

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function _realtimeChannel(resource) {
  // resource ex : "databases.ego-meta-db.collections.messages.documents"
  return `databases.${EGO_CONFIG.appwriteDatabaseId}.collections.${resource}.documents`;
}

/* ─── Conversation (messages + réactions + membres) ───────────────────── */

function subscribeToConversation(conversationId, handlers) {
  unsubscribeFromConversation();

  // Messages
  const msgChannel = _realtimeChannel(COLLECTIONS.messages);
  // Réactions
  const reactChannel = _realtimeChannel(COLLECTIONS.message_reactions);
  // Membres
  const memberChannel = _realtimeChannel(COLLECTIONS.conversation_members);

  _convUnsub = awRealtime.subscribe(
    [msgChannel, reactChannel, memberChannel],
    (response) => {
      const { events, payload } = response;

      // Messages INSERT
      if (events.some(e => e.includes(COLLECTIONS.messages) && e.includes('.create'))) {
        if (payload.conversation_id === conversationId) {
          // Enrichit avec profil expéditeur (async, on l'envoie brut + enrichi ensuite)
          getProfile(payload.sender_id).then(profile => {
            handlers.onNewMessage?.({ ...payload, id: payload.$id, created_at: payload.$createdAt, profiles: profile, message_reactions: [] });
          });
        }
      }
      // Messages UPDATE
      if (events.some(e => e.includes(COLLECTIONS.messages) && e.includes('.update'))) {
        if (payload.conversation_id === conversationId) {
          handlers.onUpdateMessage?.({ ...payload, id: payload.$id, created_at: payload.$createdAt });
        }
      }
      // Réactions INSERT / DELETE
      if (events.some(e => e.includes(COLLECTIONS.message_reactions))) {
        handlers.onReactionChange?.(response);
      }
      // Membres UPDATE
      if (events.some(e => e.includes(COLLECTIONS.conversation_members) && e.includes('.update'))) {
        if (payload.conversation_id === conversationId) {
          handlers.onMembersChange?.({ ...payload, id: payload.$id });
        }
      }
    }
  );

  // Typing : polling léger via localStorage broadcast (BroadcastChannel ou storage events)
  // Pour multi-onglets sur même domaine — fonctionne offline-first
  _startTypingListener(conversationId, handlers);
}

function unsubscribeFromConversation() {
  if (_convUnsub) { _convUnsub(); _convUnsub = null; }
  _stopTypingListener();
}

/* ─── Typing (BroadcastChannel ou localStorage fallback) ──────────────── */

let _typingBC = null;
let _typingPollInterval = null;

function _startTypingListener(conversationId, handlers) {
  _stopTypingListener();

  // BroadcastChannel API (même origine, multi-onglets)
  if (window.BroadcastChannel) {
    _typingBC = new BroadcastChannel('ego_typing_' + conversationId);
    _typingBC.onmessage = (e) => {
      const { user_id, name, typing } = e.data || {};
      if (user_id && user_id !== App.me?.id) {
        _handleTypingEvent(conversationId, handlers, { user_id, name, typing });
      }
    };
  } else {
    // Fallback : polling localStorage toutes les 800ms
    _typingPollInterval = setInterval(() => {
      try {
        const raw = localStorage.getItem(_TYPING_KEY(conversationId));
        if (!raw) return;
        const state = JSON.parse(raw);
        const now = Date.now();
        const typers = Object.values(state).filter(t => t.user_id !== App.me?.id && (now - t.ts) < 5000 && t.typing);
        handlers.onTypingChange?.(typers);
      } catch (_) {}
    }, 800);
  }
}

function _stopTypingListener() {
  if (_typingBC) { _typingBC.close(); _typingBC = null; }
  if (_typingPollInterval) { clearInterval(_typingPollInterval); _typingPollInterval = null; }
}

// État local des typeurs actifs (pour BroadcastChannel)
const _typingState = {};
function _handleTypingEvent(conversationId, handlers, { user_id, name, typing }) {
  if (typing) {
    _typingState[user_id] = { user_id, name, typing: true, ts: Date.now() };
  } else {
    delete _typingState[user_id];
  }
  handlers.onTypingChange?.(Object.values(_typingState).filter(t => t.typing));
}

function sendTypingSignal(isTyping, myId, myName) {
  const convId = App.activeConversationId;
  if (!convId) return;
  clearTimeout(typingTimeout);

  const payload = { user_id: myId, name: myName, typing: isTyping, ts: Date.now() };

  if (_typingBC) {
    _typingBC.postMessage(payload);
  } else {
    // localStorage broadcast
    try {
      const raw = localStorage.getItem(_TYPING_KEY(convId));
      const state = raw ? JSON.parse(raw) : {};
      if (isTyping) state[myId] = payload;
      else delete state[myId];
      localStorage.setItem(_TYPING_KEY(convId), JSON.stringify(state));
    } catch (_) {}
  }

  if (isTyping) {
    typingTimeout = setTimeout(() => sendTypingSignal(false, myId, myName), 4000);
  }
}

/* ─── Notifications ────────────────────────────────────────────────────── */

function subscribeToNotifications(userId, onNotif) {
  if (_notifUnsub) { _notifUnsub(); _notifUnsub = null; }

  const channel = _realtimeChannel(COLLECTIONS.notifications);
  _notifUnsub = awRealtime.subscribe(channel, (response) => {
    const { events, payload } = response;
    if (events.some(e => e.includes('.create')) && payload.user_id === userId) {
      onNotif({ ...payload, id: payload.$id, created_at: payload.$createdAt, data: tryParse(payload.data) });
    }
  });
}

/* ─── Présence globale ─────────────────────────────────────────────────── */

// Appwrite n'a pas de "presence" natif comme Supabase.
// On simule via un BroadcastChannel + heartbeat dans localStorage.
const _PRESENCE_KEY = 'ego_presence';
let _presHeartbeat = null;

function subscribeGlobalPresence(myId, myName, onSync) {
  // Heartbeat : se signale "en ligne" toutes les 15s dans localStorage
  const _ping = () => {
    try {
      const raw = localStorage.getItem(_PRESENCE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      state[myId] = { user_id: myId, name: myName, online_at: Date.now() };
      // Nettoie les vieux (>35s)
      const now = Date.now();
      for (const [id, p] of Object.entries(state)) {
        if (now - p.online_at > 35000) delete state[id];
      }
      localStorage.setItem(_PRESENCE_KEY, JSON.stringify(state));
      onSync(state);
    } catch (_) {}
  };
  _ping();
  _presHeartbeat = setInterval(_ping, 15000);

  // Écoute les autres onglets
  window.addEventListener('storage', (e) => {
    if (e.key === _PRESENCE_KEY) {
      try { onSync(JSON.parse(e.newValue || '{}')); } catch (_) {}
    }
  });

  // Nettoyage au départ
  window.addEventListener('beforeunload', () => {
    try {
      const raw = localStorage.getItem(_PRESENCE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      delete state[myId];
      localStorage.setItem(_PRESENCE_KEY, JSON.stringify(state));
    } catch (_) {}
    clearInterval(_presHeartbeat);
  });
}

/* ─── Stub tryParse (si appwrite-data.js pas encore chargé) ───────────── */
function tryParse(s) {
  try { return JSON.parse(s); } catch (_) { return {}; }
}
