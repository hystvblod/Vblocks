let score = 0;
let highscore = localStorage.getItem("vblocks_highscore") || 0;

// Mise à jour du score en fonction des lignes complètes
function updateScore(lines) {
  score += lines * 100;
  document.getElementById("score").textContent = "Score : " + score;

  // Mise à jour du record
  if (score > highscore) {
    highscore = score;
    localStorage.setItem("vblocks_highscore", highscore);
    document.getElementById("highscore").textContent = "Record : " + highscore;
  }
}

// Appelle cette fonction pour mettre à jour le score à chaque ligne complète
function clearLines(board) {
  let lines = 0;
  board = board.filter(row => {
    if (row.every(cell => cell !== "")) {
      lines++;
      return false;
    }
    return true;
  });

  // Ajouter des lignes vides au-dessus
  while (board.length < ROWS) board.unshift(Array(COLS).fill(""));

  // Mise à jour du score
  updateScore(lines);
}
