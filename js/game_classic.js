// ===================
// V-BLOCKS JS INFINITE (FULL, SCORE PRO, POINTS BOUTIQUE, COMBO, PAS DE LEVEL-UP)
// ===================

console.log("Bienvenue dans V-Blocks 🎮 Mode Infini");

// --- Fonctions utilitaires best score
function updateBestScore() {
  let best = localStorage.getItem("vblocks_best_score");
  if (!best || score > best) {
    localStorage.setItem("vblocks_best_score", score);
  }
}

// --- Initialisation canvas et contexte
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const holdCanvas = document.getElementById("holdCanvas");
const holdCtx = holdCanvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx = nextCanvas.getContext("2d");

const COLS = 10, ROWS = 20;
let BLOCK_SIZE = 30;
canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;

// --- Responsive resizing
function resizeCanvas() {
  const top = document.querySelector("h1")?.offsetHeight || 0;
  const score = document.getElementById("score")?.offsetHeight || 0;
  const highscore = document.getElementById("highscore")?.offsetHeight || 0;
  const buttons = document.getElementById("controls")?.offsetHeight || 0;
  const options = document.getElementById("options")?.offsetHeight || 0;
  const reserved = top + score + highscore + buttons + options + 80;
  const availableHeight = window.innerHeight - reserved;
  const availableWidth = window.innerWidth * 0.9;
  const blockW = Math.floor(availableWidth / COLS);
  const blockH = Math.floor(availableHeight / ROWS);
  BLOCK_SIZE = Math.min(blockW, blockH, 30);
  canvas.width = COLS * BLOCK_SIZE;
  canvas.height = ROWS * BLOCK_SIZE;
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";
  drawBoard();
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", resizeCanvas);

const THEMES = ["nuit", "neon", "nature", "bubble", "retro"];
let currentTheme = localStorage.getItem('themeVBlocks') || "neon";
let currentThemeIndex = THEMES.indexOf(currentTheme);


const blockImages = {};
function loadBlockImages(themeName) {
  // Thèmes avec images PNG
  const themesWithPNG = ["bubble", "nature"];
  ['I','J','L','O','S','T','Z'].forEach(letter => {
    if (themesWithPNG.includes(themeName)) {
      const img = new Image();
      img.onload = () => drawBoard();
      img.src = `../themes/${themeName}/${letter}.png`;
      blockImages[letter] = img;
    } else {
      blockImages[letter] = null; // Pas d'image, on dessine en couleur JS
    }
  });
  currentTheme = themeName;
  // Met à jour les couleurs JS si besoin
  if (themeName === "retro") {
    window.currentColors = {
      I: "#00f0ff", J: "#0044ff", L: "#ff6600",
      O: "#ffff33", S: "#00ff44", T: "#ff00cc", Z: "#ff0033"
    };
  } else if (themeName === "neon") {
    window.currentColors = {
      I: "#00ffff", J: "#007bff", L: "#ff8800",
      O: "#ffff00", S: "#00ff00", T: "#ff00ff", Z: "#ff0033"
    };
  } else if (themeName === "nuit") {
    window.currentColors = {
      I: "#ccc", J: "#ccc", L: "#ccc",
      O: "#ccc", S: "#ccc", T: "#ccc", Z: "#ccc"
    };
  } else {
    // Remet les couleurs nature par défaut (ou bubble)
    window.currentColors = {
      I: "#5cb85c", J: "#388e3c", L: "#7bb661",
      O: "#cddc39", S: "#a2d149", T: "#558b2f", Z: "#9ccc65"
    };
  }
}
loadBlockImages(currentTheme);

// --- Fonction centrale pour changer de thème
function changeTheme(themeName) {
  // Change le data-theme du body pour activer les styles CSS globaux
  document.body.setAttribute('data-theme', themeName);

  // Change la feuille CSS du thème
  const themeStyle = document.getElementById('theme-style');
  if (themeStyle) themeStyle.href = `../themes/${themeName}.css`;

  // Recharge les images des pièces pour le thème
  setTimeout(() => loadBlockImages(themeName), 100);

  // Mets à jour l'index courant pour le bouton
  currentThemeIndex = THEMES.indexOf(themeName);
}

// --- Variables jeu
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let currentPiece, nextPiece, heldPiece = null;
let holdUsed = false;
let score = 0;
let highscore = Number(localStorage.getItem("vblocks_highscore") || 0);
let dropInterval = 500;
let lastTime = 0;
let gameOver = false;
let paused = false;
let combo = 0;

document.getElementById("score").textContent = "Score : 0";
document.getElementById("highscore").textContent = "Record : " + highscore;

const PIECES = [
  [[1,1,1,1]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]],
  [[1,1],[1,1]], [[0,1,1],[1,1,0]], [[0,1,0],[1,1,1]], [[1,1,0],[0,1,1]]
];
const LETTERS = ['I','J','L','O','S','T','Z'];

// --- SCORING PRO (comme challenge)
function computeScore(lines, combo) {
  let pts = 0;
  switch (lines) {
    case 1: pts = 10; break;
    case 2: pts = 30; break;
    case 3: pts = 50; break;
    case 4: pts = 80; break;
    default: pts = 0;
  }
  if (combo > 1 && lines > 0) pts += (combo - 1) * 5;
  return pts;
}
// Ajoute les points à la banque boutique
function addBoutiquePoints(pts) {
  let old = Number(localStorage.getItem("vblocks_boutique_points") || 0);
  localStorage.setItem("vblocks_boutique_points", old + pts);
}

function newPiece() {
  const typeId = Math.floor(Math.random() * PIECES.length);
  return {
    shape: PIECES[typeId],
    letter: LETTERS[typeId],
    x: Math.floor((COLS - PIECES[typeId][0].length) / 2),
    y: 0
  };
}

function collision() {
  return currentPiece.shape.some((row, dy) =>
    row.some((val, dx) => {
      if (!val) return false;
      const x = currentPiece.x + dx;
      const y = currentPiece.y + dy;
      return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
    })
  );
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
    combo++;
    let pts = computeScore(lines, combo);
    score += pts;
    addBoutiquePoints(pts);
    document.getElementById("score").textContent = "Score : " + score;
    if (score > highscore) {
      highscore = score;
      localStorage.setItem("vblocks_highscore", highscore);
      document.getElementById("highscore").textContent = "Record : " + highscore;
    }
    updateBestScore();
  } else {
    combo = 0;
  }
}

function move(offset) {
  currentPiece.x += offset;
  if (collision()) currentPiece.x -= offset;
}

function dropPiece() {
  currentPiece.y++;
  if (collision()) {
    currentPiece.y--;
    merge();
    reset();
    if (collision()) {
      alert("🎮 Game Over !");
      gameOver = true;
    }
  }
}

function rotatePiece() {
  const shape = currentPiece.shape;
  currentPiece.shape = shape[0].map((_, i) => shape.map(r => r[i])).reverse();
  if (collision()) currentPiece.shape = shape;
}

function holdPiece() {
  if (holdUsed) return;
  if (!heldPiece) {
    heldPiece = { ...currentPiece };
    reset();
  } else {
    [heldPiece, currentPiece] = [{ ...currentPiece }, { ...heldPiece }];
  }
  holdUsed = true;
  drawMiniPiece(holdCtx, heldPiece);
}

function drawBlockCustom(ctx, x, y, letter, size = BLOCK_SIZE) {
  const img = blockImages[letter];
  const px = x * size;
  const py = y * size;
  // Si une image PNG existe (bubble/nature), on la dessine
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, px, py, size, size);
  } else {
    // Sinon, couleur JS selon thème
    if (currentTheme === "nuit") {
      ctx.fillStyle = "#ccc";
      ctx.fillRect(px, py, size, size);
    } else if (currentTheme === "neon") {
      const color = window.currentColors?.[letter] || "#fff";
      ctx.fillStyle = "#111";
      ctx.fillRect(px, py, size, size);
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
      ctx.shadowBlur = 0;
    } else if (currentTheme === "retro") {
      const color = window.currentColors?.[letter] || "#fff";
      ctx.fillStyle = color;
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, size, size);
    } else {
      // "nature", "bubble" ou autre fallback couleur
      const fallback = window.currentColors?.[letter] || "#999";
      ctx.fillStyle = fallback;
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = "#333";
      ctx.strokeRect(px, py, size, size);
    }
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  board.forEach((row, y) =>
    row.forEach((letter, x) => {
      if (letter) drawBlockCustom(ctx, x, y, letter);
    })
  );
  currentPiece.shape.forEach((row, dy) =>
    row.forEach((val, dx) => {
      if (val) drawBlockCustom(ctx, currentPiece.x + dx, currentPiece.y + dy, currentPiece.letter);
    })
  );
}

function drawMiniPiece(ctxRef, piece, size = 20) {
  ctxRef.clearRect(0, 0, 120, 120);
  if (!piece) return;
  const shape = piece.shape;
  const w = shape[0].length;
  const h = shape.length;
  const offsetX = (120 - w * size) / 2;
  const offsetY = (120 - h * size) / 2;
  shape.forEach((row, y) =>
    row.forEach((val, x) => {
      if (val) {
        const px = offsetX + x * size;
        const py = offsetY + y * size;
        const color = window.currentColors?.[piece.letter] || "#999";
        ctxRef.fillStyle = color;
        ctxRef.fillRect(px, py, size, size);
        ctxRef.strokeStyle = "#333";
        ctxRef.strokeRect(px, py, size, size);
      }
    })
  );
}

function reset() {
  currentPiece = nextPiece || newPiece();
  nextPiece = newPiece();
  holdUsed = false;
  drawMiniPiece(nextCtx, nextPiece);
}

// CLAVIER
document.addEventListener("keydown", e => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
  if (e.key === "p" || e.key === "P") {
    paused = !paused;
    if (!paused) update();
    drawBoard();
    return;
  }
  if (gameOver || paused) return;
  switch (e.key) {
    case "ArrowLeft": move(-1); break;
    case "ArrowRight": move(1); break;
    case "ArrowDown": dropPiece(); break;
    case "ArrowUp": rotatePiece(); break;
    case "c": case "C": holdPiece(); break;
  }
});

// INITIALISATION JEU
nextPiece = newPiece();
reset();

function update(time = 0) {
  if (gameOver || paused) return;
  const delta = time - lastTime;
  if (delta > dropInterval) {
    dropPiece();
    lastTime = time;
  }
  drawBoard();
  requestAnimationFrame(update);
}
requestAnimationFrame(update);

// Boutons UI (si présents dans ta page)
document.addEventListener("DOMContentLoaded", () => {
  const btnTheme  = document.getElementById("theme-btn");
  const btnMusic  = document.getElementById("music-btn");
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
      changeTheme(THEMES[currentThemeIndex]);
    });
  }
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
