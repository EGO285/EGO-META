/* =========================================================================
   EGO-META — Notifications navigateur, titre d'onglet, son
   -------------------------------------------------------------------------
   Limite honnête : ceci utilise l'API Notification standard du navigateur.
   Ça fonctionne tant que l'onglet EGO-META est ouvert (même en arrière-plan
   ou minimisé). Ce n'est PAS une notification "push" capable de réveiller
   le téléphone quand le site est complètement fermé — ça demanderait un
   serveur de notifications push dédié, hors du périmètre d'un site statique.
   ========================================================================= */

const BrowserNotify = {
  soundEnabled: true,
  audioCtx: null,
  tabHasFocus: true,
  unreadTitleCount: 0,
  originalTitle: document.title
};

function initBrowserNotify() {
  window.addEventListener('focus', () => { BrowserNotify.tabHasFocus = true; clearUnreadTitle(); });
  window.addEventListener('blur', () => { BrowserNotify.tabHasFocus = false; });
  const saved = localStorage.getItem('ego_notif_sound');
  BrowserNotify.soundEnabled = saved !== 'off';
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    try { return await Notification.requestPermission(); } catch { return 'denied'; }
  }
  return Notification.permission;
}

function fireBrowserNotification(title, body) {
  if (BrowserNotify.tabHasFocus) return; // pas besoin si l'utilisateur regarde déjà
  playNotifSound();
  bumpUnreadTitle();
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: 'icons/icon-192.png', tag: 'ego-meta' });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* certains navigateurs mobiles n'autorisent pas new Notification() hors service worker */ }
}

function bumpUnreadTitle() {
  BrowserNotify.unreadTitleCount++;
  document.title = `(${BrowserNotify.unreadTitleCount}) ${BrowserNotify.originalTitle}`;
}
function clearUnreadTitle() {
  BrowserNotify.unreadTitleCount = 0;
  document.title = BrowserNotify.originalTitle;
}

function playNotifSound() {
  if (!BrowserNotify.soundEnabled) return;
  try {
    BrowserNotify.audioCtx = BrowserNotify.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = BrowserNotify.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* AudioContext peut être bloqué avant interaction utilisateur — sans gravité */ }
}

function toggleNotifSound(enabled) {
  BrowserNotify.soundEnabled = enabled;
  localStorage.setItem('ego_notif_sound', enabled ? 'on' : 'off');
}
