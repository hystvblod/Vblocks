/* ===========================
   achat.js (confirmation + achat générique)
   =========================== */

// Utilise la même map que boutique.js (exposée en global)
const _PRODUCT_IDS = (window.PRODUCT_IDS) || {
  points3000:  'points3000',
  points10000: 'points10000',
  jetons12:    'jetons12',
  jetons50:    'jetons50',
  nopub:       'nopub'
};

// Récupère un prix localisé depuis le Store si possible
function _getLocalizedPrice(alias) {
  // Priorité 1 : cache rempli par boutique.js
  if (window.PRICES_BY_ALIAS && window.PRICES_BY_ALIAS[alias]?.price) {
    return window.PRICES_BY_ALIAS[alias].price;
  }
  // Priorité 2 : lire directement depuis le plugin
  const IAP = (window.store && typeof window.store.get === 'function') ? window.store : null;
  const pid = _PRODUCT_IDS[alias] || alias;
  if (IAP) {
    const p = IAP.get(pid);
    if (p && p.price) return p.price; // déjà localisé: "€0,99", "US$0.99", ...
  }
  return ""; // inconnu
}

// Fonction générique de confirmation (pas de "€" en dur)
window.lancerPaiement = async function(type) {
  const priceStr = _getLocalizedPrice(type);
  const labelMap = {
    jetons12:     "12 jetons",
    jetons50:     "50 jetons",
    nopub:        "Suppression des pubs",
    points3000:   "3000 points",
    points10000:  "10 000 points"
  };
  const item = labelMap[type] || type;
  const message = priceStr ? `${item} pour ${priceStr} ?` : `Valider l'achat : ${item} ?`;
  return confirm(message);
};

// Handler central pour tous les achats “boutique” déclenchés ailleurs dans l’app
window.accordeAchat = async function(type) {
  const isPaidItem =
    type === "jetons12" ||
    type === "jetons50" ||
    type === "points3000" ||
    type === "points10000" ||
    type === "nopub";

  if (isPaidItem) {
    const IAP = (window.store && typeof window.store.order === 'function') ? window.store : null;
    const ok = await window.lancerPaiement(type);
    if (!ok) return;

    if (IAP) {
      // Achats in-app (pop-up Google Play)
      const pid = _PRODUCT_IDS[type] || type;
      IAP.order(pid);
    } else {
      // Fallback serveur (web / plugin absent)
      await acheterProduitVercel(type);
      if (type === "nopub") {
        await sb.rpc('ajouter_nopub');
      }
      await renderThemes?.();
      setupPubCartouches?.();
      setupBoutiqueAchats?.();
    }
    return;
  }

  // Gains gratuits (pub reward, bonus)
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
};
