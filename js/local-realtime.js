/* =========================================================================
   EGO-META — Realtime 100 % local (BroadcastChannel)
   Même API publique que appwrite-realtime.js
   ========================================================================= */

let _convHandlers  = null;
let _convId        = null;
let _realtimeBC    = null;
let _notifCallback = null;
let typingTimeout  = null;

const _TYPING_KEY   = id => `ego_typing_${id}`;
const _PRESENCE_KEY = 'ego_presence';
let _presHeartbeat  = null;

/* ── Canal realtime principal ────────────────────────────────────────────── */

function _getBC() {
  if (!_realtimeBC || _realtimeBC.name !== 'ego_realtime') {
    _realtimeBC = new BroadcastChannel('ego_realtime');
  }
  return _realtimeBC;
}

function subscribeToConversation(conversationId, handlers) {
  unsubscribeFromConversation();
  _convId       = conversationId;
  _convHandlers = handlers;

  _getBC().onmessage = e => {
    const { type, payload } = e.data || {};
    if (!type || !payload) return;

    if (type === 'message_create' && payload.conversation_id === conversationId) {
      handlers.onNewMessage?.(payload);
    } else if (type === 'message_update' && payload.conversation_id === conversationId) {
      handlers.onUpdateMessage?.(payload);
    } else if (type === 'reaction_change' && _convId) {
      // Reformate pour correspondre à ce qu'attend app.js
      handlers.onReactionChange?.({ events: ['.'+payload.action], payload });
    } else if (type === 'typing' && payload.conversation_id === conversationId) {
      _handleTypingBCEvent(conversationId, handlers, payload);
    } else if (type === 'notification' && _notifCallback) {
      _notifCallback(payload);
    }
  };

  _startTypingListener(conversationId, handlers);
}

function unsubscribeFromConversation() {
  _convHandlers = null;
  _convId       = null;
  if (_realtimeBC) _realtimeBC.onmessage = null;
  _stopTypingListener();
}

/* ── Typing ──────────────────────────────────────────────────────────────── */

let _typingBC           = null;
let _typingPollInterval = null;
const _typingState      = {};

function _startTypingListener(conversationId, handlers) {
  _stopTypingListener();
  if (window.BroadcastChannel) {
    _typingBC = new BroadcastChannel('ego_typing_' + conversationId);
    _typingBC.onmessage = e => {
      const { user_id, name, typing } = e.data || {};
      if (user_id) _handleTypingBCEvent(conversationId, handlers, { user_id, name, typing });
    };
  } else {
    _typingPollInterval = setInterval(() => {
      try {
        const raw = localStorage.getItem(_TYPING_KEY(conversationId));
        if (!raw) return;
        const state = JSON.parse(raw);
        const now   = Date.now();
        const typers = Object.values(state).filter(t => (now - t.ts) < 5000 && t.typing);
        handlers.onTypingChange?.(typers);
      } catch(_) {}
    }, 800);
  }
}

function _stopTypingListener() {
  if (_typingBC) { _typingBC.close(); _typingBC = null; }
  if (_typingPollInterval) { clearInterval(_typingPollInterval); _typingPollInterval = null; }
}

function _handleTypingBCEvent(conversationId, handlers, { user_id, name, typing }) {
  if (typing) {
    _typingState[user_id] = { user_id, name, typing: true, ts: Date.now() };
  } else {
    delete _typingState[user_id];
  }
  handlers.onTypingChange?.(Object.values(_typingState).filter(t => t.typing));
}

function sendTypingSignal(isTyping, myId, myName) {
  const convId = typeof App !== 'undefined' ? App.activeConversationId : _convId;
  if (!convId) return;
  clearTimeout(typingTimeout);

  const payload = { user_id: myId, name: myName, typing: isTyping, conversation_id: convId, ts: Date.now() };

  if (_typingBC) {
    _typingBC.postMessage(payload);
  } else {
    try {
      const raw   = localStorage.getItem(_TYPING_KEY(convId));
      const state = raw ? JSON.parse(raw) : {};
      if (isTyping) state[myId] = payload; else delete state[myId];
      localStorage.setItem(_TYPING_KEY(convId), JSON.stringify(state));
    } catch(_) {}
  }

  if (isTyping) typingTimeout = setTimeout(() => sendTypingSignal(false, myId, myName), 4000);
}

/* ── Notifications ───────────────────────────────────────────────────────── */

function subscribeToNotifications(userId, onNotif) {
  _notifCallback = payload => {
    if (payload.user_id === userId) onNotif(payload);
  };
}

/* ── Présence globale ────────────────────────────────────────────────────── */

function subscribeGlobalPresence(myId, myName, onSync) {
  const _ping = () => {
    try {
      const raw   = localStorage.getItem(_PRESENCE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      state[myId] = { user_id: myId, name: myName, online_at: Date.now() };
      const now   = Date.now();
      for (const [id, p] of Object.entries(state)) {
        if (now - p.online_at > 35000) delete state[id];
      }
      localStorage.setItem(_PRESENCE_KEY, JSON.stringify(state));
      onSync(state);
    } catch(_) {}
  };
  _ping();
  _presHeartbeat = setInterval(_ping, 15000);

  window.addEventListener('storage', e => {
    if (e.key === _PRESENCE_KEY) {
      try { onSync(JSON.parse(e.newValue || '{}')); } catch(_) {}
    }
  });

  window.addEventListener('beforeunload', () => {
    try {
      const raw   = localStorage.getItem(_PRESENCE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      delete state[myId];
      localStorage.setItem(_PRESENCE_KEY, JSON.stringify(state));
    } catch(_) {}
    clearInterval(_presHeartbeat);
  });
}
