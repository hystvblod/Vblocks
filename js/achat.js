/* global CdvPurchase, sb */
'use strict';

/**
 * achat.js — Cordova Purchase v13 (Google Play)
 * Crédit côté client comme les pubs (mêmes RPC) :
 *   - points  → sb.rpc('secure_add_points', { p_user_id, p_amount, p_product })
 *   - jetons  → sb.rpc('secure_add_jetons', { p_user_id, p_amount, p_product })
 *   - nopub   → sb.rpc('secure_set_nopub', { p_user_id, p_product })
 * Dédoublonnage local par purchaseToken (ou fallback), finish() systématique.
 */

(function () {
  const TAG    = '[IAP]';
  const DEBUG  = true;
  const SILENT = true;

  const log   = (...a) => { if (DEBUG) console.log(TAG, ...a); };
  const warn  = (...a) => { if (DEBUG) console.warn(TAG, ...a); };
  const error = (...a) => { console.error(TAG, ...a); };

  // ---------- SKUs → action (ajuste montants ici) ----------
  const SKU = {
    points3000:  { kind: 'points', amount: 5000 },
    points10000: { kind: 'points', amount: 12000 },
    jetons12:    { kind: 'jetons', amount: 12 },
    jetons50:    { kind: 'jetons', amount: 50 },
    nopub:       { kind: 'nopub' }
  };

  // ---------- État local ----------
  const PRICES_BY_ID = Object.create(null);
  const IN_FLIGHT_TX = new Set();
  const FINISHED_TX  = new Set();
  const NOTIFIED_TX  = new Set();

  const PENDING_KEY  = 'iap_pending_v2';   // [{txId, productId, ts}]
  const CREDITED_KEY = 'iap_credited_v1';  // [txId] — anti double-crédit local
  let STORE_READY    = false;

  const readJson  = (k, d=[]) => { try { return JSON.parse(localStorage.getItem(k)||'null') ?? d; } catch(_) { return d; } };
  const writeJson = (k, v)    => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){} };

  function addPending(txId, productId) {
    if (!txId) return;
    const L = readJson(PENDING_KEY, []);
    if (!L.find(x => x.txId === txId)) { L.push({ txId, productId, ts: Date.now() }); writeJson(PENDING_KEY, L.slice(-50)); }
  }
  function removePending(txId) {
    if (!txId) return;
    writeJson(PENDING_KEY, readJson(PENDING_KEY, []).filter(x => x.txId !== txId));
  }
  function isCredited(txId) {
    if (!txId) return false;
    const L = readJson(CREDITED_KEY, []);
    return L.includes(txId);
  }
  function markCredited(txId) {
    if (!txId) return;
    const L = readJson(CREDITED_KEY, []);
    if (!L.includes(txId)) { L.push(txId); writeJson(CREDITED_KEY, L.slice(-200)); }
  }

  // ---------- UI helpers (silencieux) ----------
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

  // ---------- parse JSON / base64 JSON ----------
  function parseMaybeBase64Json(s) {
    if (!s || typeof s !== 'string') return null;
    try { return JSON.parse(s); } catch(_) {}
    try { return JSON.parse(atob(s)); } catch(_) {}
    return null;
  }

  // ---------- CHANGEMENT: petit hash pour fallback txId ----------
  function simpleHash(str) {
    let h = 5381, i = str.length;
    while (i) h = (h * 33) ^ str.charCodeAt(--i);
    return (h >>> 0).toString(16);
  }

  // ---------- extraction token Android 13 & co ----------
  function getPurchaseToken(tx) {
    try { if (tx?.transaction?.purchaseToken) return tx.transaction.purchaseToken; } catch(_){}
    try {
      const rec = tx?.transaction?.receipt || tx?.receipt;
      const r   = typeof rec === 'string' ? parseMaybeBase64Json(rec) : rec;
      if (r?.purchaseToken) return r.purchaseToken;
      if (r?.payload) {
        const p = typeof r.payload === 'string' ? parseMaybeBase64Json(r.payload) : r.payload;
        if (p?.purchaseToken) return p.purchaseToken;
      }
    } catch(_){}
    return tx?.purchaseToken
        || tx?.androidPurchaseToken
        || tx?.transactionId
        || tx?.orderId
        || tx?.id
        || null;
  }

  // ---------- extraction productId robuste ----------
// ---------- extraction productId robuste ----------
function getProductIdFromTx(tx, p) {
  let pid =
    tx?.products?.[0]?.id      // v13: source la plus fiable
    || p?.id
    || tx?.productIds?.[0]
    || tx?.transaction?.productIds?.[0]
    || tx?.productId
    || tx?.sku
    || tx?.transaction?.productId
    || tx?.transaction?.lineItems?.[0]?.productId
    || null;

  if (!pid) {
    const rec = tx?.transaction?.receipt || tx?.receipt;
    const r   = typeof rec === 'string' ? parseMaybeBase64Json(rec) : rec;
    if (Array.isArray(r?.productIds) && r.productIds[0]) pid = r.productIds[0];
    else if (r?.productId) pid = r.productId;
    else if (r?.payload) {
      const pld = typeof r.payload === 'string' ? parseMaybeBase64Json(r.payload) : r.payload;
      pid = pld?.productId || pld?.product_id ||
            (Array.isArray(pld?.productIds) && pld.productIds[0]) || pid;
    }
  }
  return pid || null;
}


  // ---------- CHANGEMENT: Auth “comme pubs” ----------
  // On lit d'abord getUser() (comme pub.js), puis on tombe en secours sur session/refresh/anon.
// utilise le même chemin que pub.js
async function ensureAuthStrict() {
  try {
    // verrou anti-rafales + anonymat si besoin (déjà fait côté pubs)
    if (window.userData?.ensureAuth) await window.userData.ensureAuth();
    // récupère l'UID stabilisé
    if (window.userData?.getAuthUserId) {
      const uid = await window.userData.getAuthUserId();
      if (uid) return uid;
    }
    // filet de sécurité si jamais
    const { data: { user } } = await sb.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}


  // =========================
  //   CRÉDIT CLIENT (mêmes RPC que pub.js)
  // =========================
  async function addPointsClientSide(userId, amount, sku) {
    const { data, error } = await sb.rpc('secure_add_points', {
      p_user_id: userId,
      p_amount: Number(amount || 0),
      p_product: `iap:${sku}`
    });
    if (error) throw new Error(error.message || 'secure_add_points failed');
    return data;
  }
  async function addJetonsClientSide(userId, amount, sku) {
    const { data, error } = await sb.rpc('secure_add_jetons', {
      p_user_id: userId,
      p_amount: Number(amount || 0),
      p_product: `iap:${sku}`
    });
    if (error) throw new Error(error.message || 'secure_add_jetons failed');
    return data;
  }

  // Toggle pub (true/false) via RPC sécurisée
  async function setNoAdsEnabled(enabled) {
    const uid = await ensureAuthStrict(); // <- lit getUser() d’abord
    if (!uid) throw new Error('no_session');

    const { error: rpcErr } = await sb.rpc('secure_set_nopub', {
      p_user_id: uid,
      p_product: enabled ? 'iap:nopub' : 'iap:nopub_off'
    });
    if (rpcErr) throw rpcErr;

    try {
      localStorage.setItem('no_ads', enabled ? '1' : '0');
      if (typeof window.setNoAds === 'function') window.setNoAds(!!enabled);
    } catch(_){}
    return true;
  }

  // Crédit en fonction du produit (points/jetons/nopub)
async function creditByProductClientSide(productId, txId) {
  const cfg = SKU[productId];
  if (!cfg) throw new Error('unknown_sku');

  // Log diag + verrou d'auth
  const uid = await ensureAuthStrict();
  log('[IAP] uid=', uid, 'productId=', productId, 'txId=', txId);
  if (!uid) throw new Error('no_session');

  if (cfg.kind === 'points')      await addPointsClientSide(uid, cfg.amount, productId);
  else if (cfg.kind === 'jetons') await addJetonsClientSide(uid, cfg.amount, productId);
  else if (cfg.kind === 'nopub')  await setNoAdsEnabled(true);
  else throw new Error('unknown_kind');

  if (txId) markCredited(txId);
  return true;
}


  async function replayLocalPending() {
    const pendings = readJson(PENDING_KEY, []);
    if (!pendings.length) return;
    for (const it of pendings.slice()) {
      try {
        if (isCredited(it.txId)) { removePending(it.txId); continue; }
        await creditByProductClientSide(it.productId, it.txId);
        removePending(it.txId);
      } catch (e) {
        warn('pending replay KO', it.txId, e?.message||e);
      }
    }
  }

  // =========================
  //   STORE V13
  // =========================
  function getApi() {
    if (window.CdvPurchase?.store) return { kind: 'v13', S: window.CdvPurchase.store };
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

  async function start() {
    const { S } = getApi();
    if (!S) {
      // réessaie tant que le plugin n’est pas prêt
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        const g = getApi();
        if (g.S) { clearInterval(timer); start(); }
        if (tries > 60) clearInterval(timer);
      }, 600);
      return;
    }

    // Errors
    S.error && S.error(err => {
      error('Store error:', err?.code, err?.message || err);
    });

    // Produits mis à jour → prix + marquer nopub local si owned
    const onProductUpdate = p => {
      const price = p?.pricing?.price || p?.price || p?.pricing?.priceString;
      if (p?.id && price) { PRICES_BY_ID[p.id] = price; refreshDisplayedPrices(); }
      if (p?.owned && p.id === 'nopub') {
        try { localStorage.setItem('no_ads','1'); if (window.setNoAds) window.setNoAds(true); } catch(_) {}
      }
      if (DEBUG) log('productUpdated', { id: p?.id, owned: !!p?.owned, state: p?.state, price });
    };
    if (S.productUpdated) S.productUpdated(onProductUpdate);
    else if (S.when?.().productUpdated) S.when().productUpdated(onProductUpdate);

    // Transactions approuvées
// --- Transactions approuvées (REMPLACE CE BLOC ENTIER) ---
if (S.when?.().approved) {
  S.when().approved(async (tx) => {
    // 1) Token unique
    let txId = getPurchaseToken(tx);
    if (!txId) {
      txId = 'fallback:' + (tx?.orderId || tx?.transactionId || simpleHash(JSON.stringify(tx) || String(Date.now())));
      if (DEBUG) log('[approved] no purchaseToken, fallback txId =', txId);
    }

    // 2) SKU v13 + fallbacks
    const productId = getProductIdFromTx(tx) || tx?.lineItems?.[0]?.productId || tx?.productId || null;
    log('[approved]', { txId, pidFromTx: tx?.products?.[0]?.id, productId });

    // 3) SANS SKU → NE PAS finish(), on laisse rejouer
    if (!productId) {
      addPending(txId, 'unknown');
      try { S?.update && await S.update(); } catch (_) {}
      return;
    }

    // 4) Déjà traité / en cours ?
    if (FINISHED_TX.has(txId)) { try { await tx.finish(); } catch(_){} return; }
    if (IN_FLIGHT_TX.has(txId)) return;
    IN_FLIGHT_TX.add(txId);

    if (isCredited(txId)) {
      try { await tx.finish(); } catch(_) {}
      FINISHED_TX.add(txId);
      IN_FLIGHT_TX.delete(txId);
      return;
    }

    // 5) Crédit + finish uniquement si OK
    addPending(txId, productId);
    try {
      await creditByProductClientSide(productId, txId);
      markCredited(txId);
      removePending(txId);

      try { await tx.finish(); } catch(_) {}
      FINISHED_TX.add(txId);
    } catch (e) {
      warn('credit fail', productId, e?.message || e);
      // IMPORTANT: pas de finish() si le crédit échoue → la TX reste rejouable
      return;
    } finally {
      IN_FLIGHT_TX.delete(txId);
    }
  });
}


    // REGISTER → INITIALIZE → UPDATE
    try {
      const regs = Object.keys(SKU).map(id => ({
        id,
        type: (id === 'nopub'
          ? (S.ProductType?.NON_CONSUMABLE || CdvPurchase.ProductType.NON_CONSUMABLE)
          : (S.ProductType?.CONSUMABLE     || CdvPurchase.ProductType.CONSUMABLE)),
        platform: (S.Platform?.GOOGLE_PLAY || CdvPurchase.Platform.GOOGLE_PLAY)
      }));
      S.register && S.register(regs);
      if (DEBUG) log('register', regs.map(r => r.id));
    } catch(e) { warn('register err', e?.message||e); }

    try { S.initialize && await S.initialize([ S.Platform?.GOOGLE_PLAY || CdvPurchase.Platform.GOOGLE_PLAY ]); if (DEBUG) log('initialize'); } catch(e){ warn('init err', e?.message||e); }
    try { S.update ? await S.update() : (S.refresh && await S.refresh()); if (DEBUG) log('first sync'); } catch(e){ warn('first sync err', e?.message||e); }

    // READY
    if (S.ready) {
       try { if (window.userData?.ensureAuth) await window.userData.ensureAuth(); } catch(_) {}
      S.ready(async () => {
        STORE_READY = true;
        try {
          Object.keys(SKU).forEach(id => {
            const p = S.get ? S.get(id, S.Platform?.GOOGLE_PLAY) : (S.products?.byId?.[id]);
            const price = p?.pricing?.price || p?.price || p?.pricing?.priceString;
            if (price) PRICES_BY_ID[id] = price;
            if (p?.owned && id === 'nopub') { try { localStorage.setItem('no_ads','1'); if (window.setNoAds) window.setNoAds(true); } catch(_) {} }
          });
          refreshDisplayedPrices();
        } catch(_){}

        try { await replayLocalPending(); } catch(_){}
        try { S.update && await S.update(); } catch(_){}
      });
    }

    // Resync au resume + rejouer pendings
document.addEventListener('resume', async () => {
  try { if (window.userData?.ensureAuth) await window.userData.ensureAuth(); } catch(_){}
  try { S.update ? await S.update() : (S.refresh && await S.refresh()); } catch(_){}
  try { await replayLocalPending(); } catch(_){}
});

  }

  // ---------- Démarrage quand prêt ----------
  function startWhenReady() {
    const fire = () => { try { start(); } catch (e) { error('start', e?.message||e); } };
    const already =
      (window.cordova && (
        (window.cordova.deviceready && window.cordova.deviceready.fired) ||
        (window.channel && window.channel.onCordovaReady && window.channel.onCordovaReady.fired)
      )) ||
      window._cordovaReady === true;

    if (already) fire();
    else {
      document.addEventListener('deviceready', function onDR() {
        window._cordovaReady = true; fire();
      }, { once: true });
      setTimeout(() => { if (window.cordova?.deviceready?.fired || window._cordovaReady) fire(); }, 1200);
    }
  }
  startWhenReady();

  // ---------- API utilitaires exportées ----------
 window.restorePurchases = async function () {
  try {
    // PRE-AUTH — comme pubs
    try { if (window.userData?.ensureAuth) await window.userData.ensureAuth(); } catch(_){}
    await replayLocalPending();
    const { S } = getApi();
    if (S?.update) await S.update();
  } catch(_) {}
};


  // Achat manuel (si tu veux l’appeler depuis l’UI)
  window.buyProduct = async function (productId) {
    try {
   try { await ensureAuthStrict(); } catch(_) {}

      const { S } = getApi();
      if (!S) return;
      if (!STORE_READY) { try { S.update && await S.update(); } catch(_){ } }

      const p = S.get ? S.get(productId, S.Platform?.GOOGLE_PLAY) : (S.products?.byId?.[productId]);
      if (!p) { try { S.update && await S.update(); } catch(_){ } }

      const offer = p?.getOffer && p.getOffer();
      let err = null;
      if (offer?.order) err = await offer.order();
      else if (p?.order) err = await p.order();

      if (err?.isError && DEBUG) warn('order err', err.code, err.message);
    } catch(e) {
      warn('buy exception', e?.message||e);
    }
  };
  window.safeOrder = window.buyProduct;

  // Toggle publicitaire dispo côté app/UI
  //   - true  => active "nopub"
  //   - false => désactive "nopub"
  window.setNoAdsEnabled = setNoAdsEnabled;

})();
