// =============================
// PUB.JS — AdMob (Capacitor) + SSV Supabase
// =============================

// On suppose que `window.sb` (client supabase) a été créé par userData.js (auth centralisée).

// --- Auth centralisée (pas de signInAnonymously ici)
async function ensureAuth() {
  try {
    if (typeof window.bootstrapAuthAndProfile === 'function') {
      await window.bootstrapAuthAndProfile(); // lock interne -> pas de doublons
    }
  } catch (_) {}
}

// === CONFIG ===
const INTERSTITIEL_APRES_X_PARTIES = 3;          // 3 nouvelles parties (Infini OU Classique)
const INTERSTITIEL_APRES_X_REPRISES_INF = 3;     // 3 reprises (Infini uniquement)
const INTER_COOLDOWN_MS = 0;                     // anti-spam (0 = off)

// Récompenses: valeurs par défaut sans redéclaration de const (évite collisions)
window.REWARD_JETONS = typeof window.REWARD_JETONS === 'number' ? window.REWARD_JETONS : 1;
window.REWARD_VCOINS = typeof window.REWARD_VCOINS === 'number' ? window.REWARD_VCOINS : 300;
window.REWARD_REVIVE = typeof window.REWARD_REVIVE === 'boolean' ? window.REWARD_REVIVE : true;

// Tes Ad Units
const AD_UNIT_ID_INTERSTITIEL = 'ca-app-pub-6837328794080297/9890831605';
const AD_UNIT_ID_REWARDED     = 'ca-app-pub-6837328794080297/3006407791';

const ENABLE_SSV = true;

// Compteurs persistés
let interPartiesEligibles = parseInt(localStorage.getItem('inter_parties_eligibles') || '0', 10);
let interReprisesInfini   = parseInt(localStorage.getItem('inter_reprises_infini')   || '0', 10);

// --- Consent / NPA
function getPersonalizedAdsGranted() {
  const rgpd = localStorage.getItem("rgpdConsent"); // "accept"|"refuse"|null
  const adsConsent = (localStorage.getItem("adsConsent") || "").toLowerCase();
  const adsEnabled = (localStorage.getItem("adsEnabled") || "").toLowerCase();
  if (rgpd === "refuse") return false;
  if (rgpd === "accept") {
    if (adsConsent) return adsConsent === "yes";
    if (adsEnabled) return adsEnabled === "true";
    return false;
  }
  if (adsConsent) return adsConsent === "yes";
  if (adsEnabled) return adsEnabled === "true";
  return false;
}
function buildAdMobRequestConfig() {
  const personalized = getPersonalizedAdsGranted();
  return { npa: personalized ? '0' : '1' };
}

// --- Init AdMob (silencieux sur web/dev)
(async function initAdMobOnce() {
  try {
    if (window.AdMob && typeof AdMob.initialize === 'function') {
      await AdMob.initialize({ initializeForTesting: false });
      console.log('[AdMob] initialisé');
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (!isAdmobAvailable()) {
          document.querySelectorAll('.btn-reward').forEach(el => el.style.display = 'none');
        }
      });
    }
  } catch (e) { console.warn('[AdMob] init:', e); }
})();

// --- Balances / NoAds (NoPub bloque UNIQUEMENT les interstitiels)
async function __getBalances() {
  await ensureAuth();
  const sb = window.sb;
  const { data, error } = await sb.rpc('get_balances');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {};
}
async function hasNoAds() {
  const b = await __getBalances();
  return !!b?.nopub;
}

// --- AdMob helpers
function isAdmobAvailable() { return !!(window.RewardAd && typeof RewardAd.show === 'function'); }

// === SSV: récupère un token signé côté serveur
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

// --- Rewarded générique (type = 'jeton' | 'vcoin' | 'revive')
async function showRewardedType(type, amount, onDone) {
  const sb = window.sb;
  try {
    if (!isAdmobAvailable()) { alert("Publicité récompensée indisponible."); onDone?.(false); return; }
    await ensureAuth();

    const { data } = await sb.auth.getUser();
    const ssvUserId = data?.user?.id;
    if (!ssvUserId) throw new Error("Utilisateur non authentifié");

    const token = ENABLE_SSV ? await getSsvToken(type, amount) : null;
    const customPayload = ENABLE_SSV ? JSON.stringify({ type, amount, token }) : undefined;

    await RewardAd.prepare({
      adId: AD_UNIT_ID_REWARDED,
      ...buildAdMobRequestConfig(),
      serverSideVerification: ENABLE_SSV ? { userId: ssvUserId, customData: customPayload } : undefined
    });
    const res = await RewardAd.show();
    onDone?.(!!res);
  } catch (e) { console.warn("[RewardedType] erreur:", e); onDone?.(false); }
}

// --- Interstitiel
function canShowInterstitialNow() {
  if (!INTER_COOLDOWN_MS) return true;
  const last = parseInt(localStorage.getItem('lastInterstitialTs') || '0', 10);
  return (Date.now() - last) >= INTER_COOLDOWN_MS;
}
function markInterstitialShownNow() { localStorage.setItem('lastInterstitialTs', Date.now().toString()); }

async function showInterstitial() {
  try {
    if (await hasNoAds()) { console.log("[PUB] Interstitiel bloqué (NoPub)"); return false; }
    if (!canShowInterstitialNow()) { console.log("[PUB] Interstitiel cooldown"); return false; }

    if (!(window.InterstitialAd && typeof InterstitialAd.show === 'function')) {
      console.log("[PUB] Interstitiel indisponible (web/dev).");
      return false;
    }

    await InterstitialAd.prepare({ adId: AD_UNIT_ID_INTERSTITIEL, ...buildAdMobRequestConfig() });
    const res = await InterstitialAd.show();
    if (res !== false) { markInterstitialShownNow(); return true; }
    return false;
  } catch (e) {
    console.warn("Interstitiel:", e?.message || e);
    return false;
  }
}

// --- Rewarded (promises)
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

// --- Modes & déclencheurs interstitiels
function isModeInfini(m){ m=(m||"").toLowerCase(); return ["infini","infinite","endless"].includes(m); }
function isModeClassique(m){ m=(m||"").toLowerCase(); return ["classique","classic","normal","arcade"].includes(m); }
function isModeDuel(m){ m=(m||"").toLowerCase(); return ["duel","versus","vs","1v1","duo"].includes(m); }

// Nouvelle partie
async function partieCommencee(mode="classique") {
  const m = String(mode || "classique").toLowerCase();
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
async function partieReprisee(mode="") {
  const m = String(mode || "").toLowerCase();
  if (!isModeInfini(m)) return;
  interReprisesInfini++;
  localStorage.setItem('inter_reprises_infini', String(interReprisesInfini));
  if (interReprisesInfini >= INTERSTITIEL_APRES_X_REPRISES_INF) {
    interReprisesInfini = 0; localStorage.setItem('inter_reprises_infini','0');
    await showInterstitial();
  }
}
function partieTerminee(){ console.log("[Game] Partie terminée."); }

// --- Exports
window.showInterstitial   = showInterstitial;
window.showRewardBoutique = showRewardBoutique;
window.showRewardVcoins   = showRewardVcoins;
window.showRewardRevive   = showRewardRevive;

window.partieCommencee = partieCommencee;
window.partieReprisee  = partieReprisee;
window.partieTerminee  = partieTerminee;

window.hasNoAds = hasNoAds;

// --- Alias attendus par le jeu (compat)
window.showInterstitialAd = showInterstitial;
window.showRewardedType   = showRewardedType;
