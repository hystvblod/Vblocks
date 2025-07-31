// Handler central pour tous les achats de la boutique
window.accordeAchat = async function(type) {
  // --- Achats EN ARGENT RÉEL : passent par l'API Vercel ---
if (
    type === "jetons12" ||
    type === "jetons50" ||
    type === "points3000" ||
    type === "points10000" ||
    type === "nopub"
  ) {
    await acheterProduitVercel(type);
    if (type === "nopub") {
      await sb.from('users').update({ nopub: true }).eq('id', getUserId());
    }
    return;
  }


  // --- Gains gratuits (ex : pubs reward, bonus) ---
  if (type === "pub1jeton") {
    await userData.addJetons(1);
    alert("+1 jeton ajouté !");
  } else if (type === "pub300points") {
    await userData.addVCoins(300);
    alert("+300 points ajoutés !");
  }

  // MAJ UI
  await renderThemes?.();
  setupPubCartouches?.();
  setupBoutiqueAchats?.();
}

// Fonction générique à appeler avant de remettre la récompense
window.lancerPaiement = async function(type) {
  // Affiche un message de confirmation avant tout achat argent réel
  let texte = "";
  if (type === "jetons12") texte = "12 jetons pour 0,99 € ?";
  else if (type === "jetons50") texte = "50 jetons pour 2,99 € ?";
  else if (type === "nopub") texte = "Supprimer les pubs pour 3,49 € ?";
  else if (type === "points3000") texte = "3000 points pour 0,99 € ?";
  else if (type === "points10000") texte = "10 000 points pour 1,99 € ?";
  // Remplace ce confirm par ton paiement réel
  return confirm("Valider l'achat : " + texte);
}
