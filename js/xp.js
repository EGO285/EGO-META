/* =========================================================================
   EGO-META — XP / niveaux / titres RP (affichage client)
   La progression réelle (xp, level, title) est calculée et protégée côté
   serveur (voir schema.sql, triggers award_message_xp). Ce module se
   contente d'afficher joliment une progression à partir des données lues.
   ========================================================================= */

let LEVEL_TITLES = [];

async function loadLevelTitles() {
  if (!sbConfigured) return;
  const { data, error } = await sb.from('level_titles').select('*').order('level');
  if (!error && data) LEVEL_TITLES = data;
}

function xpProgress(xp, level) {
  const current = LEVEL_TITLES.find(l => l.level === level) || { xp_required: 0 };
  const next = LEVEL_TITLES.find(l => l.level === level + 1);
  if (!next) return { pct: 100, next: null, remaining: 0 };
  const span = next.xp_required - current.xp_required;
  const done = xp - current.xp_required;
  return {
    pct: Math.max(0, Math.min(100, Math.round((done / span) * 100))),
    next,
    remaining: Math.max(0, next.xp_required - xp)
  };
}

function levelBadgeHtml(level, title) {
  return `<span class="level-badge">Niv. ${level} · ${esc(title || '')}</span>`;
}
