/* ===========================
   achat.js (confirmation + achat générique)
   =========================== */

// Map produits (utilise celle fournie au boot si présente)
const _PRODUCT_IDS = (window.PRODUCT_IDS) || {
  points3000:  'points3000',
  points10000: 'points10000',
  jetons12:    'jetons12',
  jetons50:    'jetons50',
  nopub:       'nopub'
};

// --- Helpers store ------------------------------------------------
function _iapAvailable() {
  return !!(window.store && typeof window.store.get === 'function' && typeof window.store.order === 'function');
}
function _pid(alias) {
  return _PRODUCT_IDS[alias] || alias;
}

// --- Prix localisés (jamais en dur) -------------------------------
function _getLocalizedPrice(alias) {
  // 1) Cache du boot (PRICES_BY_ALIAS)
  if (window.PRICES_BY_ALIAS && window.PRICES_BY_ALIAS[alias]?.price) {
    return window.PRICES_BY_ALIAS[alias].price;
  }
  // 2) Lecture store par alias
  if (_iapAvailable()) {
    let p = store.get(alias);
    if (p && p.price) return p.price;
    // 3) Lecture store par id réel (si enregistré avec l'id)
    p = store.get(_pid(alias));
    if (p && p.price) return p.price;
  }
  return ""; // inconnu → l’UI affichera "…"
}

function _getProductTitle(alias) {
  if (_iapAvailable()) {
    let p = store.get(alias);
    if (!p || !p.title) p = store.get(_pid(alias));
    if (p && p.title) return p.title;
  }
  const labelMap = {
    jetons12:     "12 jetons",
    jetons50:     "50 jetons",
    nopub:        "Suppression des pubs",
    points3000:   "3000 points",
    points10000:  "10 000 points"
  };
  return labelMap[alias] || alias;
}

// --- Confirmation (sans prix codé) --------------------------------
window.lancerPaiement = async function(alias) {
  const priceStr = _getLocalizedPrice(alias);
  const item = _getProductTitle(alias);
  const message = priceStr ? `${item} pour ${priceStr} ?` : `Valider l'achat : ${item} ?`;
  return confirm(message);
};

// --- Wiring PRICES_BY_ALIAS (optionnel, protégé) -------------------
if (_iapAvailable() && !window.__IAP_PRICES_WIRED__) {
  window.__IAP_PRICES_WIRED__ = true;
  window.PRICES_BY_ALIAS = window.PRICES_BY_ALIAS || {};
  try {
    // Remplit/MAJ PRICES_BY_ALIAS dès que le store connaît un produit
    store.when('product').updated((p) => {
      const alias = p.alias || p.id;
      if (p && p.price) {
        window.PRICES_BY_ALIAS[alias] = { price: p.price, title: p.title || alias };
      }
    });
    if (typeof store.ready === 'function') {
      store.ready(() => {
        try { window.refreshDisplayedPrices?.(); } catch(_) {}
      });
    }
  } catch(_) {}
}

// --- Achat central ------------------------------------------------
let __orderBusy = false;

async function __ensureAuthOnce() {
  // Auth centralisée → on passe par le bootstrap si dispo
  if (typeof window.bootstrapAuthAndProfile === 'function') {
    try { await window.bootstrapAuthAndProfile(); } catch(_) {}
  }
}

window.accordeAchat = async function(type) {
  const sb = window.sb; // peut être undefined si la lib n'a pas chargé
  // Cas “mal appelé” pour les rewarded → redirige proprement
  if (type === "pub1jeton") {
    if (typeof window.showRewardBoutique === 'function') {
      await window.showRewardBoutique();
      try { await window.renderThemes?.(); } catch(_) {}
    } else {
      alert("Pub non disponible.");
    }
    return;
  }
  if (type === "pub300points") {
    if (typeof window.showRewardVcoins === 'function') {
      await window.showRewardVcoins();
      try { await window.renderThemes?.(); } catch(_) {}
    } else {
      alert("Pub non disponible.");
    }
    return;
  }

  // Produits payants (IAP)
  const isPaidItem = ['jetons12','jetons50','points3000','points10000','nopub'].includes(type);
  if (!isPaidItem) return;

  const ok = await window.lancerPaiement(type);
  if (!ok) return;

  if (_iapAvailable()) {
    if (__orderBusy) return;
    __orderBusy = true;
    try {
      // Tente d’abord par alias (si register avec alias), sinon par id réel
      try { await store.order(type); }
      catch { await store.order(_pid(type)); }
      // Crédit = à faire dans tes listeners IAP (approved/verified + finish)
    } catch (e) {
      console.warn('[IAP] order failed:', e?.message || e);
      alert("Achat non abouti.");
    } finally {
      __orderBusy = false;
    }
  } else {
    // Fallback web/dev: simulateur (utile en dev sans plugin)
    try {
      await __ensureAuthOnce();
      if (typeof acheterProduitVercel === 'function') {
        await acheterProduitVercel(type);
      } else if (sb && sb.rpc) {
        // Crédit côté Supabase pour une simulation manuelle
        if (type === "points3000")   await sb.rpc('ajouter_vcoins', { montant: 3000 });
        if (type === "points10000")  await sb.rpc('ajouter_vcoins', { montant: 10000 });
        if (type === "jetons12")     await sb.rpc('ajouter_jetons', { montant: 12 });
        if (type === "jetons50")     await sb.rpc('ajouter_jetons', { montant: 50 });
        if (type === "nopub")        await sb.rpc('ajouter_nopub');
      } else {
        alert("Achat indisponible (store et Supabase non disponibles).");
      }
      try { await window.renderThemes?.(); } catch(_) {}
    } catch (e) {
      console.warn('[IAP] fallback web error:', e?.message || e);
      alert("Achat indisponible sans le store natif.");
    }
  }
};
