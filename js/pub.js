// === Configuration ===
const INTERSTITIEL_APRES_X_PARTIES = 2;   // Nombre de parties avant pub interstitielle
const REWARD_JETONS = 1;                  // Jetons gagnés par pub reward dans la boutique (corrigé)
const REWARD_REVIVE = true;               // Activer reward revive fin de partie

let compteurParties = parseInt(localStorage.getItem("compteurParties") || "0");

// === Fonction pour afficher une pub interstitielle ===
function showInterstitial() {
  console.log("[PUB] Interstitiel affichée");
  // 🔴 Remplace ce log par l'appel à ta régie (AdMob, AppLovin, etc.)
}

// === Fonction pour afficher une pub rewarded ===
function showRewarded(callback) {
  console.log("[PUB] Rewarded affichée");
  // 🔴 Remplace ce log par la vraie pub
  setTimeout(() => {
    console.log("[PUB] Rewarded terminée");
    if (typeof callback === "function") callback(true);
  }, 3000); // Simulation 3s
}

// === Reward dans la boutique ===
function showRewardBoutique() {
  showRewarded(async (ok) => {
    if (ok && window.userData && userData.addJetons) {
      try {
        await userData.addJetons(REWARD_JETONS); // ⚡️ Sécurisé Supabase
        alert(`+${REWARD_JETONS} jeton ajouté !`);
        // Optionnel: mettre à jour l'affichage du solde
        if (window.renderThemes) renderThemes();
      } catch (e) {
        alert("Erreur lors de l'ajout de jeton: " + (e?.message || e));
      }
    }
  });
}

// === Reward en fin de partie pour revivre ===
function showRewardRevive(callback) {
  if (!REWARD_REVIVE) return;
  showRewarded((ok) => {
    if (ok && typeof callback === "function") callback();
  });
}

// === Gestion des parties pour l'interstitiel ===
function partieTerminee() {
  compteurParties++;
  localStorage.setItem("compteurParties", compteurParties);

  if (compteurParties >= INTERSTITIEL_APRES_X_PARTIES) {
    compteurParties = 0;
    localStorage.setItem("compteurParties", compteurParties);
    showInterstitial();
  }
}

// === Exposer les fonctions globales ===
window.showInterstitial = showInterstitial;
window.showRewarded = showRewarded;
window.showRewardBoutique = showRewardBoutique;
window.showRewardRevive = showRewardRevive;
window.partieTerminee = partieTerminee;
