/* =========================================================
   achat.js — Cordova Purchase (prix dynamiques + achats)
   – Branché 100% après `deviceready`
   – Affiche les prix localisés depuis le Store (no hardcode)
   – Crédit VCoins / Jetons à l’approval (idempotent)
   – Garde-fou d’auth Supabase anonyme si besoin
   – Expose window.refreshDisplayedPrices() pour l’UI
   ========================================================= */

(function(){
  // --- Configuration produits (IDs identiques Play/App Store) ---
  const PRODUCTS = [
    { id: 'points3000',  type: 'CONSUMABLE',     credit: { vcoins: 3000  } },
    { id: 'points10000', type: 'CONSUMABLE',     credit: { vcoins: 10000 } },
    { id: 'jetons12',    type: 'CONSUMABLE',     credit: { jetons: 12    } },
    { id: 'jetons50',    type: 'CONSUMABLE',     credit: { jetons: 50    } },
    { id: 'nopub',       type: 'NON_CONSUMABLE', credit: { nopub: true   } },
  ];

  // Mémos
  const PRICES_BY_ID = Object.create(null);             // { productId: "€1,99" }
  const PROCESSED_TX = new Set();                       // idempotence par transaction.id
  let   STORE_READY   = false;

  // --- Helpers présence plugin / types ---
  function _iapAvailable() {
    return !!(window.store && typeof window.store.register === 'function');
  }
  function _mapType(t) {
    const s = window.store;
    if (!s) return null;
    return t === 'CONSUMABLE' ? s.CONSUMABLE
         : t === 'NON_CONSUMABLE' ? s.NON_CONSUMABLE
         : s.CONSUMABLE;
  }

  // --- Supabase: s’assurer d’une session (anonyme OK) ---
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

  // --- Créditer l’utilisateur (via userData si présent, sinon RPC simple) ---
  async function creditUser(credit, meta) {
    await __ensureAuthOnce();

    try {
      if (window.userData) {
        if (credit.vcoins) await window.userData.addVCoins(credit.vcoins);
        if (credit.jetons) await window.userData.addJetons(credit.jetons);
        if (credit.nopub)  {
          // flag local + éventuel setter applicatif
          localStorage.setItem('no_ads', '1');
          if (typeof window.setNoAds === 'function') window.setNoAds(true);
          if (window.userData.setNoAds) await window.userData.setNoAds(true);
        }
        return true;
      }

      // Fallback très basique via RPC (à remplacer par ton Edge Function de vérif reçu).
      if (window.sb) {
        if (credit.vcoins) {
          await sb.rpc('secure_add_points', { delta: credit.vcoins });
        }
        if (credit.jetons) {
          await sb.rpc('secure_add_jetons', { delta: credit.jetons });
        }
        if (credit.nopub) {
          await sb.from('users').update({ no_ads: true }).eq('id', (await sb.auth.getUser()).data.user.id);
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

  // --- Injecter les prix dans le DOM (boutique.html) ---
  function refreshDisplayedPrices() {
    try {
      // Cartouches "achats" (data-product-id)
      document.querySelectorAll('#achats-list .special-cartouche[data-product-id]').forEach(node => {
        const id = node.getAttribute('data-product-id');
        const price = PRICES_BY_ID[id];
        const priceNode = node.querySelector('.prix-label');
        if (priceNode && price) priceNode.textContent = price;
      });
    } catch (e) {
      // silencieux en cas d’absence d’UI
    }
  }
  window.refreshDisplayedPrices = refreshDisplayedPrices;

  // --- Récupérer prix depuis le Store ---
  function updateProductPrice(p) {
    if (!p || !p.id) return;
    if (p.price) {
      PRICES_BY_ID[p.id] = p.price; // prix localisé
      refreshDisplayedPrices();
    }
  }

  // --- Wiring principal (uniquement après deviceready) ---
  document.addEventListener('deviceready', function onReady(){
    if (!_iapAvailable()) {
      console.warn('[achat] Plugin cordova-purchase indisponible (build web ?). Les prix resteront "—".');
      return;
    }

    const IAP = window.store;

    // 1) REGISTER produits
    PRODUCTS.forEach(prod => {
      IAP.register({
        id: prod.id,
        alias: prod.id,
        type: _mapType(prod.type),
      });
    });

    // 2) Listeners généraux
    IAP.ready(() => {
      STORE_READY = true;
      // On capture tous les prix connus et on push dans l’UI
      try {
        PRODUCTS.forEach(({ id }) => {
          const p = IAP.get(id);
          if (p && p.price) {
            PRICES_BY_ID[id] = p.price;
          }
        });
        refreshDisplayedPrices();
      } catch (_) {}
    });

    // — Prix: se met à jour à chaque update produit
    IAP.when('product').updated(updateProductPrice);

    // — Achat approuvé: créditer + finish (idempotent)
    IAP.when('product').approved(async function(p){
      try {
        // idempotence: éviter double exécution si l’event rejoue
        const txId = p && p.transaction && (p.transaction.id || p.transaction.orderId);
        if (txId) {
          if (PROCESSED_TX.has(txId)) { p.finish(); return; }
          PROCESSED_TX.add(txId);
        }

        const meta = { productId: p.id, type: p.type, transaction: p.transaction || null };
        const found = PRODUCTS.find(x => x.id === p.id);
        if (!found) {
          console.warn('[achat] Produit non mappé:', p.id);
          p.finish();
          return;
        }

        const ok = await creditUser(found.credit, meta);
        if (!ok) {
          alert('Une erreur est survenue pendant l’attribution. Réessayez ou contactez le support.');
        } else {
          // petit feedback UI
          if (found.credit.vcoins) alert('✅ VCoins crédités !');
          if (found.credit.jetons) alert('✅ Jetons crédités !');
          if (found.credit.nopub)  alert('✅ Pack NO ADS activé !');
        }

        p.finish();
      } catch (e) {
        console.error('[achat] approved handler error:', e?.message || e);
        try { p.finish(); } catch(_) {}
      }
    });

    // — Possédé / restauré: utile pour NO ADS
    IAP.when('product').owned(function(p){
      if (p && p.id === 'nopub') {
        localStorage.setItem('no_ads', '1');
        if (typeof window.setNoAds === 'function') window.setNoAds(true);
      }
    });

    IAP.error(function(err){
      console.warn('[achat] Store error:', err && (err.message || err.code || err));
    });

    // 3) Refresh (déclenche la récupération des prix/états)
    try {
      IAP.refresh();
    } catch (e) {
      console.warn('[achat] refresh error:', e?.message || e);
    }
  });

  // --- API achat programmatique (optionnelle) ---
  window.buyProduct = function(productId){
    if (!_iapAvailable()) {
      alert('Achat via le Store indisponible ici. Ouvre l’app installée depuis le Store.');
      return;
    }
    try { window.store.order(productId); }
    catch (e) { alert('Erreur achat: ' + (e?.message || e)); }
  };

  // --- Petit confort: si ta page est chargée avant deviceready,
  //     affiche "—" et remontera tout seul dès que IAP.ready() pose les prix.
  document.addEventListener('DOMContentLoaded', function(){
    refreshDisplayedPrices();
  });

})();
