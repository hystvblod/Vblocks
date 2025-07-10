// Sélecteurs canvas (assure-toi d'avoir ces IDs dans ton HTML)
const canvas     = document.getElementById("gameCanvas");
const ctx        = canvas.getContext("2d");
const holdCanvas = document.getElementById("holdCanvas");
const holdCtx    = holdCanvas ? holdCanvas.getContext("2d") : null;
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx    = nextCanvas ? nextCanvas.getContext("2d") : null;

let BLOCK_SIZE = 30;
const COLS = 10, ROWS = 20;

// Responsive canvas & side panels (next/hold)
function resizeAllCanvas() {
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

window.addEventListener("resize", resizeAllCanvas);
window.addEventListener("orientationchange", resizeAllCanvas);
setTimeout(resizeAllCanvas, 40);

let currentTheme = "nature";
if (!window.currentColors) {
  window.currentColors = {
    I: "#5cb85c", J: "#388e3c", L: "#7bb661",
    O: "#cddc39", S: "#a2d149", T: "#558b2f", Z: "#9ccc65"
  };
}
const blockImages = {};
function loadBlockImages(themeName) {
  ['I','J','L','O','S','T','Z'].forEach(letter => {
    const img = new Image();
    img.src = `../themes/${themeName}/${letter}.png`;
    blockImages[letter] = img;
  });
  currentTheme = themeName;
  if (themeName === "neon") {
    window.currentColors = {
      I: "#00ffff", J: "#007bff", L: "#ff8800",
      O: "#ffff00", S: "#00ff00", T: "#ff00ff", Z: "#ff0033"
    };
  }
}
loadBlockImages(currentTheme);

let board        = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let currentPiece, nextPiece, heldPiece = null;
let holdUsed     = false;
let score        = 0;
let highscore    = localStorage.getItem("vblocks_highscore") || 0;
let dropInterval = 500;
let lastTime     = 0;
let gameOver     = false;
let paused       = false;

document.getElementById("score").textContent = "Score : 0";
document.getElementById("highscore").textContent = "Record : " + highscore;

const PIECES = [
  [[1,1,1,1]],
  [[1,0,0],[1,1,1]],
  [[0,0,1],[1,1,1]],
  [[1,1],[1,1]],
  [[0,1,1],[1,1,0]],
  [[0,1,0],[1,1,1]],
  [[1,1,0],[0,1,1]]
];
const LETTERS = ['I','J','L','O','S','T','Z'];

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
  score += lines * 100;
  document.getElementById("score").textContent = "Score : " + score;
  if (score > highscore) {
    highscore = score;
    localStorage.setItem("vblocks_highscore", highscore);
    document.getElementById("highscore").textContent = "Record : " + highscore;
  }
}

function reset() {
  currentPiece = nextPiece || newPiece();
  nextPiece    = newPiece();
  holdUsed     = false;
  if (nextCtx) drawMiniPiece(nextCtx, nextPiece);
}

function drawBlockCustom(ctx, x, y, letter, size = BLOCK_SIZE, alpha = 1) {
  const img = blockImages[letter];
  const px = x * size;
  const py = y * size;
  ctx.save();
  ctx.globalAlpha = alpha;
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
  } else if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, px, py, size, size);
  } else {
    const fallback = window.currentColors?.[letter] || "#999";
    ctx.fillStyle = fallback;
    ctx.fillRect(px, py, size, size);
    ctx.strokeStyle = "#333";
    ctx.strokeRect(px, py, size, size);
  }
  ctx.restore();
}

// --- Ghost Piece ---
function drawGhostPiece() {
  const ghost = {
    shape: currentPiece.shape,
    letter: currentPiece.letter,
    x: currentPiece.x,
    y: currentPiece.y
  };
  while (!ghostCollision(ghost)) ghost.y++;
  ghost.y--;
  ghost.shape.forEach((row, dy) =>
    row.forEach((val, dx) => {
      if (val) drawBlockCustom(ctx, ghost.x + dx, ghost.y + dy, ghost.letter, BLOCK_SIZE, 0.22);
    })
  );
}
function ghostCollision(piece) {
  return piece.shape.some((row, dy) =>
    row.some((val, dx) => {
      if (!val) return false;
      const x = piece.x + dx;
      const y = piece.y + dy;
      return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
    })
  );
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  board.forEach((row, y) =>
    row.forEach((letter, x) => {
      if (letter) drawBlockCustom(ctx, x, y, letter);
    })
  );
  drawGhostPiece();
  currentPiece.shape.forEach((row, dy) =>
    row.forEach((val, dx) => {
      if (val) {
        drawBlockCustom(ctx, currentPiece.x + dx, currentPiece.y + dy, currentPiece.letter);
      }
    })
  );
  if (paused && !gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px Arial";
    ctx.fillText("⏸️ Pause", canvas.width / 2 - 40, canvas.height / 2);
  }
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
        const color = window.currentColors?.[piece.letter] || "#999";
        ctxRef.fillStyle = color;
        ctxRef.fillRect(px, py, size, size);
        ctxRef.strokeStyle = "#333";
        ctxRef.strokeRect(px, py, size, size);
      }
    })
  );
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
      alert("Game Over");
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
  if (holdCtx) drawMiniPiece(holdCtx, heldPiece);
}

// --- Contrôles clavier & tactile ---
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
    case "ArrowLeft": move(-1); drawBoard(); break;
    case "ArrowRight": move(1); drawBoard(); break;
    case "ArrowDown": dropPiece(); drawBoard(); break;
    case "ArrowUp": rotatePiece(); drawBoard(); break;
    case "c": case "C": holdPiece(); drawBoard(); break;
  }
});

// --- Contrôle tactile moderne (mobile) ---
let touchStartX = 0, touchStartY = 0, touchMoved = false;

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
    return;
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

setInterval(() => {
  if (dropInterval > 50) {
    dropInterval -= 30;
    //console.log("Vitesse accélérée à", dropInterval);
  }
}, 20000);

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

