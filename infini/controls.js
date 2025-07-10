document.addEventListener("DOMContentLoaded", () => {
  // Contrôles directionnels (boutons physiques)
  const btnLeft   = document.querySelector("button[data-action='left']");
  const btnRight  = document.querySelector("button[data-action='right']");
  const btnRotate = document.querySelector("button[data-action='rotate']");
  const btnDrop   = document.querySelector("button[data-action='drop']");
  const btnTheme  = document.getElementById("theme-btn");
  const btnMusic  = document.getElementById("music-btn");

  if (btnLeft)   btnLeft.addEventListener("click", () => { if (!gameOver && !paused) { move(-1); drawBoard(); }});
  if (btnRight)  btnRight.addEventListener("click", () => { if (!gameOver && !paused) { move(1); drawBoard(); }});
  if (btnRotate) btnRotate.addEventListener("click", () => { if (!gameOver && !paused) { rotatePiece(); drawBoard(); }});
  if (btnDrop)   btnDrop.addEventListener("click", () => { if (!gameOver && !paused) { dropPiece(); drawBoard(); }});

  // Changement de thème (cycle)
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const link = document.getElementById("theme-style");
      const themes = ["nuit", "neon", "nature", "bubble", "retro"];
      let current = themes.findIndex(t => link.href.includes(t));
      const nextTheme = themes[(current + 1) % themes.length];
      link.href = "../themes/" + nextTheme + ".css";
      loadBlockImages(nextTheme);
      drawBoard();
    });
  }

  // Bouton musique
  if (btnMusic) {
    btnMusic.addEventListener("click", () => {
      const music = document.getElementById("music");
      if (!music) return;
      if (music.paused) {
        music.play();
        btnMusic.textContent = "🔊 Musique";
      } else {
        music.pause();
        btnMusic.textContent = "🔇 Muet";
      }
    });
  }
});
