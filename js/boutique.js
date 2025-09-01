/* ===========================
   boutique.js (IAP + UI boutique) — version sécurisée RPC
   =========================== */

// --- Helper i18n universel
function t(key) {
  if (window.i18n && window.i18n[key]) return window.i18n[key];
  return key;
}

// --- Liste des thèmes/cadres possibles
const THEMES = [
  { key: "bubble" }, { key: "nature" }, { key: "nuit" }, { key: "luxury" },
  { key: "space" }, { key: "angelique" }, { key: "cyber" }, { key: "vitraux" },
  { key: "pixel" }, { key: "halloween" },
  { key: "arabic", name: "Arabic" },
  { key: "grece",  name: "Grèce antique" },
  { key: "japon",  name: "Japon" }
];

// --- Cartouches d’achats spéciaux
const SPECIAL_CARTOUCHES = [
  { key: "boutique.cartouche.points3000",  icon: '<img src="assets/images/vcoin.webp" alt="Points">', color: 'color-yellow', prix: "", amount: 3000 },
  { key: "boutique.cartouche.points10000", icon: '<img src="assets/images/vcoin.webp" alt="Points">', color: 'color-purple', prix: "", amount: 10000 },
  { key: "boutique.cartouche.jetons12",    icon: '<img src="assets/images/jeton.webp" alt="jeton">',  color: 'color-blue',   prix: "", amount: 12 },
  { key: "boutique.cartouche.jetons50",    icon: '<img src="assets/images/jeton.webp" alt="jeton">',  color: 'color-purple', prix: "", amount: 50 },
  { key: "boutique.cartouche.nopub",       icon: '<img src="assets/images/ads.png" alt="No Ads">',    color: 'color-yellow', prix: "" },
  { key: "boutique.cartouche.pub1jeton",   icon: '<img src="assets/images/jeton.webp" alt="Pub">',    color: 'color-green' },
  { key: "boutique.cartouche.pub300points",icon: '<img src="assets/images/vcoin.webp" alt="Pub">',    color: 'color-blue' }
];

const THEME_PRICE = 5000;

// --- IDs des produits (Google Play / iOS) — UNIFIÉS
// (disponible globalement → window.PRODUCT_IDS)
const PRODUCT_IDS = window.PRODUCT_IDS = window.PRODUCT_IDS || {
  points3000:  'points3000',
  points10000: 'points10000',
  jetons12:    'jetons12',
  jetons50:    'jetons50',
  nopub:       'nopub'
};

// --- Mémo des prix localisés (rempli par IAP.ready/product.updated)
const PRICES_BY_ALIAS = window.PRICES_BY_ALIAS = window.PRICES_BY_ALIAS || {};
// { alias: { price: "€0,99", currency: "EUR", micros: 990000 } }

// --- Utilitaires
function getUserId() {
  return localStorage.getItem('user_id') || "";
}

async function ensureAuthSafe() {
  try {
    const s = await sb.auth.getSession();
    if (!s?.data?.session) await sb.auth.signInAnonymously();
  } catch (_) {}
}

/* ===========================
   SUPABASE — Accès SÉCURISÉ (RPC)
   =========================== */

async function __getBalances() {
  await ensureAuthSafe();
  const { data, error } = await sb.rpc('get_balances');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {};
}

// --- VCoins & Jetons (100% RPC sécurisées)
async function getVCoinsSupabase() {
  const b = await __getBalances();
  return b?.vcoins ?? 0;
}
async function addVCoinsSupabase(amount) {
  await ensureAuthSafe();
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
  await ensureAuthSafe();
  const delta = Number(amount) || 0;
  const { error } = await sb.rpc('ajouter_jetons', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.jetons ?? 0;
}

// --- Themes/cadres POSSEDES (lecture via RPC, setter sécurisé optionnel)
async function getUnlockedThemesCloud() {
  const b = await __getBalances();
  return Array.isArray(b?.themes_possedes) ? b.themes_possedes : [];
}
async function setUnlockedThemesCloud(newThemes) {
  await ensureAuthSafe();
  const { error } = await sb.rpc('set_themes_secure', { themes: newThemes });
  if (error) throw error;
}

/* ===========================
   POPUP (ouverture/fermeture accessibles)
   =========================== */

function openThemeModal() {
  const modal = document.getElementById("themeModalBackdrop");
  if (!modal) return;
  modal.style.display = "flex";
  modal.removeAttribute("aria-hidden");
  modal.removeAttribute("inert");
  const closeBtn = document.getElementById("themeModalClose");
  if (closeBtn) closeBtn.focus();
}

function closeThemeModal() {
  const modal = document.getElementById("themeModalBackdrop");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.setAttribute("inert", "");
  modal.style.display = "none";
  const opener = document.getElementById("btnThemes") || document.querySelector("[data-open='themeModal']");
  if (opener) opener.focus();
  if (document.activeElement) document.activeElement.blur();
}

/* ===========================
   Achat sécurisé (Supabase RPC)
   =========================== */

async function acheterTheme(themeKey, prix) {
  try {
    if (window.bootstrapAuthAndProfile) await window.bootstrapAuthAndProfile();

    const { data, error } = await sb.rpc('purchase_theme', {
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
    closeThemeModal();
    alert(t("theme.debloque") || "Thème débloqué !");
    return true;
  } catch (e) {
    alert("Erreur: " + (e.message || e));
    return false;
  }
}

/* ===========================
   UI
   =========================== */

// --- Activation (localStorage)
function getCurrentTheme() { return localStorage.getItem('themeVBlocks') || "neon"; }
function setCurrentTheme(theme) { localStorage.setItem('themeVBlocks', theme); }

// --- Branche Achats + Pub
function setupBoutiqueAchats() {
  document.querySelectorAll('.special-cartouche').forEach(cartouche => {
    const label = cartouche.querySelector('.theme-label');
    if (!label) return;
    const key = label.dataset.i18n || label.textContent;

    // Achats via Store (alias = dernière partie de la clé i18n)
    const alias = key?.split('.').pop();
    const pid = PRODUCT_IDS[alias];

    if (pid) {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        const IAP = (window.store && typeof window.store.order === 'function') ? window.store : null;
        if (IAP) {
          const ok = await (window.lancerPaiement ? window.lancerPaiement(alias) : Promise.resolve(true));
          if (ok) IAP.order(pid);
        } else {
          alert("Achat via Store indisponible ici. Ouvre l’app installée depuis le Store.");
          // // Pour autoriser l’achat côté web, décommente :
          // await acheterProduitVercel(alias);
          // await renderThemes(); setupPubCartouches?.(); setupBoutiqueAchats?.();
        }
      };
    }

    // PUB Reward
    if (key === 'boutique.cartouche.pub1jeton') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = () => (typeof showRewardBoutique === 'function' ? showRewardBoutique() : alert("Pub non disponible."));
    }
    if (key === 'boutique.cartouche.pub300points') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = () => (typeof showRewardVcoins === 'function' ? showRewardVcoins() : alert("Pub non disponible."));
    }
  });
}

// --- UI Achats (⚠️ rebind après chaque render)
function renderAchats() {
  const $achatsList = document.getElementById('achats-list');
  if (!$achatsList) return;
  const achatsHtml = SPECIAL_CARTOUCHES.map(c => `
    <div class="special-cartouche ${c.color}">
      <span class="theme-ico">${c.icon}</span>
      <span class="theme-label" data-i18n="${c.key}">${t(c.key)}</span>
      <span class="prix-label">${c.prix || "…"}</span>
    </div>
  `).join('');
  $achatsList.innerHTML = achatsHtml;

  setupBoutiqueAchats();
}

// --- UI Themes
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

  const soldeEls = document.querySelectorAll('.vcoins-solde');
  if (soldeEls[0]) soldeEls[0].textContent = await getVCoinsSupabase();
  if (soldeEls[1]) soldeEls[1].textContent = await getJetonsSupabase();
}

// --- Init DOM
document.addEventListener("DOMContentLoaded", function() {
  renderThemes();
});

// --- Store init Cordova Purchase
document.addEventListener('deviceready', function() {
  const IAP = (window.store && typeof window.store.register === 'function') ? window.store : null;
  if (!IAP) {
    console.warn("[IAP] Plugin purchase non dispo");
    return;
  }

  // Register (nopub = NON_CONSUMABLE)
  Object.entries(PRODUCT_IDS).forEach(([alias, id]) => {
    const type = (alias === 'nopub') ? IAP.NON_CONSUMABLE : IAP.CONSUMABLE;
    IAP.register({ id, alias, type });
  });

  // Alimente PRICES_BY_ALIAS en continu
  try {
    IAP.when('product').updated((p) => {
      const alias = p.alias || Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === p.id) || p.id;
      if (p && p.price) {
        PRICES_BY_ALIAS[alias] = {
          price:    p.price || "",
          currency: p.currency || "",
          micros:   p.priceMicros || 0
        };
      }
      // Mets à jour l’affichage des prix si la boutique est ouverte
      try {
        SPECIAL_CARTOUCHES.forEach(c => {
          const a = c.key?.split('.').pop();
          if (a && PRICES_BY_ALIAS[a]?.price) c.prix = PRICES_BY_ALIAS[a].price;
        });
        renderAchats();
      } catch (_) {}
    });
  } catch (_) {}

  // Handlers IAP (validation & crédit)
  Object.entries(PRODUCT_IDS).forEach(([alias, id]) => {
    IAP.when(id).approved(async (p) => {
      try {
        if (typeof acheterProduitVercel === 'function') {
          await acheterProduitVercel(alias);
        } else {
          // Fallback crédit direct Supabase (à utiliser seulement si pas de backend de validation)
          if (alias === 'points3000')   await sb.rpc('ajouter_vcoins', { montant: 3000 });
          if (alias === 'points10000')  await sb.rpc('ajouter_vcoins', { montant: 10000 });
          if (alias === 'jetons12')     await sb.rpc('ajouter_jetons', { montant: 12 });
          if (alias === 'jetons50')     await sb.rpc('ajouter_jetons', { montant: 50 });
          if (alias === 'nopub')        await sb.rpc('ajouter_nopub');
        }

        p.finish();
        await renderThemes?.();
        alert("Achat réussi !");
      } catch (e) {
        console.warn("[IAP] post-achat erreur:", e);
        p.finish();
        alert("Erreur post-achat.");
      }
    });
  });

  IAP.ready(function() {
    // Première passe: mémorise les prix + alimente les cartouches
    IAP.products.forEach(prod => {
      const foundAlias = Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === prod.id) || prod.alias;
      if (foundAlias) {
        PRICES_BY_ALIAS[foundAlias] = {
          price:    prod.price || "",
          currency: prod.currency || "",
          micros:   prod.priceMicros || 0
        };
        // MAJ cartouche affichée
        const c = SPECIAL_CARTOUCHES.find(x => x.key?.endsWith(foundAlias));
        if (c) c.prix = prod.price || c.prix || "…";
      }
    });

    renderAchats();        // met à jour le DOM avec les prix localisés
    setupBoutiqueAchats(); // rebind sécurité
  });

  IAP.error(e => console.warn('[IAP] error:', e));
  IAP.refresh();
});
