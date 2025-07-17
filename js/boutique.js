// === Boutique VBlocks : JS complet, compatible Capacitor, Synchro Supabase+LocalStorage ===

// Liste des thèmes
const THEMES = [
  { key: "bubble",     name: "Bubble",     locked: false },
  { key: "nature",     name: "Nature",     locked: false },
  { key: "nuit",       name: "Nuit",       locked: false },
  { key: "luxury",     name: "Luxury",     locked: true  },
  { key: "space",      name: "Space",      locked: true  },
  { key: "candy",      name: "Candy",      locked: true  },
  { key: "cyber",      name: "Cyber",      locked: true  },
  { key: "vitraux",    name: "Vitraux",     locked: true  },
  { key: "pixel",      name: "Pixel Art",  locked: true  },
  { key: "halloween",  name: "Halloween",  locked: true  }
];

// Cartouches d’achats supplémentaires (ajoute si besoin, exemple)
const SPECIAL_CARTOUCHES = [
  { label: '12 jetons : 0,99€',        icon: '<img src="assets/images/jeton.webp" alt="jeton">', color: 'color-blue' },
  { label: '50 jetons : 2,99€',        icon: '<img src="assets/images/jeton.webp" alt="jeton">', color: 'color-purple' },
  { label: 'Supprimer pubs : 2,99€',   icon: '<img src="assets/images/ads.png" alt="No Ads">',   color: 'color-yellow' },
  { label: 'Regarder pub : 1 jeton',   icon: '<img src="assets/images/jeton.webp" alt="Pub">',   color: 'color-green' },
  { label: 'Regarder pub : 300 points',icon: '<img src="assets/images/vcoin.webp" alt="Pub">',   color: 'color-blue' }
];

const THEME_PRICE = 200;

// --- Helpers localStorage ---
function getUnlockedThemes() {
  return JSON.parse(localStorage.getItem('unlockedVBlocksThemes') || '["bubble","nature","nuit"]');
}
function setUnlockedThemes(themes) {
  localStorage.setItem('unlockedVBlocksThemes', JSON.stringify(themes));
}
function getCurrentTheme() {
  return localStorage.getItem('themeVBlocks') || "bubble";
}
function setCurrentTheme(theme) {
  localStorage.setItem('themeVBlocks', theme);
}
function getUserId() {
  // À adapter selon ton système d'authentification
  return localStorage.getItem('user_id') || "";
}

// --- RPC Supabase pour modifier le solde ---
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

// --- Achat sécurisé d’un thème ---
async function acheterTheme(themeKey, prix) {
  const userId = getUserId();
  let { data: user, error } = await sb.from('users').select('vcoins,themes_possedes').eq('id', userId).single();
  let coins = user?.vcoins ?? 0;
  let themes = Array.isArray(user?.themes_possedes) ? user.themes_possedes : [];
  if (themes.includes(themeKey)) {
    alert("Thème déjà possédé !");
    return false;
  }
  if (coins < prix) {
    alert("Pas assez de pièces !");
    return false;
  }
  // Déduit les coins (RPC sécurisé)
  const newBalance = await addVCoinsSupabase(-prix);
  // Ajoute le thème côté cloud
  themes.push(themeKey);
  await sb.from('users').update({ themes_possedes: themes }).eq('id', userId);
  // Synchro localStorage pour l'UI
  setUnlockedThemes(themes);
  localStorage.setItem('vblocks_vcoins', newBalance);
  alert("Thème débloqué !");
  renderThemes();
  return true;
}

// --- Activation d’un thème (cloud + local) ---
async function activerTheme(themeKey) {
  setCurrentTheme(themeKey);
  const userId = getUserId();
  await sb.from('users').update({ theme_actif: themeKey }).eq('id', userId);
  renderThemes();
  alert("Nouveau style activé : " + THEMES.find(t=>t.key===themeKey).name);
}

// --- Affichage des cartouches d’achats ---
function renderAchats() {
  const $achatsList = document.getElementById('achats-list');
  let achatsHtml = SPECIAL_CARTOUCHES.map(c => `
    <div class="special-cartouche ${c.color}">
      <span class="theme-ico">${c.icon}</span>
      <span class="theme-label">${c.label}</span>
    </div>
  `).join('');
  $achatsList.innerHTML = achatsHtml;
}

// --- Affichage des thèmes ---
function renderThemes() {
  renderAchats();
  const list = document.getElementById('themes-list');
  if (!list) return;
  list.innerHTML = "";
  const unlocked = getUnlockedThemes();
  const current = getCurrentTheme();
  THEMES.forEach(theme => {
    const isUnlocked = unlocked.includes(theme.key);
    const card = document.createElement('div');
    card.className = 'theme-card' + (current === theme.key ? " selected" : "") + (isUnlocked ? "" : " locked");
    card.innerHTML = `
      <div class="theme-name">${theme.name}</div>
      <img class="theme-img" src="img/theme_${theme.key}.png" alt="" loading="lazy">
    `;
    if (isUnlocked) {
      card.innerHTML += (current === theme.key)
        ? `<button class="theme-btn selected" disabled>Sélectionné</button>`
        : `<button class="theme-btn" onclick="activerTheme('${theme.key}')">Utiliser</button>`;
    } else {
      card.innerHTML += `<button class="theme-btn locked" onclick="acheterTheme('${theme.key}', ${THEME_PRICE})">Débloquer (${THEME_PRICE})</button>`;
    }
    list.appendChild(card);
  });
  // Met à jour le solde des VCoins (si tu stockes côté local)
  const solde = localStorage.getItem('vblocks_vcoins') || "--";
  document.querySelector('.vcoins-solde').textContent = solde;
}

// --- Initialisation au chargement ---
document.addEventListener("DOMContentLoaded", renderThemes);

// --- Pour compatibilité Capacitor ---
// Rien à changer, tout ce qui utilise localStorage/fetch/fonctions Supabase marche pareil en Capacitor !
// (Pas de NodeJS requis, pas de dépendance serveur)
