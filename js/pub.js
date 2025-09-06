// =============================
// PUB.JS — AdMob (Capacitor Community, no-import) — SANS SSV
// =============================
(function () {
  'use strict';

  // ------- Raccourcis globaux -------
  var Capacitor = (window.Capacitor || {});
  var AdMob = (Capacitor.Plugins && Capacitor.Plugins.AdMob) ? Capacitor.Plugins.AdMob : null;
  var App = (Capacitor.App) ? Capacitor.App
          : ((Capacitor.Plugins && Capacitor.Plugins.App) ? Capacitor.Plugins.App : null);

  // ------- STRICT PROD -------
  var __DEV_ADS__ = false;      // true pour tests locaux
  var SHOW_DIAG_PANEL = false;  // overlay debug (laisse false en prod)

  // --- Tes Ad Units réelles ---
  var AD_UNIT_ID_INTERSTITIEL = 'ca-app-pub-6837328794080297/9890831605';
  var AD_UNIT_ID_REWARDED     = 'ca-app-pub-6837328794080297/3006407791';

  // --- Réglages interstitiels ---
  var INTERSTITIEL_APRES_X_ACTIONS = 2; // pub AU DÉBUT de la 3ᵉ action
  var INTER_COOLDOWN_MS = 0; // anti-spam (0 = off)

  // --- Récompenses par défaut (affichage/UI) ---
  window.REWARD_JETONS = typeof window.REWARD_JETONS === 'number'  ? window.REWARD_JETONS : 1;
  window.REWARD_VCOINS = typeof window.REWARD_VCOINS === 'number'  ? window.REWARD_VCOINS : 300;
  window.REWARD_REVIVE = typeof window.REWARD_REVIVE === 'boolean' ? window.REWARD_REVIVE : true;

  // --- SSV désactivé (NO-SSV)
  var ENABLE_SSV = false;

  // --- Flags d'état ---
  var isRewardShowing = false;
  window.__ads_active = false; // flag global anti-back/anti-overlays côté app

  // --- Compteur unifié persisté (interstitiels) ---
  var interActionsCount = parseInt(localStorage.getItem('inter_actions_count') || '0', 10);
  var lastInterTs = parseInt(localStorage.getItem('inter_last_ts') || '0', 10);

  // =============================
  // Utils / Auth / Consent
  // =============================

  // ✅ Auth lecture-seule (PAS d'upsert / PAS d'écriture client)
  async function ensureAuth() {
    const sb = window.sb;
    if (!sb || !sb.auth) return null;

    try {
      if (typeof window.bootstrapAuthAndProfile === 'function') {
        await window.bootstrapAuthAndProfile(); // peut faire signInAnonymously en interne
      }
    } catch (_) {}

    try {
      const { data: { user }, error } = await sb.auth.getUser();
      if (error) return null;
      return user?.id || null;
    } catch (_) {
      return null;
    }
  }

  function getPersonalizedAdsGranted() {
    var rgpd = localStorage.getItem('rgpdConsent'); // "accept"|"refuse"|null
    var adsConsent = (localStorage.getItem('adsConsent') || '').toLowerCase();
    var adsEnabled = (localStorage.getItem('adsEnabled') || '').toLowerCase();
    if (rgpd === 'refuse') return false;
    if (rgpd === 'accept') {
      if (adsConsent) return adsConsent === 'yes';
      if (adsEnabled) return adsEnabled === 'true';
      return false;
    }
    if (adsConsent) return adsConsent === 'yes';
    if (adsEnabled) return adsEnabled === 'true';
    return false;
  }
  function buildAdMobRequestOptions() {
    return { npa: getPersonalizedAdsGranted() ? '0' : '1' };
  }

  // =============================
  // Helper plateforme
  // =============================
  function isNative() {
    try { return !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
    catch(_) { return false; }
  }

  // =============================
  // Helpers anti-surcouches avant/après show() — WHITELIST SAFE
  // =============================
  var APP_OVERLAYS = [
    '#popup-consent',
    '#update-banner',
    '.tooltip-box',
    '.popup-consent-bg',
    '.modal-app',
    '.dialog-app',
    '.backdrop-app',
    '.overlay-app',
    '.loading-app'
  ];

  function hideOverlays() {
    try {
      APP_OVERLAYS.forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(el){
          el.__prevDisplay = el.style.display;
          el.style.display = 'none';
        });
      });
    } catch(_) {}
  }

  function restoreOverlays() {
    try {
      APP_OVERLAYS.forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(el){
          el.style.display = (typeof el.__prevDisplay === 'string') ? el.__prevDisplay : '';
          try { delete el.__prevDisplay; } catch(_) {}
        });
      });
    } catch(_) {}
  }

  function preShowAdCleanup() {
    try {
      if (window.OneSignal && window.OneSignal.InAppMessages) {
        window.OneSignal.InAppMessages.paused = true;
      }
      hideOverlays();
      window.__ads_active = true;
    } catch(_) {}
  }

  function postAdCleanup() {
    try {
      if (window.OneSignal && window.OneSignal.InAppMessages) {
        window.OneSignal.InAppMessages.paused = false;
      }
      window.__ads_active = false;
      restoreOverlays();
    } catch(_) {}
  }

  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) {
      if (!isRewardShowing) postAdCleanup();
    }
  });

  // =============================
  // Panneau diag (optionnel)
  // =============================
  function diag(msg) {
    if (!SHOW_DIAG_PANEL) return;
    try {
      var el = document.getElementById('__ads_diag');
      if (!el) {
        el = document.createElement('div');
        el.id = '__ads_diag';
        el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999999;background:rgba(0,0,0,.6);color:#fff;padding:6px 8px;border-radius:8px;font:12px/1.35 monospace;max-width:80vw;';
        document.body.appendChild(el);
      }
      var sep = el.textContent ? '\n' : '';
      el.textContent += sep + '['+new Date().toLocaleTimeString()+'] ' + msg;
    } catch(_) {}
  }

  // =============================
  // Écouteurs AdMob (1 seule fois)
  // =============================
  function registerAdEventsOnce() {
    try {
      if (!AdMob || !AdMob.addListener || window.__adListenersRegistered) return;
      window.__adListenersRegistered = true;

      if (typeof window.onRewardClosed !== 'function') {
        window.onRewardClosed = function () {
          try { postAdCleanup(); } catch (_) {}
        };
      }

      var SAFE = function(fn){ return function(arg){ try { fn && fn(arg); } catch(e) {} }; };

      var map = [
        ['onAdFullScreenContentOpened', function () {
          isRewardShowing = true;
          window.__ads_active = true;
          diag('Ad opened');
        }],
        ['onAdDismissedFullScreenContent', function () {
          diag('Ad dismissed');
          isRewardShowing = false;
          postAdCleanup();
          window.onRewardClosed && window.onRewardClosed();
        }],
        ['onAdFailedToShowFullScreenContent', function () {
          diag('Ad failed to show');
          isRewardShowing = false;
          postAdCleanup();
          window.onRewardClosed && window.onRewardClosed();
        }],
        ['onRewarded', function () {
          diag('Rewarded granted');
        }],
      ];

      for (var i=0;i<map.length;i++) {
        var evt = map[i][0], handler = map[i][1];
        try { AdMob.addListener(evt, SAFE(handler)); } catch(e) {}
      }
    } catch (_e) {}
  }

  // =============================
  // Init (silencieux si web)
  // =============================
  (async function initAdMobOnce() {
    try {
      if (!isNative()) {
        document.addEventListener('DOMContentLoaded', function(){
          document.querySelectorAll('.btn-reward').forEach(function(el){ el.style.display = 'none'; });
        });
        return;
      }
      if (!AdMob || !AdMob.initialize) {
        return;
      }
      await AdMob.initialize({
        requestTrackingAuthorization: false,
        initializeForTesting: __DEV_ADS__
      });
      registerAdEventsOnce();
    } catch (_e) {}
  })();

  // =============================
  // Balances / NoAds (lecture)
  // =============================
  async function __getBalances() {
    await ensureAuth();
    var sb = window.sb;
    if (!sb || !sb.rpc) throw new Error('Supabase non initialisé (window.sb manquant)');
    var res = await sb.rpc('get_balances');
    if (res.error) throw res.error;
    var row = Array.isArray(res.data) ? res.data[0] : res.data;
    return row || {};
  }
  async function hasNoAds() {
    try {
      var b = await __getBalances();
      return !!(b && b.nopub);
    } catch (_e) {
      return false;
    }
  }

  // ====== Helpers UI post-reward (non bloquants) ======
  function notifyRewardUI(b, type) {
    try {
      var msg = '';
      if (type === 'jeton') msg = 'Récompense validée ! Jetons: ' + (b && b.jetons != null ? b.jetons : '--');
      if (type === 'vcoin') msg = 'Récompense validée ! VCoins: ' + (b && b.vcoins != null ? b.vcoins : '--');
      if (msg) {
        if (typeof window.showToast === 'function') window.showToast(msg);
      }
      if (typeof window.renderThemes === 'function') window.renderThemes();
      if (typeof window.updateBalancesHeader === 'function') window.updateBalancesHeader();
    } catch(_) {}
  }

  async function refreshBalanceUntil(timeoutMs, stepMs, type) {
    var t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 8000)) {
      try {
        var b = await __getBalances();
        notifyRewardUI(b, type);
        return true;
      } catch (_e) {}
      await new Promise(function(r){ setTimeout(r, stepMs || 1000); });
    }
    return false;
  }

  function waitDismissedOnce() {
    return new Promise(function(resolve) {
      var off1 = AdMob.addListener && AdMob.addListener('onAdDismissedFullScreenContent', function(){
        try { off1 && off1.remove && off1.remove(); } catch(_) {}
        try { off2 && off2.remove && off2.remove(); } catch(_) {}
        resolve(true);
      });
      var off2 = AdMob.addListener && AdMob.addListener('onAdFailedToShowFullScreenContent', function(){
        try { off1 && off1.remove && off1.remove(); } catch(_) {}
        try { off2 && off2.remove && off2.remove(); } catch(_) {}
        resolve(false);
      });
    });
  }

  function waitOpenedOnce(timeoutMs) {
    return new Promise(function (resolve) {
      var off = null, timer = null, resolved = false;
      try {
        off = AdMob.addListener('onAdFullScreenContentOpened', function () {
          if (resolved) return; resolved = true;
          try { off && off.remove && off.remove(); } catch(_) {}
          if (timer) { clearTimeout(timer); timer = null; }
          resolve(true);
        });
      } catch(_) {
        resolve(false);
        return;
      }
      timer = setTimeout(function(){
        if (resolved) return; resolved = true;
        try { off && off.remove && off.remove(); } catch(_) {}
        resolve(false);
      }, timeoutMs || 4000);
    });
  }

  function waitRewardedOnce(timeoutMs) {
    return new Promise(function (resolve) {
      var off = null, timer = null;
      try {
        off = AdMob.addListener('onRewarded', function () {
          try { off && off.remove && off.remove(); } catch(_) {}
          if (timer) { clearTimeout(timer); timer = null; }
          resolve(true);
        });
      } catch(_) {
        resolve(false);
        return;
      }
      timer = setTimeout(function(){
        try { off && off.remove && off.remove(); } catch(_) {}
        resolve(false);
      }, timeoutMs || 30000);
    });
  }

  function waitAppReturnOnce() {
    return new Promise(function(resolve){
      var resolved = false;
      function done(){ if (resolved) return; resolved = true; cleanup(); resolve(true); }
      function onVis(){ try { if (!document.hidden) done(); } catch(_) {} }
      function onFocus(){ done(); }
      var off1=null, off2=null;

      function cleanup(){
        try { document.removeEventListener('visibilitychange', onVis); } catch(_) {}
        try { window.removeEventListener('focus', onFocus); } catch(_) {}
        try { off1 && off1.remove && off1.remove(); } catch(_) {}
        try { off2 && off2.remove && off2.remove(); } catch(_) {}
      }

      try { document.addEventListener('visibilitychange', onVis, { once:true }); } catch(_) {}
      try { window.addEventListener('focus', onFocus, { once:true }); } catch(_) {}

      try {
        if (App && App.addListener) {
          off1 = App.addListener('resume', done);
          off2 = App.addListener('appStateChange', function(state){
            try { if (state && state.isActive) done(); } catch(_){}
          });
        }
      } catch(_) {}
    });
  }

  // =============================
  // Crédit côté client (NO-SSV) — signature 3 params
  // =============================
  async function creditRewardClientSide(type, amount) {
    var sb = window.sb;
    if (!sb || !sb.rpc) throw new Error('Supabase non initialisé');

    var uid = await ensureAuth();
    if (!uid) return false;

    var params = {
      p_user_id: uid,
      p_amount: Number(amount || 0),
      p_product: 'reward_ad'
    };

    try {
      if (String(type) === 'jeton') {
        var r1 = await sb.rpc('secure_add_jetons', params);
        if (r1 && r1.error) throw r1.error;
        return true;
      }
      if (String(type) === 'vcoin') {
        var r2 = await sb.rpc('secure_add_points', params);
        if (r2 && r2.error) throw r2.error;
        return true;
      }
      return true; // revive: pas de crédit numérique
    } catch (_e) {
      return false;
    }
  }

  // =============================
  // Rewarded (LOAD/SHOW) — SANS SSV
  //  ⚠️ Crédit déclenché sur onRewarded (fiable), pas sur dismissed
  // =============================
  async function showRewardedType(type, amount, onDone) {
    var unlocked = false;
    var watchdog = null;
    function unlockUI() {
      if (unlocked) return;
      unlocked = true;
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      isRewardShowing = false;
      try { window.onRewardClosed && window.onRewardClosed(); } catch(_) {}
      postAdCleanup();
    }

    try {
      if (!isNative()) { onDone&&onDone(false); return; }
      if (!AdMob || !AdMob.prepareRewardVideoAd || !AdMob.showRewardVideoAd) {
        onDone&&onDone(false);
        return;
      }

      await ensureAuth();

      var adId = AD_UNIT_ID_REWARDED;

      var rewardedP  = waitRewardedOnce(30000);
      var dismissedP = waitDismissedOnce();
      var openedP    = waitOpenedOnce(4000);

      await AdMob.prepareRewardVideoAd({
        adId: adId,
        requestOptions: buildAdMobRequestOptions()
      });

      preShowAdCleanup();
      isRewardShowing = true;

      watchdog = setTimeout(function(){ unlockUI(); }, 120000);

      var showPromise = AdMob.showRewardVideoAd();

      if (String(type) === 'revive') {
        try {
          await Promise.race([ openedP, new Promise(function (res) { setTimeout(res, 4000); }) ]);
        } catch (_) {}

        var outcome = await Promise.race([
          rewardedP.then(function(){ return 'reward'; }).catch(function(){ return 'timeout'; }),
          dismissedP.then(function(){ return 'dismissed'; }),
          new Promise(function (res) { setTimeout(function(){ res('timeout'); }, 60000); })
        ]);

        if (outcome === 'timeout') { onDone && onDone(false); return; }

        if (outcome !== 'dismissed') {
          await Promise.race([ dismissedP.catch(function(){}), waitAppReturnOnce() ]);
        }

        try { await refreshBalanceUntil(3000, 800); } catch(_) {}
        onDone && onDone(true);
        return;
      }

      var gotReward = await rewardedP;
      var credited  = await creditRewardClientSide(type, amount);
      await refreshBalanceUntil(5000, 800, type);

      showPromise.finally(function(){}).catch(function(){});
      onDone && onDone(!!(gotReward || credited));
      dismissedP.then(function(){}).catch(function(){});

    } catch (_e) {
      onDone && onDone(false);
      try {
        AdMob.prepareRewardVideoAd({
          adId: AD_UNIT_ID_REWARDED,
          requestOptions: buildAdMobRequestOptions()
        }).catch(function(){});
      } catch(_) {}
    } finally {
      unlockUI();
    }
  }

  // Wrappers publics
  async function showRewardBoutique() {
    return new Promise(function(resolve){
      showRewardedType('jeton', window.REWARD_JETONS, function(ok){ resolve(!!ok); });
    });
  }
  async function showRewardVcoins() {
    return new Promise(function(resolve){
      showRewardedType('vcoin', window.REWARD_VCOINS, function(ok){ resolve(!!ok); });
    });
  }
  function showRewardRevive(onDone) {
    showRewardedType('revive', 1, function(ok){ try { onDone && onDone(!!ok); } catch(_){}; });
  }

  // =============================
  // Interstitiel (LOAD/SHOW)
  // =============================
  function canShowInterstitialNow() {
    if (!INTER_COOLDOWN_MS) return true;
    var now = Date.now();
    if (now - lastInterTs < INTER_COOLDOWN_MS) return false;
    return true;
  }
  function markInterstitialShownNow() {
    lastInterTs = Date.now();
    localStorage.setItem('inter_last_ts', String(lastInterTs));
  }

  async function showInterstitial() {
    var watchdog = null;
    try {
      if (await hasNoAds()) { return false; }
      if (!isNative()) { return false; }
      if (!AdMob || !AdMob.prepareInterstitial || !AdMob.showInterstitial) {
        return false;
      }
      if (!canShowInterstitialNow()) { return false; }

      var adId = AD_UNIT_ID_INTERSTITIEL;

      await AdMob.prepareInterstitial({
        adId: adId,
        requestOptions: buildAdMobRequestOptions()
      });

      preShowAdCleanup();

      watchdog = setTimeout(function(){
        postAdCleanup();
      }, 120000);

      var dismissedP = waitDismissedOnce();

      var res = await AdMob.showInterstitial();

      await Promise.race([ dismissedP.catch(function(){}), waitAppReturnOnce() ]);

      if (res !== false) {
        markInterstitialShownNow();
        setTimeout(function(){
          AdMob.prepareInterstitial({ adId: adId, requestOptions: buildAdMobRequestOptions() }).catch(function(){});
        }, 1200);
        return true;
      }
      return false;
    } catch (_e) {
      try {
        AdMob.prepareInterstitial({ adId: AD_UNIT_ID_INTERSTITIEL, requestOptions: buildAdMobRequestOptions() }).catch(function(){});
      } catch(_) {}
      return false;
    } finally {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      postAdCleanup();
    }
  }

  // =============================
  // Compteurs / Déclencheur interstitiels
  // =============================
  function isModeInfini(m){ m=(m||'').toLowerCase(); return ['infini','infinite','endless'].includes(m); }
  function isModeClassique(m){ m=(m||'').toLowerCase(); return ['classique','classic','normal','arcade'].includes(m); }
  function isModeDuel(m){ m=(m||'').toLowerCase(); return ['duel','versus','vs','1v1','duo'].includes(m); }

  async function maybeShowInterBeforeAction(mode) {
    if (isModeDuel(mode)) return;

    var needAd = interActionsCount >= INTERSTITIEL_APRES_X_ACTIONS;
    if (needAd) {
      interActionsCount = 0;
      localStorage.setItem('inter_actions_count', '0');
      await showInterstitial();
    }

    interActionsCount++;
    localStorage.setItem('inter_actions_count', String(interActionsCount));
  }

  // =============================
  // Wrappers "événements jeu" (à appeler AVANT le gameplay)
  // =============================
  async function partieCommencee(mode){
    mode = String(mode || 'classique').toLowerCase();
    if (isModeInfini(mode) || isModeClassique(mode) || isModeDuel(mode)) {
      await maybeShowInterBeforeAction(mode);
    }
  }
  async function partieReprisee(mode){
    mode = String(mode || 'classique').toLowerCase();
    if (isModeInfini(mode) || isModeClassique(mode) || isModeDuel(mode)) {
      await maybeShowInterBeforeAction(mode);
    }
  }
  async function partieRecommencee(mode){
    mode = String(mode || 'classique').toLowerCase();
    if (isModeInfini(mode) || isModeClassique(mode) || isModeDuel(mode)) {
      await maybeShowInterBeforeAction(mode);
    }
  }
  function partieTerminee(){}

  // =============================
  // Expose global
  // =============================
  window.showInterstitial     = showInterstitial;
  window.showRewardBoutique   = showRewardBoutique;
  window.showRewardVcoins     = showRewardVcoins;
  window.showRewardRevive     = showRewardRevive;

  window.partieCommencee      = partieCommencee;
  window.partieReprisee       = partieReprisee;
  window.partieRecommencee    = partieRecommencee;
  window.partieTerminee       = partieTerminee;

  window.hasNoAds             = hasNoAds;

})();

/* ====== ADD-ONLY: PRELOAD REWARDED (ne modifie rien d’existant) ====== */
(function () {
  'use strict';

  // Récup plugin sans casser tes variables
  var Cap = (window.Capacitor || {});
  var AdMob = (Cap.Plugins && Cap.Plugins.AdMob) ? Cap.Plugins.AdMob : (window.AdMob || null);

  // ⚠️ On reprend ton ad unit rewarded tel quel (même valeur que dans le fichier ci-dessus)
  var REWARDED_ID = 'ca-app-pub-6837328794080297/3006407791';

  // Petits flags internes au preload (ne touchent pas tes variables)
  var __rewardReady = false;
  var __rewardLoading = false;

  function isNative() {
    try {
      if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
        return window.Capacitor.getPlatform() !== 'web';
      }
      if (Capacitor && Capacitor.isNativePlatform) return Capacitor.isNativePlatform();
    } catch (_) {}
    return !!(window.cordova && typeof window.cordova.platformId === 'string');
  }

  function buildReq() {
    // si ta fonction existe dans le scope global, on l’utilise
    try { if (typeof window.buildAdMobRequestOptions === 'function') return window.buildAdMobRequestOptions(); } catch(_){}
    return {};
  }

  async function preloadReward() {
    if (!isNative()) return;
    if (!AdMob || !REWARDED_ID) return;
    if (__rewardReady || __rewardLoading) return;
    __rewardLoading = true;
    try {
      // Compat différentes APIs
      if (AdMob.loadRewardedAd) {
        await AdMob.loadRewardedAd({ adId: REWARDED_ID, requestOptions: buildReq() });
      } else if (AdMob.prepareRewardVideoAd) {
        await AdMob.prepareRewardVideoAd({ adId: REWARDED_ID, requestOptions: buildReq() });
      } else {
        __rewardLoading = false;
        return;
      }
      __rewardReady = true;
    } catch (_) {
      __rewardReady = false;
    } finally {
      __rewardLoading = false;
    }
  }

  // Expose un hook global SANS toucher à tes flux existants
  window.preloadRewardAds = preloadReward;

  // Précharge automatiquement au bon moment, sans modifier ton init
  document.addEventListener('deviceready', function () {
    try { preloadReward(); } catch (_) {}
    var timer = setInterval(function () {
      if (__rewardReady) { clearInterval(timer); return; }
      if (!__rewardLoading) { preloadReward(); }
    }, 20000);
  });

  // Bonus: si la page arrive avant deviceready, on tente un petit preload
  document.addEventListener('DOMContentLoaded', function () {
    try { preloadReward(); } catch (_) {}
  });
})();
