document.addEventListener("keydown", e => {
  if (gameOver || paused) {
    // Permet de sortir de la pause avec 'P'
    if ((e.key === "p" || e.key === "P") && paused) {
      paused = false;
      update();
      drawBoard();
    }
    return;
  }

  // Empêcher le comportement par défaut pour les touches directionnelles
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();

  switch (e.key) {
    case "ArrowLeft":
      move(-1);
      drawBoard();
      break;
    case "ArrowRight":
      move(1);
      drawBoard();
      break;
    case "ArrowDown":
      dropPiece();
      drawBoard();
      break;
    case "ArrowUp":
      rotatePiece();
      drawBoard();
      break;
    case "c":
    case "C":
      holdPiece();
      drawBoard();
      break;
    case "p":
    case "P":
      paused = true;
      drawBoard();
      break;
  }
});
