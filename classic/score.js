function updateBestScore() {
  let best = localStorage.getItem("vblocks_best_score");
  if (!best || score > best) {
    localStorage.setItem("vblocks_best_score", score);
  }
}
