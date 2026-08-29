/* =========================================================================
   EGO-META — Client Appwrite (remplace supabase-client.js + config.js)
   ========================================================================= */

let aw = null;         // Client Appwrite
let awAuth = null;     // Account service
let awDB = null;       // Databases service
let awStorage = null;  // Storage service
let awRealtime = null; // Realtime service
let sbConfigured = false;

function initSupabase() {  // conserve le nom pour compatibilité avec app.js
  const notConfigured =
    !EGO_CONFIG.appwriteProjectId ||
    EGO_CONFIG.appwriteProjectId === "TON_PROJECT_ID" ||
    !EGO_CONFIG.appwriteDatabaseId;

  if (notConfigured) {
    sbConfigured = false;
    showConfigWarning();
    return;
  }

  if (!window.Appwrite) {
    sbConfigured = false;
    showConfigWarning('sdk');
    return;
  }

  try {
    aw        = new Appwrite.Client();
    aw.setEndpoint(EGO_CONFIG.appwriteEndpoint).setProject(EGO_CONFIG.appwriteProjectId);
    awAuth    = new Appwrite.Account(aw);
    awDB      = new Appwrite.Databases(aw);
    awStorage = new Appwrite.Storage(aw);
    awRealtime = new Appwrite.Realtime(aw);
    sbConfigured = true;
  } catch (err) {
    console.error('EGO-META: échec init Appwrite', err);
    sbConfigured = false;
    showConfigWarning('sdk');
  }
}

function showConfigWarning(kind) {
  const el = document.getElementById('configWarning');
  if (!el) return;
  if (kind === 'sdk') {
    const title = el.querySelector('h2');
    const desc  = el.querySelector('p');
    if (title) title.innerHTML = icon('plug') + " Connexion au service impossible";
    if (desc)  desc.innerHTML  = "Le script Appwrite n'a pas pu se charger. Vérifiez votre connexion et rechargez la page.";
  }
  el.classList.remove('hidden');
}

/* ─── Helpers internes ────────────────────────────────────────────────────── */

const DB  = () => EGO_CONFIG.appwriteDatabaseId;
const COL = (name) => COLLECTIONS[name];
const ID  = () => Appwrite.ID.unique();

// Convertit un document Appwrite en objet plat compatible avec le reste du code
function doc(d) {
  if (!d) return null;
  const { $id, $collectionId, $databaseId, $createdAt, $updatedAt, $permissions, ...rest } = d;
  return { id: $id, created_at: $createdAt, updated_at: $updatedAt, ...rest };
}

function docs(list) {
  return (list?.documents || []).map(doc);
}

// Query helpers (Appwrite SDK v14 Query API)
const Q = Appwrite.Query;

async function queryAll(collection, queries = [], limit = 100) {
  const results = [];
  let cursor = null;
  while (true) {
    const q = [...queries, Q.limit(limit)];
    if (cursor) q.push(Q.cursorAfter(cursor));
    const res = await awDB.listDocuments(DB(), COL(collection), q);
    results.push(...res.documents);
    if (res.documents.length < limit) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return results.map(doc);
}
