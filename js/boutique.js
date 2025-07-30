// --- Helper i18n universel
function t(key) {
  if (window.i18n && window.i18n[key]) return window.i18n[key];
  return key;
}

// --- Liste des thèmes/cadres possibles
const THEMES = [
  { key: "bubble" }, { key: "nature" }, { key: "nuit" }, { key: "luxury" },
  { key: "space" }, { key: "candy" }, { key: "cyber" }, { key: "vitraux" },
  { key: "pixel" }, { key: "halloween" }
];

// --- Cartouches d’achats spéciaux (OFFRES POINTS AJOUTÉES)
const SPECIAL_CARTOUCHES = [
  {
    key: "boutique.cartouche.points3000",
    icon: '<img src="assets/images/vcoin.webp" alt="Points">',
    color: 'color-yellow',
    prix: "0,99€",
    amount: 3000
  },
  {
    key: "boutique.cartouche.points10000",
    icon: '<img src="assets/images/vcoin.webp" alt="Points">',
    color: 'color-purple',
    prix: "1,99€",
    amount: 10000
  },
  { key: "boutique.cartouche.jetons12", icon: '<img src="assets/images/jeton.webp" alt="jeton">', color: 'color-blue' },
  { key: "boutique.cartouche.jetons50", icon: '<img src="assets/images/jeton.webp" alt="jeton">', color: 'color-purple' },
  { key: "boutique.cartouche.nopub", icon: '<img src="assets/images/ads.png" alt="No Ads">', color: 'color-yellow' },
  { key: "boutique.cartouche.pub1jeton", icon: '<img src="assets/images/jeton.webp" alt="Pub">', color: 'color-green' },
  { key: "boutique.cartouche.pub300points", icon: '<img src="assets/images/vcoin.webp" alt="Pub">', color: 'color-blue' }
];
const THEME_PRICE = 3000;

// --- Utilitaires cloud (userId etc)
function getUserId() {
  return localStorage.getItem('user_id') || "";
}

// --- VCoins & Jetons 100% Supabase ---
async function getVCoinsSupabase() {
  const { data, error } = await sb.from('users').select('vcoins').eq('id', getUserId()).single();
  if (error) return 0;
  return data.vcoins;
}
async function addVCoinsSupabase(amount) {
  const { error } = await sb.rpc('add_vcoins', { user_id: getUserId(), delta: amount });
  if (error) throw error;
  return await getVCoinsSupabase();
}
async function getJetonsSupabase() {
  const { data, error } = await sb.from('users').select('jetons').eq('id', getUserId()).single();
  if (error) return 0;
  return data.jetons;
}
async function addJetonsSupabase(amount) {
  const { error } = await sb.rpc('add_jetons', { user_id: getUserId(), delta: amount });
  if (error) throw error;
  return await getJetonsSupabase();
}

// --- Themes/cadres POSSEDES : cloud ONLY
async function getUnlockedThemesCloud() {
  const { data, error } = await sb.from('users').select('themes_possedes').eq('id', getUserId()).single();
  if (error) return [];
  return Array.isArray(data?.themes_possedes) ? data.themes_possedes : [];
}
async function setUnlockedThemesCloud(newThemes) {
  await sb.from('users').update({ themes_possedes: newThemes }).eq('id', getUserId());
}

// --- Achat sécurisé (débloque dans Supabase)
async function acheterTheme(themeKey, prix) {
  try {
    const { error } = await sb.rpc('purchase_theme', {
      user_id: getUserId(),
      theme_key: themeKey,
      price: prix
    });
    if (error) {
      alert("Erreur: " + error.message);
      return false;
    }
    alert(t("theme.debloque"));
    await renderThemes();
    return true;
  } catch (e) {
    alert("Erreur: " + (e.message || e));
    return false;
  }
}

// --- Activation (tu peux aussi le stocker cloud si tu veux)
function getCurrentTheme() {
  return localStorage.getItem('themeVBlocks') || "bubble";
}
function setCurrentTheme(theme) {
  localStorage.setItem('themeVBlocks', theme);
}

// --- UI : Cartouches achats (AFFICHAGE PRIX SI PRÉSENT)
function renderAchats() {
  const $achatsList = document.getElementById('achats-list');
  let achatsHtml = SPECIAL_CARTOUCHES.map(c => `
    <div class="special-cartouche ${c.color}">
      <span class="theme-ico">${c.icon}</span>
      <span class="theme-label" data-i18n="${c.key}">${t(c.key)}</span>
      ${c.prix ? `<span class="prix-label">${c.prix}</span>` : ""}
    </div>
  `).join('');
  $achatsList.innerHTML = achatsHtml;
}

// --- UI : Thèmes/cadres cloud only
async function renderThemes() {
  renderAchats();
  const list = document.getElementById('themes-list');
  if (!list) return;
  list.innerHTML = "";
  const unlocked = await getUnlockedThemesCloud();
  const current = getCurrentTheme();
  THEMES.forEach(theme => {
    const isUnlocked = unlocked.includes(theme.key);
    const card = document.createElement('div');
    card.className = 'theme-card' + (current === theme.key ? " selected" : "") + (isUnlocked ? "" : " locked");
    card.innerHTML = `
      <div class="theme-name">${t("theme." + theme.key)}</div>
      <img class="theme-img" src="img/theme_${theme.key}.png" alt="" loading="lazy">
    `;
    if (isUnlocked) {
      card.innerHTML += (current === theme.key)
        ? `<button class="theme-btn selected" disabled>${t("boutique.btn.selectionne")}</button>`
        : `<button class="theme-btn" onclick="setCurrentTheme('${theme.key}');renderThemes();">${t("boutique.btn.utiliser")}</button>`;
    } else {
      card.innerHTML += `<button class="theme-btn locked" onclick="acheterTheme('${theme.key}', ${THEME_PRICE})">${t("boutique.btn.debloquer").replace("{PRICE}", THEME_PRICE)}</button>`;
    }
    list.appendChild(card);
  });
  // Solde à jour
  document.querySelector('.vcoins-solde').textContent = await getVCoinsSupabase();
  document.querySelectorAll('.vcoins-solde')[1].textContent = await getJetonsSupabase();
}

// --- Initialisation
document.addEventListener("DOMContentLoaded", function() {
  renderThemes();
  setupBoutiqueAchats();
});

// --- Branche les achats monétaires et pub reward
function setupBoutiqueAchats() {
  document.querySelectorAll('.special-cartouche').forEach(cartouche => {
    const label = cartouche.querySelector('.theme-label');
    if (!label) return;
    const key = label.dataset.i18n || label.textContent;

    // POINTS 3000 / 10 000 (paiement)
    if (key === 'boutique.cartouche.points3000') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        // Remplace par ta logique réelle de paiement
        if (await lancerPaiement("points3000")) {
          await addVCoinsSupabase(3000);
          alert("+3000 points ajoutés !");
          await renderThemes();
        }
      };
    }
    if (key === 'boutique.cartouche.points10000') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        if (await lancerPaiement("points10000")) {
          await addVCoinsSupabase(10000);
          alert("+10 000 points ajoutés !");
          await renderThemes();
        }
      };
    }
    // AUTRES ACHATS / PUBS / JETONS
    if (key === 'boutique.cartouche.jetons12') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => { /* paiement 12 jetons */ };
    }
    if (key === 'boutique.cartouche.jetons50') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => { /* paiement 50 jetons */ };
    }
    if (key === 'boutique.cartouche.nopub') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => { /* paiement nopub */ };
    }
    if (key === 'boutique.cartouche.pub1jeton') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        await addJetonsSupabase(1);
        alert("+1 jeton ajouté !");
        await renderThemes();
      };
    }
    if (key === 'boutique.cartouche.pub300points') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        await addVCoinsSupabase(300);
        alert("+300 VCoins ajoutés !");
        await renderThemes();
      };
    }
  });
}
