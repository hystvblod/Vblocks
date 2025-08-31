// --- PATCH anti-lignes (ne s'applique qu'au thème "nuit") ---
function fillRectThemeSafe(c, px, py, size) {
  const theme =
    (typeof getCurrentTheme === 'function'
      ? getCurrentTheme()
      : (localStorage.getItem('themeVBlocks') || 'neon'));
  if (theme === 'nuit') {
    const pad = 0.5;
    c.fillRect(px - pad, py - pad, size + 2 * pad, size + 2 * pad);
  } else {
    // Important: ne PAS se rappeler soi-même → pas de récursion
    c.fillRect(px, py, size, size); // ✅ width & height
  }
}

// --- FILE: game_duel.js ---
(function (global) {
  'use strict';

  // === IMPORTANT : alias sécurisé sur le client Supabase ===
  const sb = window.sb;
  if (!sb) {
    console.error("[game_duel.js] Supabase client 'window.sb' introuvable. Assure-toi de l'initialiser avant ce script.");
  }

  // ==== GESTION MUSIQUE UNIFIÉE ==== //
  const music = document.getElementById('music');
  if (music) music.volume = 0.45;

  function isMusicAlwaysMuted() {
    return localStorage.getItem('alwaysMuteMusic') === 'true';
  }
  function playMusicAuto() {
    if (!music) return;
    if (!isMusicAlwaysMuted()) {
      music.play().then(() => {
        window.musicStarted = true;
        refreshMusicBtn();
      }).catch(() => {});
    }
  }
  function pauseMusic() {
    if (music) music.pause();
    window.musicStarted = false;
    refreshMusicBtn();
  }
  function refreshMusicBtn() {
    const btn = document.getElementById('music-btn');
    if (!btn) return;
    const muted = isMusicAlwaysMuted() || (music && music.paused);
    const icon = muted ? 'volume-x' : 'volume-2';
    btn.innerHTML = `<img src="assets/icons/${icon}.svg" alt="${muted ? 'Muet' : 'Actif'}" class="music-btn-img">`;
  }
  window.setMusicAlwaysMuted = function (val) {
    localStorage.setItem('alwaysMuteMusic', val ? 'true' : 'false');
    if (val) pauseMusic(); else playMusicAuto();
    refreshMusicBtn();
  };
  window.startMusicForGame = function () {
    if (!music) return;
    if (isMusicAlwaysMuted()) { pauseMusic(); return; }
    music.currentTime = 0;
    playMusicAuto();
  };
  window.addEventListener('storage', (e) => {
    if (e.key === 'alwaysMuteMusic') {
      refreshMusicBtn();
      if (isMusicAlwaysMuted()) pauseMusic(); else playMusicAuto();
    }
  });
  if (window.Capacitor || window.cordova) {
    setTimeout(playMusicAuto, 350);
  } else {
    window.addEventListener('pointerdown', function autoStartMusic() {
      if (!window.musicStarted && !isMusicAlwaysMuted()) {
        playMusicAuto();
        window.musicStarted = true;
      }
    }, { once: true });
  }
  setTimeout(refreshMusicBtn, 200);
  document.addEventListener('DOMContentLoaded', () => {
    const btnMusic = document.getElementById('music-btn');
    if (!btnMusic) return;
    btnMusic.onclick = () => {
      const currentlyMuted = isMusicAlwaysMuted() || (music && music.paused);
      const nextMute = !currentlyMuted;
      if (typeof window.setMusicAlwaysMuted === 'function') {
        window.setMusicAlwaysMuted(nextMute);
      } else {
        localStorage.setItem('alwaysMuteMusic', nextMute ? 'true' : 'false');
        if (music) { if (nextMute) music.pause(); else music.play().catch(()=>{}); }
      }
      refreshMusicBtn();
    };
    refreshMusicBtn();
  });
  // ==== FIN MUSIQUE ====


  // ==== i18n minimal ====
  function t(key, params) {
    if (window.i18nGet) {
      let str = window.i18nGet(key) ?? key;
      if (params) Object.keys(params).forEach(k => { str = str.replace(`{${k}}`, params[k]); });
      return str;
    }
    if (window.I18N_MAP && window.I18N_MAP[key]) {
      let str = window.I18N_MAP[key];
      if (params) Object.keys(params).forEach(k => { str = str.replace(`{${k}}`, params[k]); });
      return str;
    }
    return key;
  }

  // === THEMES: helpers ===
  const THEMES = ['nuit','neon','nature','bubble','retro','space','vitraux','luxury','grece','arabic'];
  function isVariantTheme(name) {
    const tname = name || (localStorage.getItem('themeVBlocks') || 'neon');
    return tname === 'space' || tname === 'vitraux' || tname === 'luxury';
  }

  function initGame(opts) {
    const mode = 'duel';
    const duelId = opts?.duelId || null;
    const duelPlayerNum = opts?.duelPlayerNum || 1;

    // ====== Séquence DUEL ======
    let piecesSequence = null;
    let piecesUsed = 0;

    // ====== Ghost toggle (persisté) ======
    let ghostPieceEnabled = localStorage.getItem('ghostPiece') !== 'false';
    global.toggleGhostPiece = function (enabled) {
      ghostPieceEnabled = !!enabled;
      localStorage.setItem('ghostPiece', ghostPieceEnabled ? 'true' : 'false');
      safeRedraw();
    };

    // ====== CANVAS + DPR ======
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const holdCanvas = document.getElementById('holdCanvas');
    const holdCtx = holdCanvas ? holdCanvas.getContext('2d') : null;
    const nextCanvas = document.getElementById('nextCanvas');
    const nextCtx = nextCanvas ? nextCanvas.getContext('2d') : null;
    const scoreEl = document.getElementById('score');

    const COLS = 10, ROWS = 20;
    let BLOCK_SIZE = 30; // en px CSS
    const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    ctx.imageSmoothingEnabled = false;
    if (holdCtx) holdCtx.imageSmoothingEnabled = false;
    if (nextCtx) nextCtx.imageSmoothingEnabled = false;

    function clearCanvas(c2d, cnv) {
      c2d.save();
      c2d.setTransform(1, 0, 0, 1, 0, 0);
      c2d.clearRect(0, 0, cnv.width, cnv.height);
      c2d.restore();
    }

    function fitCanvasToCSS() {
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.round(rect.width);
      BLOCK_SIZE = cssW / COLS;
      const usedW = BLOCK_SIZE * COLS;
      const usedH = BLOCK_SIZE * ROWS;

      canvas.style.height = usedH + 'px';
      canvas.width  = Math.round(usedW * DPR);
      canvas.height = Math.round(usedH * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    function boardOffsets() {
      const cssW = canvas.width / DPR;
      const cssH = canvas.height / DPR;
      const usedW = BLOCK_SIZE * COLS;
      const usedH = BLOCK_SIZE * ROWS;
      return { x: (cssW - usedW) / 2, y: (cssH - usedH) / 2 };
    }
    function sizeMiniCanvas(cnv, c2d, target = 48) {
      if (!cnv || !c2d) return;
      cnv.style.width = target + 'px';
      cnv.style.height = target + 'px';
      cnv.width = Math.round(target * DPR);
      cnv.height = Math.round(target * DPR);
      c2d.setTransform(DPR, 0, 0, DPR, 0, 0);
      c2d.imageSmoothingEnabled = false;
    }

    fitCanvasToCSS();
    sizeMiniCanvas(holdCanvas, holdCtx, 48);
    sizeMiniCanvas(nextCanvas, nextCtx, 48);
    window.addEventListener('resize', () => {
      fitCanvasToCSS();
      sizeMiniCanvas(holdCanvas, holdCtx, 48);
      sizeMiniCanvas(nextCanvas, nextCtx, 48);
      safeRedraw();
    });

    // ====== Thèmes & assets ======
    let currentTheme = localStorage.getItem('themeVBlocks') || 'neon';
    let currentThemeIndex = Math.max(0, THEMES.indexOf(currentTheme));
    const blockImages = {};

    function loadBlockImages(themeName) {
      const themesWithPNG = ['bubble','nature','vitraux','luxury','space','angelique','cyber','japon','arabic','grece'];

      if (isVariantTheme(themeName)) {
        // Plusieurs variantes 1..6
        blockImages[themeName] = [];
        let left = 6;
        for (let i = 1; i <= 6; i++) {
          const img = new Image();
          img.onload = () => { if (--left === 0) safeRedraw(); };
          img.onerror = () => { if (--left === 0) safeRedraw(); };
          img.src = `themes/${themeName}/${i}.png`;
          blockImages[themeName].push(img);
        }
        ['I','J','L','O','S','T','Z'].forEach(l => { blockImages[l] = null; });
      } else if (themeName === 'grece' || themeName === 'arabic') {
        // Une seule image pour toutes les pièces
        const img = new Image();
        img.onload = () => { safeRedraw(); };
        img.onerror = () => {};
        img.src = `themes/${themeName}/block.png`;
        ['I','J','L','O','S','T','Z'].forEach(l => { blockImages[l] = img; });
      } else {
        // PNG par lettre (ou fallback dessin)
        ['I','J','L','O','S','T','Z'].forEach(l => {
          if (themesWithPNG.includes(themeName)) {
            const img = new Image();
            img.onload = () => { safeRedraw(); };
            img.onerror = () => {};
            img.src = `themes/${themeName}/${l}.png`;
            blockImages[l] = img;
          } else {
            blockImages[l] = null;
          }
        });
      }

      currentTheme = themeName;
      if (themeName === 'retro') {
        global.currentColors = { I:'#00f0ff', J:'#0044ff', L:'#ff6600', O:'#ffff33', S:'#00ff44', T:'#ff00cc', Z:'#ff0033' };
      } else if (themeName === 'neon') {
        global.currentColors = { I:'#00ffff', J:'#007bff', L:'#ff8800', O:'#ffff00', S:'#00ff00', T:'#ff00ff', Z:'#ff0033' };
      } else if (themeName === 'nuit') {
        global.currentColors = { I:'#ccc', J:'#ccc', L:'#ccc', O:'#ccc', S:'#ccc', T:'#ccc', Z:'#ccc' };
      } else {
        global.currentColors = { I:'#5cb85c', J:'#388e3c', L:'#7bb661', O:'#cddc39', S:'#a2d149', T:'#558b2f', Z:'#9ccc65' };
      }
    }
    function changeTheme(themeName) {
      document.body.setAttribute('data-theme', themeName);
      const link = document.getElementById('theme-style');
      if (link) link.href = `themes/${themeName}.css`;
      loadBlockImages(themeName);
      currentThemeIndex = Math.max(0, THEMES.indexOf(themeName));
      safeRedraw();
    }
    loadBlockImages(currentTheme);
    window.addEventListener('vblocks-theme-changed', (e) => {
      const tname = (e?.detail?.theme) || localStorage.getItem('themeVBlocks') || 'neon';
      if (tname) changeTheme(tname);
    });

    // ====== Pièces ======
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

    // ====== État ======
    let board = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
    let currentPiece = null;
    let nextPiece = null;
    let heldPiece = null;
    let holdUsed = false; // ignoré pour compat — échanges illimités ici
    let score = 0;
    let dropInterval = 500;
    let lastTime = 0;
    let gameOver = false;
    let paused = false;
    let combo = 0;
    let linesCleared = 0;
    let history = [];

    const SPEED_TABLE = [
      800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
       83,  83,  83,  67,  67,  67,  50,   50,  50,  33,
       33,  33,  33,  33,  33,  33,  33,  33,  17
    ];

    function updateScoreUI() { if (scoreEl) scoreEl.textContent = String(score); }

    function saveHistory() {
      history.push({
        board: board.map(row => row.map(cell => cell && typeof cell === 'object' ? { ...cell } : cell)),
        currentPiece: JSON.parse(JSON.stringify(currentPiece)),
        nextPiece: JSON.parse(JSON.stringify(nextPiece)),
        heldPiece: heldPiece ? JSON.parse(JSON.stringify(heldPiece)) : null,
        score, combo, linesCleared, dropInterval,
        piecesSequence: piecesSequence ? piecesSequence.slice() : null,
        piecesUsed
      });
      if (history.length > 30) history.shift();
    }

    // ====== DUEL: séquence partagée depuis BDD ======
    async function setupDuelSequence() {
      if (!duelId || !sb) {
        // fallback solo/random si pas d’ID (démo locale)
        piecesSequence = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 7));
        piecesUsed = 0;
        return;
      }
      let tries = 0, data = null;
      while (tries++ < 20) {
        const res = await sb.from('duels').select('*').eq('id', duelId).single();
        if (res?.data && res.data.pieces_seq) { data = res.data; break; }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (!data) throw new Error(t('error.duel_not_found'));
      piecesSequence = data.pieces_seq.split(',').map(x => parseInt(x, 10));
      piecesUsed = 0;
    }
    function getDuelNextPieceId() {
      if (!piecesSequence) return Math.floor(Math.random() * PIECES.length);
      if (piecesUsed >= piecesSequence.length) return Math.floor(Math.random() * PIECES.length);
      return piecesSequence[piecesUsed++];
    }

    async function handleDuelEnd(myScore) {
      const field = (duelPlayerNum === 1) ? 'score1' : 'score2';
      await sb.from('duels').update({ [field]: myScore }).eq('id', duelId);
      let tries = 0, otherScore = null;
      while (tries++ < 40) {
        let { data } = await sb.from('duels').select('*').eq('id', duelId).single();
        if (duelPlayerNum === 1 && data?.score2 != null) { otherScore = data.score2; break; }
        if (duelPlayerNum === 2 && data?.score1 != null) { otherScore = data.score1; break; }
        await new Promise(r => setTimeout(r, 1500));
      }
      const msg = `
        <div style="font-weight:bold;">${t('duel.finished')}</div>
        <div>${t('duel.yourscore')} <b>${myScore}</b></div>
        <div>${t('duel.opponentscore')} <b>${otherScore != null ? otherScore : t('duel.waiting')}</b></div>
        <br>
        <button style="padding:0.4em 1em;font-size:0.9em;border-radius:0.5em;border:none;background:#444;color:#fff;cursor:pointer;"
                onclick="window.location.href='index.html'">
          ${t('button.back')}
        </button>
      `;
      const div = document.createElement('div');
      div.id = 'duel-popup';
      div.style = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2em;';
      div.innerHTML = `<div style="background:#23294a;padding:2em 2em 1em 2em;border-radius:1.2em;box-shadow:0 0 12px #39ff1477;text-align:center;">${msg}</div>`;
      document.body.appendChild(div);
    }

    function showEndPopup(points) {
      paused = true;
      stopSoftDrop();
      safeRedraw();
      handleDuelEnd(points);
    }

    // ====== Gameplay ======
    function computeScore(lines) {
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

    async function startGame() {
      await setupDuelSequence();
      nextPiece = newPiece();
      reset();
      saveHistory();
      updateScoreUI();
      window.startMusicForGame?.();
      requestAnimationFrame(update);
    }

    function newPiece() {
      let typeId = getDuelNextPieceId();
      if (Number.isNaN(typeId) || typeId < 0 || typeId > 6) typeId = 3;
      const shape = PIECES[typeId];
      const letter = LETTERS[typeId];
      const obj = {
        shape,
        letter,
        x: Math.floor((COLS - shape[0].length) / 2),
        y: 0
      };
      if (isVariantTheme(currentTheme)) {
        const numbers = [1,2,3,4,5,6];
        for (let i = numbers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }
        let idx = 0;
        obj.variants = shape.map(row => row.map(val => (val ? numbers[idx++] : null)));
      }
      return obj;
    }

    function collision(p = currentPiece) {
      if (!p || !p.shape) return false;
      return p.shape.some((row, dy) =>
        row.some((val, dx) => {
          if (!val) return false;
          const x = p.x + dx;
          const y = p.y + dy;
          return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
        })
      );
    }

    function merge() {
      currentPiece.shape.forEach((row, dy) =>
        row.forEach((val, dx) => {
          if (!val) return;
          const x = currentPiece.x + dx;
          const y = currentPiece.y + dy;
          if (y >= 0) {
            if (isVariantTheme(currentTheme)) {
              board[y][x] = { letter: currentPiece.letter, variant: currentPiece.variants?.[dy]?.[dx] ?? 0 };
            } else {
              board[y][x] = currentPiece.letter;
            }
          }
        })
      );
      clearLines();
    }

    function clearLines() {
      let lines = 0;
      board = board.filter(row => {
        if (row.every(cell => cell !== '')) { lines++; return false; }
        return true;
      });
      while (board.length < ROWS) board.unshift(Array(COLS).fill(''));
      if (lines > 0) {
        if (window.vibrateIfEnabled) window.vibrateIfEnabled(lines >= 4 ? 200 : 70);
        combo++;
        linesCleared += lines;
        score += computeScore(lines);
        let level = Math.floor(linesCleared / 7);
        if (level >= SPEED_TABLE.length) level = SPEED_TABLE.length - 1;
        dropInterval = SPEED_TABLE[level];
        updateScoreUI();
      } else {
        combo = 0;
      }
    }

    function move(offset) {
      if (!currentPiece) return;
      currentPiece.x += offset;
      if (collision()) currentPiece.x -= offset;
    }

    function dropPiece() {
      if (!currentPiece) return;
      currentPiece.y++;
      if (collision()) {
        currentPiece.y--;
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = true;

        merge();
        saveHistory();
        reset();
        lastTime = performance.now();

        if (collision()) {
          showEndPopup(score);
          gameOver = true;
        }
      }
    }

    function rotatePiece() {
      if (!currentPiece) return;
      const shape = currentPiece.shape;
      let oldVariants = null;
      if (isVariantTheme(currentTheme)) oldVariants = currentPiece.variants ? JSON.parse(JSON.stringify(currentPiece.variants)) : null;

      currentPiece.shape = shape[0].map((_, i) => shape.map(r => r[i])).reverse();
      if (isVariantTheme(currentTheme) && oldVariants && oldVariants[0]) {
        const before = oldVariants;
        currentPiece.variants = before[0].map((_, i) => before.map(r => r[i])).reverse();
      }

      if (collision()) {
        currentPiece.shape = shape;
        if (isVariantTheme(currentTheme)) currentPiece.variants = oldVariants;
      }
    }

    // === HOLD: échange illimité + tentative de placement/kick autour de la même position
    function tryKickPlace(p, targetX, targetY) {
      const kicks = [[0,0],[-1,0],[1,0],[0,-1],[-2,0],[2,0],[0,-2]];
      const bx = p.x, by = p.y;
      for (const [kx, ky] of kicks) {
        p.x = targetX + kx; p.y = targetY + ky;
        if (!collision(p)) return true;
      }
      p.x = bx; p.y = by;
      return false;
    }
    function holdPieceSwapStay() {
      if (!currentPiece) return;
      const cx = currentPiece.x;
      const cy = currentPiece.y;
      const cshape = currentPiece.shape.map(r => r.slice());
      const cvars  = currentPiece.variants ? currentPiece.variants.map(r => r.slice()) : null;
      const clet   = currentPiece.letter;

      if (!heldPiece) {
        heldPiece = JSON.parse(JSON.stringify(currentPiece));
        currentPiece = JSON.parse(JSON.stringify(nextPiece));
        nextPiece = newPiece();
      } else {
        const tmp = JSON.parse(JSON.stringify(currentPiece));
        currentPiece = JSON.parse(JSON.stringify(heldPiece));
        heldPiece = tmp;
      }

      currentPiece.x = cx;
      currentPiece.y = cy;

      if (collision(currentPiece)) {
        if (!tryKickPlace(currentPiece, cx, cy)) {
          if (heldPiece && heldPiece.letter === clet) {
            const tmp = heldPiece;
            heldPiece = currentPiece;
            currentPiece = tmp;
          } else {
            currentPiece.shape = cshape;
            currentPiece.letter = clet;
            currentPiece.variants = cvars;
            currentPiece.x = cx;
            currentPiece.y = cy;
          }
          return;
        }
      }

      drawMiniPiece(holdCtx, heldPiece);
      drawMiniPiece(nextCtx, nextPiece);
      safeRedraw();
    }

    function getGhostPiece() {
      if (!ghostPieceEnabled || !currentPiece || !currentPiece.shape) return null;
      const ghost = JSON.parse(JSON.stringify(currentPiece));
      while (!collision(ghost)) { ghost.y++; }
      ghost.y--;
      return ghost;
    }

    function hardDrop() {
      if (!currentPiece) return;
      const ghost = getGhostPiece();
      if (!ghost) return;
      currentPiece.y = ghost.y;
      stopSoftDrop();
      merge();
      saveHistory();
      reset();
      lastTime = performance.now();
      if (collision()) {
        showEndPopup(score);
        gameOver = true;
      }
      if (!gameOver && !paused) requestAnimationFrame(update);
    }

    // ====== Rendu ======
    function drawBlockCustom(c, x, y, letter, size = BLOCK_SIZE, ghost = false, variant = 0) {
      let img = blockImages[letter];
      const px = x * size, py = y * size;
      if (ghost) c.globalAlpha = 0.33;

      if (isVariantTheme(currentTheme) && blockImages[currentTheme]) {
        let v = variant ?? 0;
        if (typeof letter === 'object' && letter.letter) {
          v = letter.variant ?? 0;
          letter = letter.letter;
        }
        const arr = blockImages[currentTheme];
        img = arr[v % arr.length];
      }

      if (img && img.complete && img.naturalWidth > 0) {
        c.drawImage(img, px, py, size, size);
      } else {
        if (currentTheme === 'nuit') {
          c.fillStyle = '#ccc';
          fillRectThemeSafe(c, px, py, size);
        } else if (currentTheme === 'neon') {
          const color = global.currentColors?.[letter] || '#fff';
          c.fillStyle = '#111';
          fillRectThemeSafe(c, px, py, size);
          c.shadowColor = color;
          c.shadowBlur = ghost ? 3 : 15;
          c.strokeStyle = color;
          c.lineWidth = 2;
          c.strokeRect(px + 1, py + 1, size - 2, size - 2);
          c.shadowBlur = 0;
        } else if (currentTheme === 'retro') {
          const color = global.currentColors?.[letter] || '#fff';
          c.fillStyle = color;
          fillRectThemeSafe(c, px, py, size);
          c.strokeStyle = '#000';
          c.lineWidth = 1;
          c.strokeRect(px, py, size, size);
        } else {
          const fb = global.currentColors?.[letter] || '#999';
          c.fillStyle = fb;
          fillRectThemeSafe(c, px, py, size);
          c.strokeStyle = '#333';
          c.strokeRect(px, py, size, size);
        }
      }
      if (ghost) c.globalAlpha = 1.0;
    }

    function drawBoard() {
      clearCanvas(ctx, canvas);
      const { x: OX, y: OY } = boardOffsets();
      ctx.save();
      ctx.translate(OX, OY);

      const ghost = getGhostPiece();
      if (ghost) {
        ghost.shape.forEach((row, dy) =>
          row.forEach((val, dx) => {
            if (val) drawBlockCustom(
              ctx, ghost.x + dx, ghost.y + dy, ghost.letter, BLOCK_SIZE, true,
              isVariantTheme(currentTheme) ? ghost.variants?.[dy]?.[dx] : 0
            );
          })
        );
      }

      board.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (!cell) return;
          if (isVariantTheme(currentTheme)) {
            drawBlockCustom(ctx, x, y, cell.letter || cell, BLOCK_SIZE, false, cell.variant || 0);
          } else {
            drawBlockCustom(ctx, x, y, cell);
          }
        })
      );

      if (currentPiece && currentPiece.shape) {
        currentPiece.shape.forEach((row, dy) =>
          row.forEach((val, dx) => {
            if (!val) return;
            drawBlockCustom(
              ctx, currentPiece.x + dx, currentPiece.y + dy, currentPiece.letter, BLOCK_SIZE, false,
              isVariantTheme(currentTheme) ? currentPiece.variants?.[dy]?.[dx] : 0
            );
          })
        );
      }

      ctx.restore();
    }
    function safeRedraw() { try { drawBoard(); } catch (_) {} }

    function drawMiniPiece(c, piece) {
      if (!c) return;
      clearCanvas(c, c.canvas);
      if (!piece) return;

      const cssW = c.canvas.width / DPR;
      const cssH = c.canvas.height / DPR;

      const shape = piece.shape;
      let minX = 99, minY = 99, maxX = -99, maxY = -99;
      shape.forEach((row, y) => row.forEach((val, x) => {
        if (val) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }));
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;

      const PAD = 6;
      const cellSize = Math.min((cssW - 2 * PAD) / w, (cssH - 2 * PAD) / h);
      const offsetX = (cssW - (w * cellSize)) / 2 - minX * cellSize;
      const offsetY = (cssH - (h * cellSize)) / 2 - minY * cellSize;

      c.save();
      c.translate(offsetX, offsetY);
      shape.forEach((row, y) => row.forEach((val, x) => {
        if (!val) return;
        drawBlockCustom(
          c, x, y, piece.letter, cellSize, false,
          isVariantTheme(currentTheme) ? piece.variants?.[y]?.[x] : 0
        );
      }));
      c.restore();
    }

    function reset() {
      currentPiece = nextPiece;
      nextPiece = newPiece();
      holdUsed = false; // (compat)
      drawMiniPiece(nextCtx, nextPiece);
      drawMiniPiece(holdCtx, heldPiece);
    }

    function update(now) {
      if (paused || gameOver) return;
      if (!lastTime) lastTime = now;
      const delta = now - lastTime;
      if (delta > dropInterval) {
        dropPiece();
        lastTime = now;
      }
      safeRedraw();
      requestAnimationFrame(update);
    }

    document.addEventListener('DOMContentLoaded', () => {
      const btnTheme = document.getElementById('theme-btn');
      if (btnTheme) {
        btnTheme.addEventListener('click', () => {
          currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
          changeTheme(THEMES[currentThemeIndex]);
        });
      }
    });

    // ====== Contrôles tactiles & clavier ======
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';

    // Soft drop (tactile)
    let softDropTimer = null;
    let softDropActive = false;
    const SOFT_DROP_INTERVAL = 45;
    const HOLD_ACTIVATION_MS = 180;
    let mustLiftFingerForNextSoftDrop = false;

    function startSoftDrop() {
      if (softDropActive || paused || gameOver) return;
      if (mustLiftFingerForNextSoftDrop) return;
      softDropActive = true;
      lastTime = performance.now();
      softDropTimer = setInterval(() => {
        if (!paused && !gameOver) dropPiece();
      }, SOFT_DROP_INTERVAL);
    }
    function stopSoftDrop() {
      if (softDropTimer) clearInterval(softDropTimer);
      softDropTimer = null;
      softDropActive = false;
      mustLiftFingerForNextSoftDrop = true;
    }

    // Gestuelle
    let startX, startY, movedX, movedY, dragging = false, touchStartTime = 0;
    let holdToDropTimeout = null;
    let gestureMode = 'none'; // 'none' | 'horizontal' | 'vertical'
    const HORIZ_THRESHOLD = 20;
    const DEAD_ZONE = 10;
    const VERTICAL_LOCK_EARLY_MS = 140;

    function isQuickSwipeUp(elapsed, dy)  { return (elapsed < 220) && (dy < -42); }
    function isQuickSwipeDown(elapsed, dy){ return (elapsed < 220) && (dy > 42); }

    canvas.addEventListener('touchstart', (e) => {
      if (gameOver) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      movedX = 0; movedY = 0;
      dragging = true;
      touchStartTime = Date.now();
      gestureMode = 'none';

      clearTimeout(holdToDropTimeout);
      holdToDropTimeout = setTimeout(() => {
        if (dragging && !softDropActive) {
          gestureMode = 'vertical';
          startSoftDrop();
        }
      }, HOLD_ACTIVATION_MS);
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      const now = Date.now();
      const elapsed = now - touchStartTime;

      movedX = t.clientX - startX;
      movedY = t.clientY - startY;

      if (gestureMode === 'vertical' || softDropActive || elapsed >= VERTICAL_LOCK_EARLY_MS) {
        gestureMode = 'vertical';
        if (!softDropActive && isQuickSwipeUp(elapsed, movedY)) {
          rotatePiece();
          touchStartTime = now;
          startY = t.clientY;
        }
        clearTimeout(holdToDropTimeout);
        return;
      }

      if (gestureMode === 'none') {
        if (Math.abs(movedX) > Math.max(Math.abs(movedY), DEAD_ZONE) && Math.abs(movedX) > HORIZ_THRESHOLD) {
          gestureMode = 'horizontal';
          clearTimeout(holdToDropTimeout);
        }
      }

      if (gestureMode === 'horizontal') {
        if (movedX > HORIZ_THRESHOLD)  { move(1);  startX = t.clientX; }
        if (movedX < -HORIZ_THRESHOLD) { move(-1); startX = t.clientX; }
        if (Math.abs(movedX) > 18) clearTimeout(holdToDropTimeout);
        return;
      }

      if (!softDropActive && isQuickSwipeUp(elapsed, movedY)) {
        rotatePiece();
        touchStartTime = now;
        startY = t.clientY;
      }

      if (movedY > 24) {
        if (!softDropActive) startSoftDrop();
        dropPiece();
        startY = t.clientY;
      }

      if (Math.abs(movedX) > 18 || movedY < -18) {
        clearTimeout(holdToDropTimeout);
      }
    }, { passive: true });

    canvas.addEventListener('touchend', () => {
      dragging = false;
      clearTimeout(holdToDropTimeout);

      if (softDropActive) {
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = false;
        gestureMode = 'none';
        return;
      }

      // Tap court => rotation (si pas geste horizontal / pas drop)
      const pressDuration = Date.now() - touchStartTime;
      const isShortPress = pressDuration < 200;
      const hasDropped   = Math.abs(movedY) > 18;
      if (gestureMode !== 'horizontal' && isShortPress && !hasDropped && Math.abs(movedX) < 10) {
        rotatePiece();
      }

      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
    }, { passive: true });

    canvas.addEventListener('touchcancel', () => {
      dragging = false;
      clearTimeout(holdToDropTimeout);
      if (softDropActive) stopSoftDrop();
      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
    }, { passive: true });

    if (holdCanvas) {
      let lastHoldTs = 0;
      const triggerHold = (e) => {
        e.preventDefault?.();
        const now = Date.now();
        if (now - lastHoldTs < 180) return; // anti double déclenchement
        lastHoldTs = now;
        holdPieceSwapStay();
      };
      holdCanvas.addEventListener('click', triggerHold, { passive: false });
      holdCanvas.addEventListener('touchstart', triggerHold, { passive: false });
      holdCanvas.style.cursor = 'pointer';
    }

    document.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
      if (gameOver || paused) return;
      switch (e.key) {
        case 'ArrowLeft':  move(-1);    break;
        case 'ArrowRight': move(1);     break;
        case 'ArrowDown':  dropPiece(); break;
        case 'ArrowUp':    rotatePiece(); break;
        case ' ':          hardDrop(); break;
        case 'c': case 'C': holdPieceSwapStay(); break;
      }
    });

    function togglePause() {
      paused = !paused;
      if (paused) stopSoftDrop();
      safeRedraw();
      if (!paused && !gameOver) requestAnimationFrame(update);
    }
    global.togglePause = togglePause;
    setTimeout(() => {
      const btn = document.getElementById('pause-btn');
      if (btn) btn.onclick = (e) => { e.preventDefault(); togglePause(); };
    }, 200);

    window.addEventListener('blur', () => { if (softDropActive) stopSoftDrop(); });

    // ==== GO ====
    startGame();
  }

  global.VBlocksGame = { initGame };
})(this);
