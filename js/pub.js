// =============================
// PUB.JS — AdMob (Capacitor Community, no-import) + SSV Supabase
// Version NATIVE PROD (HTML + Capacitor) — 2025-09-04
//  • Interstitiel au DÉBUT de la 4e action (nouvelle/reprise/recommencer)
//  • Fix end-card freeze + revive no-SSV-block conservés
// =============================
//
// Chargement côté HTML (exemple):
//   <script src="cordova.js"></script> <!-- généré par Capacitor -->
//   <script src="js/pub.js"></script>
//
// ❗ Points clés :
// - AUCUN import / AUCUN type="module".
// - API via Capacitor.Plugins.AdMob (community).
// - Pas d’IDs de test ici (mettre initializeForTesting=false en prod).
// - Crédit STRICTEMENT côté serveur via SSV (Edge Function). Ici on ne fait que rafraîchir l’UI.
//   👉 Sauf pour "revive": on n’attend PAS le SSV pour relancer la partie.
//
// Expose global :
//   window.showInterstitial, window.showRewardBoutique, window.showRewardVcoins, window.showRewardRevive
//   window.partieCommencee, window.partieReprisee, window.partieRecommencee, window.partieTerminee
//   window.hasNoAds, window.onRewardClosed
// =============================
(function () {
  'use strict';

  // ------- Raccourcis globaux -------
  var Capacitor = (window.Capacitor || {});
  var AdMob = (Capacitor.Plugins && Capacitor.Plugins.AdMob) ? Capacitor.Plugins.AdMob : null;

  // ------- STRICT PROD -------
  var __DEV_ADS__ = false;      // si tu veux tester avec init=testing, passe à true en debug
  var SHOW_DIAG_PANEL = false;  // pas de panneau overlay

  // --- Tes Ad Units réelles ---
  var AD_UNIT_ID_INTERSTITIEL = 'ca-app-pub-6837328794080297/9890831605';
  var AD_UNIT_ID_REWARDED     = 'ca-app-pub-6837328794080297/3006407791';

  // --- Réglages interstitiels ---
  // On déclenche la pub AU DÉBUT de la 4ᵉ action (après 3 actions cumulées)
  var INTERSTITIEL_APRES_X_ACTIONS = 3;
  var INTER_COOLDOWN_MS = 0; // anti-spam (0 = off)

  // --- Récompenses par défaut (affichage uniquement ; crédit via SSV serveur) ---
  window.REWARD_JETONS = typeof window.REWARD_JETONS === 'number'  ? window.REWARD_JETONS : 1;
  window.REWARD_VCOINS = typeof window.REWARD_VCOINS === 'number'  ? window.REWARD_VCOINS : 300;
  window.REWARD_REVIVE = typeof window.REWARD_REVIVE === 'boolean' ? window.REWARD_REVIVE : true;

  // --- SSV activé ---
  var ENABLE_SSV = true;

  // --- Flags d'état ---
  var isRewardShowing = false;
  window.__ads_active = false; // flag global anti-back/anti-overlays côté app

  // --- Compteur unifié persisté ---
  // Compte TOUTES les "actions de jeu" (nouvelle + reprise + recommencer), hors Duel.
  var interActionsCount = parseInt(localStorage.getItem('inter_actions_count') || '0', 10);

  // =============================
  // Utils / Auth / Consent
  // =============================
  async function ensureAuth() {
    try {
      if (typeof window.bootstrapAuthAndProfile === 'function') {
        await window.bootstrapAuthAndProfile();
      }
    } catch (_e) {}
  }

  function getPersonalizedAdsGranted() {
    // RGPD : lecture de tes drapeaux locaux
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
    // npa: '1' = non-personnalisées ; '0' = personnalisées
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
  // Helpers anti-surcouches avant/après show()
  // =============================
  function preShowAdCleanup() {
    try {
      // Pause les In-App Messages OneSignal (si présent)
      if (window.OneSignal && window.OneSignal.InAppMessages) {
        window.OneSignal.InAppMessages.paused = true;
      }
      // Cache/retire les overlays HTML éventuels
      document.querySelectorAll('.modal,.popup,.dialog,.backdrop').forEach(function(el){
        el.style.display = 'none';
      });
      var blocker = document.querySelector('.overlay--ad, .overlay, .loading');
      if (blocker) blocker.remove();

      // Verrou global d'UI (anti-clics fantômes)
      try { document.documentElement.style.pointerEvents = 'none'; } catch(_) {}

      // Flag "pub active"
      window.__ads_active = true;
    } catch(_) {}
  }

  function postAdCleanup() {
    try {
      if (window.OneSignal && window.OneSignal.InAppMessages) {
        window.OneSignal.InAppMessages.paused = false;
      }
      window.__ads_active = false;

      // Optionnel : retirer une classe overlay si utilisée côté app
      var ov = document.querySelector('.overlay--ad');
      if (ov) ov.classList.remove('overlay--ad');

      // Déverrou global d'UI
      try { document.documentElement.style.pointerEvents = ''; } catch(_) {}
    } catch(_) {}
  }

  // =============================
  // Enregistrement des listeners (1 seule fois)
  // =============================
  function registerAdEventsOnce() {
    try {
      if (!AdMob || !AdMob.addListener || window.__adListenersRegistered) return;
      window.__adListenersRegistered = true;

      // Filet global pour réactiver l’UI
      if (typeof window.onRewardClosed !== 'function') {
        window.onRewardClosed = function () {
          try { postAdCleanup(); } catch (_) {}
        };
      }

      // Petite protection try/catch silencieuse
      var SAFE = (fn)=> (arg)=> { try { fn && fn(arg); } catch(e) {} };

      // Événements possibles selon versions du plugin community
      var map = [
        ['onAdFullScreenContentOpened', () => {
          isRewardShowing = true;
          window.__ads_active = true;
          console.log('[Ad] Opened');
        } ],
        ['onAdDismissedFullScreenContent', () => {
          console.log('[Ad] Dismissed (full screen content)');
          isRewardShowing = false;
          postAdCleanup();
          window.onRewardClosed && window.onRewardClosed();
        } ],
        ['onAdFailedToShowFullScreenContent', (err) => {
          console.warn('[Ad] Failed to show', err);
          isRewardShowing = false;
          postAdCleanup();
          window.onRewardClosed && window.onRewardClosed();
        } ],

        // Alias/legacy possibles (rewarded)
        ['onRewardedAdDismissed', () => {
          console.log('[Reward] Dismissed (legacy rewarded)');
          isRewardShowing = false;
          postAdCleanup();
          window.onRewardClosed && window.onRewardClosed();
        } ],
        ['onRewardedVideoAdClosed', () => {
          console.log('[Reward] Closed (very old name)');
          isRewardShowing = false;
          postAdCleanup();
          window.onRewardClosed && window.onRewardClosed();
        } ],

        // Gagne la récompense (⚠️ crédit via SSV serveur uniquement)
        ['onRewarded', (data) => {
          console.log('[Reward] User earned reward', data);
        } ],
      ];

      for (var i=0;i<map.length;i++) {
        var evt = map[i][0], handler = map[i][1];
        try { AdMob.addListener(evt, SAFE(handler)); } catch(e) {}
      }

      console.log('[AdMob] Listeners enregistrés.');
    } catch (e) {
      console.warn('[AdMob] register listeners err:', e && (e.message || e));
    }
  }

  // =============================
  // Init (silencieux si web)
  // =============================
  (async function initAdMobOnce() {
    try {
      if (!isNative()) {
        // En web, pas de plugin → masquer boutons reward si tu en as
        document.addEventListener('DOMContentLoaded', function(){
          document.querySelectorAll('.btn-reward').forEach(function(el){ el.style.display = 'none'; });
        });
        console.warn('[AdMob] Web mode: plugin indisponible.');
        return;
      }
      if (!AdMob || !AdMob.initialize) {
        console.error('[AdMob] Plugin community non disponible (Capacitor.Plugins.AdMob absent).');
        return;
      }
      await AdMob.initialize({
        requestTrackingAuthorization: false,
        initializeForTesting: __DEV_ADS__ // mettre false en prod
      });
      registerAdEventsOnce();
      console.log('[AdMob] Ready (native, community plugin).');
    } catch (e) {
      console.warn('[AdMob] init ERR:', e && (e.message || e));
    }
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
    } catch (e) {
      console.warn('[PUB] get_balances err', e);
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
        else console.log('[Reward]', msg); // fallback console, surtout pas alert()
      }
      if (typeof window.renderThemes === 'function') window.renderThemes();
    } catch(_) {}
  }

  async function refreshBalanceUntil(timeoutMs, stepMs, type) {
    var t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 20000)) {
      try {
        var b = await __getBalances();
        notifyRewardUI(b, type);
        return true;
      } catch (e) { /* ignore and retry */ }
      await new Promise(r => setTimeout(r, stepMs || 2000));
    }
    return false;
  }

  function waitDismissedOnce() {
    return new Promise((resolve) => {
      var off1 = AdMob.addListener && AdMob.addListener('onAdDismissedFullScreenContent', () => {
        try { off1 && off1.remove && off1.remove(); } catch(_) {}
        try { off2 && off2.remove && off2.remove(); } catch(_) {}
        resolve(true);
      });
      var off2 = AdMob.addListener && AdMob.addListener('onAdFailedToShowFullScreenContent', () => {
        try { off1 && off1.remove && off1.remove(); } catch(_) {}
        try { off2 && off2.remove && off2.remove(); } catch(_) {}
        resolve(false);
      });
    });
  }

  // =============================
  // SSV token (Edge Function)
  // =============================
  async function getSsvToken(type, amount) {
    var sb = window.sb;
    var supabaseUrl = window.SUPABASE_URL || (typeof window.SB_URL !== 'undefined' ? window.SB_URL : '');
    if (!supabaseUrl) throw new Error('SUPABASE_URL manquant');

    var sess = await sb.auth.getSession();
    var at = (sess && sess.data && sess.data.session && sess.data.session.access_token) || '';

    var res = await fetch(supabaseUrl + '/functions/v1/reward-token', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: String(type||'jeton'), amount: Number(amount||1) })
    });
    if (!res.ok) throw new Error('reward-token failed');
    var json = await res.json();
    return json.token;
  }

  // =============================
  // Rewarded (LOAD/SHOW) — SSV + revive non bloquant
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
      if (!isNative()) { console.warn('[Rewarded] non-native'); onDone&&onDone(false); return; }
      if (!AdMob || !AdMob.prepareRewardVideoAd || !AdMob.showRewardVideoAd) {
        console.warn('[Rewarded] API indisponible (community)');
        onDone&&onDone(false);
        return;
      }

      await ensureAuth();
      var sb = window.sb;
      var gu = await sb.auth.getUser();
      var ssvUserId = gu && gu.data && gu.data.user && gu.data.user.id;
      if (!ssvUserId) throw new Error('Utilisateur non authentifié');

      var adId = AD_UNIT_ID_REWARDED;

      // SSV: on demande un nonce signé côté backend
      var token = ENABLE_SSV ? await getSsvToken(type, amount) : null;
      // IMPORTANT : customData doit contenir UNIQUEMENT le token (pas un JSON)
      var customPayload = ENABLE_SSV ? String(token || '') : undefined;

      console.log('[Rewarded] prepare...', adId);
      await AdMob.prepareRewardVideoAd({
        adId: adId,
        requestOptions: buildAdMobRequestOptions(),
        serverSideVerification: ENABLE_SSV ? { userId: ssvUserId, customData: customPayload } : undefined
      });

      // --- Coup de filet anti-surcouches avant d'afficher ---
      preShowAdCleanup();

      console.log('[Rewarded] show...');
      isRewardShowing = true;

      // Watchdog 120s : si aucun "dismissed" ne remonte
      watchdog = setTimeout(function(){
        console.warn('[Rewarded] Watchdog timeout -> cleanup forcé');
        unlockUI();
      }, 120000);

      // On arme un "attente de fermeture" AVANT le show
      var dismissedP = waitDismissedOnce();

      // Affiche la pub
      await AdMob.showRewardVideoAd();

      // ⚠️ On attend la FERMETURE réelle de la pub (end-card incluse)
      var closed = await dismissedP;

      // === Différenciation des types ===
      if (String(type) === 'revive') {
        // 👉 Revive: on NE BLOQUE PAS sur le SSV (mais on le laisse vivre)
        try { await refreshBalanceUntil(2000, 1000, type); } catch(_) {}
        onDone && onDone(!!closed);
      } else {
        // Jetons / VCoins: on exige le crédit SSV
        var credited = await refreshBalanceUntil(20000, 2000, type);
        onDone && onDone(!!(closed && credited));
      }
    } catch (e) {
      console.warn('[Rewarded] erreur:', e && (e.message || e));
      onDone && onDone(false);
      // Préload discret pour prochaine fois (best effort)
      try {
        AdMob.prepareRewardVideoAd({
          adId: AD_UNIT_ID_REWARDED,
          requestOptions: buildAdMobRequestOptions()
        }).catch(function(){});
      } catch(_) {}
    } finally {
      // ✅ Garantit la reprise de l’UI même si aucun event 'dismissed' n'est remonté
      unlockUI();
    }
  }

  // =============================
  // Interstitiel (LOAD/SHOW)
  // =============================
  async function showInterstitial() {
    try {
      if (await hasNoAds()) { console.log('[Inter] bloqué (NoPub)'); return false; }
      if (!isNative()) { console.log('[Inter] non-native'); return false; }
      if (!AdMob || !AdMob.prepareInterstitial || !AdMob.showInterstitial) {
        console.log('[Inter] API indisponible (community)');
        return false;
      }
      if (!canShowInterstitialNow()) { console.log('[Inter] cooldown'); return false; }

      var adId = AD_UNIT_ID_INTERSTITIEL;

      console.log('[Inter] prepare...', adId);
      await AdMob.prepareInterstitial({
        adId: adId,
        requestOptions: buildAdMobRequestOptions()
      });

      // --- Coup de filet anti-surcouches avant d'afficher ---
      preShowAdCleanup();

      console.log('[Inter] show...');
      var watchdog = setTimeout(function(){ postAdCleanup(); }, 120000);
      var res = await AdMob.showInterstitial();
      clearTimeout(watchdog);

      // Si on arrive ici, Android a normalement renvoyé (fermeture ou click-out)
      postAdCleanup();

      if (res !== false) {
        markInterstitialShownNow();
        // Préload discret
        setTimeout(function(){
          AdMob.prepareInterstitial({ adId: adId, requestOptions: buildAdMobRequestOptions() }).catch(function(){});
        }, 1200);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Inter] err:', (e && e.message) || e);
      try {
        AdMob.prepareInterstitial({ adId: AD_UNIT_ID_INTERSTITIEL, requestOptions: buildAdMobRequestOptions() }).catch(function(){});
      } catch(_) {}
      postAdCleanup();
      return false;
    }
  }

  // =============================
  // Compteurs / Déclencheur interstitiels
  // =============================
  function isModeInfini(m){ m=(m||'').toLowerCase(); return ['infini','infinite','endless'].includes(m); }
  function isModeClassique(m){ m=(m||'').toLowerCase(); return ['classique','classic','normal','arcade'].includes(m); }
  function isModeDuel(m){ m=(m||'').toLowerCase(); return ['duel','versus','vs','1v1','duo'].includes(m); }

  // 👉 Logique unifiée : pub AU DÉBUT de la 4e action (nouvelle/reprise/recommencer), Duel exclu
  async function maybeShowInterBeforeAction(mode) {
    if (isModeDuel(mode)) return; // jamais en Duel

    // Si déjà 3 actions cumulées -> afficher la pub AVANT de lancer la 4ᵉ
    var needAd = interActionsCount >= INTERSTITIEL_APRES_X_ACTIONS;
    if (needAd) {
      interActionsCount = 0; // reset avant d'afficher
      localStorage.setItem('inter_actions_count', '0');
      await showInterstitial(); // affichée AVANT de lancer l'action
    }

    // On compte l'action qui démarre maintenant
    interActionsCount++;
    localStorage.setItem('inter_actions_count', String(interActionsCount));
  }

  // =============================
  // Wrappers "événements jeu" (à appeler AVANT de lancer le gameplay)
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
  function partieTerminee(){ console.log('[Game] Partie terminée.'); }

  // =============================
  // Cooldown helpers
  // =============================
  function canShowInterstitialNow() {
    if (!INTER_COOLDOWN_MS) return true;
    var last = parseInt(localStorage.getItem('lastInterstitialTs') || '0', 10);
    return (Date.now() - last) >= INTER_COOLDOWN_MS;
  }
  function markInterstitialShownNow() {
    localStorage.setItem('lastInterstitialTs', String(Date.now()));
  }

  // =============================
  // Exports globaux
  // =============================
  window.showInterstitial   = showInterstitial;
  window.showRewardBoutique = function(){ return new Promise(function(resolve){ showRewardedType('jeton', window.REWARD_JETONS, function(ok){ resolve(!!ok); }); }); };
  window.showRewardVcoins   = function(){ return new Promise(function(resolve){ showRewardedType('vcoin', window.REWARD_VCOINS, function(ok){ resolve(!!ok); }); }); };
  window.showRewardRevive   = function(callback){ if (!window.REWARD_REVIVE) return; showRewardedType('revive', 0, function(ok){ if (ok && typeof callback === 'function') callback(); }); };

  window.partieCommencee   = partieCommencee;   // nouvelle partie
  window.partieReprisee    = partieReprisee;    // reprise d'une partie
  window.partieRecommencee = partieRecommencee; // "Recommencer" via popup
  window.partieTerminee    = partieTerminee;

  window.hasNoAds = hasNoAds;

  // Alias compat
  window.showInterstitialAd = showInterstitial;
  window.showRewardedType   = showRewardedType;

  // Petit diag optionnel
  (function diag() {
    if (!SHOW_DIAG_PANEL) return;
    console.log('[AdDiag]', {
      native: isNative(),
      hasPlugin: !!AdMob
    });
  })();

})();
