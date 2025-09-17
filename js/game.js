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

  // ==== FIN MUSIQUE ====


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
      : (localStorage.getItem('themeVBlocks') || 'neon'));
    return t === 'space' || t === 'vitraux' || t === 'luxury';
  }

  function initGame(opts) {
    const mode = (opts && opts.mode) || 'classic';
    const duelId = opts?.duelId || null;
    const duelPlayerNum = opts?.duelPlayerNum || 1;

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

    window.addEventListener('resize', () => {
      fitCanvasToCSS();
      sizeMiniCanvas(holdCanvas, holdCtx, 48);
      sizeMiniCanvas(nextCanvas, nextCtx, 48);
      safeRedraw();
    });

    const THEMES = ['nuit', 'neon', 'nature', 'bubble', 'retro', 'space', 'vitraux', 'luxury', 'grece', 'arabic'];
    let currentTheme = localStorage.getItem('themeVBlocks') || 'neon';
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
      } else {
        global.currentColors = { I:'#5cb85c', J:'#388e3c', L:'#7bb661', O:'#cddc39', S:'#a2d149', T:'#558b2f', Z:'#9ccc65' };
      }
    }

    function changeTheme(themeName) {
      document.body.setAttribute('data-theme', themeName);
      localStorage.setItem('themeVBlocks', themeName);
      const style = document.getElementById('theme-style');
      if (style) style.href = `themes/${themeName}.css`;
      loadBlockImages(themeName);
      currentThemeIndex = Math.max(0, THEMES.indexOf(themeName));
      safeRedraw();
    }

    loadBlockImages(currentTheme);
    // --- Suit le thème choisi dans le profil (évènement envoyé par profil.html)
    window.addEventListener('vblocks-theme-changed', (e) => {
      const t = (e?.detail?.theme) || localStorage.getItem('themeVBlocks') || 'neon';
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
        piecesUsed
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
        piecesUsed
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
      popup.innerHTML = `
        <div style="background:#23294a;border-radius:1em;padding:24px 16px;box-shadow:0 0 14px #3ff7;min-width:260px;max-width:92vw;text-align:center">
          <div style="font-size:1.2em;font-weight:bold;margin-bottom:10px;">
            <span>${tt('end.title','Partie terminée')}</span><br>
            <span>+${points} ${tt('end.points','points')}</span>
          </div>
          <div style="opacity:.9;margin-bottom:14px">
            ${tt('end.subtitle','Que voulez-vous faire ?')}
          </div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button id="end-restart" class="btn-primary" style="padding:.6em 1.1em;border-radius:.8em;border:none;background:#39f;color:#fff;cursor:pointer;">
              ${tt('end.restart','Recommencer')}
            </button>
            <button id="end-quit" class="btn" style="padding:.6em 1.1em;border-radius:.8em;border:none;background:#444;color:#fff;cursor:pointer;">
              ${tt('end.quit','Quitter')}
            </button>
            <button id="end-revive-token" class="btn" style="padding:.6em 1.1em;border-radius:.8em;background:#2a7;color:#fff;cursor:pointer;${canRevive ? '' : 'display:none;'}">
              ${tt('end.revive.token','Revivre (1 jeton)')}
            </button>
            <button id="end-revive-ad" class="btn" style="padding:.6em 1.1em;border:none;border-radius:.8em;background:#a73;color:#fff;cursor:pointer;${canRevive ? '' : 'display:none;'}">
              ${tt('end.revive.ad','Revivre (pub)')}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(popup);

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
        if (!okTok) { alert('Pas assez de jetons.'); return; }
        reviveUsed = true;
        try { popup.remove(); } catch(_) {}
        endHandled = false;      // ✅ clé : autoriser la prochaine popup
        creditDone = false;      // ✅ pas de crédit encore
        gameOver = false;
        reviveRewindAndResume();
      }

      document.getElementById('end-restart').onclick = async function () {
        await commitEndRewards(points); // ✅ crédit au moment de confirmer la fin
        endHandled = true;
        popup.remove();
        restartGameHard();
      };
      document.getElementById('end-quit').onclick = async function () {
        await commitEndRewards(points); // ✅ crédit au moment de confirmer la fin
        endHandled = true;
        window.location.href = INDEX_URL;
      };
      const btnTok = document.getElementById('end-revive-token');
      const btnAd  = document.getElementById('end-revive-ad');
      if (btnTok) btnTok.onclick = function () { doRevive(false); };
      if (btnAd)  btnAd.onclick  = function () { doRevive(true);  };
    }

    function reviveRewindAndResume() {
      if (history.length === 0) return;
      const index = history.length > 8 ? history.length - 8 : 0;
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

      // ❄️ Assure qu'aucun flag pub ne bloque
      window.__ads_active = false;
      window.__ads_freeze = false;

      paused = true;
      gameOver = false;
      safeRedraw();

      // 2) Compte à rebours court (i18n)
      let countdown = 3;
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

// 3) Restaure et démarre rampe de vitesse
paused = false;
gameOver = false;

reviveTargetInterval = dropInterval || 500;
dropInterval = 1200; // très lent au départ
reviveRampActive = true;
reviveRampStart = performance.now();

lastTime = performance.now();

// ⬅️ Ne pas compter la reprise post-revive comme une action
window.__ads_skip_next_action = true;

try { window.partieReprisee?.(mode); } catch(_) {}

requestAnimationFrame(update);

        }
      }, 1000);
    }

    function rewind() {
      if (history.length === 0) return;
      const index = history.length > 8 ? history.length - 8 : 0;
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

      paused = true;
      gameOver = false;
      safeRedraw();

      let countdown = 5;
      const overlay = document.createElement('div');
      overlay.id = 'countdown-overlay';
      overlay.style = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);
        color:#fff;display:flex;align-items:center;justify-content:center;font-size:4em;z-index:99998;
      `;
      overlay.textContent = countdown;
      document.body.appendChild(overlay);
      let tmr = setInterval(() => {
        countdown--;
        overlay.textContent = countdown;
        if (countdown <= 0) {
          clearInterval(tmr);
          overlay.remove();
          paused = false;
          gameOver = false;
          lastTime = performance.now();
          requestAnimationFrame(update);
        }
      }, 1000);
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

    setTimeout(() => {
      let btn = document.getElementById('pause-btn');
      if (btn) btn.onclick = (e) => { e.preventDefault(); togglePause(); };
      const btnRestart = document.getElementById('restart-btn');
      if (btnRestart) btnRestart.onclick = (e) => { e.preventDefault(); restartGameHard(); };
    }, 200);

    const SPEED_TABLE = [
      800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
       83,  83,  83,  67,  67,  67,  50,   50,  50,  33,
       33,  33,  33,  33,  33,  33,  33,  33,  17
    ];

    const scoreEl = document.getElementById('score');
    const highEl  = document.getElementById('highscore') || document.getElementById('highscore-global');
    if (scoreEl) scoreEl.textContent = '0';
    if (highEl)  highEl.textContent  = '0';

    async function updateHighscoreDisplay() {
      highscoreCloud = await userData.getHighScore?.() ?? 0;
      if (highEl) highEl.textContent = highscoreCloud;
    }
    document.addEventListener('DOMContentLoaded', updateHighscoreDisplay);

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

      let shape = PIECES[typeId];
      let letter = LETTERS[typeId];
      let obj = {
        shape,
        letter,
        x: Math.floor((COLS - shape[0].length) / 2),
        y: 0
      };

      if (isVariantTheme(currentTheme)) {
        let numbers = [1,2,3,4,5,6];
        shuffle(numbers);
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
          highscoreCloud = score;
          if (highEl) highEl.textContent = highscoreCloud;
          if (userData.setHighScore) {
            userData.setHighScore(score).then(() => {
              if (window.updateHighScoreDisplay) window.updateHighScoreDisplay();
            });
          }
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
      currentPiece.x += offset;
      if (collision()) currentPiece.x -= offset;
      scheduleSave();
    }

    function dropPiece() {
      currentPiece.y++;
      if (collision()) {
        currentPiece.y--;
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = true;

        merge();
        saveHistory();
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
      if (rotationLocked) return; // 🔒
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

      ctx.restore();
    }

    function safeRedraw() {
      try { drawBoard(); } catch (_e) {}
    }

    function drawMiniPiece(c, piece) {
      if (!c) return;
      clearCanvas(c, c.canvas);
      if (!piece) return;

      const cssW = c.canvas.width  / DPR;
      const cssH = c.canvas.height / DPR;

      const shape = piece.shape;
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
      c.translate(offsetX, offsetY);
      shape.forEach((row, y) => {
        row.forEach((val, x) => {
          if (!val) return;
          drawBlockCustom(
            c,
            x,
            y,
            piece.letter,
            cellSize,
            false,
            (currentTheme && isVariantTheme(currentTheme)) ? piece.variants?.[y]?.[x] : 0
          );
        });
      });
      c.restore();
    }

    function reset() {
      stopSoftDrop();
      mustLiftFingerForNextSoftDrop = true;

      currentPiece = nextPiece;
      nextPiece = newPiece();
      holdUsed = false;
      drawMiniPiece(nextCtx, nextPiece);
      drawMiniPiece(holdCtx, heldPiece);
      scheduleSave();
    }

    function update(now) {
      // ❄️ GEL TOTAL si pub (interstitiel/reward) en cours
      if (window.__ads_active) { requestAnimationFrame(update); return; }

      if (paused || gameOver) return;

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
      const vcoins = await userData.getVCoins?.();
      const jetons = await userData.getJetons?.();
      if (document.getElementById('vcoin-amount')) document.getElementById('vcoin-amount').textContent = (vcoins ?? '--');
      if (document.getElementById('jeton-amount')) document.getElementById('jeton-amount').textContent = (jetons ?? '--');
    }

    document.addEventListener('DOMContentLoaded', () => {
      const btnTheme = document.getElementById('theme-btn');
      if (btnTheme) {
        btnTheme.addEventListener('click', () => {
          currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
          changeTheme(THEMES[currentThemeIndex]);
        });
      }

      if (holdCanvas) {
        holdCanvas.style.cursor = 'pointer';
        // anti double déclenchement (click + touchstart)
        let lastHoldTs = 0;
        const triggerHold = (e) => {
          e.preventDefault?.();
          const now = Date.now();
          if (now - lastHoldTs < 180) return; // debounce
          lastHoldTs = now;
          holdPieceSwapStay();
        };
        holdCanvas.addEventListener('click', triggerHold, { passive: false });
        holdCanvas.addEventListener('touchstart', triggerHold, { passive: false });
      }

      updateBalancesHeader();
      updateHighscoreDisplay();
    });

    // ====================
    // TOUCH & CLAVIER
    // ====================

    canvas.style.touchAction = 'none';
    canvas.style.userSelect  = 'none';

    let softDropTimer = null;
    let softDropActive = false;
    const SOFT_DROP_INTERVAL = 45;
    const HOLD_ACTIVATION_MS = 180;
    let mustLiftFingerForNextSoftDrop = false;

    // Verrou de geste
    let gestureMode = 'none'; // 'none' | 'horizontal' | 'vertical'
    const HORIZ_THRESHOLD = 20;
    const DEAD_ZONE = 10;
    const VERTICAL_LOCK_EARLY_MS = 140;

    // === AUTO-REPEAT HORIZONTAL (glissement continu) ===
    const INITIAL_REPEAT_DELAY = 180; // délai avant répétition (ms)
    const REPEAT_INTERVAL = 60;       // cadence pendant maintien (ms)
    let horizDir = 0;                 // -1 gauche, 1 droite, 0 neutre
    let repeatKickoff = null;
    let repeatTicker = null;
    function startHorizontalRepeat(dir) {
      if (paused || gameOver) return;
      if (dir !== -1 && dir !== 1) return;
      if (horizDir === dir && (repeatKickoff || repeatTicker)) return; // déjà en cours
      stopHorizontalRepeat();
      horizDir = dir;
      repeatKickoff = setTimeout(() => {
        repeatKickoff = null;
        repeatTicker = setInterval(() => {
          if (!paused && !gameOver && !window.__ads_active) move(horizDir);
        }, REPEAT_INTERVAL);
      }, INITIAL_REPEAT_DELAY);
    }
    function stopHorizontalRepeat() {
      if (repeatKickoff) { clearTimeout(repeatKickoff); repeatKickoff = null; }
      if (repeatTicker)  { clearInterval(repeatTicker); repeatTicker = null; }
      horizDir = 0;
    }

    // flags de swipe
    let didHardDrop = false;

    function startSoftDrop() {
      if (softDropActive || paused || gameOver) return;
      if (mustLiftFingerForNextSoftDrop) return;
      softDropActive = true;
      rotationLocked = true; // 🔒 pas de rotation pendant soft drop
      lastTime = performance.now();
      softDropTimer = setInterval(() => {
        if (!paused && !gameOver && !window.__ads_active) dropPiece();
      }, SOFT_DROP_INTERVAL);
    }
    function stopSoftDrop() {
      if (softDropTimer) clearInterval(softDropTimer);
      softDropTimer = null;
      softDropActive = false;
      // rotationLocked restera true jusqu'au relâchement
    }

    function isQuickSwipeUp(elapsed, dy) {
      return (elapsed < 220) && (dy < -42);
    }
    function isQuickSwipeDown(elapsed, dy) {
      return (elapsed < 220) && (dy > 42);
    }

    let startX, startY, movedX, movedY, dragging = false, touchStartTime = 0;
    let holdToDropTimeout = null;

    // ✅ lock rotation pendant un drop rapide
    let quickDropLock = false;

    canvas.addEventListener('touchstart', function (e) {
      if (gameOver || window.__ads_active) return; // bloque si pub
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      movedX = 0; movedY = 0;
      dragging = true;
      touchStartTime = Date.now();
      gestureMode = 'none';
      didHardDrop = false;
      quickDropLock = false;
      rotationLocked = false; // 🔓 nouveau contact : rotation autorisée au départ

      stopHorizontalRepeat(); // reset

      clearTimeout(holdToDropTimeout);
      holdToDropTimeout = setTimeout(() => {
        if (dragging && !softDropActive) {
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

      // Drop rapide vers le bas -> verrouille rotation
      if (isQuickSwipeDown(elapsed, movedY)) {
        quickDropLock = true;
        rotationLocked = true; // 🔒
        gestureMode = 'vertical';
        if (!softDropActive) startSoftDrop();
        if (movedY > 24) {
          dropPiece();
          startY = t.clientY;
        }
        clearTimeout(holdToDropTimeout);
        return;
      }

      // Passage en vertical
      if (gestureMode === 'vertical' || softDropActive || elapsed >= VERTICAL_LOCK_EARLY_MS) {
        gestureMode = 'vertical';
        rotationLocked = true; // 🔒 pendant vertical/softdrop
        stopHorizontalRepeat();
        if (!quickDropLock && !softDropActive && !rotationLocked && isQuickSwipeUp(elapsed, movedY)){
          rotatePiece();
          touchStartTime = now;
          startY = t.clientY;
        }
        clearTimeout(holdToDropTimeout);
        return;
      }

      // Détection mode horizontal
      if (gestureMode === 'none') {
        if (Math.abs(movedX) > Math.max(Math.abs(movedY), DEAD_ZONE) && Math.abs(movedX) > HORIZ_THRESHOLD) {
          gestureMode = 'horizontal';
          rotationLocked = true; // 🔒 on a commencé un drag horizontal → pas de rotation jusqu'au relâchement
          clearTimeout(holdToDropTimeout);
        }
      }

      if (gestureMode === 'horizontal') {
        if (movedX > HORIZ_THRESHOLD)  {
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

      // Gestes complémentaires
      if (!quickDropLock && !softDropActive && !rotationLocked && isQuickSwipeUp(elapsed, movedY)) {
        rotatePiece();
        touchStartTime = now;
        startY = t.clientY;
      }

      if (movedY > 24 && !didHardDrop) {
        if (!softDropActive) startSoftDrop();
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

      if (softDropActive) {
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = false;
        gestureMode = 'none';
        quickDropLock = false;
        rotationLocked = false; // 🔓 lift => on peut re-rotater au prochain contact
        return;
      }

      if (wasHard) {
        didHardDrop = false;
        gestureMode = 'none';
        quickDropLock = false;
        rotationLocked = false; // 🔓
        return;
      }

      const pressDuration = Date.now() - touchStartTime;
      const isShortPress = pressDuration < 200;
      const hasDropped   = Math.abs(movedY) > 18;
      const movedHoriz   = Math.abs(movedX) >= HORIZ_THRESHOLD;

      // 🔒 Pas de rotation si un drag horizontal est survenu ou si le verrou est actif
      if (gestureMode !== 'horizontal' && isShortPress && !hasDropped && Math.abs(movedX) < 10 && !quickDropLock && !rotationLocked && !movedHoriz) {
        rotatePiece();
      }

      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
      quickDropLock = false;
      rotationLocked = false; // 🔓 prêt pour la prochaine interaction
    }, { passive: true });

    canvas.addEventListener('touchcancel', function () {
      dragging = false;
      clearTimeout(holdToDropTimeout);
      stopHorizontalRepeat();
      if (softDropActive) stopSoftDrop();
      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
      didHardDrop = false;
      quickDropLock = false;
      rotationLocked = false; // 🔓
    }, { passive: true });

    document.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
      if (gameOver || paused || window.__ads_active) return;
      switch (e.key) {
        case 'ArrowLeft':  move(-1);    break;
        case 'ArrowRight': move(1);     break;
        case 'ArrowDown':  dropPiece(); break;
        case 'ArrowUp':    if (!quickDropLock && !rotationLocked) rotatePiece(); break; // 🔒
        case ' ':          hardDrop(); break;
        case 'c': case 'C': holdPieceSwapStay();  break;
      }
    });

    window.addEventListener('blur', () => {
      stopSoftDrop();
      stopHorizontalRepeat();
    });


    // === SUPABASE Fonctions (scores uniquement) ===
    async function getUserId() {
      try {
        if (typeof userData !== 'undefined' && userData.getUserId) {
          const maybe = await userData.getUserId();
          if (maybe) return maybe;
        }
      } catch {}

      try {
        if (sb?.auth?.getUser) {
          const { data: { user } } = await sb.auth.getUser();
          if (user?.id) return user.id;
        }
      } catch {}

      return (window.sbUser && window.sbUser.id) || null;
    }
    async function setLastScoreSupabase(score) {
      if (!sb) return;
      const val = parseInt(score, 10) || 0;
      await sb.rpc('set_lastscore_secure', { last_score: val });
    }

    async function setHighScoreSupabase(score) {
      if (!sb) return;
      const val = parseInt(score, 10) || 0;
      await sb.rpc('set_highscore_secure', { new_score: val });
    }

    async function getHighScoreSupabase() {
      if (!sb) return 0;
      const { data, error } = await sb.rpc('get_balances'); // ou une RPC dédiée
      if (error) return 0;
      const row = Array.isArray(data) ? data[0] : data;
      return row?.highscore || 0;
    }

    // ===== BOOT (LOCAL UNIQUEMENT, SANS CLOUD) =====
    (function boot() {
      // reset des flags ads pour éviter tout gel initial
      window.__ads_active = false;
      window.__ads_freeze = false;

      const savedLocal = loadSavedLocal();
      if (savedLocal && savedLocal.inProgress) {
        // Affiche la popup de reprise locale
        paused = true;
        showResumePopup(savedLocal);
        return;
      }
      // Pas de save locale → démarre direct
      startGame();
    })();

  }

  global.VBlocksGame = { initGame };
})(this);
