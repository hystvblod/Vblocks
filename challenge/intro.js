function whenReady(fn) {
  if (window.cordova || window.Capacitor) {
    document.addEventListener('deviceready', fn, false);
  } else if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

whenReady(function () {
  alert("Bienvenue dans V-Blocks ! Le but du jeu est simple : remplir des lignes avec les pièces qui tombent. Bon jeu !");

  // Optionnellement, tu peux ajouter une animation ou un petit message personnalisé
  // avant de lancer le jeu
});
