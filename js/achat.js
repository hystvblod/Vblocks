/* ===========================
   achat.js (confirmation + achat générique + crédit Supabase)
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
  if (window.PRICES_BY_ALIAS && window.PRICES_BY_ALIAS[alias]?.price) {
    return window.PRICES_BY_ALIAS[alias].price;
  }
  if (_iapAvailable()) {
    let p = store.get(alias);
    if (p && p.price) return p.price;
    p = store.get(_pid(alias));
    if (p && p.price) return p.price;
  }
  return "";
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
  if (typeof window.bootstrapAuthAndProfile === 'function') {
    try { await window.bootstrapAuthAndProfile(); } catch(_) {}
  }
}

window.accordeAchat = async function(type) {
  const sb = window.sb;

  // Redirections pubs reward (si tu les utilises)
  if (type === "pub1jeton") {
    if (typeof window.showRewardBoutique === 'function') {
      await window.showRewardBoutique();
      try { await window.renderThemes?.(); } catch(_) {}
    } else { alert("Pub non disponible."); }
    return;
  }
  if (type === "pub300points") {
    if (typeof window.showRewardVcoins === 'function') {
      await window.showRewardVcoins();
      try { await window.renderThemes?.(); } catch(_) {}
    } else { alert("Pub non disponible."); }
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
      try { await store.order(type); }
      catch { await store.order(_pid(type)); }
      // Le crédit est fait dans le listener "approved" ci-dessous
    } catch (e) {
      console.warn('[IAP] order failed:', e?.message || e);
      alert("Achat non abouti.");
    } finally {
      __orderBusy = false;
    }
  } else {
    // Fallback web/dev uniquement (sans plugin)
    try {
      await __ensureAuthOnce();
      const userId = sb?.auth?.currentUser?.id;
      if (!userId) throw new Error("Utilisateur non connecté");

      if (type === "points3000")   await sb.rpc('secure_add_points', { p_user_id: userId, p_amount: 3000, p_product: 'points3000' });
      if (type === "points10000")  await sb.rpc('secure_add_points', { p_user_id: userId, p_amount: 10000, p_product: 'points10000' });
      if (type === "jetons12")     await sb.rpc('secure_add_jetons', { p_user_id: userId, p_amount: 12, p_product: 'jetons12' });
      if (type === "jetons50")     await sb.rpc('secure_add_jetons', { p_user_id: userId, p_amount: 50, p_product: 'jetons50' });
      if (type === "nopub")        await sb.from('users').update({ nopub: true }).eq('auth_id', userId);

      try { await window.renderThemes?.(); } catch(_) {}
      alert("Achat simulé (web/dev) ✅");
    } catch (e) {
      console.warn('[IAP] fallback web error:', e?.message || e);
      alert("Achat indisponible sans le store natif.");
    }
  }
};

// === Listener achats approuvés (crédit direct Supabase, pas de backend) ===
if (_iapAvailable()) {
  store.when("product").approved(async (p) => {
    try {
      const sb = window.sb;
      const userId = sb?.auth?.currentUser?.id;
      if (!userId) {
        console.warn("[IAP] Aucun utilisateur connecté");
        return p.finish();
      }

      console.log("[IAP] Approved:", p.id);

      if (p.id === "points3000") {
        await sb.rpc("secure_add_points", { p_user_id: userId, p_amount: 3000, p_product: "points3000" });
      }
      else if (p.id === "points10000") {
        await sb.rpc("secure_add_points", { p_user_id: userId, p_amount: 10000, p_product: "points10000" });
      }
      else if (p.id === "jetons12") {
        await sb.rpc("secure_add_jetons", { p_user_id: userId, p_amount: 12, p_product: "jetons12" });
      }
      else if (p.id === "jetons50") {
        await sb.rpc("secure_add_jetons", { p_user_id: userId, p_amount: 50, p_product: "jetons50" });
      }
      else if (p.id === "nopub") {
        await sb.from("users").update({ nopub: true }).eq("auth_id", userId);
      }

      alert("✅ Achat validé !");
      try { await window.renderThemes?.(); } catch(_) {}

      p.finish(); // 🔴 NE PAS ENLEVER : finalise la transaction côté Play/App Store
    } catch (err) {
      console.error("[IAP ERROR]", err);
      p.finish(); // 🔴 Même en cas d'erreur, on finit pour ne pas re-créditer en boucle
    }
  });

  store.refresh();
}
