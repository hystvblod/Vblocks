// === VBlocks Mode Challenge JS Complet (clé i18n, défis, timer, etc.) ===

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

let paused = false;
let currentTheme = "neon";
const blockImages = {};

// === Couleurs blocs via CSS (pro, lis depuis la variable CSS)
function getBlockColor(letter) {
  return getComputedStyle(document.body).getPropertyValue('--block-' + letter) || "#aaa";
}

function loadBlockImages(themeName) {
  const useImages = (themeName === "neon" || themeName === "bubble");
  ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].forEach(letter => {
    if (useImages) {
      const img = new Image();
      img.src = `../themes/${themeName}/${letter}.png`;
      blockImages[letter] = img;
    } else {
      blockImages[letter] = null;
    }
  });
  currentTheme = themeName;
}

function changeTheme(themeName) {
  // 1. Change l’attribut data-theme du body
  document.body.setAttribute('data-theme', themeName);

  // 2. Change la feuille de style du thème
  const themeStyle = document.getElementById('theme-style');
  themeStyle.href = `../themes/${themeName}.css`;

  // 3. Recharge les images de pièces après chargement du CSS
  setTimeout(() => loadBlockImages(themeName), 100);
}


function newPiece() {
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
  const id = Math.floor(Math.random() * PIECES.length);
  return {
    shape: PIECES[id],
    letter: LETTERS[id],
    x: Math.floor((COLS - PIECES[id][0].length) / 2),
    y: 0
  };
}

function drawBlock(ctx, x, y, letter, size = BLOCK_SIZE) {
  const img = blockImages[letter];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x * size, y * size, size, size);
  } else {
    ctx.fillStyle = getBlockColor(letter);
    ctx.fillRect(x * size, y * size, size, size);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#333";
    ctx.strokeRect(x * size, y * size, size, size);
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  board.forEach((row, y) =>
    row.forEach((letter, x) => {
      if (letter) drawBlock(ctx, x, y, letter);
    })
  );

  if (currentPiece) {
    currentPiece.shape.forEach((row, dy) =>
      row.forEach((val, dx) => {
        if (val) drawBlock(ctx, currentPiece.x + dx, currentPiece.y + dy, currentPiece.letter);
      })
    );
  }

  drawNext();
  drawHold();
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (nextPiece) {
    const offsetX = Math.floor((nextCanvas.width / BLOCK_SIZE - nextPiece.shape[0].length) / 2);
    const offsetY = Math.floor((nextCanvas.height / BLOCK_SIZE - nextPiece.shape.length) / 2);
    nextPiece.shape.forEach((row, dy) =>
      row.forEach((val, dx) => {
        if (val) drawBlock(nextCtx, offsetX + dx, offsetY + dy, nextPiece.letter, BLOCK_SIZE);
      })
    );
  }
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (heldPiece) {
    const offsetX = Math.floor((holdCanvas.width / BLOCK_SIZE - heldPiece.shape[0].length) / 2);
    const offsetY = Math.floor((holdCanvas.height / BLOCK_SIZE - heldPiece.shape.length) / 2);
    heldPiece.shape.forEach((row, dy) =>
      row.forEach((val, dx) => {
        if (val) drawBlock(holdCtx, offsetX + dx, offsetY + dy, heldPiece.letter, BLOCK_SIZE);
      })
    );
  }
}

function movePiece(dir) {
  currentPiece.x += dir;
  if (collision(currentPiece)) {
    currentPiece.x -= dir;
  }
}

function rotatePiece() {
  const oldShape = currentPiece.shape;
  currentPiece.shape = oldShape[0].map((_, i) => oldShape.map(row => row[i])).reverse();
  if (collision(currentPiece)) {
    currentPiece.shape = oldShape;
  }
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
    if (collision(currentPiece)) {
      endChallenge(false); // Game over = échec challenge
      return;
    }
  }
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

// === SCORE MODE TETRIS en dizaines ===
function computeScore(lines) {
  switch (lines) {
    case 1: return 10;
    case 2: return 30;
    case 3: return 50;
    case 4: return 80;
    default: return 0;
  }
}

// === Compte des lignes totales depuis début partie ===
let totalLines = 0;

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
    score += computeScore(lines);
    totalLines += lines;
    document.getElementById("score").textContent = "Score : " + score;
    if (score > highscore) {
      highscore = score;
      localStorage.setItem("vblocks_highscore", highscore);
      document.getElementById("highscore").textContent = "Record : " + highscore;
    }
    checkChallenge();
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
}

function newTurn() {
  currentPiece = nextPiece;
  nextPiece = newPiece();
  holdUsed = false;
}

function endGame() {
  endChallenge(false);
}

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let currentPiece = newPiece();
let nextPiece = newPiece();
let heldPiece = null;
let holdUsed = false;
let score = 0;
let highscore = localStorage.getItem("vblocks_highscore") || 0;

// === CHALLENGE MODE ===
// === 50 défis (numérotés, crescendo, clés i18n générées) ===
const CHALLENGE_LIST = [
  // 1 à 20 : lignes faciles/croissantes
  { num: 1,  type: "lines",  goal: 2,   time: 25 },
  { num: 2,  type: "lines",  goal: 3,   time: 28 },
  { num: 3,  type: "lines",  goal: 4,   time: 30 },
  { num: 4,  type: "lines",  goal: 5,   time: 35 },
  { num: 5,  type: "lines",  goal: 6,   time: 38 },
  { num: 6,  type: "lines",  goal: 7,   time: 42 },
  { num: 7,  type: "lines",  goal: 8,   time: 45 },
  { num: 8,  type: "lines",  goal: 10,  time: 50 },
  { num: 9,  type: "lines",  goal: 12,  time: 55 },
  { num:10,  type: "lines",  goal: 14,  time: 60 },
  { num:11,  type: "lines",  goal: 16,  time: 70 },
  { num:12,  type: "lines",  goal: 18,  time: 80 },
  { num:13,  type: "lines",  goal: 20,  time: 90 },
  { num:14,  type: "lines",  goal: 22,  time: 100 },
  { num:15,  type: "lines",  goal: 24,  time: 110 },
  { num:16,  type: "lines",  goal: 26,  time: 120 },
  { num:17,  type: "lines",  goal: 28,  time: 130 },
  { num:18,  type: "lines",  goal: 30,  time: 140 },
  { num:19,  type: "lines",  goal: 32,  time: 150 },
  { num:20,  type: "lines",  goal: 35,  time: 160 },
  // 21 à 50 : points, difficulté croissante
  { num:21,  type: "points", goal: 30,  time: 20 },
  { num:22,  type: "points", goal: 40,  time: 24 },
  { num:23,  type: "points", goal: 50,  time: 28 },
  { num:24,  type: "points", goal: 60,  time: 32 },
  { num:25,  type: "points", goal: 70,  time: 36 },
  { num:26,  type: "points", goal: 80,  time: 40 },
  { num:27,  type: "points", goal: 90,  time: 44 },
  { num:28,  type: "points", goal: 100, time: 48 },
  { num:29,  type: "points", goal: 120, time: 52 },
  { num:30,  type: "points", goal: 140, time: 56 },
  { num:31,  type: "points", goal: 160, time: 60 },
  { num:32,  type: "points", goal: 180, time: 65 },
  { num:33,  type: "points", goal: 200, time: 70 },
  { num:34,  type: "points", goal: 230, time: 80 },
  { num:35,  type: "points", goal: 260, time: 90 },
  { num:36,  type: "points", goal: 290, time: 100 },
  { num:37,  type: "points", goal: 320, time: 110 },
  { num:38,  type: "points", goal: 350, time: 120 },
  { num:39,  type: "points", goal: 380, time: 130 },
  { num:40,  type: "points", goal: 420, time: 140 },
  { num:41,  type: "lines",  goal: 10,  time: 15 },
  { num:42,  type: "lines",  goal: 15,  time: 30 },
  { num:43,  type: "points", goal: 100, time: 20 },
  { num:44,  type: "points", goal: 200, time: 35 },
  { num:45,  type: "lines",  goal: 20,  time: 45 },
  { num:46,  type: "points", goal: 250, time: 35 },
  { num:47,  type: "lines",  goal: 25,  time: 55 },
  { num:48,  type: "points", goal: 300, time: 45 },
  { num:49,  type: "lines",  goal: 30,  time: 60 },
  { num:50,  type: "points", goal: 350, time: 55 }
];

let challengeIndex = 0; // 0 = défi 1
let challengeStartLines = 0;
let challengeStartScore = 0;
let challengeTimer = 0;
let timerInterval = null;
let challengeRunning = false;

function i18n(key, params) {
  // --- FAKE VERSION : tu remplaces ça par ton vrai système i18n ! ---
  if (!params) return key;
  return key.replace(/\{(\w+)\}/g, (_, p) => params[p] ?? '');
}

function showChallenge() {
  const defi = CHALLENGE_LIST[challengeIndex];
  document.getElementById("challenge-num").textContent = defi.num;
  const key = (defi.type === "lines")
    ? "challenge.defi.lines"
    : "challenge.defi.points";
  const params = { goal: defi.goal, time: defi.time };
  document.getElementById("challenge-defi").textContent = i18n(key, params);
  document.getElementById("challenge-timer").textContent = defi.time + "s";
}

function startChallenge() {
  const defi = CHALLENGE_LIST[challengeIndex];
  challengeStartLines = totalLines;
  challengeStartScore = score;
  challengeTimer = defi.time;
  challengeRunning = true;

  document.getElementById("challenge-timer").textContent = challengeTimer + "s";
  timerInterval = setInterval(() => {
    challengeTimer--;
    document.getElementById("challenge-timer").textContent = challengeTimer + "s";
    if (challengeTimer <= 0) {
      endChallenge(false);
    }
  }, 1000);
}

function checkChallenge() {
  if (!challengeRunning) return;
  const defi = CHALLENGE_LIST[challengeIndex];
  if (defi.type === "lines" &&
    (totalLines - challengeStartLines) >= defi.goal) {
    endChallenge(true);
  }
  if (defi.type === "points" &&
    (score - challengeStartScore) >= defi.goal) {
    endChallenge(true);
  }
}

function endChallenge(success) {
  clearInterval(timerInterval);
  challengeRunning = false;
  if (success) {
    alert("Bravo, défi réussi !");
    // Ici tu peux passer au défi suivant : challengeIndex++; + reload ou continuer
  } else {
    alert("Temps écoulé ou objectif non atteint.");
  }
  window.location.reload();
}

// --- GAMELOOP ---
function update(time = 0) {
  if (!paused) {
    dropPiece();
    drawBoard();
  }
  requestAnimationFrame(update);
}

// --- CONTROLES CLAVIER ---
document.addEventListener("keydown", (e) => {
  if (paused) return;
  switch (e.key) {
    case "ArrowLeft": movePiece(-1); break;
    case "ArrowRight": movePiece(1); break;
    case "ArrowDown": dropPiece(); break;
    case "ArrowUp": rotatePiece(); break;
    case "c":
    case "C": holdPiece(); break;
    case " ": // Barre espace = démarre le challenge (si pas déjà fait)
      if (!challengeRunning) startChallenge();
      break;
  }
});

loadBlockImages(currentTheme);
showChallenge();
update();

/*
--- HTML À AJOUTER AU DESSUS DE LA GRILLE ---
<div class="challenge-box" id="challenge-box" style="margin-bottom:14px;">
  <div class="challenge-label">Défi n°<span id="challenge-num"></span></div>
  <div class="challenge-defi" id="challenge-defi"></div>
  <div class="challenge-timer" id="challenge-timer"></div>
</div>
*/

/*
--- CLÉS i18n À AJOUTER ---
"challenge.defi.lines": "Fais {goal} lignes en {time} secondes",
"challenge.defi.points": "Marque {goal} points en {time} secondes",
*/

