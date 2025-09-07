/* =========================================================
   achat.js — Cordova Purchase (prix dynamiques + achats)
   - Compatible API legacy (window.store) ET API moderne (window.CdvPurchase.store v13+)
   - Débloque l'UI via window.__IAP_READY__
   - Affiche les prix localisés (pricing.price / price)
   - v13+ : order(offer) avec attente/retry
   ========================================================= */
(function () {
  // --- Produits ---
  const PRODUCTS = [
    { id: 'points3000',  type: 'CONSUMABLE',     credit: { vcoins: 3000  } },
    { id: 'points10000', type: 'CONSUMABLE',     credit: { vcoins: 10000 } },
    { id: 'jetons12',    type: 'CONSUMABLE',     credit: { jetons: 12    } },
    { id: 'jetons50',    type: 'CONSUMABLE',     credit: { jetons: 50    } },
    { id: 'nopub',       type: 'NON_CONSUMABLE', credit: { nopub: true   } },
  ];

  // --- Mémo / état ---
  const PRICES_BY_ID = Object.create(null);
  const PROCESSED_TX = new Set();
  let   STORE_READY  = false;

  // Flag lu par la boutique pour autoriser les clics
  window.__IAP_READY__ = false;

  // Stub immédiat pour éviter l’alerte “initialisation” (sera remplacé quand prêt)
  window.buyProduct = function () {
    alert("Boutique en cours d'initialisation… réessaie dans un instant.");
  };
  window.safeOrder = window.buyProduct;

  // --- Détection API ---
  function getIapApi() {
    if (window.CdvPurchase && window.CdvPurchase.store) return { api:'cdv7', store: window.CdvPurchase.store };
    if (window.store && typeof window.store.register === 'function') return { api:'legacy', store: window.store };
    return { api:'none', store: null };
  }

  // --- Auth Supabase (anonyme si besoin) ---
  let __authEnsured = false;
  async function __ensureAuthOnce() {
    if (__authEnsured) return;
    try {
      if (window.sb) {
        const { data:{ session } } = await sb.auth.getSession();
        if (!session) await sb.auth.signInAnonymously();
      }
    } catch(_) {}
    __authEnsured = true;
  }

  // --- Crédit utilisateur ---
  async function creditUser(credit) {
    await __ensureAuthOnce();
    try {
      if (window.userData) {
        if (credit.vcoins) await window.userData.addVCoins(credit.vcoins);
        if (credit.jetons) await window.userData.addJetons(credit.jetons);
        if (credit.nopub) {
          localStorage.setItem('no_ads','1');
          if (window.setNoAds) window.setNoAds(true);
          if (window.userData.setNoAds) await window.userData.setNoAds(true);
        }
        return true;
      }
      if (window.sb) {
        if (credit.vcoins) await sb.rpc('secure_add_points',{ delta: credit.vcoins });
        if (credit.jetons) await sb.rpc('secure_add_jetons',{ delta: credit.jetons });
        if (credit.nopub) {
          try {
            const { data:{ user } } = await sb.auth.getUser();
            if (user?.id) await sb.from('users').update({ no_ads:true }).eq('id', user.id);
          } catch(_) {}
          localStorage.setItem('no_ads','1');
        }
        return true;
      }
    } catch(_) {}
    return false;
  }

  // --- Peinture des prix dans l’UI ---
  function refreshDisplayedPrices() {
    try {
      document.querySelectorAll('#achats-list .special-cartouche[data-product-id]').forEach(node => {
        const id = node.getAttribute('data-product-id');
        const price = PRICES_BY_ID[id];
        const label = node.querySelector('.prix-label');
        if (label && price) label.textContent = price;
      });
    } catch(_) {}
  }
  window.refreshDisplayedPrices = refreshDisplayedPrices;

  // Attendre une offer (v13+), en repeignant le prix dès qu’on l’a
  async function waitForOffer(S, productId, timeoutMs) {
    const t0 = Date.now(), lim = timeoutMs || 6000;
    while (Date.now() - t0 < lim) {
      try {
        const p = S.products?.byId?.[productId] || (S.get && S.get(productId));
        const price = p?.pricing?.price || p?.price;
        if (price) { PRICES_BY_ID[productId] = price; refreshDisplayedPrices(); }
        const offer = p?.offers?.[0];
        if (offer) return offer;
      } catch(_) {}
      try { S.update ? await S.update() : (S.refresh && await S.refresh()); } catch(_) {}
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  // --- Bootstrap ---
  document.addEventListener('deviceready', function () {
    const { api, store } = getIapApi();
    if (api === 'none') {
      // En web/sideload, on laisse les prix à “—”
      return;
    }

    // =============== Branche legacy ===============
    if (api === 'legacy') {
      const IAP = store;
      const mapType = t => (t === 'NON_CONSUMABLE' ? IAP.NON_CONSUMABLE : IAP.CONSUMABLE);

      // Register
      PRODUCTS.forEach(p => { try { IAP.register({ id:p.id, alias:p.id, type:mapType(p.type) }); } catch(_) {} });

      // Prix
      IAP.when('product').updated(p => {
        try {
          if (p?.id && p.price) { PRICES_BY_ID[p.id] = p.price; refreshDisplayedPrices(); }
        } catch(_) {}
      });

      // Approved
      IAP.when('product').approved(async p => {
        try {
          const txId = p?.transaction && (p.transaction.id || p.transaction.orderId);
          if (txId) {
            if (PROCESSED_TX.has(txId)) { try { p.finish(); } catch(_) {} return; }
            PROCESSED_TX.add(txId);
          }
          const found = PRODUCTS.find(x => x.id === p?.id);
          if (!found) { try { p.finish(); } catch(_) {} return; }
          const ok = await creditUser(found.credit);
          if (ok) {
            if (found.credit.vcoins) alert('✅ VCoins crédités !');
            if (found.credit.jetons) alert('✅ Jetons crédités !');
            if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
          } else {
            alert('Erreur de crédit. Réessayez.');
          }
        } catch(_) {}
        try { p.finish(); } catch(_) {}
      });

      // Owned
      IAP.when('product').owned(p => {
        if (p?.id === 'nopub') {
          try {
            localStorage.setItem('no_ads','1');
            if (window.setNoAds) window.setNoAds(true);
          } catch(_) {}
        }
      });

      // Ready + refresh
      IAP.ready(() => {
        STORE_READY = true;
        window.__IAP_READY__ = true;
        try { window.dispatchEvent(new Event('iap-ready')); } catch(_) {}
        try {
          PRODUCTS.forEach(({id}) => {
            const prod = IAP.get(id);
            if (prod?.price) PRICES_BY_ID[id] = prod.price;
          });
        } catch(_) {}
        refreshDisplayedPrices();
        setTimeout(refreshDisplayedPrices, 1500);
        let n=0, t=setInterval(()=>{ refreshDisplayedPrices(); if(++n>=5) clearInterval(t); }, 1000);
      });

      try { IAP.refresh(); } catch(_) {}
      setTimeout(()=>{ try { IAP.refresh(); } catch(_) {} }, 2500);

      // Achat legacy
      window.buyProduct = function (id) {
        try { IAP.order(id); } catch (e) { alert('Erreur achat: ' + (e?.message || e)); }
      };
      window.safeOrder = window.buyProduct;
      return; // stop ici pour legacy
    }

    // =============== Branche v13+ ===============
    const S = store;
    const mapType = t => (t === 'NON_CONSUMABLE' ? S.ProductType.NON_CONSUMABLE : S.ProductType.CONSUMABLE);

    // initialize : essayer plusieurs signatures (selon versions)
    (function robustInitialize(){
      try {
        if (S.initialize) {
          // 1) objet avec platforms
          if (S.Platform?.GOOGLE_PLAY) { S.initialize({ platforms:[ S.Platform.GOOGLE_PLAY ] }); return; }
          // 2) array de plateformes
          if (S.Platform?.GOOGLE_PLAY) { S.initialize([ S.Platform.GOOGLE_PLAY ]); return; }
          // 3) direct register-like (certaines builds anciennes)
          S.initialize(PRODUCTS.map(p => ({ id:p.id, type:mapType(p.type) })));
        }
      } catch(_) {}
    })();

    // register (tolérant)
    try { S.register && S.register(PRODUCTS.map(p => ({ id:p.id, type:mapType(p.type) }))); } catch(_) {}

    // Prix (selon signaux dispos)
    if (S.when && S.when().productUpdated) {
      S.when().productUpdated(p => {
        try {
          const price = p?.pricing?.price || p?.price;
          if (p?.id && price) { PRICES_BY_ID[p.id] = price; refreshDisplayedPrices(); }
        } catch(_) {}
      });
    } else if (S.updated && S.updated.add) {
      S.updated.add(() => {
        try {
          PRODUCTS.forEach(({id}) => {
            const p = S.products?.byId?.[id];
            const price = p?.pricing?.price || p?.price;
            if (price) PRICES_BY_ID[id] = price;
          });
          refreshDisplayedPrices();
        } catch(_) {}
      });
    }

    // Approved
    if (S.when && S.when().approved) {
      S.when().approved(async (tx) => {
        try {
          const productId = tx?.productId || tx?.product?.id;
          const txId = tx?.transactionId || tx?.orderId || tx?.transaction?.id || tx?.id;
          if (txId) {
            if (PROCESSED_TX.has(txId)) { try { tx.finish && tx.finish(); } catch(_) {} return; }
            PROCESSED_TX.add(txId);
          }
          const found = PRODUCTS.find(x => x.id === productId);
          if (!found) { try { tx.finish && tx.finish(); } catch(_) {} return; }
          const ok = await creditUser(found.credit);
          if (ok) {
            if (found.credit.vcoins) alert('✅ VCoins crédités !');
            if (found.credit.jetons) alert('✅ Jetons crédités !');
            if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
          } else {
            alert('Erreur de crédit. Réessayez.');
          }
        } catch(_) {}
        try { tx.finish && tx.finish(); } catch(_) {}
      });
    } else if (S.approved && S.approved.add) {
      S.approved.add(async (p) => {
        try {
          const txId = p?.transaction?.id || p?.transactionId;
          if (txId) {
            if (PROCESSED_TX.has(txId)) { try { S.finish && S.finish(p); } catch(_) {} return; }
            PROCESSED_TX.add(txId);
          }
          const found = PRODUCTS.find(x => x.id === p?.id);
          if (!found) { try { S.finish && S.finish(p); } catch(_) {} return; }
          const ok = await creditUser(found.credit);
          if (ok) {
            if (found.credit.vcoins) alert('✅ VCoins crédités !');
            if (found.credit.jetons) alert('✅ Jetons crédités !');
            if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
          } else {
            alert('Erreur de crédit. Réessayez.');
          }
          try { S.finish && S.finish(p); } catch(_) {}
        } catch(_) {
          try { S.finish && S.finish(p); } catch(_) {}
        }
      });
    }

    // Ready
    if (S.ready) {
      S.ready(() => {
        STORE_READY = true;
        window.__IAP_READY__ = true;
        try { window.dispatchEvent(new Event('iap-ready')); } catch(_) {}
        try {
          PRODUCTS.forEach(({id}) => {
            const p = S.products?.byId?.[id] || (S.get && S.get(id));
            const price = p?.pricing?.price || p?.price;
            if (price) PRICES_BY_ID[id] = price;
          });
        } catch(_) {}
        refreshDisplayedPrices();
        setTimeout(refreshDisplayedPrices, 1500);
        let n=0, t=setInterval(()=>{ refreshDisplayedPrices(); if(++n>=5) clearInterval(t); }, 1000);
      });
    }

    // Refresh/update catalogue
    try { S.update ? S.update() : (S.refresh && S.refresh()); } catch(_) {}
    setTimeout(()=>{ try { S.update ? S.update() : (S.refresh && S.refresh()); } catch(_) {} }, 2500);

    // Achat v13+ : attendre l’offre
    window.buyProduct = async function (productId) {
      try {
        const offer = await waitForOffer(S, productId, 6000);
        if (!offer) { alert('Offre introuvable pour ce produit.'); return; }
        await S.order(offer);
      } catch (e) {
        alert('Erreur achat: ' + (e?.message || e));
      }
    };
    window.safeOrder = window.buyProduct;
  });

  // Si la page charge avant deviceready : peint au moins “—”
  document.addEventListener('DOMContentLoaded', refreshDisplayedPrices);
})();
