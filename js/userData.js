// =============================
// INIT SUPABASE (création unique, mode Capacitor)
// =============================
const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

if (!window.sb) {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}
const sb = window.sb;

// =============================
// THÈMES VBLOCKS (schéma users: theme_actif / themes_possedes)
// =============================
const ALL_THEMES = [
  "neon",   // par défaut
  "nuit", "nature", "bubble", "retro",
  "vitraux", "angelique", "luxury", "space", "cyber"
];
window.getAllThemes = () => ALL_THEMES;

function getCurrentTheme() {
  return localStorage.getItem("themeVBlocks") || "neon";
}
function setCurrentTheme(theme) {
  localStorage.setItem("themeVBlocks", theme);
}

// =============================
// LEGACY (avant Auth) : gestion locale
// =============================
function getLegacyUserId() {
  let id = localStorage.getItem('user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('user_id', id);
  }
  return id;
}

function getPseudo() {
  let pseudo = localStorage.getItem('pseudo');
  if (!pseudo) {
    pseudo = 'Player_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('pseudo', pseudo);
  }
  return pseudo;
}
function setPseudo(pseudo) { localStorage.setItem('pseudo', pseudo); }

function normalizeLangForCloud(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  if (["FR","EN","ES","DE","IT","PT","PT-BR","NL","AR","IDN","JP","KO"].includes(c)) return c;
  const lower = c.toLowerCase();
  if (lower.startsWith("pt-br")) return "PT-BR";
  if (lower.startsWith("pt"))    return "PT";
  if (lower.startsWith("en"))    return "EN";
  if (lower.startsWith("fr"))    return "FR";
  if (lower.startsWith("de"))    return "DE";
  if (lower.startsWith("es"))    return "ES";
  if (lower.startsWith("it"))    return "IT";
  if (lower.startsWith("nl"))    return "NL";
  if (lower === "ar" || lower.startsWith("ar-")) return "AR";
  if (lower === "id" || lower.startsWith("id-")) return "IDN";
  if (lower === "ja" || lower.startsWith("ja-")) return "JP";
  if (lower === "ko" || lower.startsWith("ko-")) return "KO";
  return null;
}
function detectPreferredLangForCloud() {
  const list = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || navigator.userLanguage];
  for (const c of list) {
    const n = normalizeLangForCloud(c);
    if (n) return n;
  }
  return "EN";
}
function getLang() {
  const stored = localStorage.getItem('langue');
  const nStored = normalizeLangForCloud(stored);
  return nStored || detectPreferredLangForCloud();
}

// =============================
// AUTH ANONYME + MIGRATION "SANS PERTE"
// =============================
async function ensureAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) await sb.auth.signInAnonymously();
}

async function migrateLegacyProfileIfNeeded() {
  try {
    const legacyId = localStorage.getItem('user_id');
    if (!legacyId) return; // rien à migrer
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.id) return;

    // Lier l'utilisateur Auth au profil legacy existant
    await sb.rpc('link_auth_to_legacy', { legacy_id: legacyId });

    // Marqueur optionnel
    localStorage.setItem('migrated_to_auth', 'true');
  } catch (e) {
    console.warn('Migration legacy ignorée :', e?.message || e);
  }
}

// Retourne l'ID courant (privilégie Auth, sinon legacy en secours)
async function getUserId() {
  const { data: { user } } = await sb.auth.getUser();
  return user?.id || getLegacyUserId();
}
window.getUserId = getUserId;

// Boot immédiat (au chargement du script)
(async () => {
  await ensureAuth();
  await migrateLegacyProfileIfNeeded();
})();

// =============================
// PSEUDO / PROFIL (cloud d'abord, fallback local)
// =============================
async function initUserData() {
  // Avec auth anonyme + trigger, pas besoin d'insérer manuellement
  // On synchronise juste pseudo/lang si nécessaire (sur la ligne liée à l'auth OU legacy)
  try {
    const uid = await getUserId();
    const pseudo = getPseudo();
    const lang = getLang();

    // Met à jour si vide côté cloud
    const { data, error } = await sb
      .from('users')
      .select('pseudo,lang')
      .or(`id.eq.${uid},auth_id.eq.${uid}`)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const toUpdate = {};
      if (!data.pseudo) toUpdate.pseudo = pseudo;
      if (!data.lang)   toUpdate.lang = lang;
      if (Object.keys(toUpdate).length) {
        await sb.from('users').update(toUpdate)
          .or(`id.eq.${uid},auth_id.eq.${uid}`);
      }
    }
  } catch {}
}

async function updatePseudo(newPseudo) {
  setPseudo(newPseudo); // MAJ local
  const uid = await getUserId();
  const { error } = await sb
    .from('users')
    .update({ pseudo: newPseudo })
    .or(`id.eq.${uid},auth_id.eq.${uid}`);
  if (error) {
    alert("Erreur Supabase: " + error.message);
    return false;
  }
  return true;
}

async function updatePseudoUI() {
  const uid = await getUserId();
  const { data, error } = await sb
    .from('users')
    .select('pseudo')
    .or(`id.eq.${uid},auth_id.eq.${uid}`)
    .limit(1)
    .maybeSingle();

  let pseudo = (!error && data?.pseudo) ? data.pseudo : getPseudo();
  setPseudo(pseudo);
  const el = document.getElementById("profilPseudo");
  if (el) el.textContent = pseudo;
}

function setupPseudoPopup() {
  const popup = document.getElementById("popupPseudo");
  const input = document.getElementById("newPseudo");
  const errorDiv = document.getElementById("pseudoError");
  const btnChange = document.getElementById("btnChangePseudo");
  const btnSave = document.getElementById("btnSavePseudo");
  const btnCancel = document.getElementById("btnCancelPseudo");
  if (!popup || !btnChange || !btnSave || !btnCancel) return;

  btnChange.onclick = () => {
    popup.classList.add("active");
    errorDiv.textContent = "";
    input.value = getPseudo();
  };
  btnCancel.onclick = () => popup.classList.remove("active");
  btnSave.onclick = async () => {
    const pseudo = input.value.trim();
    if (pseudo.length < 3) { errorDiv.textContent = "Pseudo trop court."; return; }
    const ok = await updatePseudo(pseudo);
    if (ok) { await updatePseudoUI(); popup.classList.remove("active"); }
  };
}

// =============================
// HIGHSCORE (inchangé, mais filtre id/auth_id)
// =============================
function getLocalHighScore() {
  return parseInt(localStorage.getItem('highscore') || '0', 10);
}
function setLocalHighScore(score) {
  localStorage.setItem('highscore', score);
}
async function syncHighScore() {
  const uid = await getUserId();
  await sb.from('users').update({ highscore: getLocalHighScore() })
    .or(`id.eq.${uid},auth_id.eq.${uid}`);
}
function updateScoreIfHigher(newScore) {
  const current = getLocalHighScore();
  if (newScore > current) {
    setLocalHighScore(newScore);
    syncHighScore();
  }
}

// =============================
// VCOINS / JETONS via NOUVELLES RPC (delta), liées à auth.uid()
// =============================
async function addVCoinsSupabase(amount) {
  const { data, error } = await sb.rpc('add_vcoins', { delta: amount });
  if (error) throw error;
  return data?.[0]?.vcoins ?? data?.[0]?.new_balance ?? 0;
}
async function getVCoinsSupabase() {
  const uid = await getUserId();
  const { data, error } = await sb
    .from('users').select('vcoins')
    .or(`id.eq.${uid},auth_id.eq.${uid}`)
    .limit(1).maybeSingle();
  if (error) return 0;
  return data?.vcoins ?? 0;
}

async function addJetonsSupabase(amount) {
  const { data, error } = await sb.rpc('add_jetons', { delta: amount });
  if (error) throw error;
  return data?.[0]?.jetons ?? data?.[0]?.new_balance ?? 0;
}
async function setJetonsSupabase(newValue) {
  const uid = await getUserId();
  const { error } = await sb
    .from('users')
    .update({ jetons: newValue })
    .or(`id.eq.${uid},auth_id.eq.${uid}`);
  if (error) throw error;
  return newValue;
}
async function getJetonsSupabase() {
  const uid = await getUserId();
  const { data, error } = await sb
    .from('users').select('jetons')
    .or(`id.eq.${uid},auth_id.eq.${uid}`)
    .limit(1).maybeSingle();
  if (error) return 0;
  return data?.jetons ?? 0;
}

// =============================
// THÈMES (schéma: theme_actif, themes_possedes)
// =============================
async function getUnlockedThemesCloud() {
  const uid = await getUserId();
  const { data, error } = await sb
    .from('users').select('themes_possedes')
    .or(`id.eq.${uid},auth_id.eq.${uid}`)
    .limit(1).maybeSingle();
  if (error) return ["neon"];
  return Array.isArray(data?.themes_possedes) ? data.themes_possedes : ["neon"];
}
async function setUnlockedThemesCloud(themes) {
  const uid = await getUserId();
  await sb.from('users').update({ themes_possedes: themes })
    .or(`id.eq.${uid},auth_id.eq.${uid}`);
}

async function setThemeActifCloud(theme) {
  const uid = await getUserId();
  await sb.from('users').update({ theme_actif: theme })
    .or(`id.eq.${uid},auth_id.eq.${uid}`);
}
async function getThemeActifCloud() {
  const uid = await getUserId();
  const { data, error } = await sb.from('users').select('theme_actif')
    .or(`id.eq.${uid},auth_id.eq.${uid}`)
    .limit(1).maybeSingle();
  if (error) return getCurrentTheme();
  return data?.theme_actif || getCurrentTheme();
}

// =============================
// SCORE
// =============================
async function setLastScoreSupabase(score) {
  const uid = await getUserId();
  await sb.from('users').update({ score }).or(`id.eq.${uid},auth_id.eq.${uid}`);
}
async function getHighScoreSupabase() {
  const uid = await getUserId();
  const { data, error } = await sb.from('users').select('highscore')
    .or(`id.eq.${uid},auth_id.eq.${uid}`)
    .limit(1).maybeSingle();
  if (error) return 0;
  return data?.highscore || 0;
}
async function setHighScoreSupabase(score) {
  const uid = await getUserId();
  await sb.from('users').update({ highscore: score })
    .or(`id.eq.${uid},auth_id.eq.${uid}`);
}

// =============================
// EXPORTS
// =============================
window.userData = window.userData || {};
userData.getVCoins = getVCoinsSupabase;
userData.addVCoins = addVCoinsSupabase;
userData.getJetons = getJetonsSupabase;
userData.addJetons = addJetonsSupabase;
userData.setJetons = setJetonsSupabase;
userData.getHighScore = getHighScoreSupabase;
userData.setHighScore = setHighScoreSupabase;
userData.getUnlockedThemes = getUnlockedThemesCloud;
userData.setUnlockedThemes = setUnlockedThemesCloud;
userData.setThemeActif = setThemeActifCloud;
userData.getThemeActif = getThemeActifCloud;

window.getPseudo = getPseudo;
window.setPseudo = setPseudo;
window.getLang = getLang;

// Init au démarrage de la page
initUserData();
window.addEventListener("DOMContentLoaded", () => {
  updatePseudoUI();
  setupPseudoPopup();
});
