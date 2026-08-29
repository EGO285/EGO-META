/* =========================================================================
   EGO-META — Abonnements temps réel (messages, réactions, présence/frappe,
   notifications, membres)
   ========================================================================= */

let currentMessagesChannel = null;
let currentPresenceChannel = null;
let notifChannel = null;
let typingTimeout = null;

function subscribeToConversation(conversationId, handlers) {
  unsubscribeFromConversation();

  currentMessagesChannel = sb.channel('conv:' + conversationId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onNewMessage?.(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onUpdateMessage?.(payload.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' },
      (payload) => handlers.onReactionChange?.(payload))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onMembersChange?.(payload.new))
    .subscribe();

  // Présence : qui est "en train d'écrire"
  currentPresenceChannel = sb.channel('typing:' + conversationId, { config: { presence: { key: handlers.myId } } });
  currentPresenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = currentPresenceChannel.presenceState();
      const typers = Object.values(state).flat().filter(p => p.typing && p.user_id !== handlers.myId);
      handlers.onTypingChange?.(typers);
    })
    .subscribe();

  return { messagesChannel: currentMessagesChannel, presenceChannel: currentPresenceChannel };
}

function unsubscribeFromConversation() {
  if (currentMessagesChannel) { sb.removeChannel(currentMessagesChannel); currentMessagesChannel = null; }
  if (currentPresenceChannel) { sb.removeChannel(currentPresenceChannel); currentPresenceChannel = null; }
}

function sendTypingSignal(isTyping, myId, myName) {
  if (!currentPresenceChannel) return;
  currentPresenceChannel.track({ user_id: myId, name: myName, typing: isTyping });
  if (isTyping) {
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => currentPresenceChannel?.track({ user_id: myId, name: myName, typing: false }), 4000);
  }
}

function subscribeToNotifications(userId, onNotif) {
  if (notifChannel) sb.removeChannel(notifChannel);
  notifChannel = sb.channel('notif:' + userId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onNotif(payload.new))
    .subscribe();
}

/* Présence globale "en ligne" (liste des utilisateurs connectés en direct) */
let globalPresenceChannel = null;
function subscribeGlobalPresence(myId, myName, onSync) {
  globalPresenceChannel = sb.channel('online-users', { config: { presence: { key: myId } } });
  globalPresenceChannel
    .on('presence', { event: 'sync' }, () => onSync(globalPresenceChannel.presenceState()))
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await globalPresenceChannel.track({ user_id: myId, name: myName, online_at: new Date().toISOString() });
    });
}
