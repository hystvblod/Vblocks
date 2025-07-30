// === Boutique VBlocks : JS complet, compatible Capacitor, Synchro Supabase+LocalStorage ===

// Helper i18n universel (compatible avec window.i18n ou autre système)
function t(key) {
  if (window.i18n && window.i18n[key]) return window.i18n[key];
  return key;
}

// Liste des thèmes
const THEMES = [
  { key: "bubble",     locked: false },
  { key: "nature",     locked: false },
  { key: "nuit",       locked: false },
  { key: "luxury",     locked: true  },
  { key: "space",      locked: true  },
  { key: "candy",      locked: true  },
  { key: "cyber",      locked: true  },
  { key: "vitraux",    locked: true  },
  { key: "pixel",      locked: true  },
  { key: "halloween",  locked: true  }
];

// Cartouches d’achats supplémentaires (full i18n)
const SPECIAL_CARTOUCHES = [
  { key: "boutique.cartouche.jetons12",  icon: '<img src="assets/images/jeton.webp" alt="jeton">', color: 'color-blue' },
  { key: "boutique.cartouche.jetons50",  icon: '<img src="assets/images/jeton.webp" alt="jeton">', color: 'color-purple' },
  { key: "boutique.cartouche.nopub",     icon: '<img src="assets/images/ads.png" alt="No Ads">',   color: 'color-yellow' },
  { key: "boutique.cartouche.pub1jeton", icon: '<img src="assets/images/jeton.webp" alt="Pub">',   color: 'color-green' },
  { key: "boutique.cartouche.pub300points", icon: '<img src="assets/images/vcoin.webp" alt="Pub">', color: 'color-blue' }
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
    alert(t("boutique.alert.vcoins_update_error"));
    throw error;
  }
  let newBalance = data?.[0]?.new_balance ?? 0;
  localStorage.setItem('vblocks_vcoins', newBalance);
  return newBalance;
}

/// --- Achat sécurisé d’un thème ---
async function acheterTheme(themeKey, prix) {
  const userId = getUserId();
  // Appel direct à la fonction d'achat sécurisée côté Supabase
  const { error } = await sb.rpc('purchase_theme', {
    user_id: userId,
    theme_key: themeKey,
    price: prix
  });

  if (error) {
    alert(error.message || "Erreur lors de l'achat");
    return false;
  }

  // Rafraîchit le solde et les thèmes débloqués depuis Supabase
  let { data: user } = await sb
    .from('users')
    .select('themes_possedes,vcoins')
    .eq('id', userId)
    .single();

  setUnlockedThemes(user?.themes_possedes || []);
  localStorage.setItem('vblocks_vcoins', user?.vcoins ?? "--");

  alert(t("theme.debloque"));
  renderThemes();
  return true;
}

// --- Activation d’un thème (cloud + local) ---
async function activerTheme(themeKey) {
  setCurrentTheme(themeKey);
  const userId = getUserId();
  await sb.from('users').update({ theme_actif: themeKey }).eq('id', userId);
  renderThemes();
  alert(t("theme.activated").replace("{THEME}", t("theme." + themeKey)));
}

// --- Affichage des cartouches d’achats ---
function renderAchats() {
  const $achatsList = document.getElementById('achats-list');
  let achatsHtml = SPECIAL_CARTOUCHES.map(c => `
    <div class="special-cartouche ${c.color}">
      <span class="theme-ico">${c.icon}</span>
      <span class="theme-label">${t(c.key)}</span>
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
      <div class="theme-name">${t("theme."+theme.key)}</div>
      <img class="theme-img" src="img/theme_${theme.key}.png" alt="" loading="lazy">
    `;
    if (isUnlocked) {
      card.innerHTML += (current === theme.key)
        ? `<button class="theme-btn selected" disabled>${t("boutique.btn.selectionne")}</button>`
        : `<button class="theme-btn" onclick="activerTheme('${theme.key}')">${t("boutique.btn.utiliser")}</button>`;
    } else {
      card.innerHTML += `<button class="theme-btn locked" onclick="acheterTheme('${theme.key}', ${THEME_PRICE})">${t("boutique.btn.debloquer").replace("{PRICE}", THEME_PRICE)}</button>`;
    }
    list.appendChild(card);
  });
  // Met à jour le solde des VCoins (si tu stockes côté local)
  const solde = localStorage.getItem('vblocks_vcoins') || "--";
  document.querySelector('.vcoins-solde').textContent = solde;
}

// --- Initialisation au chargement ---
document.addEventListener("DOMContentLoaded", function() {
  renderThemes();
  setupBoutiqueAchats();
});


// === Brancher les achats monétaires à la logique achat.js ===

// Cette fonction va relier les boutons d'achat aux flux de paiement
function setupBoutiqueAchats() {
  document.querySelectorAll('.special-cartouche').forEach(cartouche => {
    const label = cartouche.querySelector('.theme-label');
    if (!label) return;
    const key = label.dataset.i18n;

    if (key === 'boutique.cartouche.jetons12') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        if (await lancerPaiement("jetons12")) {
          accordeAchat("jetons12");
        }
      };
    }
    if (key === 'boutique.cartouche.jetons50') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        if (await lancerPaiement("jetons50")) {
          accordeAchat("jetons50");
        }
      };
    }
    if (key === 'boutique.cartouche.nopub') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        if (await lancerPaiement("nopub")) {
          accordeAchat("nopub");
        }
      };
    }
    // Les cartouches PUB sont déjà gérées ailleurs
  });
}
