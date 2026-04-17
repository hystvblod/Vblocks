// --- PATCH anti-lignes (ne s'applique qu'au thème "nuit") ---
function fillRectThemeSafe(c, px, py, size) {
  const theme =
    (typeof getCurrentTheme === 'function'
      ? getCurrentTheme()
      : (localStorage.getItem('themeVBlocks') || 'cyber'));

  if (theme === 'nuit') {
    const pad = 0.5;
    c.fillRect(px - pad, py - pad, size + 2 * pad, size + 2 * pad);
  } else {
    // Important: ne PAS se rappeler soi-même → pas de récursion
    c.fillRect(px, py, size, size); // ✅ FIX: width ET height
  }
}

(function (global) {
  'use strict';

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
    if (val) {
      pauseMusic();
    } else {
      playMusicAuto();
    }
    refreshMusicBtn();
  };

  window.startMusicForGame = function () {
    if (!music) return;
    if (isMusicAlwaysMuted()) {
      pauseMusic();
      return;
    }
    music.currentTime = 0;
    playMusicAuto();
  };
  window.addEventListener('storage', (e) => {
    if (e.key === 'alwaysMuteMusic') {
      refreshMusicBtn();
      if (isMusicAlwaysMuted()) pauseMusic();
      else playMusicAuto();
    }
  });
  // Démarrage audio sur premier input (pas d’attente réseau)
  window.addEventListener('pointerdown', function autoStartMusic() {
    if (!window.musicStarted && !isMusicAlwaysMuted()) {
      playMusicAuto();
      window.musicStarted = true;
    }
  }, { once: true });

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
        if (music) {
          if (nextMute) music.pause();
          else music.play().catch(()=>{});
        }
      }
      refreshMusicBtn();
    };

    refreshMusicBtn();
  });

  // ==== FIN MUSIQUE ==== //


  // ==== SUPABASE (safe) ==== //
  const sb = global.sb || global.supabase || null;

  let highscoreCloud = 0; // Record cloud global

  // i18n + fallbacks
  function t(key, params) {
    if (global.i18nGet) {
      let str = global.i18nGet(key) ?? key;
      if (params) Object.keys(params).forEach(k => { str = str.replace(`{${k}}`, params[k]); });
      return str;
    }
    if (global.I18N_MAP && global.I18N_MAP[key]) {
      let str = global.I18N_MAP[key];
      if (params) Object.keys(params).forEach(k => { str = str.replace(`{${k}}`, params[k]); });
      return str;
    }
    return key;
  }
  // tt = i18n avec texte de repli si la clé n'existe pas
  function tt(key, fallback, params) {
    const val = t(key, params);
    return (val === key ? fallback : val);
  }

  // === THEMES à variantes (multicarrés random) ===
  function isVariantTheme(name) {
    const t = name || (typeof getCurrentTheme === 'function'
      ? getCurrentTheme()
      : (localStorage.getItem('themeVBlocks') || 'cyber'));
    return t === 'space' || t === 'vitraux' || t === 'luxury';
  }

  function initGame(opts) {
    const mode = (opts && opts.mode) || 'classic';
    const duelId = opts?.duelId || null;
    const duelPlayerNum = opts?.duelPlayerNum || 1;
    const RECORD_BEAT_COUNT_KEY = 'vblocks_record_beats_classic_v1';
    const REWIND_TUTORIAL_STATE_KEY = 'vblocks_rewind_tutorial_v1';
    const REWIND_TUTORIAL_MIN_PLACED_PIECES = 8;

    let runStartHighscore = 0;
    let recordBeatAlreadyCountedThisRun = false;
    let shouldShowDuelNudgeThisRun = false;

    function resetRunRecordNudgeState() {
      runStartHighscore = Number(highscoreCloud) || 0;
      recordBeatAlreadyCountedThisRun = false;
      shouldShowDuelNudgeThisRun = false;
    }


    

    function hasSeenRewindTutorial() {
      try { return localStorage.getItem(REWIND_TUTORIAL_STATE_KEY) === '1'; }
      catch (_) { return false; }
    }

    function markRewindTutorialSeen() {
      try { localStorage.setItem(REWIND_TUTORIAL_STATE_KEY, '1'); } catch (_) {}
    }

    // Séquence commune (persistance et rewind)
    let piecesSequence = null;
    let piecesUsed = 0;

    let ghostPieceEnabled = localStorage.getItem('ghostPiece') !== 'false';
    global.toggleGhostPiece = function (enabled) {
      ghostPieceEnabled = !!enabled;
      localStorage.setItem('ghostPiece', ghostPieceEnabled ? 'true' : 'false');
      safeRedraw();
    };

    // ==== CANVAS & DPR ==== //
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) { return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }

    const holdCanvas = document.getElementById('holdCanvas');
    const holdCtx = holdCanvas ? holdCanvas.getContext('2d') : null;
    const nextCanvas = document.getElementById('nextCanvas');
    const nextCtx = nextCanvas ? nextCanvas.getContext('2d') : null;

    const COLS = 10, ROWS = 20;
    let BLOCK_SIZE = 30; // en px CSS (pas device)
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

    const mainContent = document.querySelector('.main-content');
    let resizeRAF = null;

    function fitCanvasToCSS() {
      const cssW = Math.round(canvas.clientWidth || canvas.getBoundingClientRect().width);
      if (!cssW) return;

      BLOCK_SIZE = cssW / COLS;

      const usedW = BLOCK_SIZE * COLS;
      const usedH = BLOCK_SIZE * ROWS;

      canvas.style.height = usedH + 'px';

      canvas.width = Math.round(usedW * DPR);
      canvas.height = Math.round(usedH * DPR);

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function fitWholeGameUI() {
      if (!mainContent) return;

      mainContent.style.transform = 'scale(1)';
      mainContent.style.marginTop = '0px';

      requestAnimationFrame(() => {
        const vv = window.visualViewport;
        const viewportW = Math.round(vv?.width || window.innerWidth || 430);
        const viewportH = Math.round(vv?.height || window.innerHeight || 800);

        const baseW = mainContent.offsetWidth || 430;
        const baseH = Math.max(mainContent.scrollHeight, mainContent.offsetHeight, 1);
        const FIT_BOTTOM_BUFFER = 30;

        const scale = Math.min(
          viewportW / baseW,
          (viewportH - FIT_BOTTOM_BUFFER) / baseH,
          1
        );

        mainContent.style.transform = `scale(${scale})`;
        mainContent.style.marginTop = '0px';
      });
    }

    function boardOffsets() {
      const cssW = canvas.width  / DPR;
      const cssH = canvas.height / DPR;
      const usedW = BLOCK_SIZE * COLS;
      const usedH = BLOCK_SIZE * ROWS;
      return {
        x: (cssW - usedW) / 2,
        y: (cssH - usedH) / 2,
      };
    }

    function sizeMiniCanvas(cnv, c2d, target = 48) {
      if (!cnv || !c2d) return;
      cnv.style.width  = target + 'px';
      cnv.style.height = target + 'px';
      cnv.width  = Math.round(target * DPR);
      cnv.height = Math.round(target * DPR);
      c2d.setTransform(DPR, 0, 0, DPR, 0, 0);
      c2d.imageSmoothingEnabled = false;
    }

    fitCanvasToCSS();
    sizeMiniCanvas(holdCanvas, holdCtx, 48);
    sizeMiniCanvas(nextCanvas, nextCtx, 48);
    fitWholeGameUI();

    window.addEventListener('load', () => {
      fitCanvasToCSS();
      sizeMiniCanvas(holdCanvas, holdCtx, 48);
      sizeMiniCanvas(nextCanvas, nextCtx, 48);
      fitWholeGameUI();
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        fitCanvasToCSS();
        sizeMiniCanvas(holdCanvas, holdCtx, 48);
        sizeMiniCanvas(nextCanvas, nextCtx, 48);
        fitWholeGameUI();
      });
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        fitCanvasToCSS();
        fitWholeGameUI();
      });
    }

    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRAF);
      resizeRAF = requestAnimationFrame(() => {
        if (mainContent) {
          mainContent.style.transform = 'scale(1)';
          mainContent.style.marginTop = '0px';
        }

        fitCanvasToCSS();
        sizeMiniCanvas(holdCanvas, holdCtx, 48);
        sizeMiniCanvas(nextCanvas, nextCtx, 48);

        safeRedraw();
        drawMiniPiece(holdCtx, heldPiece);
        drawMiniPiece(nextCtx, nextPiece);

        fitWholeGameUI();
      });
    });

    const THEMES = ['cyber', 'neon', 'nuit', 'nature', 'bubble', 'retro', 'space', 'vitraux', 'luxury', 'grece', 'arabic', 'angelique', 'japon'];
    let currentTheme = localStorage.getItem('themeVBlocks') || 'cyber';
    let currentThemeIndex = Math.max(0, THEMES.indexOf(currentTheme));
    const blockImages = {};

    // --- utils ---
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    function generateSequenceClassic(bags = 200) {
      const res = [];
      for (let b = 0; b < bags; b++) {
        const bag = [0,1,2,3,4,5,6]; // I,J,L,O,S,T,Z
        shuffle(bag);
        res.push(...bag);
      }
      return res;
    }
    function getNextPieceIdGeneric() {
      if (!piecesSequence || piecesUsed >= piecesSequence.length) {
        piecesSequence = (mode === 'duel' && piecesSequence) ? piecesSequence : generateSequenceClassic(200);
        piecesUsed = 0;
      }
      return piecesSequence[piecesUsed++];
    }

    // === Load all images ===
    function loadBlockImages(themeName) {
      const themesWithPNG = ['bubble','nature','vitraux','luxury','space','angelique','cyber','japon','arabic','grece'];

      if (isVariantTheme(themeName)) {
        // === MODE VARIANTES (6 carrés tirés aléatoirement) ===
        blockImages[themeName] = [];
        let imagesToLoad = 6, imagesLoaded = 0;
        for (let i = 1; i <= 6; i++) {
          const img = new Image();
          img.onload  = () => { if (++imagesLoaded === imagesToLoad) safeRedraw(); };
          img.onerror = () => { if (++imagesLoaded === imagesToLoad) safeRedraw(); };
          img.src = `themes/${themeName}/${i}.png`;
          blockImages[themeName].push(img);
        }
        ['I','J','L','O','S','T','Z'].forEach(l => { blockImages[l] = null; });
      }
      else if (themeName === 'grece' || themeName === 'arabic') {
        // === UNE SEULE IMAGE POUR TOUTES LES PIÈCES ===
        const img = new Image();
        img.onload  = () => { safeRedraw(); };
        img.onerror = () => {};
        img.src = `themes/${themeName}/block.png`;
        ['I','J','L','O','S','T','Z'].forEach(l => { blockImages[l] = img; });
      }
      else {
        // === CAS NORMAL (1 fichier par lettre) ===
        ['I','J','L','O','S','T','Z'].forEach(l => {
          if (themesWithPNG.includes(themeName)) {
            const img = new Image();
            img.onload  = () => { safeRedraw(); };
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
      } else if (themeName === 'cyber') {
        global.currentColors = { I:'#5df2ff', J:'#4a7dff', L:'#ff9b4d', O:'#ffe45c', S:'#3dffb5', T:'#d86bff', Z:'#ff5f7a' };
      } else {
        global.currentColors = { I:'#9aa4b2', J:'#7f8ea3', L:'#b79a7b', O:'#d0c36c', S:'#7fc28e', T:'#a27fc2', Z:'#c27f7f' };
      }
    }

    function getThemeCssHref(themeName) {
      const themesWithOwnCss = new Set(['bubble', 'nature', 'neon', 'nuit', 'retro']);
      return themesWithOwnCss.has(themeName) ? `themes/${themeName}.css` : 'themes/themes.css';
    }

    function changeTheme(themeName) {
      document.body.setAttribute('data-theme', themeName);
      localStorage.setItem('themeVBlocks', themeName);
      const style = document.getElementById('theme-style');
      if (style) style.href = getThemeCssHref(themeName);
      loadBlockImages(themeName);
      currentThemeIndex = Math.max(0, THEMES.indexOf(themeName));
      safeRedraw();
    }

    loadBlockImages(currentTheme);
    // --- Suit le thème choisi dans le profil (évènement envoyé par profil.html)
    window.addEventListener('vblocks-theme-changed', (e) => {
      const t = (e?.detail?.theme) || localStorage.getItem('themeVBlocks') || 'cyber';
      if (t) changeTheme(t);
    });


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

    function cloneMatrix(shape) {
      if (!Array.isArray(shape)) return null;
      return shape.map(row => Array.isArray(row) ? row.slice() : []);
    }

    function isValidShape(shape) {
      return Array.isArray(shape)
        && shape.length > 0
        && shape.every(row => Array.isArray(row) && row.length > 0);
    }

    function getPieceTypeIdFromLetter(letter) {
      const idx = LETTERS.indexOf(letter);
      return idx >= 0 ? idx : 0;
    }

    function buildVariantsForShape(shape) {
      if (!isValidShape(shape)) return null;
      const numbers = [1,2,3,4,5,6];
      shuffle(numbers);
      let idx = 0;
      return shape.map(row => row.map(val => (val ? numbers[idx++ % numbers.length] : null)));
    }

    function sanitizePiece(piece, fallbackLetter = 'I') {
      if (!piece || typeof piece !== 'object') return null;

      const safeLetter = LETTERS.includes(piece.letter) ? piece.letter : fallbackLetter;
      const typeId = getPieceTypeIdFromLetter(safeLetter);
      const fallbackShape = cloneMatrix(PIECES[typeId]);
      const safeShape = isValidShape(piece.shape) ? cloneMatrix(piece.shape) : fallbackShape;
      if (!safeShape) return null;

      const safePiece = {
        shape: safeShape,
        letter: safeLetter,
        x: Number.isFinite(piece.x) ? piece.x : Math.floor((COLS - safeShape[0].length) / 2),
        y: Number.isFinite(piece.y) ? piece.y : 0
      };

      if (piece.variants && Array.isArray(piece.variants)) {
        safePiece.variants = piece.variants.map(row => Array.isArray(row) ? row.slice() : []);
      } else if (isVariantTheme(currentTheme)) {
        safePiece.variants = buildVariantsForShape(safeShape);
      }

      return safePiece;
    }

    function createSafePiece(letter) {
      const safeLetter = LETTERS.includes(letter) ? letter : LETTERS[Math.floor(Math.random() * LETTERS.length)];
      const typeId = getPieceTypeIdFromLetter(safeLetter);
      const shape = cloneMatrix(PIECES[typeId]);
      const piece = {
        shape,
        letter: safeLetter,
        x: Math.floor((COLS - shape[0].length) / 2),
        y: 0
      };
      if (isVariantTheme(currentTheme)) {
        piece.variants = buildVariantsForShape(shape);
      }
      return piece;
    }

    function ensureRenderablePieces() {
      if (currentPiece) {
        currentPiece = sanitizePiece(currentPiece, currentPiece.letter || 'I') || createSafePiece(currentPiece?.letter || 'I');
      }
      if (nextPiece) {
        nextPiece = sanitizePiece(nextPiece, nextPiece.letter || 'I') || createSafePiece(nextPiece?.letter || 'I');
      }
      if (heldPiece) {
        heldPiece = sanitizePiece(heldPiece, heldPiece.letter || 'I') || null;
      }
    }

    function recoverPiecesForRender() {
      currentPiece = sanitizePiece(currentPiece, currentPiece?.letter || 'I') || createSafePiece(currentPiece?.letter || 'I');
      nextPiece = sanitizePiece(nextPiece, nextPiece?.letter || 'I') || createSafePiece(nextPiece?.letter || 'I');
      if (heldPiece) {
        heldPiece = sanitizePiece(heldPiece, heldPiece.letter || 'I') || null;
      }
    }

    let board = Array.from({ length: ROWS }, () => Array(COLS).fill(''));

    let currentPiece = null;
    let nextPiece = null;
    let heldPiece = null;
    let holdUsed = false; // conservé pour compat, mais ignoré (échanges illimités)
    let score = 0;
    let dropInterval = 500;
    let lastTime = 0;
    let gameOver = false;
    let paused = false;
    let combo = 0;
    let linesCleared = 0;
    let history = [];
    let piecesLockedThisRun = 0;
    let rewindTutorialShownThisRun = false;
    let rewindTutorialBusy = false;

    // revive ramp
    let reviveRampActive = false;
    let reviveRampStart = 0;
    const REVIVE_RAMP_MS = 6000;
    let reviveTargetInterval = 500;

    // ✅ Limitation: 1 seul revive par partie (pub OU jeton)
    let reviveUsed = false;

    // 🔒 Anti-double fin/anti-double crédit
    let endHandled = false;
    let creditDone = false;

    function lerp(a, b, t) { return a + (b - a) * t; }

    function saveHistory() {
      history.push({
        board: board.map(row => row.map(cell => cell && typeof cell === 'object' ? { ...cell } : cell)),
        currentPiece: JSON.parse(JSON.stringify(currentPiece)),
        nextPiece: JSON.parse(JSON.stringify(nextPiece)),
        heldPiece: heldPiece ? JSON.parse(JSON.stringify(heldPiece)) : null,
        score, combo, linesCleared, dropInterval,
        piecesSequence: piecesSequence ? piecesSequence.slice() : null,
        piecesUsed,
        piecesLockedThisRun
      });
      if (history.length > 30) history.shift();
    }

    async function getJetons() {
      return (await userData.getJetons?.()) ?? 0;
    }
    async function useJeton() {
      const solde = await getJetons();
      if (solde > 0) {
        await userData.addJetons(-1);
        return true;
      }
      return false;
    }

    // === AJUSTEMENT #1 : interstitiel centralisé (pub.js) ===
    async function showInterstitial() {
      try {
        if (typeof window.showInterstitial === 'function') {
          await window.showInterstitial(); // AdMob via pub.js
          return;
        }
        if (global.showInterstitialAd) { // vieux wrapper éventuel
          await global.showInterstitialAd();
          return;
        }
      } catch (_) {}
      await showFakeAd(); // fallback web/dev
    }

    function showFakeAd() {
      return new Promise(resolve => {
        const ad = document.createElement('div');
        ad.style = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;';
        ad.innerHTML = `<div style="text-align:center">
          <div>${tt('ad.fake','Publicité')}</div>
          <div style="opacity:.9;font-size:.7em;margin-top:.3em">${tt('ad.wait','Veuillez patienter quelques secondes…')}</div>
        </div>`;
        document.body.appendChild(ad);
        setTimeout(() => { ad.remove(); resolve(); }, 3000);
      });
    }

    // ----- DUEL --------
    async function setupDuelSequence() {
      if (!duelId || !sb) return;
      let tries = 0, data = null;
      while (tries++ < 20) {
        let res = await sb.from('duels').select('*').eq('id', duelId).single();
        if (res?.data && res.data.pieces_seq) { data = res.data; break; }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (!data) throw new Error(tt('error.duel_not_found','Duel introuvable'));
      piecesSequence = data.pieces_seq.split(',').map(x => parseInt(x, 10));
      piecesUsed = 0;
    }
    function getDuelNextPieceId() {
      if (!piecesSequence) return Math.floor(Math.random() * PIECES.length);
      if (piecesUsed >= piecesSequence.length) return Math.floor(Math.random() * PIECES.length);
      return piecesSequence[piecesUsed++];
    }

    // =========================
    // AUTOSAVE / RESUME (LOCAL UNIQUEMENT)
    // =========================
    const SAVE_KEY = `vblocks:autosave:${mode}:v3`; // v3: inclut inProgress + séquence
    const SAVE_TTL_MS = 1000 * 60 * 60 * 48; // 48h
    const CAN_RESUME = (mode !== 'duel'); // Par équité, pas de reprise en duel

    // Cloud désactivé pour la sauvegarde de partie
    const saveStateCloud = async () => {};
    const loadSavedCloud = async () => null;

    function getSavableState() {
      return {
        board,
        currentPiece,
        nextPiece,
        heldPiece,
        holdUsed,
        score,
        combo,
        linesCleared,
        dropInterval,
        mode,
        theme: currentTheme,
        ts: Date.now(),
        inProgress: !gameOver && !!currentPiece, // flag clé → pas de popup si false
        piecesSequence,
        piecesUsed,
        piecesLockedThisRun
      };
    }
    function clearSavedGame() {
      try { localStorage.removeItem(SAVE_KEY); } catch (_e) {}
      saveStateCloud(null).catch(()=>{});
    }
    function safeParse(json) {
      try { return JSON.parse(json); } catch { return null; }
    }

    function saveStateNowLocal() {
      if (!CAN_RESUME) return;
      try {
        const payload = { version: 3, ts: Date.now(), state: getSavableState() };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      } catch (_e) {}
    }

    async function saveStateNow() {
      if (!CAN_RESUME) return;
      const state = getSavableState();
      saveStateNowLocal();
      // pas de cloud ici
    }

    let saveTimer = null;
    function scheduleSave() {
      if (!CAN_RESUME) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveStateNow, 300);
    }

    function loadSavedLocal() {
      if (!CAN_RESUME) return null;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = safeParse(raw);
      if (!parsed || !parsed.state) return null;
      const st = parsed.state;
      if ((Date.now() - (parsed.ts || st.ts || 0)) > SAVE_TTL_MS) {
        try { localStorage.removeItem(SAVE_KEY); } catch (_e) {}
        return null;
      }
      if (st.mode !== mode) return null;
      if (!st.inProgress) return null;
      return st;
    }

    function restoreFromSave(s) {
      try {
        if (!Array.isArray(s.board) || !s.currentPiece || !s.nextPiece) return false;

        board = s.board.map(row => row.map(cell => cell && typeof cell === 'object' ? { ...cell } : cell));
        currentPiece = JSON.parse(JSON.stringify(s.currentPiece));
        nextPiece    = JSON.parse(JSON.stringify(s.nextPiece));
        heldPiece    = s.heldPiece ? JSON.parse(JSON.stringify(s.heldPiece)) : null;
        ensureRenderablePieces();
        holdUsed     = !!s.holdUsed;
        score        = +s.score || 0;
        combo        = +s.combo || 0;
        linesCleared = +s.linesCleared || 0;
        dropInterval = +s.dropInterval || 500;
        gameOver     = false;
        paused       = false;

        if (s.piecesSequence && Array.isArray(s.piecesSequence)) {
          piecesSequence = s.piecesSequence.slice();
        }
        if (Number.isInteger(s.piecesUsed)) {
          piecesUsed = s.piecesUsed;
        }
        if (Number.isInteger(s.piecesLockedThisRun)) {
          piecesLockedThisRun = Math.max(0, s.piecesLockedThisRun);
        }

    // Préfère TOUJOURS le thème actuel choisi par l’utilisateur
const desiredTheme = localStorage.getItem('themeVBlocks') || s.theme || currentTheme;
if (THEMES.includes(desiredTheme) && desiredTheme !== currentTheme) {
  changeTheme(desiredTheme);
}


        const scoreEl = document.getElementById('score');
        if (scoreEl) scoreEl.textContent = String(score);
        drawMiniPiece(nextCtx, nextPiece);
        drawMiniPiece(holdCtx, heldPiece);
        safeRedraw();

        history = [];
        saveHistory();

        lastTime = performance.now();
        requestAnimationFrame(update);
        window.startMusicForGame?.();

        scheduleSave();
        return true;
      } catch (_) {
        return false;
      }
    }

    // Sauvegardes « événements »
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveStateNow();
    });
    window.addEventListener('beforeunload', saveStateNow);
    window.addEventListener('pagehide', saveStateNow);
    document.addEventListener('backbutton', saveStateNow, false);


 // Popup de reprise (locale)
function showResumePopup(savedState) {
  // Empêche de compter tant que la popup est ouverte
  window.__ads_waiting_choice = true;

  const overlay = document.createElement('div');
  overlay.id = 'resume-popup';
  overlay.style = `
    position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);
    display:flex;align-items:center;justify-content:center;
  `;
  overlay.innerHTML = `
    <div style="background:#23294a;border-radius:1em;padding:22px 18px;box-shadow:0 0 14px #3ff7;min-width:240px;max-width:92vw;text-align:center">
      <div style="font-size:1.15em;font-weight:bold;margin-bottom:8px;">
        ${tt('resume.title','Partie en cours')}
      </div>
      <div style="opacity:.9;margin-bottom:14px">
        ${tt('resume.subtitle','Voulez-vous reprendre là où vous vous êtes arrêté ?')}
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button id="resume-yes" style="padding:.5em 1em;border-radius:.7em;border:none;background:#39f;color:#fff;cursor:pointer;">
          ${tt('resume.resume','Reprendre')}
        </button>
        <button id="resume-restart" style="padding:.5em 1em;border-radius:.7em;border:none;background:#444;color:#fff;cursor:pointer;">
          ${tt('resume.restart','Recommencer')}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cleanup = () => { window.__ads_waiting_choice = false; overlay.remove(); };

overlay.querySelector('#resume-yes').onclick = () => {
  cleanup();  // remet __ads_waiting_choice = false
  try { window.partieReprisee?.(mode); } catch(_){}
  restoreFromSave(savedState);


  };
  overlay.querySelector('#resume-restart').onclick = () => {
    clearSavedGame();
    cleanup();
    restartGameHard();
  };

    }

    // URL index pour "Quitter"
    const INDEX_URL = global.GAME_INDEX_URL || 'index.html';

    // === RESTART PROPRE GLOBAL (utile en cours de partie ou fin) ===
    function restartGameHard() {
      try { window.partieRecommencee?.(mode); } catch(_){}

      // stop timers
      stopSoftDrop();
      stopHorizontalRepeat();
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }

      // reset state
      board = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
      currentPiece = null;
      nextPiece = null;
      heldPiece = null;
      holdUsed = false;
      score = 0;
      combo = 0;
      linesCleared = 0;
      dropInterval = 500;
      gameOver = false;
      paused = false;
      history = [];
      lastTime = 0;
      reviveRampActive = false;
      reviveUsed = false; // ✅ on ré-autorise 1 revive pour la nouvelle partie
      endHandled = false;
      creditDone = false;
      resetRunRecordNudgeState();
      piecesLockedThisRun = 0;
      rewindTutorialShownThisRun = false;
      rewindTutorialBusy = false;

      // UI
      const scoreEl = document.getElementById('score');
      if (scoreEl) scoreEl.textContent = '0';
      drawMiniPiece(nextCtx, null);
      drawMiniPiece(holdCtx, null);
      safeRedraw();

      clearSavedGame();

      // start new
      if (mode === 'duel') {
        // duel séquence déjà set dans setupDuelSequence
      } else {
        piecesSequence = generateSequenceClassic(200);
        piecesUsed = 0;
      }
      nextPiece = newPiece();
      reset();
      saveHistory();
      window.startMusicForGame?.();
      requestAnimationFrame(update);
    }
    // Expose facultatif si tu as un bouton "Recommencer" en HUD
    global.restartGameHard = restartGameHard;

    // === helper de crédit des récompenses (appelé sur Restart/Quit) ===
    async function commitEndRewards(points) {
      if (creditDone) return;
      creditDone = true;
      try {
        await setLastScoreSupabase(points);
        const cloudHigh = await getHighScoreSupabase();
        if (points > cloudHigh) {
          await setHighScoreSupabase(points);
          highscoreCloud = points;
          updateHighscoreDisplay();
        }
        await userData.addVCoins?.(points);
        updateBalancesHeader();
      } catch (err) {}
    }

    // Nouvelle popup de fin de partie (+ revive)
    function showEndPopup(points) {
      if (endHandled) return;
      // ⚠️ on NE met PAS endHandled=true ici — on attend la confirmation fin
      try { window.partieTerminee?.(); } catch(_){}

      paused = true;
      stopSoftDrop();
      stopHorizontalRepeat();

      safeRedraw();

      // on efface ttes sauvegardes → pas de "reprendre"
      clearSavedGame();

      // ❌ Ancienne IIFE de crédit supprimée : on crédite au Restart/Quit

      const old = document.getElementById('gameover-popup');
      if (old) old.remove();

      if (mode === 'duel') {
        handleDuelEnd(points);
        return;
      }

      const canRevive = !reviveUsed;
      const popup = document.createElement('div');
      popup.id = 'gameover-popup';
      popup.style = `
        position: fixed; left:0; top:0; width:100vw; height:100vh; z-index:99999;
        background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center;
      `;
      const rewardAmount = Number(window.REWARD_VCOINS || 300);
      const referralRewardAmount = Number(window.REFERRAL_INVITE_VCOINS || 500);
      if (!recordBeatAlreadyCountedThisRun && points > (Number(runStartHighscore) || 0)) {
        recordBeatAlreadyCountedThisRun = true;
        const recordBeatCount = getNextRecordBeatCount();
        shouldShowDuelNudgeThisRun = (recordBeatCount >= 4 && recordBeatCount % 4 === 0);
      }
      let rewardClaimedOnEndPopup = false;
      popup.innerHTML = `
        <div id="end-confetti-layer" style="position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;"></div>

        <div style="position:relative;z-index:2;background:#23294a;border-radius:1em;padding:24px 16px;box-shadow:0 0 14px #3ff7;min-width:260px;max-width:92vw;text-align:center">
          <div style="font-size:1.2em;font-weight:bold;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;">
              <span>${tt('end.win_intro','Bravo !! tu as gagné')}</span>
              <span style="display:flex;align-items:center;gap:8px;">
                <img src="assets/images/vcoin.webp" alt="" style="width:28px;height:28px;object-fit:contain;">
                <span>${points}</span>
              </span>
            </div>
          </div>

          ${shouldShowDuelNudgeThisRun ? `
  <div style="margin:0 0 14px 0;padding:14px 14px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);line-height:1.45;text-align:center;">
    <div style="font-weight:800;margin-bottom:6px;">${tt('end.super_score_title','Super score !')}</div>
    <div style="opacity:.96;margin-bottom:12px;">${tt('end.super_score_body','Tu devrais affronter tes amis en Duel pour leur montrer ce que tu vaux.')}</div>

    <div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <span style="font-weight:900;font-size:17px;">${tt('referral.invite_and_earn_btn','Inviter et gagner')}</span>
      <img src="assets/images/vcoin.webp" alt="" style="width:22px;height:22px;object-fit:contain;">
      <span style="font-weight:900;font-size:18px;">+${referralRewardAmount}</span>
    </div>

    <button
      id="end-invite-friend"
      type="button"
      style="
        min-width:150px;
        padding:11px 18px;
        border:none;
        border-radius:999px;
        background:linear-gradient(180deg,#7fbeff 0%,#63dcfb 100%);
        color:#fff;
        cursor:pointer;
        font-weight:900;
        font-size:16px;
        box-shadow:0 10px 24px rgba(99,220,251,.28);
      "
    >
      ${tt('referral.invite_btn','Inviter')}
    </button>
  </div>
` : ''}

          <div style="opacity:.9;margin-bottom:14px">
            ${tt('end.subtitle','Que voulez-vous faire ?')}
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;width:100%">
            <button
              id="end-reward-vcoins"
              class="btn-primary"
              style="
                width:100%;
                padding:.85em 1em;
                border-radius:1em;
                border:none;
                background:linear-gradient(180deg,#2f7bff 0%,#1e55d6 100%);
                color:#fff;
                cursor:pointer;
                display:flex;
                align-items:center;
                justify-content:center;
                box-shadow:0 0 12px #39f7;
              "
            >
              <span style="display:flex;align-items:center;justify-content:center;gap:10px;font-weight:800;width:100%;">
                <img src="assets/images/vcoin.webp" alt="" style="width:24px;height:24px;object-fit:contain;">
                <span>+${rewardAmount}</span>
              </span>
            </button>

            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <button
                id="end-revive-token"
                class="btn"
                style="padding:.6em 1.1em;border-radius:.8em;background:#2a7;color:#fff;cursor:pointer;${canRevive ? '' : 'display:none;'}"
              >
                ${tt('end.revive.token','Revivre (1 jeton)')}
              </button>

              <button
                id="end-revive-ad"
                class="btn"
                style="padding:.6em 1.1em;border:none;border-radius:.8em;background:#a73;color:#fff;cursor:pointer;${canRevive ? '' : 'display:none;'}"
              >
                ${tt('end.revive.ad','Revivre (pub)')}
              </button>
            </div>

            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <button
                id="end-restart"
                class="btn-primary"
                style="padding:.6em 1.1em;border-radius:.8em;border:none;background:#39f;color:#fff;cursor:pointer;"
              >
                ${tt('end.restart','Recommencer')}
              </button>

              <button
                id="end-quit"
                class="btn"
                style="padding:.6em 1.1em;border-radius:.8em;border:none;background:#444;color:#fff;cursor:pointer;"
              >
                ${tt('end.quit','Quitter')}
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(popup);

      function launchEndConfetti() {
        if (!shouldShowDuelNudgeThisRun) return;

        const layer = popup.querySelector('#end-confetti-layer');
        if (!layer) return;

        layer.innerHTML = '';

        if (popup.__endConfettiRaf) {
          cancelAnimationFrame(popup.__endConfettiRaf);
          popup.__endConfettiRaf = null;
        }
        clearTimeout(popup.__endConfettiCleanupTimer);

        const colors = [
          '#ffffff',
          '#f4d35e',
          '#ff6b6b',
          '#b8f2e6',
          '#d0bfff',
          '#7dd3fc',
          '#f9a8d4'
        ];

        const rect = layer.getBoundingClientRect();
        const W = Math.max(1, rect.width || window.innerWidth || 360);
        const H = Math.max(1, rect.height || window.innerHeight || 640);

        const count = 170;
        const gravity = 1550;
        const pieces = [];

        for (let i = 0; i < count; i += 1) {
          const el = document.createElement('span');

          const w = 5 + Math.random() * 8;
          const h = 10 + Math.random() * 16;
          const x = Math.random() * W;
          const y = H + 20 + Math.random() * 60;

          const vx = -260 + Math.random() * 520;
          const vy = -(980 + Math.random() * 720);
          const spin = -720 + Math.random() * 1440;
          const rot = Math.random() * 360;
          const life = 3.8 + Math.random() * 1.4;
          const fadeStart = life * 0.72;

          el.style.position = 'absolute';
          el.style.left = '0';
          el.style.top = '0';
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
          el.style.borderRadius = `${2 + Math.random() * 3}px`;
          el.style.background = colors[Math.floor(Math.random() * colors.length)];
          el.style.opacity = '1';
          el.style.pointerEvents = 'none';
          el.style.willChange = 'transform,opacity';
          el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`;

          layer.appendChild(el);

          pieces.push({
            el,
            x,
            y,
            vx,
            vy,
            rot,
            spin,
            age: 0,
            life,
            fadeStart
          });
        }

        let last = performance.now();

        const tick = (now) => {
          const dt = Math.min((now - last) / 1000, 0.033);
          last = now;

          let alive = 0;

          for (const p of pieces) {
            p.age += dt;
            if (p.age >= p.life) {
              p.el.style.opacity = '0';
              continue;
            }

            p.vy += gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.spin * dt;

            const fade =
              p.age < p.fadeStart
                ? 1
                : Math.max(0, 1 - ((p.age - p.fadeStart) / (p.life - p.fadeStart)));

            p.el.style.opacity = String(fade);
            p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rot}deg)`;

            alive += 1;
          }

          if (alive > 0) {
            popup.__endConfettiRaf = requestAnimationFrame(tick);
          } else {
            popup.__endConfettiRaf = null;
            try { layer.innerHTML = ''; } catch (_) {}
          }
        };

        popup.__endConfettiRaf = requestAnimationFrame(tick);

        popup.__endConfettiCleanupTimer = setTimeout(() => {
          if (popup.__endConfettiRaf) {
            cancelAnimationFrame(popup.__endConfettiRaf);
            popup.__endConfettiRaf = null;
          }
          try { layer.innerHTML = ''; } catch (_) {}
        }, 6500);
      }
      launchEndConfetti();

      async function doRevive(withAd) {
        if (withAd) {
          // Marque pub active (pour le gel) puis réinitialise quoi qu’il arrive
          window.__ads_active = true;
          window.__ads_freeze = true;
          const resetAds = () => { window.__ads_active = false; window.__ads_freeze = false; };

          if (typeof window.showRewardRevive === 'function') {
            const ok = await new Promise(resolve => {
              try { window.showRewardRevive(closedOk => resolve(!!closedOk)); }
              catch(_) { resolve(false); }
            });
            resetAds();
            if (!ok) return;

            reviveUsed = true;
            try { popup.remove(); } catch(_) {}
            // ✅ Réarmer les flags pour permettre la prochaine popup de fin
            endHandled = false;
            creditDone = false;
            gameOver = false;
            reviveRewindAndResume();
            return;
          }

          // Fallback web/dev si showRewardRevive indisponible
          await showInterstitial();
          resetAds();
          reviveUsed = true;
          try { popup.remove(); } catch(_) {}
          endHandled = false;
          creditDone = false;
          gameOver = false;
          reviveRewindAndResume();
          return;
        }

        // Revive via JETON
        const okTok = await useJeton();
        if (!okTok) {
          showNoJetonPopup();
          return;
        }
        reviveUsed = true;
        try { popup.remove(); } catch(_) {}
        endHandled = false;      // ✅ clé : autoriser la prochaine popup
        creditDone = false;      // ✅ pas de crédit encore
        gameOver = false;
        reviveRewindAndResume();
      }

      document.getElementById('end-restart').onclick = async function () {
        await commitEndRewards(points);
        endHandled = true;

        try { window.VReferral?.registerCompletedRun?.(); } catch (_) {}
        try { window.VRCrossPromo?.notifyCompletedRun?.(); } catch (_) {}
        try {
          await window.VRCrossPromo?.maybeShowPostGamePromo?.({
            skipBecauseRewardAd: false
          });
        } catch (_) {}

        popup.remove();
        restartGameHard();
      };

      document.getElementById('end-quit').onclick = async function () {
        await commitEndRewards(points);
        endHandled = true;

        try { window.VReferral?.registerCompletedRun?.(); } catch (_) {}
        let queuedReferralShare = false;
        try {
          queuedReferralShare = !!window.VReferral?.maybeQueueIndexSharePrompt?.(shouldShowDuelNudgeThisRun);
        } catch (_) {}

        try { window.VRCrossPromo?.notifyCompletedRun?.(); } catch (_) {}
        if (!queuedReferralShare) {
          try {
            window.VRCrossPromo?.queuePostGamePromoForIndex?.(false);
          } catch (_) {}
        }

        window.location.href = INDEX_URL;
      };
      const btnTok = document.getElementById('end-revive-token');
      const btnAd = document.getElementById('end-revive-ad');
      const btnReward = document.getElementById('end-reward-vcoins');
      const btnInvite = document.getElementById('end-invite-friend');
      if (btnReward?.animate) {
        btnReward.animate(
          [
            { transform: 'scale(1)', boxShadow: '0 0 12px #39f7' },
            { transform: 'scale(1.04)', boxShadow: '0 0 24px #39f7' },
            { transform: 'scale(1)', boxShadow: '0 0 12px #39f7' }
          ],
          {
            duration: 1600,
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        );
      }

      if (btnInvite?.animate) {
        btnInvite.animate(
          [
            { transform: 'scale(1)', boxShadow: '0 10px 24px rgba(99,220,251,.28)' },
            { transform: 'scale(1.04)', boxShadow: '0 16px 32px rgba(99,220,251,.46)' },
            { transform: 'scale(1)', boxShadow: '0 10px 24px rgba(99,220,251,.28)' }
          ],
          { duration: 1400, iterations: Infinity, easing: 'ease-in-out' }
        );
      }

      if (btnTok) btnTok.onclick = function () { doRevive(false); };
      if (btnAd) btnAd.onclick = function () { doRevive(true); };
      if (btnInvite) {
        btnInvite.onclick = async function () {
          try { await window.VReferral?.shareInvite?.(); } catch (_) {}
        };
      }

      if (btnReward) {
        btnReward.onclick = async function () {
          if (rewardClaimedOnEndPopup) return;

          btnReward.disabled = true;
          btnReward.style.opacity = '.7';

          try {
            const ok = (typeof window.showRewardVcoins === 'function')
              ? await window.showRewardVcoins()
              : false;

            if (!ok) {
              btnReward.disabled = false;
              btnReward.style.opacity = '1';
              return;
            }

            rewardClaimedOnEndPopup = true;
            btnReward.style.display = 'none';

            try {
              if (typeof window.updateVCoinsDisplay === 'function') {
                await window.updateVCoinsDisplay();
              }
            } catch (_) {}

            try {
              const vcoins = await userData.getVCoins?.();
              const el =
                document.getElementById('header-vcoins') ||
                document.getElementById('vcoinsCount') ||
                document.getElementById('vcoin-amount');

              if (el) el.textContent = String(vcoins ?? 0);
            } catch (_) {}
          } catch (_) {
            btnReward.disabled = false;
            btnReward.style.opacity = '1';
            alert(tt('pub.err','Publicité indisponible pour le moment.'));
          }
        };
      }
    }

    function rewindHistoryAndResume(stepsBack = 8, countdownStart = 3) {
      if (history.length === 0) return;

      const index = history.length > stepsBack ? history.length - stepsBack : 0;
      const state = history[index];
      history = history.slice(0, index);

      board = state.board.map(r => r.slice());
      currentPiece = JSON.parse(JSON.stringify(state.currentPiece));
      nextPiece = JSON.parse(JSON.stringify(state.nextPiece));
      heldPiece = state.heldPiece ? JSON.parse(JSON.stringify(state.heldPiece)) : null;
      score = state.score;
      combo = state.combo;
      linesCleared = state.linesCleared;
      dropInterval = state.dropInterval || 500;

      if (state.piecesSequence && Array.isArray(state.piecesSequence)) {
        piecesSequence = state.piecesSequence.slice();
      }
      if (Number.isInteger(state.piecesUsed)) {
        piecesUsed = state.piecesUsed;
      }

      ensureRenderablePieces();

      window.__ads_active = false;
      window.__ads_freeze = false;

      paused = true;
      gameOver = false;
      safeRedraw();

      let countdown = countdownStart;
      const overlay = document.createElement('div');
      overlay.id = 'countdown-overlay';
      overlay.style = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);
        color:#fff;display:flex;align-items:center;justify-content:center;font-size:4em;z-index:99998;
      `;
      overlay.textContent = tt('revive.count','{n}', { n: countdown });
      document.body.appendChild(overlay);

      const tmr = setInterval(() => {
        countdown--;
        overlay.textContent = tt('revive.count','{n}', { n: countdown });

        if (countdown <= 0) {
          clearInterval(tmr);
          overlay.remove();

          paused = false;
          gameOver = false;

          reviveTargetInterval = dropInterval || 500;
          dropInterval = 1200;
          reviveRampActive = true;
          reviveRampStart = performance.now();

          lastTime = performance.now();
          window.__ads_skip_next_action = true;

          try { window.partieReprisee?.(mode); } catch (_) {}

          requestAnimationFrame(update);
        }
      }, 1000);
    }

    function reviveRewindAndResume() {
      rewindHistoryAndResume(8, 3);
    }

    function rewind() {
      rewindHistoryAndResume(5, 3);
    }

    function togglePause() {
      paused = !paused;
      if (paused) {
        stopSoftDrop();
        stopHorizontalRepeat();
      }
      safeRedraw();
      if (!paused && !gameOver) requestAnimationFrame(update);
    }
    global.togglePause = togglePause;

async function doRewindWithAd() {
  window.__ads_active = true;
  window.__ads_freeze = true;

  const resetAds = () => {
    window.__ads_active = false;
    window.__ads_freeze = false;
  };

  if (typeof window.showRewardRevive === 'function') {
    const ok = await new Promise(resolve => {
      try { window.showRewardRevive(closedOk => resolve(!!closedOk)); }
      catch (_) { resolve(false); }
    });

    resetAds();
    if (!ok) return;

    rewindHistoryAndResume(5, 3);
    return;
  }

  await showInterstitial();
  resetAds();
  rewindHistoryAndResume(5, 3);
}

function showRewindConfirmPopup() {
  const oldPopup = document.getElementById('rewind-confirm-popup');
  if (oldPopup) oldPopup.remove();

  paused = true;
  stopSoftDrop();
  stopHorizontalRepeat();
  safeRedraw();

  const popup = document.createElement('div');
  popup.id = 'rewind-confirm-popup';
  popup.style = `
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(0,0,0,.45);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  popup.innerHTML = `
    <div style="width:min(92vw,360px);background:#23294a;border-radius:18px;padding:18px 16px;box-shadow:0 0 18px rgba(0,0,0,.35);text-align:center;">
      <div style="font-size:1.08em;font-weight:800;margin-bottom:10px;">${tt('rewind.title','Retour arrière')}</div>

      <div style="opacity:.96;line-height:1.5;margin-bottom:14px;">
        ${tt(
          'rewind.body',
          'Utiliser 1 <img src="assets/images/jeton.webp" alt="" style="width:1.35em;height:1.35em;vertical-align:-0.22em;object-fit:contain;"> pour revenir 5 pièces en arrière ?'
        )}
      </div>

      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button id="rewind-confirm-btn" style="padding:.7em 1em;border:none;border-radius:.85em;background:#39f;color:#fff;cursor:pointer;">
          ${tt(
            'rewind.confirm',
            'Utiliser 1 <img src="assets/images/jeton.webp" alt="" style="width:1.35em;height:1.35em;vertical-align:-0.22em;object-fit:contain;">'
          )}
        </button>

        <button id="rewind-cancel-btn" style="padding:.7em 1em;border:none;border-radius:.85em;background:#444;color:#fff;cursor:pointer;">
          ${tt('common.cancel','Annuler')}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const closeOnly = () => popup.remove();

  popup.querySelector('#rewind-cancel-btn')?.addEventListener('click', closeOnly);
  popup.addEventListener('click', (e) => {
    if (e.target === popup) closeOnly();
  });

  popup.querySelector('#rewind-confirm-btn')?.addEventListener('click', async () => {
    const okTok = await useJeton();

    popup.remove();

    if (!okTok) {
      showNoJetonPopup({
        title: tt('rewind.no_token.title', 'Tu n\'as plus de jeton'),
        body: tt('rewind.no_token.body', 'Regarde une pub pour revenir 5 pièces en arrière ou va à la boutique.'),
        onWatchAd: async () => { await doRewindWithAd(); }
      });
      return;
    }

    rewindHistoryAndResume(5, 3);
  });
}

async function maybeShowRewindTutorialPopup() {
  if (mode === 'duel') return;
  if (piecesLockedThisRun < REWIND_TUTORIAL_MIN_PLACED_PIECES) return;
  if (rewindTutorialShownThisRun || rewindTutorialBusy) return;
  if (hasSeenRewindTutorial()) return;

  rewindTutorialBusy = true;
  rewindTutorialShownThisRun = true;

  try {
    await userData.addJetons?.(1);
    markRewindTutorialSeen();

    try {
      const jetons = await userData.getJetons?.();
      const j = document.getElementById('header-jetons') || document.getElementById('jetonsCount');
      if (j && jetons != null) j.textContent = String(jetons);
    } catch (_) {}

    const oldPopup = document.getElementById('rewind-tutorial-popup');
    if (oldPopup) oldPopup.remove();

    const wasPaused = paused;
    paused = true;
    stopSoftDrop();
    stopHorizontalRepeat();
    safeRedraw();

    const popup = document.createElement('div');
    popup.id = 'rewind-tutorial-popup';
    popup.style = `
      position: fixed;
      inset: 0;
      z-index: 100001;
      background: rgba(0,0,0,.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    `;

    popup.innerHTML = `
      <div style="width:min(92vw,360px);background:#23294a;border-radius:18px;padding:18px 16px;box-shadow:0 0 18px rgba(0,0,0,.35);text-align:center;">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px;">
          <img src="assets/icons/rewind_5.svg" alt="" style="width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,.25));">
          <div style="font-size:1.05em;font-weight:800;line-height:1.2;">${tt('rewind.tip.title', 'Retour en arrière')}</div>
        </div>

        <div style="opacity:.96;line-height:1.5;margin-bottom:10px;">
          ${tt('rewind.tip.body', 'En cas de besoin, tu peux cliquer sur cette touche pour revenir 5 pièces en arrière.')}
        </div>

        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;font-weight:800;flex-wrap:nowrap;">
          <span>${tt('rewind.tip.cost', 'Coût')}</span>
          <span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:0 0 auto;">
            <img src="assets/images/jeton.webp" alt="" style="display:block;width:20px;height:20px;object-fit:contain;flex:0 0 20px;">
            <span>x1</span>
          </span>
        </div>

        <div style="margin-bottom:14px;font-weight:800;text-align:center;">
          ${tt('rewind.tip.reward', '')}
        </div>

        <button id="rewind-tutorial-ok" style="padding:.78em 1.15em;border:none;border-radius:.85em;background:#39f;color:#fff;cursor:pointer;font-weight:800;">
          ${tt('rewind.tip.cta', 'Compris')}
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    let canCloseRewindTutorial = false;
    const rewindOkBtn = popup.querySelector('#rewind-tutorial-ok');

    if (rewindOkBtn) {
      rewindOkBtn.disabled = true;
      rewindOkBtn.style.opacity = '0.55';
      rewindOkBtn.style.cursor = 'default';
      rewindOkBtn.style.pointerEvents = 'none';
    }

    setTimeout(() => {
      canCloseRewindTutorial = true;
      if (rewindOkBtn) {
        rewindOkBtn.disabled = false;
        rewindOkBtn.style.opacity = '1';
        rewindOkBtn.style.cursor = 'pointer';
        rewindOkBtn.style.pointerEvents = 'auto';
      }
    }, 2000);

    const closePopup = () => {
      if (!canCloseRewindTutorial) return;
      popup.remove();
      paused = wasPaused;
      safeRedraw();
      if (!paused && !gameOver) requestAnimationFrame(update);
    };

    rewindOkBtn?.addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => {
      if (e.target === popup && canCloseRewindTutorial) closePopup();
    });
  } catch (e) {
    rewindTutorialShownThisRun = false;
    console.warn('[VBlocks] rewind tutorial popup failed', e);
  } finally {
    rewindTutorialBusy = false;
  }
}

function showNoJetonPopup(opts = {}) {
  const oldMini = document.getElementById('no-jeton-popup');
  if (oldMini) oldMini.remove();

  const title = opts.title || tt('rewind.no_token.title', 'Tu n\'as plus de jeton');

  const body = opts.body || tt(
    'rewind.no_token.body',
    'Regarde une pub pour revenir 5 pièces en arrière ou ouvre la boutique.'
  );

  const onWatchAd = typeof opts.onWatchAd === 'function'
    ? opts.onWatchAd
    : async () => { await doRewindWithAd(); };

  let jetons12Price = '...';
  try {
    const p =
      window.CdvPurchase?.store?.get?.('jetons12', window.CdvPurchase?.Platform?.GOOGLE_PLAY) ||
      window.CdvPurchase?.store?.products?.byId?.jetons12 ||
      null;

    const livePrice = p?.pricing?.price || p?.price || p?.pricing?.priceString;
    if (livePrice) jetons12Price = livePrice;
  } catch (_) {}

  const mini = document.createElement('div');
  mini.id = 'no-jeton-popup';
  mini.style = `
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(0,0,0,.45);
    display:flex;
    align-items:center;
    justify-content:center;
  `;

  mini.innerHTML = `
    <div style="width:min(92vw,370px);background:#23294a;border-radius:18px;padding:18px 16px;box-shadow:0 0 18px rgba(0,0,0,.35);text-align:center;">
      <div style="font-size:1.08em;font-weight:800;margin-bottom:10px;">${title}</div>

      <div style="opacity:.95;line-height:1.5;margin-bottom:14px;">
        ${body}
      </div>

      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;">
        <img src="assets/images/jeton.webp" alt="" style="width:30px;height:30px;object-fit:contain;">
        <span style="font-weight:800;">1</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;justify-content:center;align-items:center;">
        <button
          id="no-jeton-watch-ad"
          style="width:100%;padding:.8em 1em;border:none;border-radius:.9em;background:#a73;color:#fff;cursor:pointer;font-weight:700;"
        >
          ${tt('common.watch_ad', 'Regarder une pub')}
        </button>

        <button
          id="no-jeton-buy-12"
          style="width:100%;padding:.8em 1em;border:none;border-radius:.9em;background:#39f;color:#fff;cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"
        >
          <img src="assets/images/jeton.webp" alt="" style="width:24px;height:24px;object-fit:contain;">
          <span>12</span>
          <span>•</span>
          <span>${jetons12Price}</span>
        </button>

        <button
          id="no-jeton-close"
          style="margin-top:2px;background:transparent;border:none;color:#cfd8ff;cursor:pointer;opacity:.9;"
        >
          ${tt('common.cancel','Annuler')}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(mini);

  const closeMini = () => mini.remove();

  mini.querySelector('#no-jeton-close')?.addEventListener('click', closeMini);
  mini.addEventListener('click', (e) => {
    if (e.target === mini) closeMini();
  });

  mini.querySelector('#no-jeton-watch-ad')?.addEventListener('click', async () => {
    closeMini();
    await onWatchAd();
  });

  mini.querySelector('#no-jeton-buy-12')?.addEventListener('click', async () => {
    try {
      if (typeof window.buyProduct === 'function') {
        await window.buyProduct('jetons12');
      } else {
        alert(tt('achat.err', 'Impossible de finaliser l\'achat.'));
      }
    } catch (_) {
      alert(tt('achat.err', 'Impossible de finaliser l\'achat.'));
    }
  });
}

    setTimeout(() => {
      const btnPause = document.getElementById('pause-btn');
      if (btnPause) {
        const pauseLabel = tt('game.pause', 'Pause');
        btnPause.title = pauseLabel;
        btnPause.setAttribute('aria-label', pauseLabel);
        const pauseImg = btnPause.querySelector('img');
        if (pauseImg) pauseImg.alt = pauseLabel;

        btnPause.onclick = (e) => {
          e.preventDefault();
          togglePause();
        };
      }

      const btnRewind = document.getElementById('rewind-btn');
      if (btnRewind) {
        const rewindLabel = tt('game.rewind', 'Retour arrière');
        btnRewind.title = rewindLabel;
        btnRewind.setAttribute('aria-label', rewindLabel);
        const rewindImg = btnRewind.querySelector('img');
        if (rewindImg) rewindImg.alt = rewindLabel;

        btnRewind.onclick = (e) => {
          e.preventDefault();
          showRewindConfirmPopup();
        };
      }

      const btnRestart = document.getElementById('restart-btn');
      if (btnRestart) btnRestart.onclick = (e) => {
        e.preventDefault();
        restartGameHard();
      };
    }, 200);

    const SPEED_TABLE = [
      800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
       83,  83,  83,  67,  67,  67,  50,   50,  50,  33,
       33,  33,  33,  33,  33,  33,  33,  33,  17
    ];

const scoreEl = document.getElementById('score');
if (scoreEl) scoreEl.textContent = '0';

// Cherche l’élément à l’instant où on en a besoin (pas au chargement)
function setHighText(val) {
  const el = document.getElementById('highscore') || document.getElementById('highscore-global');
  if (el) el.textContent = String(val);
}

function getNextRecordBeatCount() {
  try {
    const raw = Number(localStorage.getItem(RECORD_BEAT_COUNT_KEY) || '0');
    const next = raw + 1;
    localStorage.setItem(RECORD_BEAT_COUNT_KEY, String(next));
    return next;
  } catch (_) {
    return 1;
  }
}

async function updateHighscoreDisplay() {
  // essaie d’abord la RPC; si KO, fallback userData
  let cloud = null;
  try {
    if (typeof getHighScoreSupabase === 'function') {
      cloud = await getHighScoreSupabase();
    }
  } catch (_) {}

  if (cloud == null && userData?.getHighScore) {
    try { cloud = await userData.getHighScore(); } catch (_) {}
  }

  highscoreCloud = Number(cloud) || 0;
  setHighText(highscoreCloud);
  return highscoreCloud;
}

// Appel immédiat si le DOM est déjà prêt, sinon on attend
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateHighscoreDisplay().then(() => { resetRunRecordNudgeState(); }).catch(() => {});
  });
} else {
  updateHighscoreDisplay().then(() => { resetRunRecordNudgeState(); }).catch(() => {});
}

// Alias (deux orthographes utilisées ailleurs dans le code)
window.updateHighscoreDisplay = updateHighscoreDisplay;
window.updateHighScoreDisplay = updateHighscoreDisplay;


    // === SCORE: barème fixe (sans combo/enchaînement) ===
    function computeScore(lines) {
      const TABLE = [0, 10, 25, 40, 60]; // 0,1,2,3,4 lignes
      return TABLE[lines] || 0;
    }

    async function startGame() {
      try { window.partieCommencee?.(mode); } catch(_){}

      paused = false;
      gameOver = false;
      lastTime = 0;
      reviveUsed = false; // ✅ nouvelle partie → re-autorise 1 revive
      endHandled = false;
      creditDone = false;

      if (mode === 'duel') await setupDuelSequence();
      if (mode !== 'duel') {
        piecesSequence = generateSequenceClassic(200);
        piecesUsed = 0;
      }
      nextPiece = newPiece();
      reset();
      saveHistory();
      window.startMusicForGame?.();
      requestAnimationFrame(update);
    }

    function newPiece() {
      let typeId;
      if (mode === 'duel') typeId = getDuelNextPieceId();
      else typeId = getNextPieceIdGeneric();

      if (typeId < 0 || typeId > 6 || Number.isNaN(typeId)) {
        typeId = Math.floor(Math.random() * PIECES.length);
      }

      const letter = LETTERS[typeId];
      return createSafePiece(letter);
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
          if (val) {
            const x = currentPiece.x + dx;
            const y = currentPiece.y + dy;
            if (y >= 0) {
              if (isVariantTheme(currentTheme)) {
                board[y][x] = { letter: currentPiece.letter, variant: currentPiece.variants?.[dy]?.[dx] ?? 0 };
              } else {
                board[y][x] = currentPiece.letter;
              }
            }
          }
        })
      );
      clearLines();
      scheduleSave();
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
        let pts = computeScore(lines, combo);
        score += pts;
        if (scoreEl) scoreEl.textContent = score;

if (score > highscoreCloud) {
  const newHS = score;
  highscoreCloud = newHS;
  setHighText(newHS);

  Promise.resolve()
    .then(() => userData?.setHighScore ? userData.setHighScore(newHS) : null)
    .then(() => (typeof setHighScoreSupabase === 'function') ? setHighScoreSupabase(newHS) : null)
    .finally(() => {
      if (typeof window.updateHighscoreDisplay === 'function') window.updateHighscoreDisplay();
      if (typeof window.updateHighScoreDisplay === 'function') window.updateHighscoreDisplay();
    })
    .catch(e => console.warn('[HS] save failed:', e));
}


        if (mode === 'classic' || mode === 'duel') {
          let level = Math.floor(linesCleared / 7);
          if (level >= SPEED_TABLE.length) level = SPEED_TABLE.length - 1;
          dropInterval = SPEED_TABLE[level];
        }
      } else {
        combo = 0;
      }
    }

    function move(offset) {
      if (!currentPiece || !currentPiece.shape) return;
      currentPiece.x += offset;
      if (collision()) currentPiece.x -= offset;
      scheduleSave();
    }

    function dropPiece() {
      if (!currentPiece || !currentPiece.shape) return;
      currentPiece.y++;
      if (collision()) {
        currentPiece.y--;
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = true;

        merge();
        saveHistory();
        piecesLockedThisRun += 1;
        setTimeout(() => { maybeShowRewindTutorialPopup(); }, 120);
        reset();
        if (collision()) {
          showEndPopup(score);
          gameOver = true;
        }
      }
    }

    // 🔒 rotation lock global (empêche rotation pendant glissements/softdrop/quickdrop)
    let rotationLocked = false;

    function rotatePiece() {
      if (rotationLocked || !currentPiece || !currentPiece.shape) return; // 🔒
      const shape = currentPiece.shape;
      let oldVariants = null;
      if (isVariantTheme(currentTheme)) oldVariants = currentPiece.variants;

      currentPiece.shape = shape[0].map((_, i) => shape.map(r => r[i])).reverse();
      if (isVariantTheme(currentTheme)) {
        if (oldVariants && oldVariants[0]) {
          currentPiece.variants = oldVariants[0].map((_, i) => oldVariants.map(r => r[i])).reverse();
        }
      }

      if (collision()) {
        currentPiece.shape = shape;
        if (isVariantTheme(currentTheme)) currentPiece.variants = oldVariants;
      } else {
        scheduleSave();
      }
    }

    function clonePiece(p) {
      return JSON.parse(JSON.stringify(p));
    }

    // === HOLD = échange instantané
    function tryKickPlace(p, targetX, targetY) {
      const kicks = [[0,0],[-1,0],[1,0],[0,-1],[-2,0],[2,0],[0,-2]];
      const bx = p.x, by = p.y;
      for (const [kx,ky] of kicks) {
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
      const cshape = currentPiece.shape.map(r=>r.slice());
      const cvars  = currentPiece.variants ? currentPiece.variants.map(r=>r.slice()) : null;
      const clet   = currentPiece.letter;

      if (!heldPiece) {
        heldPiece = clonePiece(currentPiece);
        currentPiece = clonePiece(nextPiece);
        nextPiece = newPiece();
      } else {
        const tmp = clonePiece(currentPiece);
        currentPiece = clonePiece(heldPiece);
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

      holdUsed = false;
      ensureRenderablePieces();
      drawMiniPiece(holdCtx, heldPiece);
      drawMiniPiece(nextCtx, nextPiece);
      scheduleSave();
      safeRedraw();
    }

    function getGhostPiece() {
      if (!ghostPieceEnabled) return null;
      if (!currentPiece || !currentPiece.shape) return null;
      let ghost = JSON.parse(JSON.stringify(currentPiece));
      while (!collision(ghost)) { ghost.y++; }
      ghost.y--;
      return ghost;
    }

    // === HARD DROP
    function hardDrop() {
      if (!currentPiece) return;
      const ghost = getGhostPiece();
      if (!ghost) return;
      currentPiece.y = ghost.y;
      stopSoftDrop();
      merge();
      saveHistory();
      piecesLockedThisRun += 1;
      setTimeout(() => { maybeShowRewindTutorialPopup(); }, 120);
      reset();
      lastTime = performance.now();
      if (collision()) {
        showEndPopup(score);
        gameOver = true;
      }
      if (!gameOver && !paused) requestAnimationFrame(update);
    }

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
          c.shadowBlur = (ghost ? 3 : 15);
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
      ensureRenderablePieces();
      clearCanvas(ctx, canvas);

      const { x: OX, y: OY } = boardOffsets();
      ctx.save();
      try {
        ctx.translate(OX, OY);

        const ghost = getGhostPiece();
        if (ghost) {
          ghost.shape.forEach((row, dy) =>
            row.forEach((val, dx) => {
              if (val) drawBlockCustom(
                ctx, ghost.x + dx, ghost.y + dy, ghost.letter, BLOCK_SIZE, true,
                (currentTheme && isVariantTheme(currentTheme)) ? ghost.variants?.[dy]?.[dx] : 0
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
                (currentTheme && isVariantTheme(currentTheme)) ? currentPiece.variants?.[dy]?.[dx] : 0
              );
            })
          );
        }
      } finally {
        ctx.restore();
      }
    }

    function safeRedraw() {
      try {
        ensureRenderablePieces();
        drawBoard();
      } catch (e) {
        console.error('[VBlocks] drawBoard failed', e, {
          currentPiece,
          nextPiece,
          heldPiece,
          currentTheme,
          score,
          linesCleared,
          mode
        });

        try {
          recoverPiecesForRender();
          drawBoard();
          drawMiniPiece(nextCtx, nextPiece);
          drawMiniPiece(holdCtx, heldPiece);
        } catch (e2) {
          console.error('[VBlocks] redraw recovery failed', e2);
        }
      }
    }

    function drawMiniPiece(c, piece) {
      if (!c) return;
      clearCanvas(c, c.canvas);
      if (!piece) return;

      const safePiece = sanitizePiece(piece, piece.letter || 'I');
      if (!safePiece || !safePiece.shape) {
        console.warn('[VBlocks] drawMiniPiece skipped invalid piece', piece);
        return;
      }

      const cssW = c.canvas.width  / DPR;
      const cssH = c.canvas.height / DPR;

      const shape = safePiece.shape;
      let minX =  99, minY =  99, maxX = -99, maxY = -99;
      shape.forEach((row, y) => {
        row.forEach((val, x) => {
          if (val) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        });
      });
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;

      const PAD = 6;
      const cellSize = Math.min(
        (cssW - 2 * PAD) / w,
        (cssH - 2 * PAD) / h
      );

      const offsetX = (cssW - (w * cellSize)) / 2 - minX * cellSize;
      const offsetY = (cssH - (h * cellSize)) / 2 - minY * cellSize;

      c.save();
      try {
        c.translate(offsetX, offsetY);
        shape.forEach((row, y) => {
          row.forEach((val, x) => {
            if (!val) return;
            drawBlockCustom(
              c,
              x,
              y,
              safePiece.letter,
              cellSize,
              false,
              (currentTheme && isVariantTheme(currentTheme)) ? safePiece.variants?.[y]?.[x] : 0
            );
          });
        });
      } finally {
        c.restore();
      }
    }

    function reset() {
      stopSoftDrop();
      mustLiftFingerForNextSoftDrop = true;

      currentPiece = sanitizePiece(nextPiece, nextPiece?.letter || 'I') || newPiece();
      nextPiece = newPiece();
      holdUsed = false;
      ensureRenderablePieces();
      drawMiniPiece(nextCtx, nextPiece);
      drawMiniPiece(holdCtx, heldPiece);
      scheduleSave();
    }

    function update(now) {
      // ❄️ GEL TOTAL si pub (interstitiel/reward) en cours
      if (window.__ads_active) { requestAnimationFrame(update); return; }

      if (paused || gameOver) return;

      ensureRenderablePieces();

      // Rampe de vitesse post-revive
      if (reviveRampActive) {
        const elapsed = now - reviveRampStart;
        const t = Math.min(1, elapsed / REVIVE_RAMP_MS);
        dropInterval = Math.max(17, Math.round(lerp(1200, reviveTargetInterval, t)));
        if (t >= 1) {
          reviveRampActive = false;
        }
      }

      if (!lastTime) lastTime = now;
      const delta = now - lastTime;
      if (delta > dropInterval) {
        dropPiece();
        lastTime = now;
      }
      safeRedraw();
      requestAnimationFrame(update);
    }

    async function updateBalancesHeader() {
      try {
        const jetons = await userData.getJetons();
        const vcoins = await userData.getVCoins();
        const j = document.getElementById('header-jetons') || document.getElementById('jetonsCount');
        const v = document.getElementById('header-vcoins') || document.getElementById('vcoinsCount');
        if (j) j.textContent = String(jetons ?? 0);
        if (v) v.textContent = String(vcoins ?? 0);
      } catch (_) {}
    }

    // ===== SOFT DROP tactile =====
    let softDropInterval = null;
    let isSoftDropping = false;
    let mustLiftFingerForNextSoftDrop = false;

    function startSoftDrop() {
      if (mustLiftFingerForNextSoftDrop) return;
      if (isSoftDropping || paused || gameOver) return;
      isSoftDropping = true;
      rotationLocked = true;
      lastTime = performance.now();
      softDropInterval = setInterval(() => {
        if (!paused && !gameOver && !window.__ads_active) {
          dropPiece();
          safeRedraw();
        }
      }, 45);
    }

    function stopSoftDrop() {
      isSoftDropping = false;
      clearInterval(softDropInterval);
      softDropInterval = null;
    }

    // ===== Repeat horizontal tactile =====
    let horizontalRepeatInterval = null;
    let horizontalRepeatDirection = 0;
    let horizontalRepeatKickoff = null;
    const INITIAL_REPEAT_DELAY = 180;
    const REPEAT_INTERVAL = 60;

    function startHorizontalRepeat(direction) {
      if (paused || gameOver || window.__ads_active) return;
      if (direction !== -1 && direction !== 1) return;

      if (
        horizontalRepeatDirection === direction &&
        (horizontalRepeatInterval || horizontalRepeatKickoff)
      ) return;

      stopHorizontalRepeat();
      horizontalRepeatDirection = direction;

      horizontalRepeatKickoff = setTimeout(() => {
        horizontalRepeatKickoff = null;
        horizontalRepeatInterval = setInterval(() => {
          if (!paused && !gameOver && !window.__ads_active) {
            move(direction);
          }
        }, REPEAT_INTERVAL);
      }, INITIAL_REPEAT_DELAY);
    }

    function stopHorizontalRepeat() {
      horizontalRepeatDirection = 0;

      if (horizontalRepeatKickoff) {
        clearTimeout(horizontalRepeatKickoff);
        horizontalRepeatKickoff = null;
      }

      if (horizontalRepeatInterval) {
        clearInterval(horizontalRepeatInterval);
        horizontalRepeatInterval = null;
      }
    }

    // ===== INPUTS clavier =====
    document.addEventListener('keydown', e => {
      if (gameOver) return;

      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (paused) return;

      if (e.key === 'ArrowLeft') {
        move(-1);
      } else if (e.key === 'ArrowRight') {
        move(1);
      } else if (e.key === 'ArrowDown') {
        startSoftDrop();
      } else if (e.key === 'ArrowUp') {
        rotatePiece();
      } else if (e.key === 'c' || e.key === 'C' || e.key === 'Shift') {
        holdPieceSwapStay();
      } else if (e.key === ' ') {
        hardDrop();
      }
      safeRedraw();
    });

    document.addEventListener('keyup', e => {
      if (e.key === 'ArrowDown') {
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = false;
        rotationLocked = false;
      }
    });

    // ====================
    // TOUCH DIRECT SUR LE CANVAS
    // ====================
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';

    let gestureMode = 'none';
    const HORIZ_THRESHOLD = 20;
    const DEAD_ZONE = 10;
    const VERTICAL_LOCK_EARLY_MS = 140;
    const HOLD_ACTIVATION_MS = 180;

    let didHardDrop = false;
    let startX = 0;
    let startY = 0;
    let movedX = 0;
    let movedY = 0;
    let dragging = false;
    let touchStartTime = 0;
    let holdToDropTimeout = null;
    let quickDropLock = false;

    function isQuickSwipeUp(elapsed, dy) {
      return (elapsed < 220) && (dy < -42);
    }

    function isQuickSwipeDown(elapsed, dy) {
      return (elapsed < 220) && (dy > 42);
    }

    canvas.addEventListener('touchstart', function (e) {
      if (gameOver || window.__ads_active) return;
      if (e.touches.length !== 1) return;

      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      movedX = 0;
      movedY = 0;
      dragging = true;
      touchStartTime = Date.now();
      gestureMode = 'none';
      didHardDrop = false;
      quickDropLock = false;
      rotationLocked = false;

      stopHorizontalRepeat();

      clearTimeout(holdToDropTimeout);
      holdToDropTimeout = setTimeout(() => {
        if (dragging && !isSoftDropping) {
          gestureMode = 'vertical';
          startSoftDrop();
          stopHorizontalRepeat();
        }
      }, HOLD_ACTIVATION_MS);
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (!dragging || window.__ads_active) return;

      const t = e.touches[0];
      const now = Date.now();
      const elapsed = now - touchStartTime;

      const newMovedX = t.clientX - startX;
      const newMovedY = t.clientY - startY;
      movedX = newMovedX;
      movedY = newMovedY;

      if (isQuickSwipeDown(elapsed, movedY)) {
        quickDropLock = true;
        rotationLocked = true;
        gestureMode = 'vertical';

        if (!isSoftDropping) startSoftDrop();

        if (movedY > 24) {
          dropPiece();
          startY = t.clientY;
        }

        clearTimeout(holdToDropTimeout);
        return;
      }

      if (gestureMode === 'vertical' || isSoftDropping || elapsed >= VERTICAL_LOCK_EARLY_MS) {
        gestureMode = 'vertical';
        rotationLocked = true;
        stopHorizontalRepeat();

        if (!quickDropLock && !isSoftDropping && !rotationLocked && isQuickSwipeUp(elapsed, movedY)) {
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
          rotationLocked = true;
          clearTimeout(holdToDropTimeout);
        }
      }

      if (gestureMode === 'horizontal') {
        if (movedX > HORIZ_THRESHOLD) {
          move(1);
          startX = t.clientX;
          startHorizontalRepeat(1);
        } else if (movedX < -HORIZ_THRESHOLD) {
          move(-1);
          startX = t.clientX;
          startHorizontalRepeat(-1);
        }

        if (Math.abs(movedX) <= HORIZ_THRESHOLD) {
          stopHorizontalRepeat();
        }

        if (Math.abs(movedX) > 18) clearTimeout(holdToDropTimeout);
        return;
      }

      if (!quickDropLock && !isSoftDropping && !rotationLocked && isQuickSwipeUp(elapsed, movedY)) {
        rotatePiece();
        touchStartTime = now;
        startY = t.clientY;
      }

      if (movedY > 24 && !didHardDrop) {
        if (!isSoftDropping) startSoftDrop();
        dropPiece();
        startY = t.clientY;
      }

      if (Math.abs(movedX) > 18 || movedY < -18) {
        clearTimeout(holdToDropTimeout);
      }
    }, { passive: true });

    canvas.addEventListener('touchend', function () {
      const wasHard = didHardDrop;
      dragging = false;
      clearTimeout(holdToDropTimeout);

      stopHorizontalRepeat();

      if (isSoftDropping) {
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = false;
        gestureMode = 'none';
        quickDropLock = false;
        rotationLocked = false;
        return;
      }

      if (wasHard) {
        didHardDrop = false;
        gestureMode = 'none';
        quickDropLock = false;
        rotationLocked = false;
        return;
      }

      const pressDuration = Date.now() - touchStartTime;
      const isShortPress = pressDuration < 200;
      const hasDropped = Math.abs(movedY) > 18;
      const movedHoriz = Math.abs(movedX) >= HORIZ_THRESHOLD;

      if (
        gestureMode !== 'horizontal' &&
        isShortPress &&
        !hasDropped &&
        Math.abs(movedX) < 10 &&
        !quickDropLock &&
        !rotationLocked &&
        !movedHoriz
      ) {
        rotatePiece();
      }

      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
      quickDropLock = false;
      rotationLocked = false;
    }, { passive: true });

    canvas.addEventListener('touchcancel', function () {
      dragging = false;
      clearTimeout(holdToDropTimeout);
      stopHorizontalRepeat();

      if (isSoftDropping) stopSoftDrop();

      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
      didHardDrop = false;
      quickDropLock = false;
      rotationLocked = false;
    }, { passive: true });

    // ===== INPUTS tactiles (boutons) =====
    function bindHoldToRepeat(el, onStart, onEnd) {
      if (!el) return;
      const start = (ev) => {
        ev.preventDefault();
        if (paused || gameOver) return;
        onStart?.();
      };
      const end = (ev) => {
        ev?.preventDefault?.();
        onEnd?.();
      };

      el.addEventListener('pointerdown', start, { passive:false });
      el.addEventListener('pointerup', end, { passive:false });
      el.addEventListener('pointercancel', end, { passive:false });
      el.addEventListener('pointerleave', end, { passive:false });
    }

    const btnLeft  = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnDown  = document.getElementById('btn-down');
    const btnRot   = document.getElementById('btn-rotate');
    const btnHold  = document.getElementById('btn-hold');
    const btnDrop  = document.getElementById('btn-drop');
    const btnGhost = document.getElementById('ghost-btn');

    bindHoldToRepeat(btnLeft,
      () => { rotationLocked = true; startHorizontalRepeat(-1); },
      () => { stopHorizontalRepeat(); rotationLocked = false; }
    );

    bindHoldToRepeat(btnRight,
      () => { rotationLocked = true; startHorizontalRepeat(1); },
      () => { stopHorizontalRepeat(); rotationLocked = false; }
    );

    bindHoldToRepeat(btnDown,
      () => { rotationLocked = true; startSoftDrop(); },
      () => { stopSoftDrop(); mustLiftFingerForNextSoftDrop = false; rotationLocked = false; }
    );

    if (btnRot) btnRot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (paused || gameOver) return;
      rotatePiece();
      safeRedraw();
    }, { passive:false });

    if (btnHold) btnHold.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (paused || gameOver) return;
      holdPieceSwapStay();
      safeRedraw();
    }, { passive:false });

    if (btnDrop) btnDrop.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (paused || gameOver) return;
      hardDrop();
      safeRedraw();
    }, { passive:false });

    if (btnGhost) btnGhost.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (paused || gameOver) return;
      ghostPieceEnabled = !ghostPieceEnabled;
      localStorage.setItem('ghostPiece', ghostPieceEnabled ? 'true' : 'false');
      safeRedraw();
    }, { passive:false });

    window.addEventListener('blur', () => {
      stopSoftDrop();
      stopHorizontalRepeat();
    });

    // ===== BOUTONS topbar =====
    const btnBack = document.getElementById('back-btn');
    if (btnBack) btnBack.addEventListener('click', () => {
      if (score > 0 && !gameOver) saveStateNow();
      window.location.href = INDEX_URL;
    });

    // ===== REPRISE de partie =====
    document.addEventListener('DOMContentLoaded', async () => {
      updateBalancesHeader();
      updateHighscoreDisplay();
      refreshMusicBtn();

      if (holdCanvas) {
        holdCanvas.style.cursor = 'pointer';
        holdCanvas.style.touchAction = 'manipulation';

        let lastHoldTs = 0;

        const triggerHold = (e) => {
          e.preventDefault?.();
          e.stopPropagation?.();

          if (paused || gameOver || !currentPiece) return;

          const now = Date.now();
          if (now - lastHoldTs < 180) return;
          lastHoldTs = now;

          holdPieceSwapStay();
          safeRedraw();
        };

        holdCanvas.addEventListener('pointerdown', triggerHold, { passive: false });

        if (!window.PointerEvent) {
          holdCanvas.addEventListener('touchstart', triggerHold, { passive: false });
          holdCanvas.addEventListener('mousedown', triggerHold, { passive: false });
        }
      }

      const savedLocal = loadSavedLocal();
      if (savedLocal) {
        showResumePopup(savedLocal);
      } else {
        await startGame();
      }
    });

    // expose debug API
    global.__vblocks = {
      get state() {
        return {
          mode, score, linesCleared, combo, dropInterval,
          currentPiece, nextPiece, heldPiece, paused, gameOver,
          theme: currentTheme
        };
      },
      saveStateNow,
      loadSavedLocal,
      restoreFromSave,
      restartGameHard
    };
  }

  // === SUPABASE helpers déjà présents ailleurs dans ton app ===
  async function getHighScoreSupabase() {
    try {
      if (typeof window.secureGetMe === 'function') {
        const me = await window.secureGetMe();
        return Number(me?.high_score ?? 0);
      }
    } catch (_) {}
    return 0;
  }

  async function setHighScoreSupabase(value) {
    try {
      if (typeof window.secureSetHighScore === 'function') {
        return await window.secureSetHighScore(value);
      }
    } catch (_) {}
    return null;
  }

  async function setLastScoreSupabase(value) {
    try {
      if (typeof window.secureSetLastScore === 'function') {
        return await window.secureSetLastScore(value);
      }
    } catch (_) {}
    return null;
  }

 global.VBlocksGame = { initGame };
})(window);
