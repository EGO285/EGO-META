/* =========================================================================
   EGO-META — Fonctions utilitaires partagées
   ========================================================================= */

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/* ---------------- toasts ---------------- */
function toast(message, type = '') {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------------- modals ---------------- */
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('show');
}
function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('show');
}
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    const emoji = document.getElementById('emojiPicker');
    if (emoji) emoji.classList.remove('show');
  }
});

/* ---------------- dates ---------------- */
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function fmtRelative(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff / 60) + ' min';
  if (diff < 86400) return Math.floor(diff / 3600) + ' h';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' j';
  return new Date(iso).toLocaleDateString();
}
function fmtDayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Aujourd'hui";
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------------- avatars ---------------- */
function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}
function avatarHtml(profile, size = '') {
  const cls = 'avatar' + (size ? ' ' + size : '');
  if (profile?.avatar_url) {
    return `<div class="${cls}"><img src="${esc(profile.avatar_url)}" alt=""></div>`;
  }
  const initials = initialsOf(profile?.display_name || profile?.username || '?');
  const bg = profile?.accent_color ? `background:${esc(profile.accent_color)};` : '';
  return `<div class="${cls}" style="${bg}">${esc(initials)}</div>`;
}
function statusDotHtml(status) {
  return `<span class="status-dot ${esc(status || 'offline')}"></span>`;
}

/* ---------------- emoji ---------------- */
const EMOJI_LIST = [
  "😀","😂","😍","😎","🥳","😢","😡","😱","🤔","🙄","😴","🤩",
  "👍","👎","👏","🙏","💪","🔥","✨","🎉","❤️","💜","💙","💯",
  "🐉","⚔️","🛡️","🏰","🎭","📜","🕯️","🌙","☠️","👑","🧙","🗡️"
];

/* ---------------- message content rendering (mentions, tag-all, links, markdown léger) ---------------- */
function renderMessageContent(content) {
  let html = esc(content || '');
  // Markdown léger : **gras**, *italique*, ~~barré~~, `code`
  html = html.replace(/```([^`]+)```/g, '<code class="msg-code-block">$1</code>');
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^\*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  html = html.replace(/(?<!\*)\*([^\*\n]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/@everyone|@tousleml/gi, '<span class="tag-all">@everyone</span>');
  html = html.replace(/@([a-zA-Z0-9_\.]{2,32})/g, '<span class="mention">@$1</span>');
  html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return html.replace(/\n/g, '<br>');
}

/* ---------------- rôles : couleur badge (façon Discord) ---------------- */
const ROLE_COLORS = { owner: '#e0a840', admin: '#e5555c', moderator: '#4fd6e8', member: null };
function roleColorStyle(role) {
  const c = ROLE_COLORS[role];
  return c ? `color:${c};` : '';
}

/* ---------------- accusés de lecture (DM) ---------------- */
function readReceiptHtml(delivered, read) {
  if (!delivered) return '';
  return `<span class="read-receipt ${read ? 'read' : ''}" title="${read ? 'Lu' : 'Envoyé'}">${read ? '✓✓' : '✓'}</span>`;
}

/* ---------------- lightbox image ---------------- */
function openLightbox(url) {
  let box = document.getElementById('lightboxOverlay');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lightboxOverlay';
    box.className = 'lightbox-overlay';
    box.innerHTML = `<img id="lightboxImg" src=""><button class="btn-icon lightbox-close">${icon('x')}</button>`;
    document.body.appendChild(box);
    box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('lightbox-close')) box.classList.remove('show'); });
  }
  document.getElementById('lightboxImg').src = url;
  box.classList.add('show');
}

/* ---------------- misc ---------------- */
function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Copié dans le presse-papiers ✓'));
}
function randHex(n = 4) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
