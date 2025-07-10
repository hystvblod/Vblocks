const { whenReady } = typeof module !== 'undefined' && module.exports
  ? require('../scripts/utils')
  : window;

whenReady(function () {
  alert("Bienvenue dans V-Blocks ! Le but du jeu est simple : remplir des lignes avec les pièces qui tombent. Bon jeu !");

  // Optionnellement, tu peux ajouter une animation ou un petit message personnalisé
  // avant de lancer le jeu
});
