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
async function addJetonsSupabase(amount) {
  const userId = getUserId();
  const { data, error } = await sb.rpc('add_jetons', {
    user_id: userId,
    delta: amount
  });
  if (error) {
    alert(t("boutique.alert.jetons_update_error") || error.message);
    throw error;
  }
  let newBalance = data?.[0]?.new_balance ?? 0;
  localStorage.setItem('vblocks_jetons', newBalance);
  return newBalance;
}

// --- Achat sécurisé d’un thème ---
async function acheterTheme(themeKey, prix) {
  const userId = getUserId();
  let { data: user, error } = await sb.from('users').select('vcoins,themes_possedes').eq('id', userId).single();
  let coins = user?.vcoins ?? 0;
  let themes = Array.isArray(user?.themes_possedes) ? user.themes_possedes : [];
  if (themes.includes(themeKey)) {
    alert(t("theme.deja_possede"));
    return false;
  }
  if (coins < prix) {
    alert(t("boutique.alert.pasassez"));
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
  alert(t("theme.activated").replace("{THEME}", t("theme."+themeKey)));
}

// --- Affichage des cartouches d’achats ---
function renderAchats() {
  const $achatsList = document.getElementById('achats-list');
  let achatsHtml = SPECIAL_CARTOUCHES.map(c => `
    <div class="special-cartouche ${c.color}" data-cartouche="${c.key}">
      <span class="theme-ico">${c.icon}</span>
      <span class="theme-label">${t(c.key)}</span>
    </div>
  `).join('');
  $achatsList.innerHTML = achatsHtml;
}

// --- Ajout de la gestion PUB (reward) sur les cartouches ---
function setupBoutiqueRewards() {
  // PUB 1 Jeton (color-green)
  const pubJeton = document.querySelector('.special-cartouche[data-cartouche="boutique.cartouche.pub1jeton"]');
  if (pubJeton) {
    pubJeton.style.cursor = "pointer";
    pubJeton.onclick = async function handler() {
      pubJeton.onclick = null; // anti-double clic
      try {
        if (window.showRewarded) {
          showRewarded(async (ok) => {
            if (ok) {
              await addJetonsSupabase(1); // fonction sécurisée !
              alert("+1 jeton ajouté !");
              renderThemes();
              setupBoutiqueRewards();
            } else {
              pubJeton.onclick = handler;
            }
          });
        }
      } catch(e) {
        alert("Erreur JS: " + (e?.message || e));
        pubJeton.onclick = handler;
      }
    };
  }
  // PUB 300 VCoins (dernier cartouche color-blue)
  const pubVCoins = document.querySelector('.special-cartouche[data-cartouche="boutique.cartouche.pub300points"]');
  if (pubVCoins) {
    pubVCoins.style.cursor = "pointer";
    pubVCoins.onclick = async function handler() {
      pubVCoins.onclick = null;
      try {
        if (window.showRewarded) {
          showRewarded(async (ok) => {
            if (ok) {
              await addVCoinsSupabase(300); // fonction sécurisée !
              alert("+300 VCoins ajoutés !");
              renderThemes();
              setupBoutiqueRewards();
            } else {
              pubVCoins.onclick = handler;
            }
          });
        }
      } catch(e) {
        alert("Erreur JS: " + (e?.message || e));
        pubVCoins.onclick = handler;
      }
    };
  }
}

// --- Affichage des thèmes ---
function renderThemes() {
  renderAchats();
  setupBoutiqueRewards();
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
document.addEventListener("DOMContentLoaded", renderThemes);

// --- Pour compatibilité Capacitor ---
// Rien à changer, tout ce qui utilise localStorage/fetch/fonctions Supabase marche pareil en Capacitor !
// (Pas de NodeJS requis, pas de dépendance serveur)
