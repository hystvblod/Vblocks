<!DOCTYPE html>
<html lang="fr">
<head>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.42.5/dist/umd/supabase.min.js"></script>
  <script src="js/userData.js"></script>
  <meta charset="UTF-8">
  <title data-i18n="boutique.titre"></title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="style/main.css">
  <style>
    /* Ajoute ton CSS ici si besoin */
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="top-left">
      <a href="index.html" class="btn-back" title="" tabindex="0" data-i18n="boutique.retour">
        <svg viewBox="0 0 36 36" fill="none">
          <path d="M23.5 28L15 19.5L23.5 11" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
    <div class="top-right">
      <a href="profil.html" class="btn-icon" title="" data-i18n="menu.profil">
        <img src="assets/icons/user.svg" alt="Profil" />
      </a>
      <a href="parametres.html" class="btn-icon" title="" data-i18n="menu.parametres">
        <img src="assets/icons/settings.svg" alt="Paramètres" />
      </a>
    </div>
  </div>
  <div class="container-boutique">
    <div class="shop-title" data-i18n="boutique.titre"></div>
    <div id="soldeVCoins" class="vcoins-bar">
      <img src="assets/images/vcoin.webp" alt="VCoins" class="vcoin-ico">
      <span class="vcoins-solde">--</span>
      <img src="assets/images/jeton.webp" alt="Jetons" class="vcoin-ico" style="margin-left:18px;">
      <span class="vcoins-solde">--</span>
    </div>
    <div class="section-label" data-i18n="boutique.section.vcoins"></div>
    <div class="achats-list" id="achats-list"></div>
    <div class="section-label" style="margin-top:1.5em;" data-i18n="boutique.section.themes"></div>
    <div class="themes-list" id="themes-list"></div>
  </div>
<script>
// Noms affichés des thèmes : restent non traduits ici (tu peux i18n si tu veux après)
const THEMES = [
  { key: "neon",   name: "Neon"   },
  { key: "bubble", name: "Bubble" },
  { key: "nature", name: "Nature" },
  { key: "nuit",   name: "Nuit"   },
  { key: "retro",  name: "Retro"  },
  { key: "vitraux", name: "Vitraux" },
  { key: "candy",  name: "Candy"  },
  { key: "luxury", name: "Luxury" },
  { key: "space",  name: "Space"  },
  { key: "cyber",  name: "Cyber"  }
];

// Clés i18n pour chaque cartouche (label: clé, la valeur sera injectée dynamiquement)
const SPECIAL_CARTOUCHES = [
  {
    key: 'boutique.cartouche.jetons12',
    icon: '<img src="assets/images/jeton.webp" alt="jeton">',
    color: 'color-blue'
  },
  {
    key: 'boutique.cartouche.jetons50',
    icon: '<img src="assets/images/jeton.webp" alt="jeton">',
    color: 'color-purple'
  },
  {
    key: 'boutique.cartouche.nopub',
    icon: '<img src="assets/images/ads.png" alt="No Ads">',
    color: 'color-yellow'
  },
  {
    key: 'boutique.cartouche.pub1jeton',
    icon: '<img src="assets/images/jeton.webp" alt="Pub">',
    color: 'color-green'
  },
  {
    key: 'boutique.cartouche.pub300points',
    icon: '<img src="assets/images/vcoin.webp" alt="Pub">',
    color: 'color-blue'
  }
];

const THEME_PRICE = 3000;

// Cette fonction t() doit être définie **après chargement du JSON de langue**
// Ex: window.i18n = {...}
// function t(key) { return window.i18n[key] || key; }
function t(key) { return (window.i18n && window.i18n[key]) || key; }

async function renderThemes() {
  await userData.syncUnlockedThemes?.();
  const unlocked = await userData.getUnlockedThemes?.() || [];

  // Achats (cartouches en haut)
  const $achatsList = document.getElementById('achats-list');
  let achatsHtml = SPECIAL_CARTOUCHES.map(c => `
    <div class="special-cartouche ${c.color}">
      <span class="theme-ico">${c.icon}</span>
      <span class="theme-label" data-i18n="${c.key}">${t(c.key)}</span>
    </div>
  `).join('');
  $achatsList.innerHTML = achatsHtml;

  // Thèmes (cartouches en bas)
  const $themesList = document.getElementById('themes-list');
  let html = THEMES.map(theme => {
    const isUnlocked = unlocked.includes(theme.key);
    return `
      <div class="theme-btn-style theme-${theme.key} ${isUnlocked ? "unlocked" : "locked"}">
        <span class="theme-label">${theme.name}</span>
        <span class="theme-action${isUnlocked ? " possede" : ""}" 
              ${isUnlocked ? "" : 'tabindex="0" role="button"'}
              data-theme="${theme.key}"
              data-i18n="${isUnlocked ? "theme.possede" : "theme.debloquer"}"
        >${t(isUnlocked ? "theme.possede" : "theme.debloquer")}</span>
      </div>
    `;
  }).join('');
  $themesList.innerHTML = html;

  // Débloquer
  $themesList.querySelectorAll('.theme-action:not(.possede)').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const key = btn.dataset.theme;
      const coins = await userData.getVCoins();
      if (coins < THEME_PRICE) {
        alert(t("boutique.alert.pasassez"));
        return;
      }
      await userData.addVCoins(-THEME_PRICE);
      await unlockThemeCloud(key);
      renderThemes();
    }
  });

  // i18n dynamique (après render)
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (window.i18n && window.i18n[key]) el.textContent = window.i18n[key];
  });

  // Solde
  const solde = await userData.getVCoins?.();
  document.querySelector('.vcoins-solde').textContent = typeof solde === "number" ? solde : "--";
  const soldeJetons = await userData.getJetons?.();
  document.querySelectorAll('.vcoins-solde')[1].textContent = typeof soldeJetons === "number" ? soldeJetons : "--";
}

window.onload = renderThemes;
</script>
</body>
</html>
