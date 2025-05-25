document.addEventListener("DOMContentLoaded", () => {
  // Contrôles directionnels
  const btnLeft   = document.querySelector("button[data-action='left']");
  const btnRight  = document.querySelector("button[data-action='right']");
  const btnRotate = document.querySelector("button[data-action='rotate']");
  const btnDrop   = document.querySelector("button[data-action='drop']");
  const btnTheme  = document.getElementById("theme-btn");
  const btnMusic  = document.getElementById("music-btn");

  if (btnLeft)   btnLeft.addEventListener("click", () => { if (!gameOver) move(-1); });
  if (btnRight)  btnRight.addEventListener("click", () => { if (!gameOver) move(1); });
  if (btnRotate) btnRotate.addEventListener("click", () => { if (!gameOver) rotatePiece(); });
  if (btnDrop)   btnDrop.addEventListener("click", () => { if (!gameOver) dropPiece(); });

  // Changement de thème
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const link = document.getElementById("theme-style");
      const themes = ["nuit", "neon", "nature", "bubble", "retro"];
      let current = themes.findIndex(t => link.href.includes(t));
      link.href = "../themes/" + themes[(current + 1) % themes.length] + ".css";
      loadBlockImages(themes[(current + 1) % themes.length]);
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
