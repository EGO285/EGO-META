/* =========================================================================
   EGO-META — Initialisation du client Supabase
   (nécessite le script CDN Supabase chargé avant ce fichier, voir index.html)
   ========================================================================= */

let sb = null;
let sbConfigured = false;

function initSupabase() {
  const notConfigured =
    !EGO_CONFIG.supabaseUrl ||
    EGO_CONFIG.supabaseUrl.includes("VOTRE-PROJET") ||
    !EGO_CONFIG.supabaseAnonKey ||
    EGO_CONFIG.supabaseAnonKey.includes("VOTRE_CLE");

  if (notConfigured) {
    sbConfigured = false;
    showConfigWarning();
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    sbConfigured = false;
    showConfigWarning('sdk');
    return;
  }

  try {
    sb = window.supabase.createClient(EGO_CONFIG.supabaseUrl, EGO_CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    sbConfigured = true;
  } catch (err) {
    console.error('EGO-META: échec de création du client Supabase', err);
    sb = null;
    sbConfigured = false;
    showConfigWarning('sdk');
  }
}

function showConfigWarning(kind) {
  const el = document.getElementById('configWarning');
  if (!el) return;
  if (kind === 'sdk') {
    const title = el.querySelector('h2');
    const desc = el.querySelector('p');
    if (title) title.innerHTML = icon('plug') + " Connexion au service impossible";
    if (desc) desc.innerHTML = "Le script Supabase n'a pas pu se charger (bloqueur de publicités, pare-feu réseau, ou hors-ligne). Vérifiez votre connexion internet et rechargez la page. Si le problème persiste, consultez le README.md.";
  }
  el.classList.remove('hidden');
}
