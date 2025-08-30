// =============================
// PUB.JS — Version AdMob (Capacitor) + SSV Supabase
// =============================

// =============================
// INIT SUPABASE (création unique, mode Capacitor)
// =============================
// On suppose que `sb` (client supabase) est déjà créé globalement dans index.html

// Petite sécurité : s’assurer d’une session (anonyme si besoin)
async function ensureAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) await sb.auth.signInAnonymously();
  } catch (_) {}
}

// === CONFIG GLOBALE ===
const INTERSTITIEL_APRES_X_PARTIES = 3;  // Interstitiel au DÉBUT de la 3e partie
const INTER_COOLDOWN_MS = 0;             // Anti-spam interstitiel (ms) — 0 pour off

// Récompenses logiques in-game
const REWARD_JETONS = 1;
const REWARD_VCOINS = 300;
const REWARD_REVIVE = true;

// Ad Unit IDs (tes blocs)
const AD_UNIT_ID_INTERSTITIEL = 'ca-app-pub-6837328794080297/9890831605';
const AD_UNIT_ID_REWARDED     = 'ca-app-pub-6837328794080297/3006407791';

// SSV (server-side verification) — active par défaut (pro & sûr)
const ENABLE_SSV = true;

// Compteur local parties
let compteurParties = parseInt(localStorage.getItem("compteurParties") || "0", 10);

// =============================
// CONSENTEMENT (RGPD / pubs personnalisées)
// =============================
function getPersonalizedAdsGranted() {
  const rgpd = localStorage.getItem("rgpdConsent"); // "accept" | "refuse" | null
  const adsConsent = (localStorage.getItem("adsConsent") || "").toLowerCase(); // "yes" | "no" | ""
  const adsEnabled = (localStorage.getItem("adsEnabled") || "").toLowerCase(); // "true" | "false" | ""

  if (rgpd === "refuse") return false;
  if (rgpd === "accept") {
    if (adsConsent) return adsConsent === "yes";
    if (adsEnabled) return adsEnabled === "true";
    return false;
  }
  if (adsConsent) return adsConsent === "yes";
  if (adsEnabled) return adsEnabled === "true";
  return false; // par défaut: non personnalisées
}

function buildAdMobRequestConfig() {
  const personalized = getPersonalizedAdsGranted();
  return {
    npa: personalized ? '0' : '1', // "1" = non-personnalisées, "0" = personnalisées
  };
}

// =============================
// INIT AdMob
// =============================
(async function initAdMobOnce() {
  try {
    if (window.Admob && typeof AdMob.initialize === 'function') {
      await AdMob.initialize({ initializeForTesting: false });
      console.log('[AdMob] initialisé');
    } else {
      console.log('[AdMob] plugin non détecté (web/dev). Les rewarded sont désactivées ici.');
      // Option UI: masquer boutons reward sur web
      document.addEventListener('DOMContentLoaded', () => {
        if (!isAdmobAvailable()) {
          document.querySelectorAll('.btn-reward').forEach(el => el.style.display = 'none');
        }
      });
    }
  } catch (e) {
    console.warn('[AdMob] Erreur init:', e);
  }
})();

// =============================
// UTILITAIRES UTILISATEUR
// =============================

// ID local legacy (non utilisé pour créditer)
function getUserId() {
  let id = localStorage.getItem('user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('user_id', id);
  }
  return id;
}

// =============================
// RPC sécurisées (Supabase)
// =============================
async function __getBalances() {
  await ensureAuth();
  const { data, error } = await sb.rpc('get_balances');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {};
}

async function hasNoAds() {
  const b = await __getBalances();
  return !!b?.nopub;
}

// (Ancien crédit côté client — non utilisé en SSV mais on les garde si besoin ailleurs)
async function addJetonsSupabase(amount) {
  await ensureAuth();
  const delta = Number(amount) || 0;
  const { error } = await sb.rpc('ajouter_jetons', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.jetons ?? 0;
}
async function addVCoinsSupabase(amount) {
  await ensureAuth();
  const delta = Number(amount) || 0;
  const { error } = await sb.rpc('ajouter_vcoins', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.vcoins ?? 0;
}

// =============================
// Helpers AdMob / SSV
// =============================
function isAdmobAvailable() {
  return !!(window.Capacitor && window.RewardAd && typeof RewardAd.show === 'function');
}

async function getSupabaseUserId() {
  await ensureAuth();
  const { data } = await sb.auth.getUser();
  return data?.user?.id; // UUID supabase (auth_id)
}

async function getSsvToken() {
  const supabaseUrl = sb?.supabaseUrl || window.SUPABASE_URL;
  if (!supabaseUrl) throw new Error('SUPABASE_URL manquant');
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/reward-token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
  });
  if (!res.ok) throw new Error('reward-token failed');
  const { token } = await res.json();
  return token;
}

// >>> NOUVEAU : helper générique pour typer la récompense <<<
async function showRewardedType(type, amount, onDone) {
  try {
    if (!isAdmobAvailable()) {
      alert("Publicité avec récompense indisponible sur cette plateforme.");
      onDone?.(false); return;
    }
    await ensureAuth();
    const { data } = await sb.auth.getUser();
    const ssvUserId = data?.user?.id;
    if (!ssvUserId) throw new Error("Utilisateur non authentifié");

    const token = await getSsvToken();
    const customPayload = JSON.stringify({ type, amount, token });

    await RewardAd.prepare({
      adId: AD_UNIT_ID_REWARDED,
      ...buildAdMobRequestConfig(),
      serverSideVerification: { userId: ssvUserId, customData: customPayload }
    });

    const res = await RewardAd.show();
    onDone?.(!!res);
  } catch (e) {
    console.warn("[RewardedType] erreur:", e);
    onDone?.(false);
  }
}

// =============================
// Interstitiel
// =============================
function canShowInterstitialNow() {
  if (!INTER_COOLDOWN_MS) return true;
  const last = parseInt(localStorage.getItem('lastInterstitialTs') || '0', 10);
  return (Date.now() - last) >= INTER_COOLDOWN_MS;
}
function markInterstitialShownNow() {
  localStorage.setItem('lastInterstitialTs', Date.now().toString());
}

async function showInterstitial() {
  if (await hasNoAds()) {
    console.log("[PUB] Interstitiel bloquée (NoPub activé)");
    return;
  }
  if (!canShowInterstitialNow()) {
    console.log("[PUB] Interstitiel non affichée (cooldown actif)");
    return;
  }
  try {
    if (window.Admob && window.InterstitialAd) {
      await InterstitialAd.prepare({
        adId: AD_UNIT_ID_INTERSTITIEL,
        ...buildAdMobRequestConfig(),
      });
      await InterstitialAd.show();
      console.log("[PUB] Interstitiel AdMob affichée");
      markInterstitialShownNow();
      return;
    }
    console.log("[PUB] Interstitiel ignorée : plugin indisponible (web/dev).");
  } catch (e) {
    console.warn("Erreur pub interstitielle:", e?.message || e);
  }
}

// =============================
// Cas Rewarded (3 usages)
// =============================

// 1) Jeton (boutique)
function showRewardBoutique() {
  showRewardedType('jeton', 1, async (ok) => {
    if (!ok) return;
    setTimeout(async () => {
      try {
        const b = await __getBalances();
        alert(`Récompense validée ! Jetons: ${b?.jetons ?? '--'}`);
        renderThemes?.();
      } catch (_) {}
    }, 1500);
  });
}

// 2) VCoins (boutique)
function showRewardVcoins() {
  showRewardedType('vcoin', 300, async (ok) => {
    if (!ok) return;
    setTimeout(async () => {
      try {
        const b = await __getBalances();
        alert(`Récompense validée ! VCoins: ${b?.vcoins ?? '--'}`);
        renderThemes?.();
      } catch (_) {}
    }, 1500);
  });
}

// 3) Revive (fin de partie)
function showRewardRevive(callback) {
  if (!REWARD_REVIVE) return;
  showRewardedType('revive', 0, (ok) => {
    if (ok) callback?.(); // ton jeu fait le rewind/reprise ici
  });
}

// =============================
// Début de partie → gérer interstitiel
// =============================
async function partieCommencee() {
  compteurParties++;
  localStorage.setItem("compteurParties", String(compteurParties));
  if (compteurParties >= INTERSTITIEL_APRES_X_PARTIES) {
    compteurParties = 0;
    localStorage.setItem("compteurParties", "0");
    await showInterstitial();
  }
}

function partieTerminee() {
  console.log("[Game] Partie terminée.");
}

// =============================
// Exposer global
// =============================
window.showInterstitial   = showInterstitial;
window.showRewardBoutique = showRewardBoutique;
window.showRewardVcoins   = showRewardVcoins;
window.showRewardRevive   = showRewardRevive;

window.partieCommencee    = partieCommencee;
window.partieTerminee     = partieTerminee;

window.addJetonsSupabase  = addJetonsSupabase;
window.addVCoinsSupabase  = addVCoinsSupabase;
window.getUserId          = getUserId;
window.hasNoAds           = hasNoAds;
