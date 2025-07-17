
// Clé Supabase fournie
const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// == THEMES VBLOCKS ==
const ALL_THEMES = [
  "neon",   // par défaut, toujours débloqué
  "nuit", "nature", "bubble", "retro",
  "vitraux", "candy", "luxury", "space", "cyber"
];

// --- EXPOSITION GLOBALE POUR LE HTML ---
window.getAllThemes = function() {
  return ALL_THEMES;
};

// Initialise la liste si vide
if (!localStorage.getItem("unlockedVBlocksThemes")) {
  localStorage.setItem("unlockedVBlocksThemes", JSON.stringify(["neon"]));
}

// Renvoie la liste débloquée (depuis localStorage, synchro avec Supabase au login)
function getUnlockedThemes() {
  return JSON.parse(localStorage.getItem("unlockedVBlocksThemes") || '["neon"]');
}
function setUnlockedThemes(themes) {
  localStorage.setItem("unlockedVBlocksThemes", JSON.stringify(themes));
}

// Thème courant (UI jeu)
function getCurrentTheme() {
  return localStorage.getItem("themeVBlocks") || "neon";
}
function setCurrentTheme(theme) {
  localStorage.setItem("themeVBlocks", theme);
}

// 1️⃣ ID local
function getUserId() {
  let id = localStorage.getItem('user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('user_id', id);
  }
  return id;
}

// 2️⃣ Pseudo local
function getPseudo() {
  let pseudo = localStorage.getItem('pseudo');
  if (!pseudo) {
    pseudo = 'Player_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('pseudo', pseudo);
  }
  return pseudo;
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

  let { data, error } = await sb
    .from('users')
    .select('id')
    .eq('id', id)
    .single();

  if (!data) {
    const { error: insertError } = await sb.from('users').insert([{
      id: id,
      pseudo: pseudo,
      lang: lang
    }]);
    if (insertError) console.error('Erreur création user:', insertError);
  }
}

// 5️⃣ MAJ pseudo côté Supabase
async function updatePseudo(newPseudo) {
  localStorage.setItem('pseudo', newPseudo);
  const { error } = await sb.from('users').update({ pseudo: newPseudo }).eq('id', getUserId());
  if (error) console.error("Erreur MAJ pseudo Supabase :", error);
}

// 6️⃣ Injecte le pseudo dans le profil.html
function updatePseudoUI() {
  const p = getPseudo();
  const el = document.getElementById("profilPseudo");
  if (el) el.textContent = p;
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
    updatePseudoUI();
    popup.classList.remove("active");
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

// ===== GESTION VCOINS - 100% SÉCURISÉE SUPABASE =====

// Ajoute ou retire des VCoins via fonction RPC Supabase (jamais direct !)
async function addVCoinsSupabase(amount) {
  const userId = getUserId();
  const { data, error } = await sb.rpc('add_vcoins', {
    user_id: userId,
    delta: amount
  });
  if (error) {
    alert("Erreur lors de la mise à jour des VCoins !");
    throw error;
  }
  let newBalance = data?.[0]?.new_balance ?? 0;
  localStorage.setItem('vblocks_vcoins', newBalance);
  return newBalance;
}

// Lis le solde des VCoins (depuis Supabase, pour affichage)
async function getVCoinsSupabase() {
  const userId = getUserId();
  const { data, error } = await sb.from('users').select('vcoins').eq('id', userId).single();
  if (error) return 0;
  localStorage.setItem('vblocks_vcoins', data.vcoins);
  return data.vcoins;
}

// Synchro la liste des thèmes (au login ou refresh UI)
async function syncUnlockedThemes() {
  const id = getUserId();
  const { data, error } = await sb.from('users').select('themes_possedes').eq('id', id).single();
  if (data && Array.isArray(data.themes_possedes)) {
    localStorage.setItem('unlockedVBlocksThemes', JSON.stringify(data.themes_possedes));
  }
}

// Ajoute un thème côté Supabase (pas de doublon)
async function unlockThemeCloud(theme) {
  const id = getUserId();
  let { data, error } = await sb.from('users').select('themes_possedes').eq('id', id).single();
  let themes = (data && Array.isArray(data.themes_possedes)) ? data.themes_possedes : [];
  if (!themes.includes(theme)) themes.push(theme);
  await sb.from('users').update({ themes_possedes: themes }).eq('id', id);
  localStorage.setItem('unlockedVBlocksThemes', JSON.stringify(themes));
}

// Change le thème actif côté Supabase
async function setCurrentThemeCloud(theme) {
  const id = getUserId();
  await sb.from('users').update({ theme_actif: theme }).eq('id', id);
  localStorage.setItem('themeVBlocks', theme);
}
// --- GESTION JETONS ---
// ===== GESTION JETONS (comme VCoins, version complète) =====

// Ajoute ou retire des Jetons via RPC Supabase
async function addJetonsSupabase(amount) {
  const userId = getUserId();
  const { data, error } = await sb.rpc('add_jetons', {
    user_id: userId,
    delta: amount
  });
  if (error) {
    alert("Erreur lors de la mise à jour des jetons !");
    throw error;
  }
  let newBalance = data?.[0]?.new_balance ?? 0;
  localStorage.setItem('vblocks_jetons', newBalance);
  return newBalance;
}

// Définit la valeur des jetons (setter direct cloud + local, par exemple après achat ou reset)
async function setJetonsSupabase(newValue) {
  const userId = getUserId();
  const { error } = await sb.from('users').update({ jetons: newValue }).eq('id', userId);
  if (error) {
    alert("Erreur lors de la mise à jour des jetons !");
    throw error;
  }
  localStorage.setItem('vblocks_jetons', newValue);
  return newValue;
}

// Lis le solde des Jetons (lecture cloud puis synchro local)
async function getJetonsSupabase() {
  const userId = getUserId();
  const { data, error } = await sb.from('users').select('jetons').eq('id', userId).single();
  if (error) return 0;
  localStorage.setItem('vblocks_jetons', data.jetons);
  return data.jetons;
}

// Synchro le solde jetons (force la valeur la plus récente côté localStorage)
async function syncJetons() {
  const solde = await getJetonsSupabase();
  localStorage.setItem('vblocks_jetons', solde);
  return solde;
}

// Pour affichage rapide
window.userData = window.userData || {};
userData.getVCoins = getVCoinsSupabase;
userData.addVCoins = addVCoinsSupabase;
userData.syncUnlockedThemes = syncUnlockedThemes;
userData.getJetons = getJetonsSupabase;
userData.addJetons = addJetonsSupabase;