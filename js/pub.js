// =============================
// PUB.JS — AdMob (Capacitor Community) + SSV Supabase — version complète (2025-09-04)
// =============================
//
// ⚠️ Charge ce fichier en module :
// <script type="module" src="js/pub.js"></script>
//
// - Utilise @capacitor-community/admob (Capacitor 7).
// - API moderne: InterstitialAd.load() / show(), RewardAd.load() / show().
// - Garde toute ta logique (RGPD, SSV, counters, wrappers compat).
// - Si tu tournes en web/Chrome, le plugin n’existe pas → on masque les boutons reward.
//
// =============================
import { Capacitor } from '@capacitor/core';
import { AdMob, InterstitialAd, RewardAd } from '@capacitor-community/admob';

// ------- MODE TEST / DIAGNOSTIC -------
const __DEV_ADS__ =
  (typeof window !== 'undefined' && (location.search || '').includes('ads=test')) ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('adsTest') === 'true') ||
  false; // <- mets true ici pour forcer le mode test

const SHOW_DIAG_PANEL = true; // mets false pour cacher le panneau overlay

// IDs de test officiels AdMob
const TEST_INTER  = 'ca-app-pub-3940256099942544/1033173712';
const TEST_REWARD = 'ca-app-pub-3940256099942544/5224354917';

// --- Tes Ad Units réelles (inchangées)
const AD_UNIT_ID_INTERSTITIEL = 'ca-app-pub-6837328794080297/9890831605';
const AD_UNIT_ID_REWARDED     = 'ca-app-pub-6837328794080297/3006407791';

// --- Réglages interstitiels
const INTERSTITIEL_APRES_X_PARTIES = 3;          // 3 nouvelles parties (Infini OU Classique)
const INTERSTITIEL_APRES_X_REPRISES_INF = 3;     // 3 reprises (Infini uniquement)
const INTER_COOLDOWN_MS = 0;                     // anti-spam (0 = off)

// --- Récompenses par défaut (inchangées)
window.REWARD_JETONS = typeof window.REWARD_JETONS === 'number' ? window.REWARD_JETONS : 1;
window.REWARD_VCOINS = typeof window.REWARD_VCOINS === 'number' ? window.REWARD_VCOINS : 300;
window.REWARD_REVIVE = typeof window.REWARD_REVIVE === 'boolean' ? window.REWARD_REVIVE : true;

// --- SSV (server-side verification) activé ?
const ENABLE_SSV = true;

// --- Compteurs persistés
let interPartiesEligibles = parseInt(localStorage.getItem('inter_parties_eligibles') || '0', 10);
let interReprisesInfini   = parseInt(localStorage.getItem('inter_reprises_infini')   || '0', 10);

// =============================
// Utilitaires / Auth / Consent
// =============================
async function ensureAuth() {
  try {
    if (typeof window.bootstrapAuthAndProfile === 'function') {
      await window.bootstrapAuthAndProfile(); // lock interne -> pas de doublons
    }
  } catch (_e) {}
}

// RGPD → ads personnalisées ou non
function getPersonalizedAdsGranted() {
  const rgpd = localStorage.getItem('rgpdConsent'); // "accept"|"refuse"|null
  const adsConsent = (localStorage.getItem('adsConsent') || '').toLowerCase();
  const adsEnabled = (localStorage.getItem('adsEnabled') || '').toLowerCase();
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
function buildAdMobRequestConfig() {
  const personalized = getPersonalizedAdsGranted();
  return { npa: personalized ? '0' : '1' };
}

// =============================
// Diag panel (plugin présent ?)
// =============================
(function diagPanel(){
  if (!SHOW_DIAG_PANEL) return;
  const badge = ok => ok ? '✅' : '❌';
  const plat  = Capacitor?.getPlatform?.() || 'unknown';

  const msg = [
    `Platform: ${plat}`,
    `AdMob.initialize: ${badge(!!AdMob?.initialize)}`,
    `Interstitial API: ${badge(!!InterstitialAd?.load && !!InterstitialAd?.show)}`,
    `Rewarded API: ${badge(!!RewardAd?.load && !!RewardAd?.show)}`,
    `Mode test Ads: ${__DEV_ADS__ ? 'ON' : 'OFF'}`
  ].join('\n');

  console.log('[ADS CHECK]\n' + msg);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:99999;left:10px;top:10px;background:#111;color:#fff;padding:10px 12px;font:12px/1.2 monospace;border-radius:8px;opacity:.92;white-space:pre';
  box.textContent = msg + '\n(toucher pour fermer • retirez ce panneau ensuite)';
  box.addEventListener('click', ()=> box.remove());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(box), {once:true});
  } else {
    document.body.appendChild(box);
  }
})();

// =============================
// Init AdMob (silencieux si web)
// =============================
(async function initAdMobOnce() {
  try {
    if (!Capacitor.isNativePlatform()) {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.btn-reward').forEach(el => el.style.display = 'none');
      });
      console.warn('[AdMob] Web mode: plugin indisponible.');
      return;
    }

    if (typeof AdMob?.initialize === 'function') {
      console.log('[AdMob] init...', __DEV_ADS__ ? '(testing mode)' : '');
      await AdMob.initialize({ initializeForTesting: !!__DEV_ADS__ });
      console.log('[AdMob] initialisé');
    } else {
      console.warn('[AdMob] initialize() indisponible.');
    }
  } catch (e) {
    console.warn('[AdMob] init ERR:', e);
  }
})();

// =============================
// Balances / NoAds
// =============================
async function __getBalances() {
  await ensureAuth();
  const sb = window.sb;
  const { data, error } = await sb.rpc('get_balances');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {};
}
async function hasNoAds() {
  try {
    const b = await __getBalances();
    return !!b?.nopub;
  } catch (e) {
    console.warn('[PUB] get_balances err', e);
    return false; // en cas d'erreur, ne pas bloquer
  }
}

// =============================
// Helpers AdMob
// =============================
function isAdmobAvailable() {
  return Capacitor.isNativePlatform() &&
         typeof InterstitialAd?.load === 'function' &&
         typeof RewardAd?.load === 'function';
}
function canShowInterstitialNow() {
  if (!INTER_COOLDOWN_MS) return true;
  const last = parseInt(localStorage.getItem('lastInterstitialTs') || '0', 10);
  return (Date.now() - last) >= INTER_COOLDOWN_MS;
}
function markInterstitialShownNow() {
  localStorage.setItem('lastInterstitialTs', Date.now().toString());
}

// =============================
// SSV token côté serveur
// =============================
async function getSsvToken(type, amount) {
  const sb = window.sb;
  const supabaseUrl = window.SUPABASE_URL || (typeof SB_URL !== 'undefined' ? SB_URL : '');
  if (!supabaseUrl) throw new Error('SUPABASE_URL manquant');

  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/reward-token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type, amount })
  });
  if (!res.ok) throw new Error('reward-token failed');
  const { token } = await res.json();
  return token;
}

// =============================
// Rewarded générique (load/show)
// =============================
async function showRewardedType(type, amount, onDone) {
  try {
    if (!isAdmobAvailable()) {
      console.warn('[Rewarded] plugin indisponible');
      alert('Publicité récompensée indisponible.');
      onDone?.(false);
      return;
    }

    await ensureAuth();
    const sb = window.sb;
    const { data } = await sb.auth.getUser();
    const ssvUserId = data?.user?.id;
    if (!ssvUserId) throw new Error('Utilisateur non authentifié');

    const adId = __DEV_ADS__ ? TEST_REWARD : AD_UNIT_ID_REWARDED;

    // SSV
    const token = ENABLE_SSV ? await getSsvToken(type, amount) : null;
    const customPayload = ENABLE_SSV ? JSON.stringify({ type, amount, token }) : undefined;

    console.log('[Rewarded] load...', adId);
    await RewardAd.load({
      adId,
      ...buildAdMobRequestConfig(),
      serverSideVerification: ENABLE_SSV ? { userId: ssvUserId, customData: customPayload } : undefined
    });

    console.log('[Rewarded] show...');
    const res = await RewardAd.show(); // sur Android: { rewardAmount, rewardType }

    // Preload pour la prochaine fois
    setTimeout(() => {
      RewardAd.load({ adId, ...buildAdMobRequestConfig() }).catch(()=>{});
    }, 1200);

    onDone?.(!!res);
  } catch (e) {
    console.warn('[RewardedType] erreur:', e);
    onDone?.(false);
    // petit retry différé (facultatif)
    const adId = __DEV_ADS__ ? TEST_REWARD : AD_UNIT_ID_REWARDED;
    setTimeout(() => RewardAd.load({ adId, ...buildAdMobRequestConfig() }).catch(()=>{}), 1500);
  }
}

// =============================
// Interstitiel (load/show)
// =============================
async function showInterstitial() {
  try {
    if (await hasNoAds()) { console.log('[PUB] Interstitiel bloqué (NoPub)'); return false; }
    if (!canShowInterstitialNow()) { console.log('[PUB] Interstitiel cooldown'); return false; }
    if (!isAdmobAvailable()) { console.log('[PUB] Interstitiel indisponible (plugin/web/dev).'); return false; }

    const adId = __DEV_ADS__ ? TEST_INTER : AD_UNIT_ID_INTERSTITIEL;

    console.log('[Inter] load...', adId);
    await InterstitialAd.load({ adId, ...buildAdMobRequestConfig() });

    console.log('[Inter] show...');
    const res = await InterstitialAd.show();
    if (res !== false) {
      markInterstitialShownNow();
      // pre-load discret
      setTimeout(() => InterstitialAd.load({ adId, ...buildAdMobRequestConfig() }).catch(()=>{}), 1200);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Interstitiel ERR:', e?.message || e);
    // retry discret (optionnel)
    const adId = __DEV_ADS__ ? TEST_INTER : AD_UNIT_ID_INTERSTITIEL;
    setTimeout(() => InterstitialAd.load({ adId, ...buildAdMobRequestConfig() }).catch(()=>{}), 1500);
    return false;
  }
}

// =============================
// Wrappers dédiés (boutique, vcoins, revive)
// =============================
function showRewardBoutique() {
  return new Promise((resolve) => {
    showRewardedType('jeton', window.REWARD_JETONS, async (ok) => {
      if (!ok) return resolve(false);
      setTimeout(async () => {
        try { const b = await __getBalances(); alert(`Récompense validée ! Jetons: ${b?.jetons ?? '--'}`); } catch(_) {}
        renderThemes?.(); resolve(true);
      }, 1200);
    });
  });
}
function showRewardVcoins() {
  return new Promise((resolve) => {
    showRewardedType('vcoin', window.REWARD_VCOINS, async (ok) => {
      if (!ok) return resolve(false);
      setTimeout(async () => {
        try { const b = await __getBalances(); alert(`Récompense validée ! VCoins: ${b?.vcoins ?? '--'}`); } catch(_) {}
        renderThemes?.(); resolve(true);
      }, 1200);
    });
  });
}
function showRewardRevive(callback) {
  if (!window.REWARD_REVIVE) return;
  showRewardedType('revive', 0, (ok) => { if (ok) callback?.(); });
}

// =============================
// Compteurs / Déclencheurs interstitiels
// =============================
function isModeInfini(m){ m=(m||'').toLowerCase(); return ['infini','infinite','endless'].includes(m); }
function isModeClassique(m){ m=(m||'').toLowerCase(); return ['classique','classic','normal','arcade'].includes(m); }
function isModeDuel(m){ m=(m||'').toLowerCase(); return ['duel','versus','vs','1v1','duo'].includes(m); }

// Nouvelle partie
async function partieCommencee(mode='classique') {
  const m = String(mode || 'classique').toLowerCase();
  if (isModeDuel(m)) return; // jamais en Duel
  if (isModeInfini(m) || isModeClassique(m)) {
    interPartiesEligibles++;
    localStorage.setItem('inter_parties_eligibles', String(interPartiesEligibles));
    if (interPartiesEligibles >= INTERSTITIEL_APRES_X_PARTIES) {
      interPartiesEligibles = 0; localStorage.setItem('inter_parties_eligibles', '0');
      await showInterstitial();
    }
  }
}
// Reprise (Infini uniquement)
async function partieReprisee(mode='') {
  const m = String(mode || '').toLowerCase();
  if (!isModeInfini(m)) return;
  interReprisesInfini++;
  localStorage.setItem('inter_reprises_infini', String(interReprisesInfini));
  if (interReprisesInfini >= INTERSTITIEL_APRES_X_REPRISES_INF) {
    interReprisesInfini = 0; localStorage.setItem('inter_reprises_infini','0');
    await showInterstitial();
  }
}
function partieTerminee(){ console.log('[Game] Partie terminée.'); }

// =============================
// Exports globaux (compat)
// =============================
window.showInterstitial   = showInterstitial;
window.showRewardBoutique = showRewardBoutique;
window.showRewardVcoins   = showRewardVcoins;
window.showRewardRevive   = showRewardRevive;

window.partieCommencee = partieCommencee;
window.partieReprisee  = partieReprisee;
window.partieTerminee  = partieTerminee;

window.hasNoAds = hasNoAds;

// Alias compat (ton code existant peut les appeler)
window.showInterstitialAd = showInterstitial;
window.showRewardedType   = showRewardedType;
