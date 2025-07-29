// achat.js

// Handler central pour tous les achats de la boutique
window.accordeAchat = async function(type) {
  if (type === "jetons12") {
    await userData.addJetons(12);
    alert("+12 jetons ajoutés !");
  } else if (type === "jetons50") {
    await userData.addJetons(50);
    alert("+50 jetons ajoutés !");
  } else if (type === "nopub") {
    // Ajoute ici ta logique cloud/noPub si tu stockes ce droit dans Supabase
    // Exemple : await userData.setNoPub?.(true);
    alert("Suppression des pubs activée !");
  }
  // MAJ UI
  await renderThemes?.();
  setupPubCartouches?.();
  setupBoutiqueAchats?.();
}

// Fonction générique à appeler avant de remettre la récompense
window.lancerPaiement = async function(type) {
  // Simulation simple pour démo : à remplacer par intégration Stripe/Google plus tard
  let texte = "";
  if (type === "jetons12") texte = "12 jetons pour 0,99 € ?";
  else if (type === "jetons50") texte = "50 jetons pour 2,99 € ?";
  else if (type === "nopub") texte = "Supprimer les pubs pour 3,49 € ?";
  // Remplace ce confirm par ton paiement réel
  return confirm("Valider l'achat : " + texte);
}
