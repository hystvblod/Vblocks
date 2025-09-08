/* =========================================================
   achat.js — Cordova Purchase v13 (Google Play) + legacy
   - Order: register → initialize → update
   - get(id, PL.GOOGLE_PLAY) en v13
   - Achat via product.getOffer().order()
   - Prix localisés + crédit VCoins/Jetons/NoAds
   ========================================================= */
(function () {
  // --- Produits (IDs = Play Console) ---
  const PRODUCTS = [
    { id: 'points3000',  type: 'CONSUMABLE',     credit: { vcoins: 3000  } },
    { id: 'points10000', type: 'CONSUMABLE',     credit: { vcoins: 10000 } },
    { id: 'jetons12',    type: 'CONSUMABLE',     credit: { jetons: 12    } },
    { id: 'jetons50',    type: 'CONSUMABLE',     credit: { jetons: 50    } },
    { id: 'nopub',       type: 'NON_CONSUMABLE', credit: { nopub: true   } },
  ];

  // --- État / mémo ---
  const PRICES_BY_ID = Object.create(null);
  const PROCESSED_TX = new Set();
  let   STORE_READY  = false;

  // Flag lu par la boutique pour débloquer les clics
  window.__IAP_READY__ = false;

  // Stub avant init
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

  // --- Auth Supabase (anonyme au besoin) ---
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

  // --- Affichage des prix dans l’UI ---
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

  // --- Helpers v13 : récupération produit/offre ---
  function getProduct(S, id, PL) {
    try {
      if (!S || !id) return null;
      if (S.get) {
        // get(id, platform?) en v13+
        return (S.get.length >= 2) ? S.get(id, PL && PL.GOOGLE_PLAY) : S.get(id);
      }
      return (S.products && S.products.byId && S.products.byId[id]) || null;
    } catch(_) { return null; }
  }

  async function waitForProduct(S, id, PL, timeoutMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const p = getProduct(S, id, PL);
      if (p) {
        const price = p?.pricing?.price || p?.price;
        if (price) { PRICES_BY_ID[id] = price; refreshDisplayedPrices(); }
        return p;
      }
      try { S.update ? await S.update() : (S.refresh && await S.refresh()); } catch(_) {}
      await new Promise(r => setTimeout(r, 350));
    }
    return null;
  }

  async function waitForOffer(S, product, timeoutMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const offer = product?.getOffer && product.getOffer();
        if (offer) return offer;
      } catch(_) {}
      try { S.update ? await S.update() : (S.refresh && await S.refresh()); } catch(_) {}
      await new Promise(r => setTimeout(r, 350));
    }
    return null;
  }

  // --- DIAG rapide (à lancer en console) ---
  window.__iapDiag = async function() {
    const { api, store:S } = getIapApi();
    const out = { api, cdvPresent: !!window.CdvPurchase, storePresent: !!S, version: S && S.version, ready: !!(S && S.isReady) };
    try {
      const PL = S && (S.Platform || (window.CdvPurchase && CdvPurchase.Platform));
      const details = {};
      for (const {id} of PRODUCTS) {
        const p = getProduct(S, id, PL);
        details[id] = {
          found: !!p,
          price: p?.pricing?.price || p?.price || null,
          offer: !!(p && p.getOffer && p.getOffer()),
          owned: !!p?.owned
        };
      }
      out.details = details;
    } catch(_) {}
    return out;
  };

  // --- Bootstrap ---
  document.addEventListener('deviceready', function () {
    const { api, store } = getIapApi();
    if (api === 'none') return; // Web/sideload : pas de store

    // =================== Branche legacy (v<13) ===================
    if (api === 'legacy') {
      const IAP = store;
      const mapType = t => (t === 'NON_CONSUMABLE' ? IAP.NON_CONSUMABLE : IAP.CONSUMABLE);

      // Register
      PRODUCTS.forEach(p => { try { IAP.register({ id:p.id, alias:p.id, type:mapType(p.type) }); } catch(_) {} });

      // Prix
      IAP.when('product').updated(p => {
        try {
          if (p?.id && p.price) { PRICES_BY_ID[p.id] = p.price; refreshDisplayedPrices(); }
          if (p?.owned && p.id === 'nopub') {
            localStorage.setItem('no_ads','1');
            if (window.setNoAds) window.setNoAds(true);
          }
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
          localStorage.setItem('no_ads','1');
          if (window.setNoAds) window.setNoAds(true);
        }
      });

      // Ready
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
      setTimeout(()=>{ try { IAP.refresh(); } catch(_) {} }, 2000);

      // Achat legacy
      window.buyProduct = function (id) {
        try { IAP.order(id); } catch (e) { alert('Erreur achat: ' + (e?.message || e)); }
      };
      window.safeOrder = window.buyProduct;
      return;
    }

    // =================== Branche v13 (CdvPurchase) ===================
    const S  = store;
    const PT = S.ProductType || (window.CdvPurchase && CdvPurchase.ProductType);
    const PL = S.Platform    || (window.CdvPurchase && CdvPurchase.Platform);
    const mapType = t => (t === 'NON_CONSUMABLE' ? PT.NON_CONSUMABLE : PT.CONSUMABLE);

    try { if (window.CdvPurchase?.log) CdvPurchase.log.level = CdvPurchase.LogLevel.INFO; } catch(_) {}

    // 1) REGISTER d'abord (avec plateforme)
    try {
      const regs = PRODUCTS.map(p => ({ id:p.id, type:mapType(p.type), platform: PL.GOOGLE_PLAY }));
      S.register && S.register(regs);
    } catch(_) {}

    // 2) INITIALIZE ensuite
    try {
      if (S.initialize) S.initialize({ platforms: [ PL.GOOGLE_PLAY ] });
    } catch(_) {}

    // 3) UPDATE le catalogue
    try { S.update ? S.update() : (S.refresh && S.refresh()); } catch(_) {}
    try { setTimeout(()=>{ S.update && S.update(); }, 1500); } catch(_) {}

    // Prix / mises à jour de produits
    if (S.when && S.when().productUpdated) {
      S.when().productUpdated(p => {
        try {
          const price = p?.pricing?.price || p?.price;
          if (p?.id && price) { PRICES_BY_ID[p.id] = price; refreshDisplayedPrices(); }
          if (p?.owned && p.id === 'nopub') {
            localStorage.setItem('no_ads','1');
            if (window.setNoAds) window.setNoAds(true);
          }
        } catch(_) {}
      });
    } else if (S.updated && S.updated.add) {
      S.updated.add(() => {
        try {
          PRODUCTS.forEach(({id}) => {
            const p = getProduct(S, id, PL);
            const price = p?.pricing?.price || p?.price;
            if (price) PRICES_BY_ID[id] = price;
            if (p?.owned && id === 'nopub') {
              localStorage.setItem('no_ads','1');
              if (window.setNoAds) window.setNoAds(true);
            }
          });
          refreshDisplayedPrices();
        } catch(_) {}
      });
    }

    // Approved (v13)
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
    }

    // Ready
    if (S.ready) {
      S.ready(() => {
        STORE_READY = true;
        window.__IAP_READY__ = true;
        try { window.dispatchEvent(new Event('iap-ready')); } catch(_) {}
        try {
          PRODUCTS.forEach(({id}) => {
            const p = getProduct(S, id, PL);
            const price = p?.pricing?.price || p?.price;
            if (price) PRICES_BY_ID[id] = price;
            if (p?.owned && id === 'nopub') {
              localStorage.setItem('no_ads','1');
              if (window.setNoAds) window.setNoAds(true);
            }
          });
        } catch(_) {}
        refreshDisplayedPrices();
        setTimeout(refreshDisplayedPrices, 1500);
        let n=0, t=setInterval(()=>{ refreshDisplayedPrices(); if(++n>=5) clearInterval(t); }, 1000);
      });
    }

    // Achat v13 : via product.getOffer().order()
    window.buyProduct = async function (productId) {
      try {
        if (!STORE_READY) { try { S.update && await S.update(); } catch(_) {} }

        const product = await waitForProduct(S, productId, PL, 12000);
        if (!product) { alert('Produit introuvable sur ce device.'); return; }

        const price = product?.pricing?.price || product?.price;
        if (price) { PRICES_BY_ID[productId] = price; refreshDisplayedPrices(); }

        let offer = (product.getOffer && product.getOffer()) || null;
        if (!offer) offer = await waitForOffer(S, product, 12000);

        if (!offer || !offer.order) { alert('Offre introuvable pour ce produit.'); return; }

        const err = await offer.order(); // ✅ v13
        if (err && err.isError) alert('Erreur achat: ' + (err.message || err.code || 'inconnue'));
      } catch (e) {
        alert('Erreur achat: ' + (e?.message || e));
      }
    };
    window.safeOrder = window.buyProduct;
  });

  // Si DOM prêt avant deviceready : peindre au moins "—"
  document.addEventListener('DOMContentLoaded', refreshDisplayedPrices);
})();
