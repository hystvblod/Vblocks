function whenReady(fn) {
  if (window.cordova || window.Capacitor) {
    document.addEventListener('deviceready', fn, false);
  } else if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

whenReady(() => {
  // Contrôles directionnels (boutons physiques)
  const btnLeft   = document.querySelector("button[data-action='left']");
  const btnRight  = document.querySelector("button[data-action='right']");
  const btnRotate = document.querySelector("button[data-action='rotate']");
  const btnDrop   = document.querySelector("button[data-action='drop']");
  const btnTheme  = document.getElementById("theme-btn");
  const btnMusic  = document.getElementById("music-btn");

  if (btnLeft)   btnLeft.addEventListener("click", () => { if (!gameOver) { move(-1); drawBoard(); }});
  if (btnRight)  btnRight.addEventListener("click", () => { if (!gameOver) { move(1); drawBoard(); }});
  if (btnRotate) btnRotate.addEventListener("click", () => { if (!gameOver) { rotatePiece(); drawBoard(); }});
  if (btnDrop)   btnDrop.addEventListener("click", () => { if (!gameOver) { dropPiece(); drawBoard(); }});

  // Changement de thème (cycle)
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const link = document.getElementById("theme-style");
      const themes = ["nuit", "neon", "nature", "bubble", "retro"];
      let current = themes.findIndex(t => link.href.includes(t));
      link.href = "../themes/" + themes[(current + 1) % themes.length] + ".css";
      loadBlockImages(themes[(current + 1) % themes.length]);
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

  // --- Contrôle tactile sur le plateau (tap = rotation, swipe = move/drop) ---
  const canvas = document.getElementById("gameCanvas");
  let touchStartX = 0, touchStartY = 0, touchMoved = false;

  if (canvas) {
    canvas.addEventListener("touchstart", (e) => {
      if (gameOver || paused) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchMoved = false;
    }, {passive: true});

    canvas.addEventListener("touchend", (e) => {
      if (gameOver || paused) return;
      if (!touchMoved) {
        rotatePiece();
        drawBoard();
      }
    }, {passive: true});

    canvas.addEventListener("touchmove", (e) => {
      if (gameOver || paused) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (Math.abs(dx) > 30 || Math.abs(dy) > 30) touchMoved = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 20) {
          move(1); drawBoard();
          touchStartX = t.clientX;
        } else if (dx < -20) {
          move(-1); drawBoard();
          touchStartX = t.clientX;
        }
      } else {
        if (dy > 20) {
          dropPiece(); drawBoard();
          touchStartY = t.clientY;
        }
      }
    }, {passive: false});
  }
});
