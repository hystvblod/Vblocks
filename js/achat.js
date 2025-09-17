/* global CdvPurchase, sb */
'use strict';

/**
 * achat.js — Cordova Purchase v13 (Google Play)
 * - Handlers branchés AVANT initialize (crucial)
 * - register → initialize (await) → update (await)
 * - approved → ensure_user → iap_credit_once (idempotent) → finish()
 * - replay pending + recover des achats "owned"
 * - SILENT: logs console uniquement
 */

(function () {
  const TAG    = '[IAP]';
  const DEBUG  = true;      // logs console détaillés
  const SILENT = true;      // pas de popup
  const DEV_FORCE_FINISH = false; // on ne force pas le finish si crédit KO (prod)

  // Garde V3 + signature de build
  if (window.__IAP_INITTED_V3__) { console.log(TAG, 'skip (already)'); return; }
  window.__IAP_INITTED_V3__ = true;
  console.log(TAG, 'build=2025-09-16-v3+receipts+telemetry+authflush+fixproof');

  const t0 = Date.now();
  const log   = (...a) => { if (DEBUG) console.log(TAG, ...a); };
  const warn  = (...a) => { if (DEBUG) console.warn(TAG, ...a); };
  const error = (...a) => { console.error(TAG, ...a); };

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
  const PENDING_KEY  = 'iap_pending_v2';

  let STORE_READY = false;
  let started     = false;
  let retryTimer  = null;
  let AUTH_READY  = false;

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
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') || []; }
    catch (_) { return []; }
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
    writePending(readPending().filter(x => x.txId !== txId));
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

  // ----------- Télémétrie DB (optionnelle, silencieuse) -----------
  async function logDb(tag, payload) {
    try {
      if (!window.sb?.rpc) return;
      await sb.rpc('iap_js_log', { p_tag: String(tag), p_payload: payload ?? null });
    } catch (_) {
      try {
        await sb.from('iap_rpc_log').insert({
          source: 'js',
          tag: String(tag).slice(0, 64),
          payload: payload ?? null
        });
      } catch (_) { /* ignore */ }
    }
  }

  // ----------- AUTH stricte + retries + flush pending à l'auth -----------
  async function ensureAuthStrict(retries = 6, delayMs = 300) {
    if (!window.sb?.auth) return null;
    try {
      // session actuelle ?
      let { data: { session } } = await sb.auth.getSession();
      if (session?.user?.id) { AUTH_READY = true; return session; }

      // tentative sign-in anonyme
      if (typeof sb.auth.signInAnonymously === 'function') {
        const r = await sb.auth.signInAnonymously();
        if (r?.data?.session?.user?.id) { AUTH_READY = true; return r.data.session; }
      }

      // retries exponentiels
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delayMs));
        return ensureAuthStrict(retries - 1, Math.min(Math.floor(delayMs * 1.6), 1500));
      }

      warn('[AUTH] pas de session après retries');
      return null;
    } catch (e) {
      warn('[AUTH] ensureAuthStrict', e?.message || e);
      return null;
    }
  }

  try {
    if (window.sb?.auth?.onAuthStateChange) {
      sb.auth.onAuthStateChange(async (_evt, session) => {
        const wasReady = AUTH_READY;
        AUTH_READY = !!(session && session.user && session.user.id);
        ev('auth:state', { ready: AUTH_READY });
        if (AUTH_READY && !wasReady) {
          try {
            await replayLocalPending();
            const { S } = getApi();
            if (S?.update) await S.update();
            ev('auth:flushPending');
          } catch (e) {
            warn('auth flush err', e?.message || e);
          }
        }
      });
    }
  } catch (e) { /* noop */ }

  // ----------- parse JSON / base64 JSON -----------
  function parseMaybeBase64Json(s) {
    if (!s || typeof s !== 'string') return null;
    try { return JSON.parse(s); } catch (_) {}
    try { return JSON.parse(atob(s)); } catch (_) {}
    return null;
  }

  // ----------- extraction token Android -----------
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

  // ----------- CREDIT → RPC serveur -----------
  const okStatus = s => ['ok','already','credited','done'].includes(String(s||'').toLowerCase());
  async function creditUser(found, txId) {
    try {
      if (!found || !window.sb) return false;

      const session = await ensureAuthStrict();
      if (!session) { ev('creditUser:noSession'); return false; }

      try { await sb.auth.refreshSession(); } catch (_) {}

      // garantir la ligne applicative
      try {
        const { error: euErr } = await sb.rpc('ensure_user', { default_lang: 'fr', default_pseudo: '' });
        if (euErr) ev('ensure_user:err', euErr.message || String(euErr));
        else       ev('ensure_user:ok');
      } catch (e) { ev('ensure_user:exception', e?.message || e); }

      const productId = found.id;

      await logDb('rpc:iap_credit_once:try', { txId, productId });

      const tRpc = performance.now();
      const { data: rpcData, error: rpcErr, status: httpStatus, statusText } =
        await sb.rpc('iap_credit_once', { p_tx_id: String(txId), p_product_id: String(productId) });
      console.log(TAG, 'RPC iap_credit_once →', { httpStatus, statusText, rpcData, rpcErr, txId, productId });

      if (rpcErr) {
        error('iap_credit_once error', rpcErr.message || String(rpcErr));
        ev('creditUser:serverError', { productId, txId, err: rpcErr?.message, httpStatus });
        await logDb('rpc:iap_credit_once:res', { txId, productId, ok: false, httpStatus, msg: rpcErr?.message || null });
        return false;
      }
      if (!okStatus(rpcData?.status)) {
        ev('creditUser:unexpectedStatus', { productId, txId, rpcData, httpStatus });
        await logDb('rpc:iap_credit_once:res', { txId, productId, ok: false, httpStatus, status: rpcData?.status || null });
        return false;
      }

      if (productId === 'nopub') {
        try {
          localStorage.setItem('no_ads', '1');
          if (window.setNoAds) window.setNoAds(true);
        } catch (_) {}
      }

      ev('creditUser:serverOK', { productId, txId, status: rpcData.status, ms: Math.round(performance.now()-tRpc) });
      await logDb('rpc:iap_credit_once:res', { txId, productId, ok: true, status: rpcData?.status || 'ok' });
      return true;
    } catch (e) {
      error('creditUser exception', e);
      ev('creditUser:serverException', e?.message || e);
      await logDb('rpc:iap_credit_once:res', { txId, productId: found?.id || null, ok: false, exception: e?.message || String(e) });
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

  // ----------- Recover "already owned" -----------
  let _recoveringOwned = false;
  async function recoverOwned(reason) {
    if (_recoveringOwned) return;
    _recoveringOwned = true;
    ev('recover:start', reason);
    const { S } = getApi();
    for (let i = 0; i < 8; i++) {
      try { if (S?.update) await S.update(); } catch(_){}
      await new Promise(r => setTimeout(r, 900));
      const ok = window.IAPDiag.lastEvents.slice(-30).some(e => e.name === 'v13:approved');
      if (ok) break;
    }
    _recoveringOwned = false;
  }

  // ----------- Rejouer crédits en attente (localStorage) -----------
  async function replayLocalPending() {
    const pendings = readPending();
    if (!pendings.length) return;
    ev('pending:replay:start', pendings.length);
    await logDb('pending:replay', { count: pendings.length });

    let anyCredited = false;
    for (const item of pendings.slice()) {
      try {
        const found = PRODUCTS.find(x => x.id === item.productId) || { id: item.productId };
        // eslint-disable-next-line no-await-in-loop
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

  // ----------- INITIALISATION -----------
  async function start() {
    if (started) return;

    // Assure une session SUPABASE au boot (avec retries)
    await ensureAuthStrict();
    try {
      const { error: euBootErr } = await sb.rpc('ensure_user', { default_lang: 'fr', default_pseudo: '' });
      if (euBootErr) ev('ensure_user:bootErr', euBootErr.message || String(euBootErr));
      else           ev('ensure_user:bootOK');
    } catch (e) { ev('ensure_user:bootException', e?.message || e); }

    ev('auth:bootstrapped');

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

    try { if (window.CdvPurchase?.log) CdvPurchase.log.level = CdvPurchase.LogLevel.WARN; } catch (_) {}

    // -------- Handlers AVANT l'init (CRUCIAL) --------
    // Errors
    if (S.error) S.error(async err => {
      window.IAPDiag.lastError = err;
      error('Store error:', err && (err.code || ''), err && (err.message || err));
      ev('v13:error', { code: err?.code, msg: err?.message });
      if (Number(err?.code) === 6777003) { // ITEM_ALREADY_OWNED
        ev('auto:recover:onItemAlreadyOwned');
        await recoverOwned('ITEM_ALREADY_OWNED');
      }
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
            if (p?.owned && id === 'nopub') { localStorage.setItem('no_ads','1'); if (window.setNoAds) window.setNoAds(true); }
          });
          refreshDisplayedPrices();
          ev('v13:updated:scan');
        } catch (e) { warn('updated scan err', e?.message || e); }
      });
    }

    // NEW: receiptsReady hook
    if (S.when && S.when().receiptsReady) {
      S.when().receiptsReady(async () => {
        ev('v13:receiptsReady');
        try { S.update && await S.update(); } catch(_) {}
        await recoverOwned('receiptsReady');
      });
    }

    // Transactions – approved/finished AVANT l'init
    if (S.when && S.when().approved) {
      S.when().approved(async tx => {
        const productId = getProductIdFromTx(tx);
        const txId      = getPurchaseToken(tx);

        try {
          console.log(TAG, 'TX RAW =>', {
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

        await logDb('approved:pre', { productId, txId });

        const found = PRODUCTS.find(x => x.id === productId) || { id: productId };
        let credited = await creditUser(found, txId);

        try {
          if (credited) {
            try { tx.finish && tx.finish(); } catch (_) {}
            FINISHED_TX.add(txId);
            removePending(txId);
            ev('v13:finish:ok', { productId, txId });
          } else if (DEV_FORCE_FINISH && productId !== 'nopub') {
            addPending(txId, productId);
            try { tx.finish && tx.finish(); } catch (_) {}
            FINISHED_TX.add(txId);
            ev('v13:finish:forced', { productId, txId });
          } else {
            addPending(txId, productId);
            ev('v13:finish:skipped', { productId, txId });
          }
        } catch (e) {
          warn('finish err', e?.message || e);
        } finally {
          IN_FLIGHT_TX.delete(txId);
          ev('v13:approved', { productId, credited });
          await logDb('approved:post', { productId, txId, credited });
        }
      });
    }
    if (S.when && S.when().finished) {
      S.when().finished(p => ev('v13:finished', p?.id || p?.productId));
    }

    // -------- register → initialize (await) → update (await) --------
    try {
      const regs = PRODUCTS.map(p => ({
        id: p.id,
        type: (p.type === 'NON_CONSUMABLE')
          ? (S.ProductType||CdvPurchase.ProductType).NON_CONSUMABLE
          : (S.ProductType||CdvPurchase.ProductType).CONSUMABLE,
        platform: (S.Platform||CdvPurchase.Platform).GOOGLE_PLAY
      }));
      if (S.register) S.register(regs);
      ev('v13:register', regs.map(x => x.id));
    } catch (e) { warn('register error', e?.message || e); ev('v13:registerErr', e?.message || e); }

    try {
      if (S.initialize) { await S.initialize([ (S.Platform||CdvPurchase.Platform).GOOGLE_PLAY ]); ev('v13:initialize'); }
    } catch (e) { warn('initialize error', e?.message || e); ev('v13:initializeErr', e?.message || e); }

    try {
      if (S.update) { await S.update(); ev('v13:update'); }
      else if (S.refresh) { await S.refresh(); ev('v13:refresh'); }
    } catch (e) {
      warn('first sync err', e?.message || e);
      ev('v13:firstSyncErr', e?.message || e);
    }
    try {
      setTimeout(() => {
        try { S.update && S.update(); ev('v13:update+1s'); }
        catch (e) { warn('update+1s err', e?.message || e); }
      }, 1000);
    } catch (_) {}

    // ready → synchros + replay + recover
    if (S.ready) {
      S.ready(async () => {
        STORE_READY = true; window.__IAP_READY__ = true; window.IAPDiag.storeReady = true; ev('v13:ready');
        try {
          PRODUCTS.forEach(({ id }) => {
            const p = getProduct(S, id, (S.Platform||{}));
            const price = p?.pricing?.price || p?.price || p?.pricing?.priceString;
            if (price) PRICES_BY_ID[id] = price;
            if (p?.owned && id === 'nopub') { localStorage.setItem('no_ads','1'); if (window.setNoAds) window.setNoAds(true); }
          });
        } catch (_) {}
        refreshDisplayedPrices();

        try { await replayLocalPending(); } catch (_) {}

        try { S.update && (await S.update()); ev('v13:update+ready'); } catch (_) {}
        await recoverOwned('onReady');
        setTimeout(() => { recoverOwned('onReady+2s'); }, 2000);
      });
    }

    // resume → resync + replay
    document.addEventListener('resume', async () => {
      const { S } = getApi();
      try { S.update ? (await S.update(), ev('app:resume:update')) : (S.refresh && (await S.refresh(), ev('app:resume:refresh'))); }
      catch (e) { warn('resume sync err', e?.message || e); }
      try { await replayLocalPending(); } catch (_) {}
    });

    // Achat (INAPP ou SUBS)
    window.buyProduct = async function (productId) {
      try {
        ev('buy:click', productId);

        const session = await ensureAuthStrict();
        if (!session) return;

        const { S } = getApi();
        if (!STORE_READY) {
          try { S.update && await S.update(); ev('buy:preUpdate'); }
          catch (e) { warn('buy preUpdate err', e?.message || e); }
        }

        const product = await waitForProduct(S, productId, (S.Platform||CdvPurchase.Platform), 12000);
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
          if (Number(err.code) === 6777003) {
            await recoverOwned('order:ITEM_ALREADY_OWNED');
          }
          return;
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

  // Démarrage robuste (multi-pages)
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

  // Failsafe additionnel
  setTimeout(() => {
    if (!window.__IAP_READY__) {
      ev('failsafe:retryStartWhenReady');
      try { startWhenReady(); } catch (e) { ev('failsafe:exception', e?.message || e); }
    }
  }, 2000);

  // API utilitaires
  window.restorePurchases = async function restorePurchases() {
    try {
      await replayLocalPending(); // crédite ce qui a raté (idempotent)
      const { S } = getApi();
      if (S && S.update) await S.update(); // déclenche approved → finish() pour les pendings
      await recoverOwned('manualRestore');
      ev('restore:done');
    } catch (e) {
      warn('restorePurchases err', e?.message || e);
    }
  };

  // Recrédit manuel "legacy"
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

  // Debug helpers
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

  // ----------- Proof (facultatif) — exécuté seulement en DEBUG -----------
  if (typeof DEBUG !== 'undefined' && DEBUG) {
    setTimeout(async () => {
      try {
        const url = sb?.rest?.url;
        const { data: { session } } = await sb.auth.getSession();
        console.log('[PROOF] url=', url, 'uid=', session?.user?.id || null);

        const r1 = await sb.from('iap_products').select('product_id').limit(1);
        console.log('[PROOF] iap_products -> data:', r1.data, 'error:', r1.error);

        const eu = await sb.rpc('ensure_user', { default_lang: 'fr', default_pseudo: '' });
        console.log('[PROOF] ensure_user ->', eu);

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

})();
