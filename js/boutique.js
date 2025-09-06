/* ===========================
   boutique.js (IAP + UI boutique) — PROD natif + RPC
   =========================== */

/* ---------- Config ---------- */
const ENABLE_WEB_FALLBACK = false; // doit rester false en prod

/* ---------- Helper i18n ---------- */
function t(key) {
  if (window.i18n && window.i18n[key]) return window.i18n[key];
  if (typeof window.i18nGet === 'function') return window.i18nGet(key);
  return key;
}

/* ---------- Liste des thèmes ---------- */
const THEMES = [
  { key: "bubble" }, { key: "nature" }, { key: "nuit" }, { key: "luxury" },
  { key: "space" }, { key: "angelique" }, { key: "cyber" }, { key: "vitraux" },
  { key: "pixel" }, { key: "halloween" },
  { key: "arabic", name: "Arabic" },
  { key: "grece",  name: "Grèce antique" },
  { key: "japon",  name: "Japon" }
];

const THEME_PRICE = 5000;

/* ---------- Cartouches UI (achats) ---------- */
const SPECIAL_CARTOUCHES = [
  { key: "boutique.cartouche.points3000",  icon: '<img src="assets/images/vcoin.webp" alt="Points">', color: 'color-yellow', prix: "", amount: 3000 },
  { key: "boutique.cartouche.points10000", icon: '<img src="assets/images/vcoin.webp" alt="Points">', color: 'color-purple', prix: "", amount: 10000 },
  { key: "boutique.cartouche.jetons12",    icon: '<img src="assets/images/jeton.webp" alt="jeton">',  color: 'color-blue',   prix: "", amount: 12 },
  { key: "boutique.cartouche.jetons50",    icon: '<img src="assets/images/jeton.webp" alt="jeton">',  color: 'color-purple', prix: "", amount: 50 },
  { key: "boutique.cartouche.nopub",       icon: '<img src="assets/images/ads.png" alt="No Ads">',    color: 'color-yellow', prix: "" },
  { key: "boutique.cartouche.pub1jeton",   icon: '<img src="assets/images/jeton.webp" alt="Pub">',    color: 'color-green' },
  { key: "boutique.cartouche.pub300points",icon: '<img src="assets/images/vcoin.webp" alt="Pub">',    color: 'color-blue' }
];

/* ---------- IDs produits (Play / iOS) ---------- */
const PRODUCT_IDS = window.PRODUCT_IDS = {
  points3000:  'points3000',
  points10000: 'points10000',
  jetons12:    'jetons12',
  jetons50:    'jetons50',
  nopub:       'nopub'
};

/* ---------- Mémo prix localisés ---------- */
// PRICES_BY_ALIAS = { alias: { price, currency, micros } }
const PRICES_BY_ALIAS = window.PRICES_BY_ALIAS = {};
const PRICES_BY_ID = Object.create(null); // { productId: "€0,99" }

/* ---------- Utilitaires IAP ---------- */
function _iapAvailable() {
  return !!(window.store && typeof window.store.register === 'function');
}
function _mapType(alias) {
  if (!window.store) return null;
  return alias === 'nopub' ? window.store.NON_CONSUMABLE : window.store.CONSUMABLE;
}

window.__IAP_READY__ = false;

function isNativeRuntime() {
  try {
    if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
      return window.Capacitor.getPlatform() !== 'web';
    }
  } catch(_) {}
  if (window.cordova && typeof window.cordova.platformId === 'string') return true;
  return false;
}

async function waitIapReady(maxMs = 15000) {
  const step = 150;
  let waited = 0;
  while (!window.__IAP_READY__ && waited < maxMs) {
    await new Promise(r => setTimeout(r, step));
    waited += step;
  }
  return !!window.__IAP_READY__;
}

async function safeOrder(productId) {
  const ok = await waitIapReady(15000);
  if (!ok || !window.store || typeof window.store.order !== 'function') {
    if (!isNativeRuntime() && !ENABLE_WEB_FALLBACK) {
      alert("Boutique indisponible dans ce contexte. Lance l’application installée.");
      return;
    }
    alert("Boutique en cours d'initialisation… réessaie dans un instant.");
    return;
  }
  try { window.store.order(productId); }
  catch(e){ alert("Erreur achat: " + (e?.message || e)); }
}

/* ===========================
   SUPABASE — RPC sécurisées
   =========================== */
let __authEnsured = false;
async function __ensureAuthOnce() {
  if (__authEnsured) return;
  try {
    if (!window.sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) await sb.auth.signInAnonymously();
    __authEnsured = true;
  } catch (e) {
    console.warn('[boutique] ensureAuth:', e?.message || e);
  }
}

async function __getBalances() {
  await __ensureAuthOnce();
  const { data, error } = await sb.rpc('get_balances');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {};
}

// VCoins & Jetons
async function getVCoinsSupabase() {
  const b = await __getBalances();
  return b?.vcoins ?? 0;
}
async function addVCoinsSupabase(amount) {
  await __ensureAuthOnce();
  const delta = Number(amount) || 0;
  const { error } = await sb.rpc('ajouter_vcoins', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.vcoins ?? 0;
}
async function getJetonsSupabase() {
  const b = await __getBalances();
  return b?.jetons ?? 0;
}
async function addJetonsSupabase(amount) {
  await __ensureAuthOnce();
  const delta = Number(amount) || 0;
  const { error } = await sb.rpc('ajouter_jetons', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.jetons ?? 0;
}

// Thèmes
async function getUnlockedThemesCloud() {
  const b = await __getBalances();
  return Array.isArray(b?.themes_possedes) ? b.themes_possedes : [];
}
async function setUnlockedThemesCloud(newThemes) {
  await __ensureAuthOnce();
  const { error } = await sb.rpc('set_themes_secure', { themes: newThemes });
  if (error) throw error;
}

// No Ads
async function setNoAds() {
  await __ensureAuthOnce();
  try { await sb.rpc('ajouter_nopub'); } catch(e) {}
  localStorage.setItem('no_ads', '1');
  if (typeof window.setNoAds === 'function') window.setNoAds(true);
  if (window.userData?.setNoAds) await window.userData.setNoAds(true);
}

/* ===========================
   Achat de thème via VCoins
   =========================== */
async function acheterTheme(themeKey, prix) {
  try {
    if (window.bootstrapAuthAndProfile) await window.bootstrapAuthAndProfile();

    const { error } = await sb.rpc('purchase_theme', {
      theme_key: String(themeKey),
      price: Number(prix) || 0
    });

    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("not enough vcoins")) {
        alert(t("boutique.alert.pasassez") || "Pas assez de VCoins.");
        return false;
      }
      alert("Erreur: " + error.message);
      return false;
    }

    await renderThemes();
    alert(t("theme.debloque") || "Thème débloqué !");
    return true;
  } catch (e) {
    alert("Erreur: " + (e.message || e));
    return false;
  }
}

/* ===========================
   UI — thèmes & cartouches
   =========================== */
function getCurrentTheme() { return localStorage.getItem('themeVBlocks') || "neon"; }
function setCurrentTheme(theme) { localStorage.setItem('themeVBlocks', theme); }

function renderAchats() {
  const $achatsList = document.getElementById('achats-list');
  if (!$achatsList) return;
  const achatsHtml = SPECIAL_CARTOUCHES.map(c => `
    <div class="special-cartouche ${c.color}" ${(() => {
      const alias = c.key.split('.').pop();
      const pid = PRODUCT_IDS[alias];
      return pid ? `data-product-id="${pid}"` : '';
    })()}>
      <span class="theme-ico">${c.icon}</span>
      <span class="theme-label" data-i18n="${c.key}">${t(c.key)}</span>
      <span class="prix-label">${c.prix || (PRODUCT_IDS[c.key?.split('.').pop()] ? "—" : "")}</span>
    </div>
  `).join('');
  $achatsList.innerHTML = achatsHtml;

  setupBoutiqueAchats(); // rebind après remplacement DOM

  // 👉 déclenche le remplissage des prix par achat.js si dispo
  if (typeof window.refreshDisplayedPrices === 'function') {
    window.refreshDisplayedPrices();
  }
}

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
        ? `<button class="theme-btn selected" disabled>${t("boutique.btn.selectionne") || "Sélectionné"}</button>`
        : `<button class="theme-btn" onclick="setCurrentTheme('${theme.key}');renderThemes();">${t("boutique.btn.utiliser") || "Utiliser"}</button>`;
    } else {
      card.innerHTML += `<button class="theme-btn locked" onclick="acheterTheme('${theme.key}', ${THEME_PRICE})">${(t("boutique.btn.debloquer") || "Débloquer").replace("{PRICE}", THEME_PRICE)}</button>`;
    }
    list.appendChild(card);
  });

  const soldeEls = document.querySelectorAll('.vcoins-solde');
  try {
    if (soldeEls[0]) soldeEls[0].textContent = await getVCoinsSupabase();
    if (soldeEls[1]) soldeEls[1].textContent = await getJetonsSupabase();
  } catch(_) {}

  // tenter à nouveau le remplissage des prix (si IAP a répondu entre-temps)
  if (typeof window.refreshDisplayedPrices === 'function') {
    window.refreshDisplayedPrices();
    setTimeout(() => { try { window.refreshDisplayedPrices(); } catch(_){} }, 1500);
  }
}

/* ===========================
   PUB récompensée — via pub.js
   =========================== */
async function showRewardBoutique() {
  try {
    if (typeof window.showRewardBoutique !== 'function') {
      alert("Publicité récompensée indisponible.");
      return;
    }
    await window.showRewardBoutique(); // SSV → crédit côté serveur
    await renderThemes();
  } catch (e) {
    alert("Erreur: " + (e?.message || e));
  }
}
async function showRewardVcoins() {
  try {
    if (typeof window.showRewardVcoins !== 'function') {
      alert("Publicité récompensée indisponible.");
      return;
    }
    await window.showRewardVcoins(); // SSV → crédit côté serveur
    await renderThemes();
  } catch (e) {
    alert("Erreur: " + (e?.message || e));
  }
}

/* ===========================
   Achats Store — binding UI
   =========================== */
function setupBoutiqueAchats() {
  document.querySelectorAll('.special-cartouche').forEach(cartouche => {
    const label = cartouche.querySelector('.theme-label');
    if (!label) return;
    const key = label.dataset.i18n || label.textContent;

    // Achats via Store
    const alias = key?.split('.').pop();
    const pid = PRODUCT_IDS[alias];
    if (pid) {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        if (typeof window.lancerPaiement === 'function') {
          const ok = await window.lancerPaiement(alias);
          if (!ok) return;
        }
        await safeOrder(pid);
      };
      return;
    }

    // PUB reward via pub.js
    if (key === 'boutique.cartouche.pub1jeton') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = showRewardBoutique;
    }
    if (key === 'boutique.cartouche.pub300points') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = showRewardVcoins;
    }
  });
}

/* ===========================
   IAP Cordova Purchase
   =========================== */
const PROCESSED_TX = new Set();

document.addEventListener('deviceready', function () {
  if (!_iapAvailable()) { console.warn("[IAP] Plugin purchase non dispo"); return; }
  const IAP = window.store;

  try { IAP.verbosity = Math.max(IAP.verbosity || 0, 4); } catch(_) {}

  // Register
  Object.entries(PRODUCT_IDS).forEach(([alias, id]) => {
    IAP.register({ id, alias, type: _mapType(alias) });
  });

  // Prix localisés → mémos + UI
  IAP.when('product').updated(function (p) {
    if (!p || !p.id) return;
    PRICES_BY_ID[p.id] = p.price || PRICES_BY_ID[p.id] || '';
    const alias = Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === p.id);
    if (alias) {
      PRICES_BY_ALIAS[alias] = {
        price: p.price || '',
        currency: p.currency || '',
        micros: p.priceMicros || 0
      };
    }
    // pousser le prix à l’écran depuis achat.js si dispo
    if (typeof window.refreshDisplayedPrices === 'function') {
      window.refreshDisplayedPrices();
    }
  });

  // Achat approuvé → crédits SERVEUR (RPC)
  IAP.when('product').approved(async function (p) {
    try {
      const txId = p?.transaction?.id || p?.transaction?.orderId;
      if (txId) {
        if (PROCESSED_TX.has(txId)) { p.finish(); return; }
        PROCESSED_TX.add(txId);
      }
      const alias = Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === p.id);

      // Crédit côté serveur selon le produit
      if (alias === 'points3000')       await addVCoinsSupabase(3000);
      else if (alias === 'points10000') await addVCoinsSupabase(10000);
      else if (alias === 'jetons12')    await addJetonsSupabase(12);
      else if (alias === 'jetons50')    await addJetonsSupabase(50);
      else if (alias === 'nopub')       await setNoAds();

      p.finish();
      await renderThemes();
      alert("Achat réussi !");
    } catch (e) {
      console.warn("[IAP] post-achat erreur:", e);
      try { p.finish(); } catch (_) {}
      alert("Erreur post-achat.");
    }
  });

  // Possédé / restauré
  IAP.when('product').owned(function (p) {
    const alias = Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === p?.id);
    if (alias === 'nopub') setNoAds();
  });

  IAP.error(function (err) {
    console.warn('[IAP] error:', err?.message || err);
  });

  IAP.ready(function () {
    window.__IAP_READY__ = true;

    // snapshot initial (mémo prix)
    IAP.products.forEach(prod => {
      const alias = Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === prod.id);
      if (alias) {
        PRICES_BY_ALIAS[alias] = {
          price: prod.price || "",
          currency: prod.currency || "",
          micros: prod.priceMicros || 0
        };
      }
    });

    // Peindre les prix init + UI
    SPECIAL_CARTOUCHES.forEach(c => {
      const alias = c.key?.split('.').pop();
      const pid = PRODUCT_IDS[alias];
      if (!pid) return;
      const p = IAP.get(pid);
      if (p && p.price) c.prix = p.price;
    });
    renderAchats();
    setupBoutiqueAchats();

    // pousser les prix dans l’UI depuis achat.js
    if (typeof window.refreshDisplayedPrices === 'function') {
      window.refreshDisplayedPrices();
      setTimeout(() => { try { window.refreshDisplayedPrices(); } catch(_){} }, 1500);
    }
  });

  try { IAP.refresh(); } catch (e) { console.warn('[IAP] refresh:', e?.message || e); }
  setTimeout(() => { try { IAP.refresh(); } catch(_){} }, 3000);
});

/* ===========================
   Bootstrap UI
   =========================== */
document.addEventListener("DOMContentLoaded", function() {
  renderThemes();

  // Au cas où achat.js ait déjà des prix en cache
  if (typeof window.refreshDisplayedPrices === 'function') {
    window.refreshDisplayedPrices();
    setTimeout(() => { try { window.refreshDisplayedPrices(); } catch(_){} }, 1500);
  }
});
