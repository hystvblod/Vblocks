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
    } catch (e) {
      console.warn('[achat] ensureAuth error:', e?.message || e);
    }
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
      console.warn('[achat] Pas de userData/sb: crédit non appliqué');
      return false;
    } catch (e) {
      console.error('[achat] creditUser error:', e?.message || e);
      return false;
    }
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
    } catch { /* silencieux */ }
  }
  window.refreshDisplayedPrices = refreshDisplayedPrices;

  // ============ BOOT ============ //
  document.addEventListener('deviceready', function () {
    console.log('[IAP] deviceready fired');
    const { api, store } = getIapApi();
    if (api === 'none') {
      console.warn('[achat] Plugin IAP indisponible. Prix resteront "—".');
      return;
    }
    console.log('[IAP] API =', api);

    if (api === 'legacy') {
      // ===== API HISTORIQUE: window.store =====
      const IAP = store;
      function mapType(t) {
        return t === 'NON_CONSUMABLE' ? IAP.NON_CONSUMABLE : IAP.CONSUMABLE;
      }

      // 1) Register
      PRODUCTS.forEach(p => IAP.register({ id: p.id, alias: p.id, type: mapType(p.type) }));
      console.log('[IAP] registered:', PRODUCTS.map(p => p.id));

      // 2) Updates → prix
      IAP.when('product').updated(p => {
        if (p?.id && p.price) {
          PRICES_BY_ID[p.id] = p.price;
          refreshDisplayedPrices();
        }
      });

      // 3) Approved → crédit + finish (idempotent)
      IAP.when('product').approved(async p => {
        try {
          const txId = p?.transaction && (p.transaction.id || p.transaction.orderId);
          if (txId) {
            if (PROCESSED_TX.has(txId)) { p.finish(); return; }
            PROCESSED_TX.add(txId);
          }
          const found = PRODUCTS.find(x => x.id === p?.id);
          if (!found) { p.finish(); return; }
          const ok = await creditUser(found.credit, { productId: p.id, type: p.type, transaction: p.transaction || null });
          if (ok) {
            if (found.credit.vcoins) alert('✅ VCoins crédités !');
            if (found.credit.jetons) alert('✅ Jetons crédités !');
            if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
          } else {
            alert('Erreur de crédit. Réessayez ou contactez le support.');
          }
          p.finish();
        } catch (e) {
          console.error('[IAP] approved error', e);
          try { p.finish(); } catch {}
        }
      });

      // 4) Owned (restauré) → NO ADS
      IAP.when('product').owned(p => {
        if (p?.id === 'nopub') {
          localStorage.setItem('no_ads', '1');
          if (typeof window.setNoAds === 'function') window.setNoAds(true);
        }
      });

      IAP.error(err => console.warn('[IAP] error', err && (err.message || err.code || err)));

      // 5) Ready + refresh
      IAP.ready(() => {
        STORE_READY = true;
        try {
          PRODUCTS.forEach(({ id }) => {
            const p = IAP.get(id);
            if (p?.price) PRICES_BY_ID[id] = p.price;
          });
        } catch {}
        refreshDisplayedPrices();
        // hotfix: relances
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

    // 1) Register / initialize
    const mapType = (t) => t === 'NON_CONSUMABLE' ? S.ProductType.NON_CONSUMABLE : S.ProductType.CONSUMABLE;
    S.initialize(PRODUCTS.map(p => ({ id: p.id, type: mapType(p.type) })));

    // 2) Updates produits → prix
    S.updated.add(() => {
      PRODUCTS.forEach(({ id }) => {
        const p = S.products?.byId?.[id];
        const priceStr = p?.pricing?.price || p?.price; // selon version
        if (priceStr) PRICES_BY_ID[id] = priceStr;
      });
      refreshDisplayedPrices();
    });

    // 3) Achats approuvés → crédit + finish (idempotent)
    S.approved.add(async (p) => {
      try {
        const txId = p?.transaction?.id || p?.transactionId;
        if (txId) {
          if (PROCESSED_TX.has(txId)) { try { await S.finish(p); } catch {} return; }
          PROCESSED_TX.add(txId);
        }
        const found = PRODUCTS.find(x => x.id === p?.id);
        if (!found) { try { await S.finish(p); } catch {} return; }
        const ok = await creditUser(found.credit, { productId: p.id, type: p.type, transaction: p.transaction || null });
        if (ok) {
          if (found.credit.vcoins) alert('✅ VCoins crédités !');
          if (found.credit.jetons) alert('✅ Jetons crédités !');
          if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
        } else {
          alert('Erreur de crédit. Réessayez ou contactez le support.');
        }
        try { await S.finish(p); } catch {}
      } catch (e) {
        console.error('[IAP] approved error', e);
        try { await S.finish(p); } catch {}
      }
    });

    // 4) Owned / restored → NO ADS
    S.owned?.add?.((p) => {
      if (p?.id === 'nopub') {
        localStorage.setItem('no_ads', '1');
        if (typeof window.setNoAds === 'function') window.setNoAds(true);
      }
    });

    S.error?.add?.(err => console.warn('[IAP] error', err && (err.message || err.code || err)));

    // 5) Ready + refresh
    S.ready(() => {
      STORE_READY = true;
      try {
        PRODUCTS.forEach(({ id }) => {
          const prod = S.products?.byId?.[id];
          const priceStr = prod?.pricing?.price || prod?.price;
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

    try { S.refresh(); } catch {}
    setTimeout(() => { try { S.refresh(); } catch {} }, 2500);

    // Achat programmatique
    window.buyProduct = function (id) {
      try { S.order(id); } catch (e) { alert('Erreur achat: ' + (e?.message || e)); }
    };
    window.safeOrder = window.buyProduct;
  });

  // Affichage des prix si la page est prête avant deviceready
  document.addEventListener('DOMContentLoaded', refreshDisplayedPrices);
})();
