/* =========================================================
   js/iap-init.js — Cordova Purchase v13 + Legacy fallback
   - Démarrage sûr après deviceready (y compris si déjà tiré)
   - v13: register → initialize({platforms:[GOOGLE_PLAY]}) → update()
   - Legacy: register → refresh()
   - Handlers: error / productUpdated / approved / finished
   - Expose window.IAP: list(), order(id), restore(), debug()
   ========================================================= */
var DEBUG_IAP = true;

(function () {
  var started = false;
  var TAG = '[IAP]';

  function log()   { if (DEBUG_IAP) console.log.apply(console, arguments); }
  function warn()  { if (DEBUG_IAP) console.warn.apply(console, arguments); }
  function error() { console.error.apply(console, arguments); }

  function hasV13()    { return !!(window.CdvPurchase && window.CdvPurchase.store); }
  function hasLegacy() { return !!(window.store && typeof window.store.register === 'function'); }
  function store()     { return (window.CdvPurchase && window.CdvPurchase.store) || window.store || null; }

  // --- Définis ici tes IDs EXACTS (Play Console) ---
  var PRODUCTS = [
    { id: 'jetons12',    kind: 'inapp'  }, // CONSUMABLE
    { id: 'jetons50',    kind: 'inapp'  }, // CONSUMABLE
    { id: 'points3000',  kind: 'inapp'  }, // CONSUMABLE
    { id: 'points10000', kind: 'inapp'  }, // CONSUMABLE
    { id: 'nopub',       kind: 'nonc'   }  // NON_CONSUMABLE
    // Abonnements ? -> { id:'mon_abonnement', kind:'subs' }
  ];

  function registerProducts() {
    var s = store();
    if (!s) return;

    if (hasV13()) {
      var T  = window.CdvPurchase.ProductType;
      var arr = PRODUCTS.map(function (p) {
        if (p.kind === 'subs')           return { id: p.id, type: T.SUBSCRIPTION };
        if (p.kind === 'nonc')           return { id: p.id, type: T.NON_CONSUMABLE };
        /* default: inapp/consumable */   return { id: p.id, type: T.CONSUMABLE };
      });
      s.register(arr);
      log(TAG, 'v13 register()', arr.map(x => x.id));
    } else {
      // Legacy
      var CONS = store().CONSUMABLE, NONC = store().NON_CONSUMABLE, SUBS = store().SUBSCRIPTION || 'subscription';
      PRODUCTS.forEach(function (p) {
        var type = (p.kind === 'subs') ? SUBS : (p.kind === 'nonc' ? NONC : CONS);
        store().register({ id: p.id, type: type, alias: p.id });
      });
      log(TAG, 'legacy register()', PRODUCTS.map(x => x.id));
    }
  }

  function attachHandlersV13() {
    var s = window.CdvPurchase.store;

    // Verbosité utile
    try { s.verbosity = s.DEBUG; } catch (_) {}

    s.error(function (err) {
      // err.code, err.message sont utiles
      error(TAG, 'Store error:', err && (err.message || err));
    });

    s.productUpdated(function (p) {
      // price: { value, currency, micros? } selon versions
      var priceStr = '';
      if (p && p.price) {
        if (typeof p.price === 'string') priceStr = p.price;
        else if (p.price.value) priceStr = p.price.value + ' ' + (p.price.currency || '');
      }
      log(TAG, 'productUpdated:', {
        id: p && p.id,
        title: p && p.title,
        price: priceStr,
        type: p && p.type,
        state: p && p.state
      });
    });

    s.when().approved(function (p) {
      log(TAG, 'approved:', p && p.id);
      try { p && p.finish && p.finish(); } catch (e) { error(TAG, 'finish error', e); }
    });

    s.when().finished(function (p) {
      log(TAG, 'finished:', p && p.id);
    });
  }

  function attachHandlersLegacy() {
    var s = window.store;

    s.error(function (err) {
      error(TAG, 'Store error:', err && (err.message || err));
    });

    s.when('product').updated(function (p) {
      log(TAG, 'product updated:', { id: p.id, title: p.title, price: p.price, state: p.state });
    });

    s.when('product').approved(function (p) {
      log(TAG, 'approved:', p.id);
      try { p.finish(); } catch (e) { error(TAG, 'finish error', e); }
    });

    s.when('product').finished(function (p) {
      log(TAG, 'finished:', p.id);
    });
  }

  function initializeV13() {
    var s  = window.CdvPurchase.store;
    var PL = window.CdvPurchase.Platform;

    try {
      // Initialisation explicite (MANQUAIT dans ta version)
      s.initialize({ platforms: [ PL.GOOGLE_PLAY ] });
      log(TAG, 'initialize({ GOOGLE_PLAY }) done');
    } catch (e) {
      error(TAG, 'initialize error', e);
    }

    // Premier fetch du catalogue
    try {
      if (typeof s.update === 'function') s.update();
      else if (typeof s.refresh === 'function') s.refresh(); // garde-fou
      log(TAG, 'catalog sync requested (update/refresh)');
    } catch (e) {
      error(TAG, 'update/refresh error', e);
    }
  }

  function refreshLegacy() {
    try {
      store().refresh();
      log(TAG, 'legacy refresh() requested');
    } catch (e) {
      error(TAG, 'legacy refresh error', e);
    }
  }

  function init() {
    if (started) return;
    started = true;

    if (!hasV13() && !hasLegacy()) {
      warn(TAG, 'plugin absent du build (cordova-plugin-purchase non chargé)');
      return;
    }

    // Enregistre les produits
    registerProducts();

    // Attache les handlers
    if (hasV13()) attachHandlersV13();
    else          attachHandlersLegacy();

    // Démarre la récupération du catalogue
    if (hasV13()) initializeV13();
    else          refreshLegacy();

    // Expose une mini API debug
    window.IAP = {
      list: function () {
        var s = store();
        var arr = (s && s.products) ? s.products : [];
        log(TAG, 'LIST', arr);
        return arr;
      },
      order: function (id) {
        try {
          if (hasV13()) {
            var s  = window.CdvPurchase.store;
            var PL = window.CdvPurchase.Platform;
            var p  = s.get && s.get(id, PL.GOOGLE_PLAY);
            if (!p) { warn(TAG, 'order: produit inconnu', id); return; }
            // SUBS: via offer.order() ; INAPP/NON-CONSUMABLE: via product.order()
            if (p.offers && p.offers.length) {
              log(TAG, 'order SUBS via offer.order()', id);
              return p.offers[0].order();
            } else if (typeof p.order === 'function') {
              log(TAG, 'order INAPP/NONC via product.order()', id);
              return p.order();
            } else {
              warn(TAG, 'order: pas de méthode order() pour', id);
            }
          } else {
            // Legacy
            var p2 = store().get(id);
            if (!p2) { warn(TAG, 'order legacy: produit inconnu', id); return; }
            log(TAG, 'order legacy', id);
            p2.purchase();
          }
        } catch (e) { error(TAG, 'order error', e); }
      },
      restore: function () {
        try {
          if (hasV13()) {
            var s = window.CdvPurchase.store;
            log(TAG, 'restore (v13) → update()');
            if (typeof s.update === 'function') s.update();
            else if (typeof s.refresh === 'function') s.refresh();
          } else {
            log(TAG, 'restore (legacy) → refresh()');
            store().refresh();
          }
        } catch (e) { error(TAG, 'restore error', e); }
      },
      debug: function (on) {
        DEBUG_IAP = (on !== false);
        try {
          if (hasV13()) window.CdvPurchase.store.verbosity = on ? window.CdvPurchase.store.DEBUG : window.CdvPurchase.store.QUIET;
        } catch (_) {}
        log(TAG, 'debug=', DEBUG_IAP);
      }
    };

    // Re-sync au resume (utile après retour du Play UI)
    document.addEventListener('resume', function () {
      try {
        if (hasV13()) {
          var s = window.CdvPurchase.store;
          if (typeof s.update === 'function') s.update();
          else if (typeof s.refresh === 'function') s.refresh();
        } else {
          store().refresh();
        }
      } catch (_) {}
    });
  }

  function startWhenReady() {
    var start = function () { try { init(); } catch (e) { error(TAG, e); } };

    if (window.cordova) {
      // Si deviceready a déjà eu lieu (multi-page Capacitor/Cordova)
      var fired =
        (window.cordova.deviceready && window.cordova.deviceready.fired) ||
        (window.channel && window.channel.onCordovaReady && window.channel.onCordovaReady.fired);
      if (fired) start();
      else document.addEventListener('deviceready', start, { once: true });
    } else {
      // Au cas où cordova.js arrive tard
      document.addEventListener('deviceready', start, { once: true });
      setTimeout(function () { if (window.cordova) start(); }, 2000);
    }
  }

  startWhenReady();
})();
