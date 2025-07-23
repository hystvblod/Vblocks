// =============================
// INIT SUPABASE (création unique, mode Capacitor)
// =============================

// Variables d'accès
const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

// Ne crée le client qu'une seule fois, même si plusieurs inclusions
if (!window.sb) {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const sb = window.sb;

// == THEMES VBLOCKS ==
const ALL_THEMES = [
  "neon",   // par défaut, toujours débloqué
  "nuit", "nature", "bubble", "retro",
  "vitraux", "candy", "luxury", "space", "cyber"
];

window.getAllThemes = function() {
  return ALL_THEMES;
};

// Thème courant (toujours lu/écrit en local, c’est visuel)
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

// 3️⃣ Langue
function getLang() {
  return localStorage.getItem('lang') || navigator.language?.split('-')[0] || 'fr';
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
  setPseudo(newPseudo);
  await sb.from('users').update({ pseudo: newPseudo }).eq('id', getUserId());
}

// 6️⃣ Injecte le pseudo dans le profil.html (toujours en cloud, jamais local direct)
async function updatePseudoUI() {
  const id = getUserId();
  let { data } = await sb.from('users').select('pseudo').eq('id', id).single();
  let pseudo = data?.pseudo || getPseudo();
  setPseudo(pseudo); // keep cache à jour
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
    await updatePseudo(pseudo);
    await updatePseudoUI();
    popup.classList.remove("active");
  };
}

// 8️⃣ Highscore local + cloud (inchangé, c’est juste du score, à adapter si besoin)
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

// ===== VCOINS & JETONS : SUPABASE SEULEMENT ! =====

// ➡️ Ajoute/retire des VCoins (RPC Supabase, pas localStorage)
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

// ➡️ Ajoute/retire des Jetons (RPC Supabase, pas localStorage)
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

// Ajoute un score au cloud (dernier score joué)
async function setLastScoreSupabase(score) {
  const userId = getUserId();
  // Écrase juste le score actuel (ou ajoute la colonne si pas présente)
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

function getUnlockedThemes() {
  return JSON.parse(localStorage.getItem('unlockedVBlocksThemes') || '["neon","nuit","nature"]');
}
function setUnlockedThemes(themes) {
  localStorage.setItem('unlockedVBlocksThemes', JSON.stringify(themes));
}

// Pour affichage rapide cloud
window.userData = window.userData || {};
userData.getVCoins = getVCoinsSupabase;
userData.addVCoins = addVCoinsSupabase;
userData.getJetons = getJetonsSupabase;
userData.addJetons = addJetonsSupabase;
userData.setJetons = setJetonsSupabase;
userData.getHighScore = getHighScoreSupabase;
userData.setHighScore = setHighScoreSupabase;
userData.getUnlockedThemes = getUnlockedThemes;
userData.setUnlockedThemes = setUnlockedThemes;

// (Optionnel) expose les fonctions utiles si besoin :
window.getUserId = getUserId;
window.getPseudo = getPseudo;
window.setPseudo = setPseudo;
window.getLang = getLang;
