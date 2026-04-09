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
  var INTERSTITIEL_APRES_X_ACTIONS = 2;        // pub au début de la 3e action réelle
  var INTERSTITIEL_APRES_MS = 0;               // désactivé : remplacé par le timer de temps d'écran ci-dessous
  var INTER_COOLDOWN_MS = 3 * 60 * 1000;       // minimum 3 minutes entre deux pubs

  // --- Timer auto hors jeu / index ---
  var INTER_ECRAN_VISIBLE_MS = 4 * 60 * 1000;  // pub auto toutes les 4 minutes de temps d'écran visible
  var INTER_ECRAN_TICK_MS = 15000;             // vérification légère toutes les 15s

  // --- Récompenses par défaut (affichage/UI) ---
  window.REWARD_JETONS = typeof window.REWARD_JETONS === 'number'  ? window.REWARD_JETONS : 1;
  window.REWARD_VCOINS = typeof window.REWARD_VCOINS === 'number'  ? window.REWARD_VCOINS : 300;
  window.REWARD_REVIVE = typeof window.REWARD_REVIVE === 'boolean' ? window.REWARD_REVIVE : true;

  // --- SSV désactivé (NO-SSV)
  var ENABLE_SSV = false;

  // --- Flags d'état ---
  var isRewardShowing = false;
  window.__ads_active = false; // flag global anti-back/anti-overlays côté app
  var __googleConsentInfo = null;
  var __googleConsentInfoPromise = null;

  // --- Compteurs persistés (interstitiels) ---
  var interActionsCount = parseInt(localStorage.getItem('inter_actions_count') || '0', 10);
  var lastInterTs = parseInt(localStorage.getItem('inter_last_ts') || '0', 10);
  var interCycleStartedTs = parseInt(localStorage.getItem('inter_cycle_started_ts') || '0', 10);
  var interScreenVisibleMs = parseInt(localStorage.getItem('inter_screen_visible_ms') || '0', 10);
  var interScreenLastResumeTs = parseInt(localStorage.getItem('inter_screen_last_resume_ts') || '0', 10);
  var interScreenTimer = null;

  if (!Number.isFinite(interActionsCount)) interActionsCount = 0;
  if (!Number.isFinite(lastInterTs)) lastInterTs = 0;
  if (!Number.isFinite(interCycleStartedTs) || interCycleStartedTs <= 0) {
    interCycleStartedTs = Date.now();
    localStorage.setItem('inter_cycle_started_ts', String(interCycleStartedTs));
  }
  if (!Number.isFinite(interScreenVisibleMs) || interScreenVisibleMs < 0) interScreenVisibleMs = 0;
  if (!Number.isFinite(interScreenLastResumeTs) || interScreenLastResumeTs < 0) interScreenLastResumeTs = 0;

  // ======================================================
  // ✅ CAP REWARDED : 10 / HEURE
  //    - Stocke les timestamps d’ouvertures d’annonces rewarded
  //    - Bloque proprement si la limite est atteinte
  // ======================================================
  var REWARD_CAP_PER_HOUR = 10;
  var REWARD_WINDOW_MS    = 60 * 60 * 1000;        // 1h rolling window
  var REWARD_HIST_KEY     = 'reward_hist_ms';      // localStorage key

  function __readRewardHist() {
    try {
      var arr = JSON.parse(localStorage.getItem(REWARD_HIST_KEY) || '[]');
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (ts) { return typeof ts === 'number' && isFinite(ts); });
    } catch (_) { return []; }
  }
  function __writeRewardHist(arr) {
    try { localStorage.setItem(REWARD_HIST_KEY, JSON.stringify(arr || [])); } catch (_) {}
  }
  function __pruneRewardHist(arr) {
    var now = Date.now();
    var pruned = (arr || []).filter(function (ts) { return now - ts < REWARD_WINDOW_MS; });
    if (pruned.length !== arr.length) __writeRewardHist(pruned);
    return pruned;
  }
  function getRewardedViewsLastHour() {
    return __pruneRewardHist(__readRewardHist()).length;
  }
  function canShowRewardedNow() {
    return getRewardedViewsLastHour() < REWARD_CAP_PER_HOUR;
  }
  function markRewardedOpenedNow() {
    var now = Date.now();
    var arr = __pruneRewardHist(__readRewardHist());
    arr.push(now);
    __writeRewardHist(arr);
  }
  function msUntilNextRewardSlot() {
    var now = Date.now();
    var arr = __pruneRewardHist(__readRewardHist()).sort(function(a,b){ return a-b; });
    if (arr.length < REWARD_CAP_PER_HOUR) return 0;
    var oldest = arr[0];
    return Math.max(0, REWARD_WINDOW_MS - (now - oldest));
  }
function informCapBlocked() {
  var ms = msUntilNextRewardSlot();
  var min = Math.ceil(ms / 60000);

  var tpl = (min > 0)
    ? (window.i18nGet ? i18nGet('ads.cap_try_in_min') : 'Limit reached: try again in ~{min} min')
    : (window.i18nGet ? i18nGet('ads.cap_try_soon')   : 'Limit reached, try again soon');

  var txt = String(tpl).replace('{min}', String(min));

  if (typeof window.showToast === 'function') {
    try { window.showToast(txt); } catch(_) {}
  } else {
    // fallback mini-toast DOM
    try {
      var id='__reward_cap_toast', el=document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.cssText =
          'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);' +
          'background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:10px;' +
          'font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
          'z-index:2147483647;max-width:80vw;text-align:center';
        document.body.appendChild(el);
      }
      el.textContent = txt;
      el.style.opacity = '1';
      clearTimeout(el.__t1); clearTimeout(el.__t2);
      el.__t1 = setTimeout(function(){ el.style.transition='opacity .25s'; el.style.opacity='0'; }, 2300);
      el.__t2 = setTimeout(function(){ try{ el.remove(); }catch(_){} }, 2600);
    } catch(_) {}
  }
}

  // Expose (utile pour UI/diag)
  window.getRewardedViewsLastHour = getRewardedViewsLastHour;
  window.msUntilNextRewardSlot    = msUntilNextRewardSlot;
  window.REWARD_CAP_PER_HOUR      = REWARD_CAP_PER_HOUR;

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

  function getPersonalizedAdsGrantedLegacy() {
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

  function hasOfficialUmpSupport() {
    return !!(AdMob && AdMob.requestConsentInfo && AdMob.showConsentForm && AdMob.showPrivacyOptionsForm);
  }

  function buildAdMobRequestOptions(forceLimited) {
    if (forceLimited) {
      return { npa: '1' };
    }

    if (isNative() && hasOfficialUmpSupport()) {
      return {};
    }

    return { npa: getPersonalizedAdsGrantedLegacy() ? '0' : '1' };
  }

  async function syncLegacyConsentMirror(info) {
    try {
      if (!info) return;
      var accepted = !!info.canRequestAds;
      localStorage.setItem('rgpdConsent', accepted ? 'accept' : 'refuse');
      localStorage.setItem('adsConsent', accepted ? 'yes' : 'no');
      localStorage.setItem('adsEnabled', accepted ? 'true' : 'false');
    } catch (_) {}

    try {
      if (!info) return;
      if (window.bootstrapAuthAndProfile) await window.bootstrapAuthAndProfile();
      if (window.sb && window.sb.rpc) {
        await window.sb.rpc('update_ads_consent', { new_consent: info.canRequestAds ? 'accept' : 'refuse' });
      }
    } catch (_) {}
  }

  async function getGoogleConsentInfo(forceRefresh) {
    if (!isNative() || !hasOfficialUmpSupport()) return null;
    if (__googleConsentInfo && !forceRefresh) return __googleConsentInfo;
    if (__googleConsentInfoPromise) return __googleConsentInfoPromise;

    __googleConsentInfoPromise = AdMob.requestConsentInfo()
      .then(async function (info) {
        __googleConsentInfo = info || null;
        await syncLegacyConsentMirror(__googleConsentInfo);
        return __googleConsentInfo;
      })
      .catch(function () {
        return __googleConsentInfo;
      })
      .finally(function () {
        __googleConsentInfoPromise = null;
      });

    return __googleConsentInfoPromise;
  }

  async function ensureCanRequestAds() {
    var info = await getGoogleConsentInfo(false);

    if (!info) {
      return {
        allowed: true,
        limited: true
      };
    }

    if (info.canRequestAds) {
      return {
        allowed: true,
        limited: false
      };
    }

    return {
      allowed: true,
      limited: true
    };
  }

  async function maybeShowGoogleConsentFormOnIndexAfterIntro() {
    if (!isNative() || !hasOfficialUmpSupport()) return null;

    var info = await getGoogleConsentInfo(true);
    if (!info) return null;

    if (info.canRequestAds === true) {
      return info;
    }

    try {
      info = await AdMob.showConsentForm();
      __googleConsentInfo = info || __googleConsentInfo;
      await syncLegacyConsentMirror(__googleConsentInfo);
      return __googleConsentInfo;
    } catch (_) {
      return __googleConsentInfo || info;
    }
  }

  async function showGooglePrivacyOptionsForm() {
    if (!isNative() || !hasOfficialUmpSupport()) return false;

    var info = await getGoogleConsentInfo(true);
    if (!info || info.privacyOptionsRequirementStatus !== 'REQUIRED') return false;

    try {
      await AdMob.showPrivacyOptionsForm();
      await getGoogleConsentInfo(true);
      return true;
    } catch (_) {
      return false;
    }
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
    '#update-banner',
    '.tooltip-box',
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
    if (document.hidden) {
      stopInterstitialScreenClock();
      return;
    }

    startInterstitialScreenClock();
    setTimeout(function(){ maybeShowInterstitialByScreenTime().catch(function(){}); }, 800);

    if (!isRewardShowing) postAdCleanup();
  });

  window.addEventListener('pagehide', function(){
    stopInterstitialScreenClock();
  });

  window.addEventListener('pageshow', function(){
    startInterstitialScreenClock();
    setTimeout(function(){ maybeShowInterstitialByScreenTime().catch(function(){}); }, 800);
  });

  try {
    if (App && App.addListener) {
      App.addListener('pause', function(){
        stopInterstitialScreenClock();
      });
      App.addListener('resume', function(){
        startInterstitialScreenClock();
        setTimeout(function(){ maybeShowInterstitialByScreenTime().catch(function(){}); }, 800);
      });
    }
  } catch(_) {}

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

      var SAFE = function (fn) {
        return function (arg) {
          try { fn && fn(arg); } catch (_) {}
        };
      };

      var map = [
        ["interstitialAdShowed", function () {
          window.__ads_active = true;
          diag("Interstitial showed");
        }],
        ["interstitialAdDismissed", function () {
          diag("Interstitial dismissed");
          if (currentAdKind === "interstitial") {
            currentAdKind = null;
            __showLock = false;
            postAdCleanup();
          }
        }],
        ["interstitialAdFailedToShow", function () {
          diag("Interstitial failed to show");
          if (currentAdKind === "interstitial") {
            currentAdKind = null;
            __showLock = false;
            postAdCleanup();
          }
        }],

        ["onRewardedVideoAdShowed", function () {
          window.__ads_active = true;
          diag("Rewarded showed");
        }],
        ["onRewardedVideoAdDismissed", function () {
          diag("Rewarded dismissed");
          if (currentAdKind === "rewarded") {
            isRewardShowing = false;
            currentAdKind = null;
            __showLock = false;
            postAdCleanup();
          }
        }],
        ["onRewardedVideoAdFailedToShow", function () {
          diag("Rewarded failed to show");
          if (currentAdKind === "rewarded") {
            isRewardShowing = false;
            currentAdKind = null;
            __showLock = false;
            postAdCleanup();
          }
        }],
        ["onRewardedVideoAdReward", function () {
          diag("Rewarded granted");
        }]
      ];

      for (var i = 0; i < map.length; i++) {
        try { AdMob.addListener(map[i][0], SAFE(map[i][1])); } catch (_) {}
      }
    } catch (_) {}
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
      await getGoogleConsentInfo(true);
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

  function waitDismissedOnce(kind) {
    return new Promise(function (resolve) {
      var off1 = null, off2 = null;

      function done(ok) {
        try { off1 && off1.remove && off1.remove(); } catch (_) {}
        try { off2 && off2.remove && off2.remove(); } catch (_) {}
        resolve(!!ok);
      }

      var dismissedEvt = kind === "rewarded"
        ? "onRewardedVideoAdDismissed"
        : "interstitialAdDismissed";

      var failedEvt = kind === "rewarded"
        ? "onRewardedVideoAdFailedToShow"
        : "interstitialAdFailedToShow";

      try {
        off1 = AdMob.addListener(dismissedEvt, function () { done(true); });
        off2 = AdMob.addListener(failedEvt, function () { done(false); });
      } catch (_) {
        done(false);
      }
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
      var off = null;
      var timer = null;

      function done(ok) {
        try { off && off.remove && off.remove(); } catch (_) {}
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(!!ok);
      }

      try {
        off = AdMob.addListener("onRewardedVideoAdReward", function () {
          done(true);
        });
      } catch (_) {
        done(false);
        return;
      }

      timer = setTimeout(function () {
        done(false);
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
  //  ⚠️ CAP 10/h appliqué AVANT l’appel, comptage à l’OUVERTURE
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
        onDone&&onDone(false); return;
      }

      // ⛔ CAP REWARDED : bloque si limite atteinte
      if (!canShowRewardedNow()) {
        informCapBlocked();
        onDone && onDone(false);
        return;
      }

      await ensureAuth();
      var adConsent = await ensureCanRequestAds();

      var adId = AD_UNIT_ID_REWARDED;

      var rewardedP  = waitRewardedOnce(30000);
      var dismissedP = waitDismissedOnce("rewarded");
      var openedP    = waitOpenedOnce(4000);

      await AdMob.prepareRewardVideoAd({
        adId: adId,
        requestOptions: buildAdMobRequestOptions(adConsent.limited)
      });

      preShowAdCleanup();
      isRewardShowing = true;

      watchdog = setTimeout(function(){ unlockUI(); }, 120000);

      var showPromise = AdMob.showRewardVideoAd();

      // 👉 Dès que l’annonce s’ouvre réellement, on compte pour le cap
      openedP.then(function(opened){ if (opened) markRewardedOpenedNow(); }).catch(function(){});

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
    return (now - lastInterTs) >= INTER_COOLDOWN_MS;
  }

  function persistInterstitialScreenClock() {
    localStorage.setItem('inter_screen_visible_ms', String(interScreenVisibleMs));
    if (interScreenLastResumeTs > 0) {
      localStorage.setItem('inter_screen_last_resume_ts', String(interScreenLastResumeTs));
    } else {
      localStorage.removeItem('inter_screen_last_resume_ts');
    }
  }

  function isElementActuallyVisible(el) {
    try {
      if (!el) return false;
      var cs = window.getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      return !!(el.offsetWidth || el.offsetHeight || cs.position === 'fixed');
    } catch (_) {
      return false;
    }
  }

  function hasBlockingUiForAutoInterstitial() {
    return !!(
      window.__ads_active ||
      window.__ads_waiting_choice ||
      isElementActuallyVisible(document.getElementById('onboarding')) ||
      isElementActuallyVisible(document.getElementById('resume-popup')) ||
      isElementActuallyVisible(document.getElementById('gameover-popup')) ||
      isElementActuallyVisible(document.getElementById('duel-popup')) ||
      isElementActuallyVisible(document.getElementById('vr-crosspromo-popup')) ||
      isElementActuallyVisible(document.getElementById('popupPseudo'))
    );
  }

  function getInterstitialScreenVisibleMs() {
    var total = interScreenVisibleMs;
    if (!document.hidden && interScreenLastResumeTs > 0) {
      total += (Date.now() - interScreenLastResumeTs);
    }
    return total;
  }

  function startInterstitialScreenClock() {
    if (!document.hidden && interScreenLastResumeTs <= 0) {
      interScreenLastResumeTs = Date.now();
      persistInterstitialScreenClock();
    }
    if (interScreenTimer) return;
    interScreenTimer = setInterval(function () {
      maybeShowInterstitialByScreenTime().catch(function(){});
    }, INTER_ECRAN_TICK_MS);
  }

  function stopInterstitialScreenClock() {
    if (interScreenLastResumeTs > 0) {
      interScreenVisibleMs += Math.max(0, Date.now() - interScreenLastResumeTs);
      interScreenLastResumeTs = 0;
      persistInterstitialScreenClock();
    }
    if (interScreenTimer) {
      clearInterval(interScreenTimer);
      interScreenTimer = null;
    }
  }

  function resetInterstitialScreenClock() {
    interScreenVisibleMs = 0;
    interScreenLastResumeTs = document.hidden ? 0 : Date.now();
    persistInterstitialScreenClock();
  }

  async function maybeShowInterstitialByScreenTime() {
    if (document.hidden) return false;
    if (hasBlockingUiForAutoInterstitial()) return false;
    if (getInterstitialScreenVisibleMs() < INTER_ECRAN_VISIBLE_MS) return false;
    if (!canShowInterstitialNow()) return false;

    var shown = await showInterstitial();
    if (shown) {
      resetInterstitialScreenClock();
      return true;
    }
    return false;
  }

  function ensureInterstitialCycleStarted() {
    if (!Number.isFinite(interCycleStartedTs) || interCycleStartedTs <= 0) {
      interCycleStartedTs = Date.now();
      localStorage.setItem('inter_cycle_started_ts', String(interCycleStartedTs));
    }
  }

  function resetInterstitialCounters() {
    interActionsCount = 0;
    interCycleStartedTs = Date.now();
    localStorage.setItem('inter_actions_count', '0');
    localStorage.setItem('inter_cycle_started_ts', String(interCycleStartedTs));
  }

  function markInterstitialShownNow() {
    lastInterTs = Date.now();
    localStorage.setItem('inter_last_ts', String(lastInterTs));
    resetInterstitialCounters();
    resetInterstitialScreenClock();
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

      var adConsent = await ensureCanRequestAds();

      var adId = AD_UNIT_ID_INTERSTITIEL;

      await AdMob.prepareInterstitial({
        adId: adId,
        requestOptions: buildAdMobRequestOptions(adConsent.limited)
      });

      preShowAdCleanup();

      watchdog = setTimeout(function(){
        postAdCleanup();
      }, 120000);

      var dismissedP = waitDismissedOnce("interstitial");

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

  // ➜ Nouvelle API claire : marquer UNIQUEMENT quand une game démarre vraiment
  async function adsMarkGameLaunched(mode) {
    // ⛔ Reprise suite à revive : ignorer UNE action
    if (window.__ads_skip_next_action) {
      window.__ads_skip_next_action = false;
      return;
    }

    ensureInterstitialCycleStarted();

    var now = Date.now();
    var needAdByActions = interActionsCount >= INTERSTITIEL_APRES_X_ACTIONS;
    var needAdByTime = INTERSTITIEL_APRES_MS > 0 && (now - interCycleStartedTs) >= INTERSTITIEL_APRES_MS;

    if (needAdByActions || needAdByTime) {
      var shown = await showInterstitial();

      // si la pub a vraiment été affichée, les compteurs sont déjà remis à zéro
      // et on ne recompte pas cette action pour éviter le spam
      if (shown) {
        return;
      }
    }

    // Compte l'action réelle seulement si aucune pub n'a été affichée
    interActionsCount++;
    localStorage.setItem('inter_actions_count', String(interActionsCount));
  }

  // Compat restreinte : modes
  function isModeInfini(m){ m=(m||'').toLowerCase(); return ['infini','infinite','endless'].includes(m); }
  function isModeClassique(m){ m=(m||'').toLowerCase(); return ['classique','classic','normal','arcade'].includes(m); }
  function isModeDuel(m){ m=(m||'').toLowerCase(); return ['duel','versus','vs','1v1','duo'].includes(m); }

  // Ancien hook : conserve mais protège pour ne PAS compter les clics qui ouvrent une popup
  async function maybeShowInterBeforeAction(mode) {
    if (isModeDuel(mode)) return;

    // ⛔ Popup ouverte (reprise ?): ne PAS compter
    if (window.__ads_waiting_choice) return;

    // Délègue à la nouvelle API (action réelle)
    await adsMarkGameLaunched(mode);
  }

  // =============================
  // Wrappers "événements jeu" (à appeler au moment RÉEL du départ)
  // =============================
  async function partieCommencee(mode){
    mode = String(mode || 'classique').toLowerCase();
    // NE PAS compter si une popup va s'ouvrir : on comptera sur Reprendre/Recommencer
    if (window.__ads_waiting_choice) return;
    if (isModeInfini(mode) || isModeClassique(mode)) {
      await adsMarkGameLaunched(mode);
    }
  }
  async function partieReprisee(mode){
    mode = String(mode || 'classique').toLowerCase();
    // La popup vient d'être validée → on la ferme côté flag
    window.__ads_waiting_choice = false;
    if (isModeInfini(mode) || isModeClassique(mode)) {
      await adsMarkGameLaunched(mode);
    }
  }
  async function partieRecommencee(mode){
    mode = String(mode || 'classique').toLowerCase();
    window.__ads_waiting_choice = false;
    if (isModeInfini(mode) || isModeClassique(mode)) {
      await adsMarkGameLaunched(mode);
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

  // ➜ Nouvelle API claire si tu veux l’appeler toi-même
  window.adsMarkGameLaunched  = adsMarkGameLaunched;

  // ➜ Compat avec ton code existant
  window.partieCommencee      = partieCommencee;
  window.partieReprisee       = partieReprisee;
  window.partieRecommencee    = partieRecommencee;
  window.partieTerminee       = partieTerminee;

  window.hasNoAds             = hasNoAds;
  window.VRAds                = Object.assign({}, window.VRAds || {}, {
    getGoogleConsentInfo: getGoogleConsentInfo,
    maybeShowGoogleConsentFormOnIndexAfterIntro: maybeShowGoogleConsentFormOnIndexAfterIntro,
    showGooglePrivacyOptionsForm: showGooglePrivacyOptionsForm
  });

  // (Optionnel) expose un helper pour ton UI de reprise
  window.adsSetResumePopupOpen = function (isOpen) {
    window.__ads_waiting_choice = !!isOpen;
  };

  startInterstitialScreenClock();
  setTimeout(function(){ maybeShowInterstitialByScreenTime().catch(function(){}); }, 1200);

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
