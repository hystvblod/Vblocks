// Begin challenge/controls.js
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


// Begin challenge/game_challenge.js
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const holdCanvas = document.getElementById("holdCanvas");
const holdCtx = holdCanvas ? holdCanvas.getContext("2d") : null;
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx = nextCanvas ? nextCanvas.getContext("2d") : null;

const COLS = 10, ROWS = 20;
let BLOCK_SIZE = 30;
canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;

let paused = false;

let currentTheme = "nature";
let currentColors = {};
const blockImages = {};

function loadBlockImages(themeName) {
  const useImages = (themeName === "nature" || themeName === "bubble");
  ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].forEach(letter => {
    if (useImages) {
      const img = new Image();
      img.src = `../themes/${themeName}/${letter}.png`;
      blockImages[letter] = img;
    } else {
      blockImages[letter] = null;
    }
  });

  if (themeName === "neon") {
    currentColors = {
      I: "#00ffff", J: "#007bff", L: "#ff8800",
      O: "#ffff00", S: "#00ff00", T: "#ff00ff", Z: "#ff0033"
    };
  } else if (themeName === "nuit") {
    currentColors = {
      I: "#555", J: "#666", L: "#777",
      O: "#888", S: "#999", T: "#aaa", Z: "#bbb"
    };
  } else if (themeName === "retro") {
    currentColors = {
      I: "#ffcc00", J: "#ff9900", L: "#ff6600",
      O: "#cc3300", S: "#ff3300", T: "#cc0033", Z: "#990066"
    };
  } else {
    currentColors = {
      I: "#5cb85c", J: "#388e3c", L: "#7bb661",
      O: "#cddc39", S: "#a2d149", T: "#558b2f", Z: "#9ccc65"
    };
  }

  const canvasBg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim();
  if (canvasBg) {
    canvas.style.background = canvasBg;
  }

  currentTheme = themeName;
  drawBoard();
}

function changeTheme(themeName) {
  const themeStyle = document.getElementById('theme-style');
  themeStyle.href = `../themes/${themeName}.css`;
  setTimeout(() => loadBlockImages(themeName), 80);
}

// ---------- Responsive ----------
function resizeCanvas() {
  const availableWidth = Math.min(window.innerWidth * 0.97, 420);
  const availableHeight = Math.max(window.innerHeight * 0.73, 300);
  const blockW = Math.floor(availableWidth / COLS);
  const blockH = Math.floor(availableHeight / ROWS);
  BLOCK_SIZE = Math.min(blockW, blockH, 32);

  canvas.width = COLS * BLOCK_SIZE;
  canvas.height = ROWS * BLOCK_SIZE;
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";

  const miniSize = Math.max(Math.floor(BLOCK_SIZE * 4), 60);
  if (holdCanvas && nextCanvas) {
    [holdCanvas, nextCanvas].forEach(c => {
      c.width = c.height = miniSize;
      c.style.width = c.style.height = miniSize + "px";
    });
  }

  drawBoard();
  if (holdCtx) drawMiniPiece(holdCtx, heldPiece, miniSize / 4);
  if (nextCtx) drawMiniPiece(nextCtx, nextPiece, miniSize / 4);
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);
setTimeout(resizeCanvas, 30);

// ---------- Game Logic ----------
const PIECES = [
  [[1, 1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]]
];
const LETTERS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

function newPiece() {
  const id = Math.floor(Math.random() * PIECES.length);
  return {
    shape: PIECES[id],
    letter: LETTERS[id],
    x: Math.floor((COLS - PIECES[id][0].length) / 2),
    y: 0
  };
}

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let currentPiece = newPiece();
let nextPiece = newPiece();
let heldPiece = null;
let holdUsed = false;
let score = 0;
let highscore = localStorage.getItem("vblocks_highscore") || 0;

document.getElementById("score").textContent = "Score : 0";
document.getElementById("highscore").textContent = "Record : " + highscore;

function drawBlock(ctx, x, y, letter, size = BLOCK_SIZE, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const img = blockImages[letter];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x * size, y * size, size, size);
  } else {
    ctx.fillStyle = currentColors[letter] || "#aaa";
    ctx.fillRect(x * size, y * size, size, size);

    if (currentTheme === "neon") {
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowBlur = 0;
    }
    if (currentTheme !== "nuit") {
      ctx.strokeStyle = "#333";
      ctx.strokeRect(x * size, y * size, size, size);
    }
  }
  ctx.restore();
}

// --------- Ghost Piece -----------
function drawGhostPiece() {
  if (!currentPiece) return;
  const ghost = {
    ...currentPiece,
    y: currentPiece.y
  };
  while (!collision(ghost)) ghost.y++;
  ghost.y--;
  ghost.shape.forEach((row, dy) =>
    row.forEach((val, dx) => {
      if (val) drawBlock(ctx, ghost.x + dx, ghost.y + dy, ghost.letter, BLOCK_SIZE, 0.22);
    })
  );
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  board.forEach((row, y) =>
    row.forEach((letter, x) => {
      if (letter) drawBlock(ctx, x, y, letter);
    })
  );

  drawGhostPiece();

  if (currentPiece) {
    currentPiece.shape.forEach((row, dy) =>
      row.forEach((val, dx) => {
        if (val) drawBlock(ctx, currentPiece.x + dx, currentPiece.y + dy, currentPiece.letter);
      })
    );
  }

  if (nextCtx) drawMiniPiece(nextCtx, nextPiece, null);
  if (holdCtx) drawMiniPiece(holdCtx, heldPiece, null);
}

function drawMiniPiece(ctxRef, piece, size = null) {
  if (!piece) return ctxRef.clearRect(0, 0, ctxRef.canvas.width, ctxRef.canvas.height);
  size = size || Math.max(Math.floor(BLOCK_SIZE * 0.9), 15);
  ctxRef.clearRect(0, 0, ctxRef.canvas.width, ctxRef.canvas.height);
  const shape = piece.shape;
  const w = shape[0].length;
  const h = shape.length;
  const offsetX = (ctxRef.canvas.width - w * size) / 2;
  const offsetY = (ctxRef.canvas.height - h * size) / 2;
  shape.forEach((row, y) =>
    row.forEach((val, x) => {
      if (val) {
        const px = offsetX + x * size;
        const py = offsetY + y * size;
        const color = currentColors?.[piece.letter] || "#999";
        ctxRef.fillStyle = color;
        ctxRef.fillRect(px, py, size, size);
        ctxRef.strokeStyle = "#333";
        ctxRef.strokeRect(px, py, size, size);
      }
    })
  );
}

function movePiece(dir) {
  currentPiece.x += dir;
  if (collision(currentPiece)) currentPiece.x -= dir;
  drawBoard();
}

function rotatePiece() {
  const oldShape = currentPiece.shape;
  currentPiece.shape = oldShape[0].map((_, i) => oldShape.map(row => row[i])).reverse();
  if (collision(currentPiece)) currentPiece.shape = oldShape;
  drawBoard();
}

function collision(piece) {
  return piece.shape.some((row, dy) =>
    row.some((val, dx) => {
      if (!val) return false;
      const x = piece.x + dx;
      const y = piece.y + dy;
      return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
    })
  );
}

function dropPiece() {
  currentPiece.y++;
  if (collision(currentPiece)) {
    currentPiece.y--;
    merge();
    newTurn();
    if (collision(currentPiece)) endGame();
  }
  drawBoard();
}

function merge() {
  currentPiece.shape.forEach((row, dy) =>
    row.forEach((val, dx) => {
      if (val) {
        const x = currentPiece.x + dx;
        const y = currentPiece.y + dy;
        if (y >= 0) board[y][x] = currentPiece.letter;
      }
    })
  );
  clearLines();
}

function clearLines() {
  let lines = 0;
  board = board.filter(row => {
    if (row.every(cell => cell !== "")) {
      lines++;
      return false;
    }
    return true;
  });
  while (board.length < ROWS) board.unshift(Array(COLS).fill(""));
  if (lines > 0) {
    score += lines * 100;
    document.getElementById("score").textContent = "Score : " + score;
    if (score > highscore) {
      highscore = score;
      localStorage.setItem("vblocks_highscore", highscore);
      document.getElementById("highscore").textContent = "Record : " + highscore;
    }
  }
}

function holdPiece() {
  if (holdUsed) return;
  if (!heldPiece) {
    heldPiece = { ...currentPiece };
    newTurn();
  } else {
    [heldPiece, currentPiece] = [{ ...currentPiece }, { ...heldPiece }];
  }
  holdUsed = true;
  drawBoard();
}

function newTurn() {
  currentPiece = nextPiece;
  nextPiece = newPiece();
  holdUsed = false;
}

function endGame() {
  alert("Temps écoulé !");
  window.location.reload();
}

// --- Contrôles clavier ---
document.addEventListener("keydown", (e) => {
  if (paused) return;
  switch (e.key) {
    case "ArrowLeft": movePiece(-1); break;
    case "ArrowRight": movePiece(1); break;
    case "ArrowDown": dropPiece(); break;
    case "ArrowUp": rotatePiece(); break;
    case "c":
    case "C": holdPiece(); break;
  }
});

// --- Contrôles boutons physiques (optionnel)
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
  const btnLeft   = document.querySelector("button[data-action='left']");
  const btnRight  = document.querySelector("button[data-action='right']");
  const btnRotate = document.querySelector("button[data-action='rotate']");
  const btnDrop   = document.querySelector("button[data-action='drop']");
  const btnTheme  = document.getElementById("theme-btn");
  const btnMusic  = document.getElementById("music-btn");

  if (btnLeft)   btnLeft.addEventListener("click", () => { if (!paused) movePiece(-1); });
  if (btnRight)  btnRight.addEventListener("click", () => { if (!paused) movePiece(1); });
  if (btnRotate) btnRotate.addEventListener("click", () => { if (!paused) rotatePiece(); });
  if (btnDrop)   btnDrop.addEventListener("click", () => { if (!paused) dropPiece(); });

  // Changement de thème (cycle)
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const link = document.getElementById("theme-style");
      const themes = ["nuit", "neon", "nature", "bubble", "retro"];
      let current = themes.findIndex(t => link.href.includes(t));
      const nextTheme = themes[(current + 1) % themes.length];
      link.href = "../themes/" + nextTheme + ".css";
      changeTheme(nextTheme);
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

  // Contrôle tactile natif (tap = rotate, swipe = move/drop)
  let touchStartX = 0, touchStartY = 0, touchMoved = false;
  canvas.addEventListener("touchstart", (e) => {
    if (paused) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchMoved = false;
  }, {passive: true});

  canvas.addEventListener("touchend", (e) => {
    if (paused) return;
    if (!touchMoved) rotatePiece();
  }, {passive: true});

  canvas.addEventListener("touchmove", (e) => {
    if (paused) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 30 || Math.abs(dy) > 30) touchMoved = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 20) {
        movePiece(1); touchStartX = t.clientX;
      } else if (dx < -20) {
        movePiece(-1); touchStartX = t.clientX;
      }
    } else {
      if (dy > 20) {
        dropPiece(); touchStartY = t.clientY;
      }
    }
  }, {passive: false});
});

function update(time = 0) {
  if (!paused) {
    dropPiece();
  }
  requestAnimationFrame(update);
}
loadBlockImages(currentTheme);
resizeCanvas();
update();


// Begin challenge/intro.js
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


// Begin challenge/score.js
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


// Begin scripts/pause.js
function whenReady(fn) {
  if (window.cordova || window.Capacitor) {
    document.addEventListener('deviceready', fn, false);
  } else if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

whenReady(function() {
  const settingsButton = document.getElementById("settings-button");
  const settingsMenu = document.getElementById("settings-menu");
  const themeMenu = document.getElementById("theme-menu");

  const muteButton = document.getElementById("mute-button");
  const themeButton = document.getElementById("theme-button");
  const closeSettingsButton = document.getElementById("close-settings-button");
  const backFromThemeButton = document.getElementById("back-theme-button");
  const themeStyle = document.getElementById("theme-style");
  const music = document.getElementById("music");

  const themeButtons = document.querySelectorAll(".theme-select-button");

  if (!settingsButton || !settingsMenu || !themeButton || !closeSettingsButton || !backFromThemeButton || !themeStyle) {
    console.error("Un ou plusieurs éléments du DOM manquent !");
    return;
  }

  settingsButton.addEventListener("click", showSettingsMenu);
  muteButton.addEventListener("click", toggleMusic);
  themeButton.addEventListener("click", showThemeMenu);
  closeSettingsButton.addEventListener("click", hideSettingsMenu);
  backFromThemeButton.addEventListener("click", backToSettings);

  themeButtons.forEach(button => {
    button.addEventListener("click", function() {
      const newTheme = this.getAttribute("data-theme");
      if (newTheme && typeof changeTheme === 'function') {
        changeTheme(newTheme); // Appelle la fonction de changement de thème
        hideAllMenus();
      } else {
        console.error("Erreur : fonction changeTheme() non trouvée !");
      }
    });
  });

  function showSettingsMenu() {
    paused = true;
    if (music && !music.paused) music.pause();
    settingsMenu.style.display = "flex";
    themeMenu.style.display = "none";
  }

  function hideSettingsMenu() {
    paused = false;
    if (music && music.paused) music.play();
    settingsMenu.style.display = "none";
    themeMenu.style.display = "none";
  }

  function toggleMusic() {
    if (!music) return;
    if (music.paused) {
      music.play();
      muteButton.textContent = "Mute Musique";
    } else {
      music.pause();
      muteButton.textContent = "Unmute Musique";
    }
  }

  function showThemeMenu() {
    settingsMenu.style.display = "none";
    themeMenu.style.display = "flex";
  }

  function backToSettings() {
    themeMenu.style.display = "none";
    settingsMenu.style.display = "flex";
  }

  function hideAllMenus() {
    settingsMenu.style.display = "none";
    themeMenu.style.display = "none";
    paused = false;
    if (music && music.paused) music.play();
  }
});


// Begin scripts/settings.js
function whenReady(fn) {
  if (window.cordova || window.Capacitor) {
    document.addEventListener('deviceready', fn, false);
  } else if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

whenReady(function() {
  const settingsButton = document.getElementById("settings-button");
  const settingsMenu = document.getElementById("settings-menu");
  const themeMenu = document.getElementById("theme-menu");

  const muteButton = document.getElementById("mute-button");
  const themeButton = document.getElementById("theme-button");
  const closeSettingsButton = document.getElementById("close-settings-button");
  const backFromThemeButton = document.getElementById("back-theme-button");
  const themeStyle = document.getElementById("theme-style");
  const themeButtons = document.querySelectorAll(".theme-select-button");
  const music = document.getElementById("music");

  if (!settingsButton || !settingsMenu || !themeMenu || !muteButton || !themeButton || !closeSettingsButton || !backFromThemeButton || !themeStyle) {
    console.error("Un ou plusieurs éléments du DOM sont introuvables !");
    return;
  }

  settingsButton.addEventListener("click", showSettingsMenu);
  muteButton.addEventListener("click", toggleMusic);
  themeButton.addEventListener("click", showThemeMenu);
  closeSettingsButton.addEventListener("click", hideSettingsMenu);
  backFromThemeButton.addEventListener("click", backToSettings);

  themeButtons.forEach(button => {
    button.addEventListener("click", function() {
      const newTheme = this.getAttribute("data-theme");
      if (newTheme) {
        themeStyle.setAttribute("href", `../themes/${newTheme}.css`);
        loadBlockImages(newTheme);
        drawBoard();
      }
      backToSettings(); // Revenir au menu paramètres
    });
  });

  function showSettingsMenu() {
    paused = true;
    if (music && !music.paused) music.pause();
    settingsMenu.style.display = "flex";
    themeMenu.style.display = "none";
  }

  function hideSettingsMenu() {
    settingsMenu.style.display = "none";
    themeMenu.style.display = "none";
    paused = false; // LE JEU REDÉMARRE seulement ici
    if (!gameOver) {
      requestAnimationFrame(update);
    }
    if (music && music.paused) music.play();
  }

  function toggleMusic() {
    if (!music) return;
    if (music.paused) {
      music.play();
      muteButton.textContent = "Mute Musique";
    } else {
      music.pause();
      muteButton.textContent = "Unmute Musique";
    }
  }

  function showThemeMenu() {
    settingsMenu.style.display = "none";
    themeMenu.style.display = "flex";
  }

  function backToSettings() {
    themeMenu.style.display = "none";
    settingsMenu.style.display = "flex";
  }
});


