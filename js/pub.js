// =============================
// INIT SUPABASE (création unique, mode Capacitor)
// =============================



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

// === Initialisation AppLovin MAX (optionnel, à faire dans ton init principal) ===
if (window.lovappApplovinmax && !window._lovapp_applovin_init) {
  window.lovappApplovinmax.initialize()
    .then(() => {
      window._lovapp_applovin_init = true;
      console.log('[AppLovin] MAX initialisé');
    })
    .catch((e) => console.warn('[AppLovin] Erreur init:', e));
}

// =============================
// UTILITAIRES UTILISATEUR
// =============================

// ID unique local
function getUserId() {
  let id = localStorage.getItem('user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('user_id', id);
  }
  return id;
}

// =============================
// HELPER NoPub CLOUD
// =============================
async function hasNoAds() {
  const { data, error } = await sb.from('users').select('nopub').eq('id', getUserId()).single();
  if (error) return false;
  return !!data?.nopub;
}
window.hasNoAds = hasNoAds;

// =============================
// FONCTIONS SUPABASE (JETONS, VCOINS, ETC.)
// =============================

// Ajoute/retire des Jetons (RPC cloud)
async function addJetonsSupabase(amount) {
  const userId = getUserId();
  const { data, error } = await sb.rpc('add_jetons', {
    user_id: userId,
    delta: amount
  });
  if (error) throw error;
  return data?.[0]?.new_balance ?? 0;
}

// Ajoute/retire des VCoins (RPC cloud)
async function addVCoinsSupabase(amount) {
  const userId = getUserId();
  const { data, error } = await sb.rpc('add_vcoins', {
    user_id: userId,
    delta: amount
  });
  if (error) throw error;
  return data?.[0]?.new_balance ?? 0;
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
  // Respecte NoPub depuis la boutique (champ cloud `nopub`)
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
        await addJetonsSupabase(REWARD_JETONS);
        alert(`+${REWARD_JETONS} jeton ajouté !`);
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
        await addVCoinsSupabase(REWARD_VCOINS);
        alert(`+${REWARD_VCOINS} VCoins ajoutés !`);
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
  // Ne déclenche plus d’interstitiel ici, on garde juste le log si besoin
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
window.getUserId          = getUserId;
window.hasNoAds           = hasNoAds;
