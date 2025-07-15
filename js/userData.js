// === userData.js ===
// Clé Supabase fournie
const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// == THEMES VBLOCKS ==
const ALL_THEMES = [
  "neon",   // par défaut, toujours débloqué
  "nuit", "nature", "bubble", "retro",
  "gothic", "candy", "luxury", "space", "cyber"
];

// Initialise la liste si vide
if (!localStorage.getItem("unlockedVBlocksThemes")) {
  localStorage.setItem("unlockedVBlocksThemes", JSON.stringify(["neon"]));
}

// Renvoie la liste débloquée
function getUnlockedThemes() {
  return JSON.parse(localStorage.getItem("unlockedVBlocksThemes") || '["neon"]');
}

// Débloque un thème (depuis la boutique)
function unlockTheme(theme) {
  let unlocked = getUnlockedThemes();
  if (!unlocked.includes(theme)) {
    unlocked.push(theme);
    localStorage.setItem("unlockedVBlocksThemes", JSON.stringify(unlocked));
  }
}

// Utilisé pour afficher le thème courant (pour le JS du jeu)
function getCurrentTheme() {
  return localStorage.getItem("themeVBlocks") || "neon";
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

// 8️⃣ Score
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
