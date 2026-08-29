/* =========================================================================
   EGO-META — Système d'icônes SVG cohérent
   -------------------------------------------------------------------------
   Pourquoi : les emoji (📌💬🔔...) sont dessinés par le système d'exploitation
   (Apple Color Emoji sur iOS/Mac, Noto Color Emoji sur Android, Segoe UI Emoji
   sur Windows...) — leur apparence, taille et alignement varient donc d'un
   appareil à l'autre, ce qui donnait une interface "différente" et des icônes
   à l'air "bizarre" selon la plateforme. Ce fichier fournit un jeu d'icônes en
   ligne (SVG inline, style trait fin cohérent) qui s'affiche identiquement
   partout, quel que soit l'appareil ou le système d'exploitation.

   Utilisation : icon('nom') retourne une chaîne <svg>...</svg> à insérer
   directement dans du HTML (template string). Le SVG hérite de la couleur du
   texte environnant (stroke="currentColor").
   ========================================================================= */

const ICONS = {
  'more-horizontal': '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  'message-circle': '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4.2-1.1L3 20l1.1-5.3A8.38 8.38 0 0 1 3 11.5 8.38 8.38 0 0 1 11.5 3a8.38 8.38 0 0 1 9.5 8.5Z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  castle: '<path d="M3 21V9l3-2V5h2v2l2-2v3l2-2v3l2-3v3l2-2v2l3 2v12Z"/><path d="M3 21h18"/><path d="M9 21v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="4"/>',
  handshake: '<path d="M8 12 4.5 8.5a2 2 0 0 1 2.8-2.8L11 9"/><path d="M13 9l3.7-3.3a2 2 0 0 1 2.8 2.8L15 13"/><path d="M8 12l3 3 2-2"/><path d="M11 15l2 2 5-5"/><path d="M2 15l3 3 2-2-3-3Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  'bell-off': '<path d="M13.7 5A6 6 0 0 1 18 11c0 3.3.9 4.9 1.5 5.6"/><path d="M6 8a6 6 0 0 0-.4 3c0 5-2 6-2 6h13"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M2 2l20 20"/>',
  star: '<path d="M12 2.5l2.9 6 6.6.6-5 4.4 1.5 6.5-6-3.5-6 3.5 1.5-6.5-5-4.4 6.6-.6Z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0Z"/><path d="M8 5H5a2 2 0 0 0 0 4h3"/><path d="M16 5h3a2 2 0 0 1 0 4h-3"/><path d="M12 14v3"/><path d="M9 21h6"/><path d="M10 17h4v4h-4Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6Z"/>',
  'shield-check': '<path d="M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6Z"/><path d="M9 12l2 2 4-4"/>',
  tool: '<path d="M14.5 2.5a4.5 4.5 0 0 0-5.9 5.1L3 13.2v3.8h3.8l5.6-5.6a4.5 4.5 0 0 0 5.1-5.9l-3 3-2-2Z"/>',
  crown: '<path d="M4 17 2.5 7.5 8 11l4-7 4 7 5.5-3.5L20 17Z"/><path d="M4 20h16"/>',
  wrench: '<path d="M21 7a4.5 4.5 0 0 1-6 4.2L8 18.3a2 2 0 0 1-2.8-2.8L12.3 8.5A4.5 4.5 0 0 1 17 3l-3 3 1 1 3-3Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  pin: '<path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="2"/>',
  'bar-chart': '<path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6Z"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  flag: '<path d="M5 3v18"/><path d="M5 4h11l-2 4 2 4H5"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/><path d="M8 22h8"/>',
  paperclip: '<path d="M21 11.5 12.5 20a4.5 4.5 0 0 1-6.4-6.4L15 4.7a3 3 0 0 1 4.3 4.2l-8.9 8.9a1.5 1.5 0 0 1-2.1-2.1l8-8"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
  x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  'arrow-left': '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
  'corner-up-left': '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M2 2l20 20"/><path d="M9.9 5.2A9.4 9.4 0 0 1 12 5c6.5 0 10 7 10 7a15.3 15.3 0 0 1-3.4 4.3"/><path d="M6.6 6.6A15.3 15.3 0 0 0 2 12s3.5 7 10 7a9.4 9.4 0 0 0 4-.9"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  link: '<path d="M9 12a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M15 12a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>',
  timer: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>',
  plug: '<path d="M12 2v6"/><path d="M9 8h6a2 2 0 0 1 2 2v2a5 5 0 0 1-10 0v-2a2 2 0 0 1 2-2Z"/><path d="M9 16v2a3 3 0 0 0 6 0v-2"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-6h4v6"/>',
  'file-text': '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  megaphone: '<path d="M3 11v2a2 2 0 0 0 2 2h1l2 5h2l-1-5h2l7 4V6l-7 4H6a2 2 0 0 0-2 2"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5 20 3"/><path d="M16 7l3 3"/><path d="M13 10l2.5 2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/>',
  'alert-triangle': '<path d="M12 3 2 20h20Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  sparkles: '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M5.6 5.6l2.8 2.8"/><path d="M15.6 15.6l2.8 2.8"/><path d="M18.4 5.6l-2.8 2.8"/><path d="M8.4 15.6l-2.8 2.8"/>',
  wave: '<path d="M8 12V6a2 2 0 0 1 4 0v5"/><path d="M12 11V4a2 2 0 0 1 4 0v7"/><path d="M16 11V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-6-3.4L2.7 13a2 2 0 0 1 3.4-2l1.9 2.6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10.5" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10.5" r="1.2"/><circle cx="10" cy="15" r="1.2"/><path d="M12 21a2 2 0 0 1 0-4h5a3 3 0 0 0 0-6"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/>',
  react: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>'
};

function icon(name, opts = {}) {
  const size = opts.size || 18;
  const cls = opts.class ? ' ' + opts.class : '';
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="icon-svg${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
