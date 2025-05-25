const canvas     = document.getElementById("gameCanvas");
const ctx        = canvas.getContext("2d");
const holdCanvas = document.getElementById("holdCanvas");
const holdCtx    = holdCanvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx    = nextCanvas.getContext("2d");


let BLOCK_SIZE = 30;
const COLS = 10, ROWS = 20;
canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;
canvas.style.width = canvas.width + "px";
canvas.style.height = canvas.height + "px";


let currentTheme = "nature";
if (!window.currentColors) {
  window.currentColors = {
    I: "#5cb85c", J: "#388e3c", L: "#7bb661",
    O: "#cddc39", S: "#a2d149", T: "#558b2f", Z: "#9ccc65"
  };
}

if (currentTheme === "neon") {
  window.currentColors = {
    I: "#00ffff", // Cyan
    J: "#007bff", // Bleu néon
    L: "#ff8800", // Orange néon
    O: "#ffff00", // Jaune néon
    S: "#00ff00", // Vert néon
    T: "#ff00ff", // Rose néon
    Z: "#ff0033"  // Rouge néon
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

  // Appliquer les couleurs si thème neon
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
  drawMiniPiece(nextCtx, nextPiece);
}

function drawBlockCustom(ctx, x, y, letter, size = BLOCK_SIZE) {
  const img = blockImages[letter];
  const px = x * size;
  const py = y * size;

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

        if (currentTheme === "neon") {
          ctxRef.fillStyle = "#111";
          ctxRef.fillRect(px, py, size, size);
          ctxRef.shadowColor = color;
          ctxRef.shadowBlur = 10;
          ctxRef.strokeStyle = color;
          ctxRef.strokeRect(px + 1, py + 1, size - 2, size - 2);
          ctxRef.shadowBlur = 0;
        } else if (currentTheme === "nuit") {
          ctxRef.fillStyle = "#ccc";
          ctxRef.fillRect(px, py, size, size);
        } else {
          const img = blockImages[piece.letter];
          if (img && img.complete && img.naturalWidth > 0) {
            ctxRef.drawImage(img, px, py, size, size);
          } else {
            ctxRef.fillStyle = color;
            ctxRef.fillRect(px, py, size, size);
            ctxRef.strokeStyle = "#333";
            ctxRef.strokeRect(px, py, size, size);
          }
        }
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
  drawMiniPiece(holdCtx, heldPiece);
}

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

setInterval(() => {
  if (dropInterval > 50) {
    dropInterval -= 30;
    console.log("Vitesse accélérée à", dropInterval);
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





function resizeCanvas() {
  const top = document.querySelector("h1")?.offsetHeight || 0;
  const score = document.getElementById("score")?.offsetHeight || 0;
  const highscore = document.getElementById("highscore")?.offsetHeight || 0;
  const controls = document.getElementById("controls")?.offsetHeight || 0;
  const options = document.getElementById("options")?.offsetHeight || 0;

  const reserved = top + score + highscore + controls + options + 80;
  const availableHeight = window.innerHeight - reserved;
  const availableWidth = window.innerWidth * 0.9;

  const blockW = Math.floor(availableWidth / COLS);
  const blockH = Math.floor(availableHeight / ROWS);
  BLOCK_SIZE = Math.min(blockW, blockH);

  canvas.width = COLS * BLOCK_SIZE;
  canvas.height = ROWS * BLOCK_SIZE;
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";

  drawBoard();
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", () => { setTimeout(() => { resizeCanvas(); }, 10); });