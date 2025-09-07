/* =========================================================
   achat.js — Cordova Purchase (prix dynamiques + achats)
   - Compatible API legacy (window.store) ET API moderne (window.CdvPurchase.store)
   - Branché 100% après `deviceready`
   - Affiche les prix localisés depuis le Store (no hardcode)
   - Crédit VCoins / Jetons à l’approval (idempotent)
   - Expose window.refreshDisplayedPrices(), window.buyProduct(), window.safeOrder()
   ========================================================= */

(function () {
  // --- Configuration produits (IDs identiques Play) ---
  const PRODUCTS = [
    { id: 'points3000',  type: 'CONSUMABLE',     credit: { vcoins: 3000  } },
    { id: 'points10000', type: 'CONSUMABLE',     credit: { vcoins: 10000 } },
    { id: 'jetons12',    type: 'CONSUMABLE',     credit: { jetons: 12    } },
    { id: 'jetons50',    type: 'CONSUMABLE',     credit: { jetons: 50    } },
    { id: 'nopub',       type: 'NON_CONSUMABLE', credit: { nopub: true   } },
  ];

  // --- Mémo runtime ---
  const PRICES_BY_ID = Object.create(null); // { productId: "€1.99" }
  const PROCESSED_TX = new Set();           // idempotence par transaction.id
  let   STORE_READY  = false;

  // --- Flag pour boutique.js (débloque les clics quand prêt) ---
  window.__IAP_READY__ = false;

  // --- Détection API disponible ---
  function getIapApi() {
    // Priorité à l'API moderne (Billing v7+)
    if (window.CdvPurchase && window.CdvPurchase.store) {
      return { api: 'cdv7', store: window.CdvPurchase.store };
    }
    // Fallback API historique
    if (window.store && typeof window.store.register === 'function') {
      return { api: 'legacy', store: window.store };
    }
    return { api: 'none', store: null };
  }

  // --- Supabase: session anonyme si besoin ---
  let __authEnsured = false;
  async function __ensureAuthOnce() {
    if (__authEnsured) return;
    try {
      if (!window.sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) await sb.auth.signInAnonymously();
      __authEnsured = true;
    } catch (e) {}
  }

  // --- Créditer l’utilisateur ---
  async function creditUser(credit, meta) {
    await __ensureAuthOnce();
    try {
      if (window.userData) {
        if (credit.vcoins) await window.userData.addVCoins(credit.vcoins);
        if (credit.jetons) await window.userData.addJetons(credit.jetons);
        if (credit.nopub) {
          localStorage.setItem('no_ads', '1');
          if (typeof window.setNoAds === 'function') window.setNoAds(true);
          if (window.userData.setNoAds) await window.userData.setNoAds(true);
        }
        return true;
      }
      // Fallback ultra simple (à remplacer par ton backend sécurisé si besoin)
      if (window.sb) {
        if (credit.vcoins) await sb.rpc('secure_add_points', { delta: credit.vcoins });
        if (credit.jetons) await sb.rpc('secure_add_jetons', { delta: credit.jetons });
        if (credit.nopub) {
          try {
            const { data: { user } } = await sb.auth.getUser();
            if (user?.id) await sb.from('users').update({ no_ads: true }).eq('id', user.id);
          } catch {}
          localStorage.setItem('no_ads', '1');
        }
        return true;
      }
      return false;
    } catch (e) { return false; }
  }

  // --- Injecter les prix dans le DOM (HTML-first) ---
  function refreshDisplayedPrices() {
    try {
      document
        .querySelectorAll('#achats-list .special-cartouche[data-product-id]')
        .forEach(node => {
          const id = node.getAttribute('data-product-id');
          const price = PRICES_BY_ID[id];
          const priceNode = node.querySelector('.prix-label');
          if (priceNode && price) priceNode.textContent = price;
        });
    } catch {}
  }
  window.refreshDisplayedPrices = refreshDisplayedPrices;

  // ============ BOOT ============ //
  document.addEventListener('deviceready', function () {
    const { api, store } = getIapApi();
    if (api === 'none') {
      // Pas de plugin (build web/sideload) : prix resteront "—"
      return;
    }

    if (api === 'legacy') {
      // ===== API HISTORIQUE: window.store =====
      const IAP = store;
      function mapType(t) {
        return t === 'NON_CONSUMABLE' ? IAP.NON_CONSUMABLE : IAP.CONSUMABLE;
      }

      // 1) Register
      PRODUCTS.forEach(p => { try { IAP.register({ id: p.id, alias: p.id, type: mapType(p.type) }); } catch(_){} });

      // 2) Updates → prix
      IAP.when('product').updated(p => {
        try {
          if (p?.id && p.price) {
            PRICES_BY_ID[p.id] = p.price;
            refreshDisplayedPrices();
          }
        } catch {}
      });

      // 3) Approved → crédit + finish (idempotent)
      IAP.when('product').approved(async p => {
        try {
          const txId = p?.transaction && (p.transaction.id || p.transaction.orderId);
          if (txId) {
            if (PROCESSED_TX.has(txId)) { try { p.finish(); } catch {} return; }
            PROCESSED_TX.add(txId);
          }
          const found = PRODUCTS.find(x => x.id === p?.id);
          if (!found) { try { p.finish(); } catch {} return; }
          const ok = await creditUser(found.credit, { productId: p.id, type: p.type, transaction: p.transaction || null });
          if (ok) {
            if (found.credit.vcoins) alert('✅ VCoins crédités !');
            if (found.credit.jetons) alert('✅ Jetons crédités !');
            if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
          } else {
            alert('Erreur de crédit. Réessayez ou contactez le support.');
          }
        } catch {}
        try { p.finish(); } catch {}
      });

      // 4) Owned (restauré) → NO ADS
      IAP.when('product').owned(p => {
        try {
          if (p?.id === 'nopub') {
            localStorage.setItem('no_ads', '1');
            if (typeof window.setNoAds === 'function') window.setNoAds(true);
          }
        } catch {}
      });

      // 5) Ready + refresh
      IAP.ready(() => {
        STORE_READY = true;
        // ✅ débloque la boutique (boutique.js)
        window.__IAP_READY__ = true;
        try { window.dispatchEvent(new Event('iap-ready')); } catch {}

        try {
          PRODUCTS.forEach(({ id }) => {
            const p = IAP.get(id);
            if (p?.price) PRICES_BY_ID[id] = p.price;
          });
        } catch {}
        refreshDisplayedPrices();
        try { window.refreshDisplayedPrices(); } catch {}
        setTimeout(() => { try { window.refreshDisplayedPrices(); } catch {} }, 1500);
        let n = 0, t = setInterval(() => {
          try { window.refreshDisplayedPrices(); } catch {}
          if (++n >= 5) clearInterval(t);
        }, 1000);
      });

      try { IAP.refresh(); } catch {}
      setTimeout(() => { try { IAP.refresh(); } catch {} }, 2500);

      // Achat programmatique
      window.buyProduct = function (id) {
        try { IAP.order(id); } catch (e) { alert('Erreur achat: ' + (e?.message || e)); }
      };
      window.safeOrder = window.buyProduct;
      return;
    }

    // ===== API MODERNE: window.CdvPurchase.store (Billing v7+) =====
    const S = store; // alias

    // 1) initialize + register (v13+)
    try {
      // initialize attend un ARRAY de plateformes
      const platform = (S.Platform && S.Platform.GOOGLE_PLAY) ? S.Platform.GOOGLE_PLAY : (S.defaultPlatform && S.defaultPlatform());
      if (platform) { S.initialize([ platform ]); }
    } catch {}

    const mapType = (t) => t === 'NON_CONSUMABLE' ? S.ProductType.NON_CONSUMABLE : S.ProductType.CONSUMABLE;
    try {
      S.register(PRODUCTS.map(p => ({ id: p.id, type: mapType(p.type) })));
    } catch {}

    // 2) Updates produits → prix (via when().productUpdated)
    if (S.when && S.when().productUpdated) {
      S.when().productUpdated(p => {
        try {
          const priceStr = p?.pricing?.price || p?.price;
          if (p?.id && priceStr) {
            PRICES_BY_ID[p.id] = priceStr;
            refreshDisplayedPrices();
          }
        } catch {}
      });
    } else if (S.updated && S.updated.add) {
      // fallback signal
      S.updated.add(() => {
        PRODUCTS.forEach(({ id }) => {
          const prod = S.products?.byId?.[id];
          const priceStr = prod?.pricing?.price || prod?.price;
          if (priceStr) PRICES_BY_ID[id] = priceStr;
        });
        refreshDisplayedPrices();
      });
    }

    // 3) Achats approuvés → crédit + finish (idempotent)
    if (S.when && S.when().approved) {
      S.when().approved(async (tx) => {
        try {
          const productId = tx?.productId || tx?.product?.id;
          const txId = tx?.transactionId || tx?.orderId || tx?.transaction?.id || tx?.id;
          if (txId) {
            if (PROCESSED_TX.has(txId)) { try { tx.finish && tx.finish(); } catch {} return; }
            PROCESSED_TX.add(txId);
          }
          const found = PRODUCTS.find(x => x.id === productId);
          if (!found) { try { tx.finish && tx.finish(); } catch {} return; }

          const ok = await creditUser(found.credit, { productId, transaction: { id: txId } });
          if (ok) {
            if (found.credit.vcoins) alert('✅ VCoins crédités !');
            if (found.credit.jetons) alert('✅ Jetons crédités !');
            if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
          } else {
            alert('Erreur de crédit. Réessayez ou contactez le support.');
          }
          try { tx.finish && tx.finish(); } catch {}
        } catch {
          try { tx.finish && tx.finish(); } catch {}
        }
      });
    } else if (S.approved && S.approved.add) {
      // fallback signal
      S.approved.add(async (p) => {
        try {
          const txId = p?.transaction?.id || p?.transactionId;
          if (txId) {
            if (PROCESSED_TX.has(txId)) { try { S.finish && S.finish(p); } catch {} return; }
            PROCESSED_TX.add(txId);
          }
          const found = PRODUCTS.find(x => x.id === p?.id);
          if (!found) { try { S.finish && S.finish(p); } catch {} return; }
          const ok = await creditUser(found.credit, { productId: p.id, transaction: p.transaction || null });
          if (ok) {
            if (found.credit.vcoins) alert('✅ VCoins crédités !');
            if (found.credit.jetons) alert('✅ Jetons crédités !');
            if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
          } else {
            alert('Erreur de crédit. Réessayez ou contactez le support.');
          }
          try { S.finish && S.finish(p); } catch {}
        } catch {
          try { S.finish && S.finish(p); } catch {}
        }
      });
    }

    // 4) Owned / restored → NO ADS (via receipt)
    if (S.when && S.when().receiptUpdated) {
      S.when().receiptUpdated(() => {
        try {
          const prod = S.products?.byId?.['nopub'];
          const owned = S.owned ? S.owned({ id: 'nopub' }) : (prod && prod.owned);
          if (owned) {
            localStorage.setItem('no_ads', '1');
            if (typeof window.setNoAds === 'function') window.setNoAds(true);
          }
        } catch {}
      });
    }

    // 5) Ready + update/refresh catalogue
    if (S.ready) {
      S.ready(() => {
        STORE_READY = true;
        // ✅ débloque la boutique (boutique.js)
        window.__IAP_READY__ = true;
        try { window.dispatchEvent(new Event('iap-ready')); } catch {}

        try {
          PRODUCTS.forEach(({ id }) => {
            const prod = S.products?.byId?.[id] || (S.get && S.get(id));
            const priceStr = (prod && prod.pricing && prod.pricing.price) || (prod && prod.price);
            if (priceStr) PRICES_BY_ID[id] = priceStr;
          });
        } catch {}
        refreshDisplayedPrices();
        try { window.refreshDisplayedPrices(); } catch {}
        setTimeout(() => { try { window.refreshDisplayedPrices(); } catch {} }, 1500);
        let n = 0, t = setInterval(() => {
          try { window.refreshDisplayedPrices(); } catch {}
          if (++n >= 5) clearInterval(t);
        }, 1000);
      });
    }

    // v13 : préférer update()
    try { (S.update ? S.update() : (S.refresh && S.refresh())); } catch {}
    setTimeout(() => { try { (S.update ? S.update() : (S.refresh && S.refresh())); } catch {} }, 2500);

    // Achat programmatique
    window.buyProduct = async function (id) {
      try {
        // v13+: commander une OFFER, pas l'ID produit direct
        const p = (S.products && S.products.byId && S.products.byId[id]) || (S.get && S.get(id));
        const offer = p && p.offers && p.offers[0];
        if (!offer) { alert('Offre introuvable pour ce produit.'); return; }
        await S.order(offer);
      } catch (e) {
        alert('Erreur achat: ' + (e?.message || e));
      }
    };
    window.safeOrder = window.buyProduct;
  });

  // Affichage des prix si la page est prête avant deviceready
  document.addEventListener('DOMContentLoaded', refreshDisplayedPrices);
})();
