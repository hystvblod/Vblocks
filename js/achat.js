/* global CdvPurchase, sb */
'use strict';

/**
 * achat.js — Cordova Purchase v13 (Google Play)
 * - Handlers branchés AVANT initialize (crucial)
 * - register → await initialize → await update/refresh
 * - Handlers v13: productUpdated / error / approved / finished
 * - INAPP: product.order() | SUBS: offer.order()
 * - Crédit via RPC: iap_credit_once (idempotent)
 * - Silencieux: aucune popup (logs console seulement)
 */

(function () {
  const TAG    = '[IAP]';
  const DEBUG  = true;     // logs console détaillés
  const SILENT = true;     // forcer false pour toasts/alert
  const DEV_FORCE_FINISH = false; // true en DEV pour purger les pendings coincés

  const t0 = Date.now();
  const log   = (...a) => { if (DEBUG) console.log(TAG, ...a); };
  const warn  = (...a) => { if (DEBUG) console.warn(TAG, ...a); };
  const error = (...a) => { console.error(TAG, ...a); };

  // Anti double init si le fichier est inclus sur plusieurs pages
  if (window.__IAP_INITTED__) {
    log('Déjà initialisé — skip');
    return;
  }
  window.__IAP_INITTED__ = true;

  // ----------- Produits (IDs Play Console) -----------
  const PRODUCTS = [
    { id: 'points3000',  type: 'CONSUMABLE',     credit: { vcoins: 5000  } },
    { id: 'points10000', type: 'CONSUMABLE',     credit: { vcoins: 12000 } },
    { id: 'jetons12',    type: 'CONSUMABLE',     credit: { jetons: 12    } },
    { id: 'jetons50',    type: 'CONSUMABLE',     credit: { jetons: 50    } },
    { id: 'nopub',       type: 'NON_CONSUMABLE', credit: { nopub: true   } },
  ];

  // ----------- État / Diags -----------
  const PRICES_BY_ID = Object.create(null);
  const IN_FLIGHT_TX = new Set();
  const FINISHED_TX  = new Set();
  const NOTIFIED_TX  = new Set();

  const PENDING_KEY = 'iap_pending_v2'; // crédits à rejouer côté app

  let STORE_READY = false;
  let started     = false;
  let retryTimer  = null;

  window.__IAP_READY__ = false;

  window.IAPDiag = {
    startAtMs: t0,
    started: false,
    apiKind: 'none',
    storeReady: false,
    devicereadySeen: !!(window.cordova && (window.cordova.deviceready?.fired)),
    lastError: null,
    lastEvents: [],
    prices: PRICES_BY_ID,
  };
  const ev = (name, data) => {
    const item = { t: Date.now() - t0, name, data };
    window.IAPDiag.lastEvents.push(item);
    if (window.IAPDiag.lastEvents.length > 400) window.IAPDiag.lastEvents.shift();
    if (DEBUG) console.log(TAG, `EVT ${name}`, data || '');
  };

  // ----------- UI helpers (silencieux) -----------
  function safeAlertOnce(txId, msg) {
    try {
      if (!txId) return;
      if (NOTIFIED_TX.has(txId)) return;
      NOTIFIED_TX.add(txId);
      if (SILENT) { log('NOTE(silent):', msg); return; }
      if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    } catch (_) {}
  }

  // ----------- Pending local storage -----------
  function readPending() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      const arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function writePending(list) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-50))); } catch (_) {}
  }
  function addPending(txId, productId) {
    if (!txId) return;
    const list = readPending();
    if (!list.find(x => x.txId === txId)) {
      list.push({ txId, productId, ts: Date.now() });
      writePending(list);
      ev('pending:add', { txId, productId });
    }
  }
  function removePending(txId) {
    if (!txId) return;
    const list = readPending().filter(x => x.txId !== txId);
    writePending(list);
    ev('pending:remove', txId);
  }

  // ----------- Utils -----------
  function getApi() {
    if (window.CdvPurchase && window.CdvPurchase.store) {
      return { kind: 'v13', S: window.CdvPurchase.store };
    }
    return { kind: 'none', S: null };
  }

  function refreshDisplayedPrices() {
    try {
      document
        .querySelectorAll('#achats-list .special-cartouche[data-product-id]')
        .forEach(node => {
          const id    = node.getAttribute('data-product-id');
          const price = PRICES_BY_ID[id];
          const label = node.querySelector('.prix-label');
          if (label && price) label.textContent = price;
        });
    } catch (_) {}
  }
  document.addEventListener('DOMContentLoaded', refreshDisplayedPrices);
  window.refreshDisplayedPrices = refreshDisplayedPrices;

  // ----------- Auth helper (STRICT) -----------
  async function ensureAuthStrict() {
    if (!window.sb?.auth) return null;
    try {
      // 1) Session actuelle ?
      let { data: { session } } = await sb.auth.getSession();
      if (session?.user?.id) return session;

      // 2) Refresh d'abord (évite de créer un nouvel anonyme si l'ancien peut être rafraîchi)
      try {
        const { data: ref } = await sb.auth.refreshSession();
        session = ref?.session || session;
      } catch (_) {}
      if (session?.user?.id) return session;

      // 3) Dernier recours : session anonyme
      if (typeof sb.auth.signInAnonymously === 'function') {
        await sb.auth.signInAnonymously();
        ({ data: { session } } = await sb.auth.getSession());
        if (session?.user?.id) return session;
      }

      console.warn('[AUTH] Pas de session et pas de signInAnonymously dans ce SDK');
      return null;
    } catch (e) {
      console.warn('[AUTH] erreur ensureAuthStrict', e?.message || e);
      return null;
    }
  }

  // ----------- parse JSON / base64 JSON -----------
  function parseMaybeBase64Json(s) {
    if (!s || typeof s !== 'string') return null;
    try { return JSON.parse(s); } catch (_) {}
    try { return JSON.parse(atob(s)); } catch (_) {}
    return null;
  }

  // ----------- extraction token Android 13 & co -----------
  function getPurchaseToken(tx) {
    try { if (tx?.transaction?.purchaseToken) return tx.transaction.purchaseToken; } catch(e){}
    try {
      const rec = tx?.transaction?.receipt || tx?.receipt;
      const r   = typeof rec === 'string' ? parseMaybeBase64Json(rec) : rec;
      if (r?.purchaseToken) return r.purchaseToken;
      if (r?.payload) {
        const p = typeof r.payload === 'string' ? parseMaybeBase64Json(r.payload) : r.payload;
        if (p?.purchaseToken) return p.purchaseToken;
      }
    } catch(e){}
    return tx?.purchaseToken
        || tx?.androidPurchaseToken
        || tx?.transactionId
        || tx?.orderId
        || tx?.id
        || null;
  }

  // ----------- extraction productId robuste -----------
  function getProductIdFromTx(tx) {
    let pid =
      tx?.product?.id ||
      tx?.productId ||
      tx?.sku ||
      tx?.transaction?.productId ||
      tx?.transaction?.lineItems?.[0]?.productId ||
      null;

    if (!pid) {
      const rec = tx?.transaction?.receipt || tx?.receipt;
      const r   = typeof rec === 'string' ? parseMaybeBase64Json(rec) : rec;
      if (r?.productId) pid = r.productId;
      else if (r?.payload) {
        const p = typeof r.payload === 'string' ? parseMaybeBase64Json(r.payload) : r.payload;
        pid = p?.productId || p?.product_id || pid;
      }
    }
    return pid || null;
  }

  // ----------- CREDIT (via RPC serveur) -----------
  async function creditUser(found, txId) {
    try {
      if (!found || !window.sb) return false;

      const session = await ensureAuthStrict();
      if (!session) {
        ev('creditUser:noSession');
        return false;
      }

      try { await sb.auth.refreshSession(); } catch (_) {}

      const productId = found.id;

      const tRpc = performance.now();
      const { data: rpcData, error: rpcErr, status: httpStatus, statusText } =
        await sb.rpc('iap_credit_once', {
          p_tx_id: String(txId),
          p_product_id: String(productId)
        });
      console.log('[IAP] RPC iap_credit_once →', {
        httpStatus, statusText, rpcData, rpcErr, txId, productId
      });

      if (rpcErr) {
        const msg = rpcErr.message || String(rpcErr);
        error('iap_credit_once error', msg);
        ev('creditUser:serverError', { productId, txId, err: msg, httpStatus });
        return false;
      }
      if (!rpcData || !['ok', 'already'].includes(rpcData.status)) {
        ev('creditUser:unexpectedStatus', { productId, txId, rpcData, httpStatus });
        return false;
      }

      // UX locale pour nopub (l’état serveur reste la source)
      if (productId === 'nopub') {
        try {
          localStorage.setItem('no_ads', '1');
          if (window.setNoAds) window.setNoAds(true);
        } catch (_) {}
      }

      ev('creditUser:serverOK', { productId, txId, status: rpcData.status, ms: Math.round(performance.now()-tRpc) });
      return true;
    } catch (e) {
      error('creditUser exception', e);
      ev('creditUser:serverException', e?.message || e);
      return false;
    }
  }

  // ----------- Helpers produits v13 -----------
  function getProduct(S, id, PL) {
    try {
      if (!S || !id) return null;
      if (S.get) return (S.get.length >= 2) ? S.get(id, PL && PL.GOOGLE_PLAY) : S.get(id);
      return (S.products && S.products.byId && S.products.byId[id]) || null;
    } catch (_) { return null; }
  }
  async function waitForProduct(S, id, PL, timeoutMs = 12000) {
    const t0 = Date.now();
    ev('waitForProduct:start', id);
    while (Date.now() - t0 < timeoutMs) {
      const p = getProduct(S, id, PL);
      if (p) {
        const price = p?.pricing?.price || p?.price || p?.pricing?.priceString;
        if (price) { PRICES_BY_ID[id] = price; refreshDisplayedPrices(); }
        ev('waitForProduct:ok', { id, price });
        return p;
      }
      try { S.update ? await S.update() : (S.refresh && await S.refresh()); } catch(e) { warn('update during wait err', e?.message||e); }
      await new Promise(r => setTimeout(r, 350));
    }
    ev('waitForProduct:timeout', id);
    return null;
  }
  async function waitForOffer(S, product, timeoutMs = 12000) {
    const t0 = Date.now();
    const pid = product?.id;
    ev('waitForOffer:start', pid);
    while (Date.now() - t0 < timeoutMs) {
      try {
        const offer = product?.getOffer && product.getOffer();
        if (offer) { ev('waitForOffer:ok', pid); return offer; }
      } catch(e) { warn('getOffer err', e?.message||e); }
      try { S.update ? await S.update() : (S.refresh && await S.refresh()); } catch(e) { warn('update during waitOffer err', e?.message||e); }
      await new Promise(r => setTimeout(r, 350));
    }
    ev('waitForOffer:timeout', pid);
    return null;
  }

  // ----------- Rejouer crédits en attente (localStorage) -----------
  async function replayLocalPending() {
    const pendings = readPending();
    if (!pendings.length) return;
    ev('pending:replay:start', pendings.length);

    let anyCredited = false;
    for (const item of pendings.slice()) {
      try {
        const found = PRODUCTS.find(x => x.id === item.productId) || { id: item.productId };
        const ok = await creditUser(found, item.txId);
        if (ok) {
          removePending(item.txId);
          anyCredited = true;
          ev('pending:replay:credited', item.txId);
        } else {
          ev('pending:replay:stillKO', item.txId);
        }
      } catch (e) {
        ev('pending:replay:exception', e?.message || e);
      }
    }

    if (anyCredited) {
      const { S } = getApi();
      try { S && S.update && await S.update(); ev('pending:replay:forceUpdate'); } catch (_) {}
    }
  }

  // ----------- INITIALISATION (handlers AVANT initialize) -----------
  async function start() {
    if (started) return;

    const { kind, S } = getApi();
    window.IAPDiag.apiKind = kind;

    if (kind === 'none' || !S) {
      if (!retryTimer) {
        warn('Plugin IAP absent. Retry…');
        ev('plugin:absent');
        retryTimer = setInterval(() => {
          const g = getApi();
          if (g.kind !== 'none' && g.S) {
            clearInterval(retryTimer); retryTimer = null;
            start();
          }
        }, 600);
      }
      return;
    }

    started = true;
    window.IAPDiag.started = true;
    log('API =', kind);

    const PT = S.ProductType || (window.CdvPurchase && CdvPurchase.ProductType);
    const PL = S.Platform    || (window.CdvPurchase && CdvPurchase.Platform);
    const mapType = t => (t === 'NON_CONSUMABLE' ? PT.NON_CONSUMABLE : PT.CONSUMABLE);

    try { if (window.CdvPurchase?.log) CdvPurchase.log.level = CdvPurchase.LogLevel.WARN; } catch (_) {}

    // ---- HANDLERS (avant tout) ----

    // Errors
    if (S.error) S.error(err => {
      window.IAPDiag.lastError = err;
      error('Store error:', err && (err.code || ''), err && (err.message || err));
      ev('v13:error', { code: err?.code, msg: err?.message });
    });

    // Produits mis à jour
    const onProductUpdate = p => {
      const price = p?.pricing?.price || p?.price || p?.pricing?.priceString;
      if (p?.id && price) { PRICES_BY_ID[p.id] = price; refreshDisplayedPrices(); }
      if (p?.owned && p.id === 'nopub') {
        try { localStorage.setItem('no_ads', '1'); if (window.setNoAds) window.setNoAds(true); } catch (_) {}
      }
      ev('v13:productUpdated', { id: p?.id, price, state: p?.state, owned: p?.owned });
    };
    if (S.productUpdated) {
      S.productUpdated(onProductUpdate);
    } else if (S.when && S.when().productUpdated) {
      S.when().productUpdated(onProductUpdate);
    } else if (S.updated && S.updated.add) {
      S.updated.add(() => {
        try {
          PRODUCTS.forEach(({ id }) => {
            const p = getProduct(S, id, PL);
            const price = p?.pricing?.price || p?.price || p?.pricing?.priceString;
            if (price) PRICES_BY_ID[id] = price;
            if (p?.owned && id === 'nopub') { localStorage.setItem('no_ads', '1'); if (window.setNoAds) window.setNoAds(true); }
          });
          refreshDisplayedPrices();
          ev('v13:updated:scan');
        } catch (e) { warn('updated scan err', e?.message || e); }
      });
    }

    // Transactions
    if (S.when && S.when().approved) {
      S.when().approved(async tx => {
        const productId = getProductIdFromTx(tx);
        const txId      = getPurchaseToken(tx);

        try {
          console.log('[IAP] TX RAW =>', {
            id: tx?.id,
            productId,
            transactionId: tx?.transactionId,
            orderId: tx?.orderId,
            androidPurchaseToken: tx?.androidPurchaseToken,
            purchaseToken: tx?.purchaseToken,
            tx_purchaseToken: tx?.transaction?.purchaseToken,
            rcpt_purchaseToken: tx?.receipt?.purchaseToken,
          });
        } catch (_) {}

        if (!txId) { ev('v13:noTxId', { productId }); return; }
        if (!productId) { addPending(txId, 'unknown'); ev('v13:noProductId', { txId }); return; }

        // Anti-dup / Anti-finish fantôme
        if (FINISHED_TX.has(txId)) {
          try { tx.finish && tx.finish(); } catch (_) {}
          ev('v13:dupTx:alreadyFinished', txId);
          return;
        }
        if (IN_FLIGHT_TX.has(txId)) {
          ev('v13:dupTx:inFlight', txId);
          return;
        }
        IN_FLIGHT_TX.add(txId);

        const found = PRODUCTS.find(x => x.id === productId) || { id: productId };

        // 👉 Ajout en pending AVANT (pour rejouer si le crédit échoue)
        addPending(txId, productId);

        // 1) Crédit serveur (essaie avec session garantie)
        const credited = await creditUser(found, txId);

        // 2) 👉 Toujours finish (idempotence côté serveur: "ok" ou "already")
        try { tx.finish && await tx.finish(); } catch (_) {}
        FINISHED_TX.add(txId);

        // 3) Nettoyage si crédit effectif
        if (credited) removePending(txId);

        ev('v13:finish:always', { productId, txId, credited });

        IN_FLIGHT_TX.delete(txId);
        ev('v13:approved', { productId, credited });
      });
    }
    if (S.when && S.when().finished) {
      S.when().finished(p => ev('v13:finished', p?.id || p?.productId));
    }

    // ---- REGISTER → await INITIALIZE → await UPDATE ----
    try {
      const regs = PRODUCTS.map(p => ({
        id: p.id,
        type: (p.type === 'NON_CONSUMABLE'
          ? (S.ProductType?.NON_CONSUMABLE || CdvPurchase.ProductType.NON_CONSUMABLE)
          : (S.ProductType?.CONSUMABLE     || CdvPurchase.ProductType.CONSUMABLE)),
        platform: (S.Platform?.GOOGLE_PLAY || CdvPurchase.Platform.GOOGLE_PLAY)
      }));
      S.register && S.register(regs);
      ev('v13:register', regs.map(x => x.id));
    } catch (e) { warn('register error', e?.message || e); ev('v13:registerErr', e?.message || e); }

    try {
      if (S.initialize) { await S.initialize([ (S.Platform?.GOOGLE_PLAY || CdvPurchase.Platform.GOOGLE_PLAY) ]); ev('v13:initialize'); }
    } catch (e) { warn('initialize error', e?.message || e); ev('v13:initializeErr', e?.message || e); }

    try {
      if (S.update) { await S.update(); ev('v13:update'); }
      else if (S.refresh) { await S.refresh(); ev('v13:refresh'); }
      setTimeout(async () => {
        try { S.update && (await S.update()); ev('v13:update+1s'); } catch (e) { warn('update+1s err', e?.message || e); }
      }, 1000);
    } catch (e) { warn('first sync err', e?.message || e); ev('v13:firstSyncErr', e?.message || e); }

    // READY
    if (S.ready) {
      S.ready(async () => {
        STORE_READY = true; window.__IAP_READY__ = true; window.IAPDiag.storeReady = true; ev('v13:ready');
        try {
          PRODUCTS.forEach(({ id }) => {
            const p = getProduct(S, id, (S.Platform || {}));
            const price = p?.pricing?.price || p?.price || p?.pricing?.priceString;
            if (price) PRICES_BY_ID[id] = price;
            if (p?.owned && id === 'nopub') { localStorage.setItem('no_ads','1'); if (window.setNoAds) window.setNoAds(true); }
          });
        } catch (_) {}
        refreshDisplayedPrices();

        try { await replayLocalPending(); } catch (_) {}

        try { S.update && (await S.update()); ev('v13:update+ready'); } catch (_) {}
      });
    }

    document.addEventListener('resume', async () => {
      try {
        if (S.update) { await S.update(); ev('app:resume:update'); }
        else if (S.refresh) { await S.refresh(); ev('app:resume:refresh'); }
      } catch (e) { warn('resume sync err', e?.message || e); }
      try { await replayLocalPending(); } catch (_) {}
    });

    // Achat (INAPP ou SUBS)
    window.buyProduct = async function (productId) {
      try {
        ev('buy:click', productId);

        const session = await ensureAuthStrict();
        if (!session) return;

        if (!STORE_READY) {
          try { S.update && await S.update(); ev('buy:preUpdate'); }
          catch (e) { warn('buy preUpdate err', e?.message || e); }
        }

        const product = await waitForProduct(S, productId, (S.Platform || CdvPurchase.Platform), 12000);
        if (!product) { ev('buy:notFound', productId); return; }

        const price = product?.pricing?.price || product?.price || product?.pricing?.priceString;
        if (price) { PRICES_BY_ID[productId] = price; refreshDisplayedPrices(); }

        const offer = (product.getOffer && product.getOffer()) || await waitForOffer(S, product, 12000);

        let err = null;
        if (offer && offer.order)     { ev('buy:order:SUBS', productId);   err = await offer.order(); }
        else if (product.order)       { ev('buy:order:INAPP', productId);  err = await product.order(); }
        else { ev('buy:order:unsupported', productId); return; }

        if (err && err.isError) {
          ev('buy:error', { code: err.code, msg: err.message });

          // 🎯 Rattrapage "déjà possédé" (6777003) → rejouer approved via update() + restore
          if (String(err.code) === '6777003' || /already/i.test(err.message || '')) {
            try {
              S.update && await S.update();
              if (window.restorePurchases) await window.restorePurchases();
              ev('recover:owned:restore');
            } catch(_) {}
          }
        } else {
          ev('buy:launched', productId);
        }
      } catch (e) {
        window.IAPDiag.lastError = e;
        ev('buy:exception', e?.message || e);
      }
    };
    window.safeOrder = window.buyProduct;
  }

  // ----------- Démarrage robuste (multi-pages) -----------
  function startWhenReady() {
    const fire = () => { try { start(); } catch (e) { error(e); ev('start:exception', e?.message || e); } };

    const already =
      (window.cordova && (
        (window.cordova.deviceready && window.cordova.deviceready.fired) ||
        (window.channel && window.channel.onCordovaReady && window.channel.onCordovaReady.fired)
      )) ||
      window._cordovaReady === true;

    if (already) {
      ev('deviceready:already');
      fire();
    } else {
      document.addEventListener('deviceready', function onDR() {
        window._cordovaReady = true;
        ev('deviceready:fired');
        fire();
      }, { once: true });

      setTimeout(() => {
        const readyNow = (window.cordova?.deviceready?.fired) || window._cordovaReady === true;
        if (readyNow) { ev('deviceready:fallback'); fire(); }
      }, 1200);
    }
  }
  startWhenReady();

  // ----------- Failsafe additionnel -----------
  setTimeout(() => {
    if (!window.__IAP_READY__) {
      ev('failsafe:retryStartWhenReady');
      try { startWhenReady(); } catch (e) { ev('failsafe:exception', e?.message || e); }
    }
  }, 2000);

  // ----------- API utilitaires -----------
  window.restorePurchases = async function restorePurchases() {
    try {
      await replayLocalPending(); // crédite ce qui a raté (idempotent)
      const { S } = getApi();
      if (S && S.update) await S.update(); // déclenche approved → finish() pour les pendings
      ev('restore:done');
    } catch (e) {
      warn('restorePurchases err', e?.message || e);
    }
  };

  // Recrédit manuel "legacy" si tu as les tokens d’anciens achats consommés
  window.forceCredit = async function forceCredit(txId, productId) {
    try {
      if (!txId || !productId) { warn('forceCredit: missing txId/productId'); return false; }
      const ok = await creditUser({ id: productId }, String(txId));
      if (ok) { ev('forceCredit:ok', { txId, productId }); }
      else    { ev('forceCredit:ko', { txId, productId }); }
      return ok;
    } catch (e) { warn('forceCredit err', e?.message || e); return false; }
  };
  window.bulkForceCredit = async function bulkForceCredit(list) {
    try {
      let okCount = 0;
      for (const it of (list||[])) {
        // eslint-disable-next-line no-await-in-loop
        if (await window.forceCredit(it.txId, it.productId)) okCount++;
      }
      ev('bulkForceCredit:done', { total: (list||[]).length, ok: okCount });
      return okCount;
    } catch (e) { warn('bulkForceCredit err', e?.message || e); return 0; }
  };

  // ----------- Debug helpers -----------
  window.IAPDump = function IAPDump() {
    try {
      const { kind, S } = getApi();
      const arr = [];
      PRODUCTS.forEach(({ id }) => {
        const p = (kind === 'v13') ? getProduct(S, id, (S.Platform || {})) : (S && S.get && S.get(id));
        arr.push({ id, price: PRICES_BY_ID[id] || p?.price || p?.pricing?.priceString, state: p?.state, owned: !!p?.owned });
      });
      console.log(TAG, 'DUMP', { kind, ready: STORE_READY, products: arr, diag: window.IAPDiag });
      return arr;
    } catch (e) {
      console.error(TAG, 'DUMP error', e);
      return [];
    }
  };
  window.IAPList   = () => window.IAPDump();
  window.IAPStatus = () => ({ ready: STORE_READY, diag: window.IAPDiag });

})();

// Petit bloc de preuve (facultatif) pour vérifier la connectivité Supabase / RPC
if (true && typeof DEBUG !== 'undefined' && DEBUG) {
  setTimeout(async () => {
    try {
      const url = sb?.rest?.url;
      const { data: { session } } = await sb.auth.getSession();
      console.log('[PROOF] url=', url, 'uid=', session?.user?.id || null);

      const r1 = await sb.from('iap_products').select('product_id').limit(1);
      console.log('[PROOF] iap_products -> data:', r1.data, 'error:', r1.error);

      const r2 = await sb.rpc('iap_credit_once', {
        p_tx_id: 'proof-' + Date.now(),
        p_product_id: '__does_not_exist__'
      });
      console.log('[PROOF] rpc -> data:', r2.data, 'error:', r2.error);
    } catch (e) {
      console.log('[PROOF] exception', e?.message || e);
    }
  }, 1500);
}
