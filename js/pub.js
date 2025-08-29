// =============================
// INIT SUPABASE (création unique, mode Capacitor)
// =============================
// (On suppose que `sb` est déjà créé globalement dans index.html)
// Si besoin de robustesse locale, décommente :
// const SB_URL  = 'https://...supabase.co';
// const SB_ANON = '...';
// window.sb = window.sb || supabase.createClient(SB_URL, SB_ANON);

// Petite sécurité : s’assurer d’une session anonyme opérationnelle
async function ensureAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) await sb.auth.signInAnonymously();
  } catch (_) {}
}

// === CONFIG PUBS ===
// → Interstitiel au DÉBUT de la 3e partie (modifier la valeur si besoin)
const INTERSTITIEL_APRES_X_PARTIES = 3; // Nombre de parties avant pub interstitielle (déclenchée au début de la Xème)

// Montants de récompense pour les pubs rewarded
const REWARD_JETONS = 1;                // Jetons gagnés par pub reward
const REWARD_VCOINS = 300;              // VCoins gagnés par pub reward
const REWARD_REVIVE = true;             // Activer reward revive fin de partie

// (Optionnel) Anti-spam : cooldown minimal entre deux interstitiels (ms). 0 pour désactiver.
const INTER_COOLDOWN_MS = 0;

let compteurParties = parseInt(localStorage.getItem("compteurParties") || "0", 10);

// === ID AppLovin MAX ===
const AD_UNIT_ID_INTERSTITIEL = 'TA_CLE_INTERSTITIEL';
const AD_UNIT_ID_REWARDED     = 'TA_CLE_REWARDED';

// =============================
// CONSENTEMENT UTILISATEUR (RGPD / pubs personnalisées)
// =============================

// Lecture unifiée du consentement depuis le stockage local.
// On considère personnalisées = TRUE seulement si:
//  - rgpdConsent == "accept" (si cette clé existe) ET
//  - adsConsent == "yes"  (nouvelle clé)
//  (Compat: on accepte aussi adsEnabled == "true")
function getPersonalizedAdsGranted() {
  const rgpd = localStorage.getItem("rgpdConsent"); // "accept" | "refuse" | null
  const adsConsent = (localStorage.getItem("adsConsent") || "").toLowerCase(); // "yes" | "no" | ""
  const adsEnabled = (localStorage.getItem("adsEnabled") || "").toLowerCase(); // "true" | "false" | ""

  // Si RGPD explicitement refusé → pas de personnalisées
  if (rgpd === "refuse") return false;

  // Si RGPD accepté, on regarde le choix pubs:
  if (rgpd === "accept") {
    if (adsConsent) return adsConsent === "yes";
    if (adsEnabled) return adsEnabled === "true";
    return false;
  }

  // Si pas de clé RGPD, on tombe sur le choix pubs
  if (adsConsent) return adsConsent === "yes";
  if (adsEnabled) return adsEnabled === "true";

  // Par défaut: non-personnalisées
  return false;
}

// Appliquer le consentement côté SDK AppLovin MAX
function applyConsentToAppLovin() {
  const granted = getPersonalizedAdsGranted();
  if (window.lovappApplovinmax && typeof window.lovappApplovinmax.setHasUserConsent === "function") {
    window.lovappApplovinmax.setHasUserConsent(!!granted);
    console.log("[Consent] AppLovin MAX →", granted ? "PERSONNALISÉES (consent YES)" : "NON-PERSONNALISÉES (consent NO)");
  }
}
// Expose pour le toggle paramètres (si tu ne veux pas recharger la page)
window.refreshAdConsent = applyConsentToAppLovin;

// === Initialisation AppLovin MAX ===
if (window.lovappApplovinmax && !window._lovapp_applovin_init) {
  // Appliquer le consentement avant init si possible
  applyConsentToAppLovin();

  window.lovappApplovinmax.initialize()
    .then(() => {
      window._lovapp_applovin_init = true;
      console.log('[AppLovin] MAX initialisé');

      // Sécurité: ré-appliquer après init (au cas où le SDK réinitialise son état)
      applyConsentToAppLovin();
    })
    .catch((e) => console.warn('[AppLovin] Erreur init:', e));
} else {
  // Même sans init MAX (dev), on enregistre l’intention
  applyConsentToAppLovin();
}

// =============================
// UTILITAIRES UTILISATEUR
// =============================

// ID unique local (legacy) — conservé pour compat (mais non utilisé pour créditer)
function getUserId() {
  let id = localStorage.getItem('user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('user_id', id);
  }
  return id;
}

// =============================
// HELPERS RPC SÉCURISÉES
// =============================

// Lecture groupée (vcoins, jetons, themes_possedes, nopub...) via RPC SECURITY DEFINER
async function __getBalances() {
  await ensureAuth();
  const { data, error } = await sb.rpc('get_balances');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {};
}

// =============================
// HELPER NoPub CLOUD (RPC, pas de SELECT par id)
// =============================
async function hasNoAds() {
  const b = await __getBalances();
  return !!b?.nopub;
}
window.hasNoAds = hasNoAds;

// =============================
// FONCTIONS SUPABASE (JETONS, VCOINS, ETC.) - 100% RPC
// =============================

// Ajoute/retire des Jetons (RPC cloud, auth.uid())
async function addJetonsSupabase(amount) {
  await ensureAuth();
  const delta = Number(amount) || 0;
  const { error } = await sb.rpc('ajouter_jetons', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.jetons ?? 0;
}

// Ajoute/retire des VCoins (RPC cloud, auth.uid())
async function addVCoinsSupabase(amount) {
  await ensureAuth();
  const delta = Number(amount) || 0;
  const { error } = await sb.rpc('ajouter_vcoins', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.vcoins ?? 0;
}

// =============================
// GESTION DES PUBS (AppLovin MAX)
// =============================

// Cooldown interstitiel
function canShowInterstitialNow() {
  if (!INTER_COOLDOWN_MS) return true;
  const last = parseInt(localStorage.getItem('lastInterstitialTs') || '0', 10);
  return (Date.now() - last) >= INTER_COOLDOWN_MS;
}
function markInterstitialShownNow() {
  localStorage.setItem('lastInterstitialTs', Date.now().toString());
}

// Affiche une pub interstitielle
async function showInterstitial() {
  // Respecte NoPub depuis la boutique (champ cloud via RPC)
  if (await hasNoAds()) {
    console.log("[PUB] Interstitiel bloquée (NoPub activé)");
    return;
  }
  if (!canShowInterstitialNow()) {
    console.log("[PUB] Interstitiel non affichée (cooldown actif)");
    return;
  }

  if (window.lovappApplovinmax) {
    return window.lovappApplovinmax.showInterstitialAd({ adUnitId: AD_UNIT_ID_INTERSTITIEL })
      .then(() => {
        console.log("[PUB] Interstitiel affichée (prod)");
        markInterstitialShownNow();
      })
      .catch(e => alert("Erreur pub interstitielle: " + (e?.message || e)));
  }

  // Simulation dev
  console.log("[PUB] Interstitiel affichée (dev)");
  markInterstitialShownNow();
}

// Affiche une pub rewarded (AppLovin)
// (Remarque: par défaut, NoPub n’affecte PAS les rewarded)
function showRewarded(callback) {
  if (window.lovappApplovinmax) {
    window.lovappApplovinmax.showRewardedAd({ adUnitId: AD_UNIT_ID_REWARDED })
      .then((result) => {
        if (typeof callback === "function") callback(!!result?.rewarded);
      })
      .catch(e => {
        alert("Erreur pub rewarded: " + (e?.message || e));
        if (typeof callback === "function") callback(false);
      });
    return;
  }
  // Simulation dev
  console.log("[PUB] Rewarded affichée (dev)");
  setTimeout(() => {
    console.log("[PUB] Rewarded terminée (dev)");
    if (typeof callback === "function") callback(true);
  }, 3000);
}

// PUB REWARDED : +1 jeton
function showRewardBoutique() {
  showRewarded(async (ok) => {
    if (ok) {
      try {
        const newBal = await addJetonsSupabase(REWARD_JETONS);
        alert(`+${REWARD_JETONS} jeton ajouté ! (solde: ${newBal})`);
        if (window.renderThemes) renderThemes();
      } catch (e) {
        alert("Erreur lors de l'ajout de jeton: " + (e?.message || e));
      }
    }
  });
}

// PUB REWARDED : +300 VCoins (ou autre montant)
function showRewardVcoins() {
  showRewarded(async (ok) => {
    if (ok) {
      try {
        const newBal = await addVCoinsSupabase(REWARD_VCOINS);
        alert(`+${REWARD_VCOINS} VCoins ajoutés ! (solde: ${newBal})`);
        if (window.renderThemes) renderThemes();
      } catch (e) {
        alert("Erreur lors de l'ajout de VCoins: " + (e?.message || e));
      }
    }
  });
}

// PUB REWARDED : revive fin de partie
function showRewardRevive(callback) {
  if (!REWARD_REVIVE) return;
  showRewarded((ok) => {
    if (ok && typeof callback === "function") callback();
  });
}

// =============================
// LOGIQUE "DÉBUT DE LA 3ᵉ PARTIE"
// =============================

// Appelle ceci AU DÉMARRAGE d’une partie
async function partieCommencee() {
  compteurParties++;
  localStorage.setItem("compteurParties", String(compteurParties));

  // Si c'est le début de la Xème (ex: 3ème), on affiche l'interstitiel puis reset.
  if (compteurParties >= INTERSTITIEL_APRES_X_PARTIES) {
    // Reset compteur avant pour éviter double affichage en cas d’erreur réseau
    compteurParties = 0;
    localStorage.setItem("compteurParties", "0");
    await showInterstitial();
  }
}

// (Compat) Ancienne logique fin de partie — conservée si tu l’appelles ailleurs
function partieTerminee() {
  console.log("[Game] Partie terminée.");
}

// =============================
// EXPOSER FONCTIONS GLOBALES
// =============================
window.showInterstitial   = showInterstitial;
window.showRewarded       = showRewarded;
window.showRewardBoutique = showRewardBoutique;
window.showRewardVcoins   = showRewardVcoins;
window.showRewardRevive   = showRewardRevive;

window.partieCommencee    = partieCommencee; // ← à appeler AU LANCEMENT d’une partie
window.partieTerminee     = partieTerminee;  // ← gardée pour compat (ne montre pas d’ad)

window.addJetonsSupabase  = addJetonsSupabase;
window.addVCoinsSupabase  = addVCoinsSupabase;
window.getUserId          = getUserId; // legacy (plus utilisé pour créditer)
window.hasNoAds           = hasNoAds;
