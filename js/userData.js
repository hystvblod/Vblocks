// =============================
// INIT SUPABASE (création unique, mode Capacitor)
// =============================

const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

if (!window.sb) {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const sb = window.sb;

// == THEMES VBLOCKS ==
const ALL_THEMES = [
  "neon",   // par défaut, toujours débloqué
  "nuit", "nature", "bubble", "retro",
  "vitraux", "angelique", "luxury", "space", "cyber"
];
window.getAllThemes = function() {
  return ALL_THEMES;
};

// Thème courant (peut rester local, purement visuel)
function getCurrentTheme() {
  return localStorage.getItem("themeVBlocks") || "neon";
}
function setCurrentTheme(theme) {
  localStorage.setItem("themeVBlocks", theme);
}

// 1️⃣ ID local uniquement pour l’auth (obligatoire)
function getUserId() {
  let id = localStorage.getItem('user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('user_id', id);
  }
  return id;
}

// 2️⃣ Pseudo local pour le cache, mais MAJ cloud dès modif
function getPseudo() {
  let pseudo = localStorage.getItem('pseudo');
  if (!pseudo) {
    pseudo = 'Player_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('pseudo', pseudo);
  }
  return pseudo;
}
function setPseudo(pseudo) {
  localStorage.setItem('pseudo', pseudo);
}

// 3️⃣ Langue — alignée sur i18n.js (même clé, même normalisation)
function normalizeLangForCloud(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  // On accepte déjà les formats fichiers: FR, EN, PT-BR…
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
  // même clé que les Paramètres / i18n.js
  const stored = localStorage.getItem('langue');
  const nStored = normalizeLangForCloud(stored);
  if (nStored) return nStored;
  return detectPreferredLangForCloud();
}

// 4️⃣ Crée/Sync user Supabase
async function initUserData() {
  const id = getUserId();
  const pseudo = getPseudo();
  const lang = getLang();
  let { data } = await sb
    .from('users')
    .select('id')
    .eq('id', id)
    .single();
  if (!data) {
    await sb.from('users').insert([{ id, pseudo, lang }]);
  }
}

// 5️⃣ MAJ pseudo côté Supabase
async function updatePseudo(newPseudo) {
  setPseudo(newPseudo); // MAJ local
  const { error } = await sb.from('users').update({ pseudo: newPseudo }).eq('id', getUserId());
  if (error) {
    alert("Erreur Supabase: " + error.message);
    return false;
  }
  return true;
}

// 6️⃣ Injecte le pseudo dans le profil.html (toujours cloud, jamais local direct)
async function updatePseudoUI() {
  const id = getUserId();
  let { data, error } = await sb.from('users').select('pseudo').eq('id', id).single();
  let pseudo = data?.pseudo;
  if (!pseudo) pseudo = getPseudo(); // fallback
  setPseudo(pseudo); // keep local en phase
  const el = document.getElementById("profilPseudo");
  if (el) el.textContent = pseudo;
}

// 7️⃣ Prépare le popup UI pour changer pseudo
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
  btnCancel.onclick = () => {
    popup.classList.remove("active");
  };
  btnSave.onclick = async () => {
    const pseudo = input.value.trim();
    if (pseudo.length < 3) {
      errorDiv.textContent = "Pseudo trop court.";
      return;
    }
    const ok = await updatePseudo(pseudo);
    if (ok) {
      await updatePseudoUI();
      popup.classList.remove("active");
    }
  };
}

// 8️⃣ Highscore local + cloud (inchangé)
function getLocalHighScore() {
  return parseInt(localStorage.getItem('highscore') || '0', 10);
}
function setLocalHighScore(score) {
  localStorage.setItem('highscore', score);
}
async function syncHighScore() {
  const id = getUserId();
  const score = getLocalHighScore();
  await sb.from('users').update({ highscore: score }).eq('id', id);
}
function updateScoreIfHigher(newScore) {
  const current = getLocalHighScore();
  if (newScore > current) {
    setLocalHighScore(newScore);
    syncHighScore();
  }
}

// 9️⃣ Init complet
initUserData();
window.addEventListener("DOMContentLoaded", () => {
  updatePseudoUI();
  setupPseudoPopup();
});
window.updatePseudo = updatePseudo;

// ===== VCOINS, JETONS, THEMES : SUPABASE SEULEMENT ! =====

// ➡️ Ajoute/retire des VCoins (RPC Supabase)
async function addVCoinsSupabase(amount) {
  const userId = getUserId();
  const { data, error } = await sb.rpc('add_vcoins', {
    user_id: userId,
    delta: amount
  });
  if (error) throw error;
  return data?.[0]?.new_balance ?? 0;
}

// ➡️ Lis le solde VCoins cloud ONLY
async function getVCoinsSupabase() {
  const userId = getUserId();
  const { data, error } = await sb.from('users').select('vcoins').eq('id', userId).single();
  if (error) return 0;
  return data.vcoins;
}

// ➡️ Ajoute/retire des Jetons (RPC Supabase)
async function addJetonsSupabase(amount) {
  const userId = getUserId();
  const { data, error } = await sb.rpc('add_jetons', {
    user_id: userId,
    delta: amount
  });
  if (error) throw error;
  return data?.[0]?.new_balance ?? 0;
}

// ➡️ Définit la valeur des jetons (setter cloud only)
async function setJetonsSupabase(newValue) {
  const userId = getUserId();
  const { error } = await sb.from('users').update({ jetons: newValue }).eq('id', userId);
  if (error) throw error;
  return newValue;
}

// ➡️ Lis le solde Jetons cloud ONLY
async function getJetonsSupabase() {
  const userId = getUserId();
  const { data, error } = await sb.from('users').select('jetons').eq('id', userId).single();
  if (error) return 0;
  return data.jetons;
}

// --- THEMES VBLOCKS ---
// 100% CLOUD pour débloqués !
async function getUnlockedThemesCloud() {
  const userId = getUserId();
  const { data, error } = await sb.from('users').select('themes_possedes').eq('id', userId).single();
  if (error) return ["neon"]; // fallback minimal
  return Array.isArray(data?.themes_possedes) ? data.themes_possedes : ["neon"];
}
async function setUnlockedThemesCloud(themes) {
  const userId = getUserId();
  await sb.from('users').update({ themes_possedes: themes }).eq('id', userId);
}

// Ajoute un score au cloud (dernier score joué)
async function setLastScoreSupabase(score) {
  const userId = getUserId();
  await sb.from('users').update({ score }).eq('id', userId);
}

// Lis le highscore cloud (utile si besoin)
async function getHighScoreSupabase() {
  const userId = getUserId();
  const { data, error } = await sb.from('users').select('highscore').eq('id', userId).single();
  if (error) return 0;
  return data.highscore || 0;
}

// Met à jour le highscore cloud si besoin
async function setHighScoreSupabase(score) {
  const userId = getUserId();
  await sb.from('users').update({ highscore: score }).eq('id', userId);
}

// --- USERDATA pour tout brancher ---
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

// (Optionnel) expose les fonctions utiles si besoin :
window.getUserId = getUserId;
window.getPseudo = getPseudo;
window.setPseudo = setPseudo;
window.getLang = getLang;
