// =============================
// INIT SUPABASE (création unique, mode Capacitor)
// =============================

const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

if (!window.sb) {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const sb = window.sb;

// === CONFIG PUBS ===
const INTERSTITIEL_APRES_X_PARTIES = 2; // Nombre de parties avant pub interstitielle
const REWARD_JETONS = 1;                // Jetons gagnés par pub reward
const REWARD_VCOINS = 300;              // VCoins gagnés par pub reward
const REWARD_REVIVE = true;             // Activer reward revive fin de partie

let compteurParties = parseInt(localStorage.getItem("compteurParties") || "0");

// === ID AppLovin MAX ===
const AD_UNIT_ID_INTERSTITIEL = 'TA_CLE_INTERSTITIEL';
const AD_UNIT_ID_REWARDED = 'TA_CLE_REWARDED';

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

// Affiche une pub interstitielle
async function showInterstitial() {
  if (await hasNoAds()) {
    console.log("[PUB] Interstitiel bloquée (NoPub activé)");
    return;
  }
  if (window.lovappApplovinmax) {
    window.lovappApplovinmax.showInterstitialAd({adUnitId: AD_UNIT_ID_INTERSTITIEL})
      .then(() => console.log("[PUB] Interstitiel affichée (prod)"))
      .catch(e => alert("Erreur pub interstitielle: " + (e?.message || e)));
    return;
  }
  // Simulation dev
  console.log("[PUB] Interstitiel affichée (dev)");
}

// Affiche une pub rewarded (AppLovin)
// (optionnel : si tu veux bloquer aussi les rewarded, ajoute le même check qu'au-dessus)
function showRewarded(callback) {
  if (window.lovappApplovinmax) {
    window.lovappApplovinmax.showRewardedAd({
      adUnitId: AD_UNIT_ID_REWARDED
    }).then((result) => {
      if (typeof callback === "function") callback(!!result?.rewarded);
    }).catch(e => {
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

// Gère le compteur pour afficher une interstitielle toutes les X parties
function partieTerminee() {
  compteurParties++;
  localStorage.setItem("compteurParties", compteurParties);

  if (compteurParties >= INTERSTITIEL_APRES_X_PARTIES) {
    compteurParties = 0;
    localStorage.setItem("compteurParties", compteurParties);
    showInterstitial();
  }
}

// =============================
// EXPOSER FONCTIONS GLOBALES
// =============================
window.showInterstitial = showInterstitial;
window.showRewarded = showRewarded;
window.showRewardBoutique = showRewardBoutique;
window.showRewardVcoins = showRewardVcoins;
window.showRewardRevive = showRewardRevive;
window.partieTerminee = partieTerminee;
window.addJetonsSupabase = addJetonsSupabase;
window.addVCoinsSupabase = addVCoinsSupabase;
window.getUserId = getUserId;
window.hasNoAds = hasNoAds;
