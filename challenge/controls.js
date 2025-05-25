document.addEventListener("keydown", e => {
  if (gameOver || paused) return;

  // Empêcher le comportement par défaut pour les touches directionnelles
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();

  // Commandes pour déplacer les pièces et autres actions
  switch (e.key) {
    case "ArrowLeft": move(-1); break;
    case "ArrowRight": move(1); break;
    case "ArrowDown": dropPiece(); break;
    case "ArrowUp": rotatePiece(); break;
    case "c": case "C": holdPiece(); break;
    case "p": case "P": // Pause
      paused = !paused;
      if (!paused) update();
      break;
  }
});
