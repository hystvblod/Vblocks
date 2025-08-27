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
    c.fillRect(px, py, size, size);
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
    if (!btn || !music) return;
    if (isMusicAlwaysMuted() || music.paused) {
      btn.textContent = '🔇 Muet';
    } else {
      btn.textContent = '🎵 Musique';
    }
  }
  window.setMusicAlwaysMuted = function (val) {
    localStorage.setItem('alwaysMuteMusic', val ? 'true' : 'false');
    if (val) pauseMusic();
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
    if (btnMusic && music) {
      btnMusic.onclick = function () {
        if (isMusicAlwaysMuted()) return;
        if (music.paused) {
          music.play().then(() => { btnMusic.textContent = '🎵 Musique'; }).catch(()=>{});
        } else {
          music.pause();
          btnMusic.textContent = '🔇 Muet';
        }
      };
      refreshMusicBtn();
    }
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

  function initGame(opts) {
    const mode = (opts && opts.mode) || 'classic';
    const duelId = opts?.duelId || null;
    const duelPlayerNum = opts?.duelPlayerNum || 1;
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
    if (!canvas) { console.error('[VBlocks] gameCanvas introuvable'); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error('[VBlocks] Contexte 2D indisponible'); return; }

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

    const THEMES = ['nuit', 'neon', 'nature', 'bubble', 'retro', 'space', 'vitraux'];
    let currentTheme = localStorage.getItem('themeVBlocks') || 'neon';
    let currentThemeIndex = Math.max(0, THEMES.indexOf(currentTheme));
    const blockImages = {};

    // === Load all images ===
    function loadBlockImages(themeName) {
      const themesWithPNG = ['bubble', 'nature', 'vitraux', 'luxury', 'space', 'angelique', 'cyber'];
      if (themeName === 'space' || themeName === 'vitraux') {
        blockImages[themeName] = [];
        let imagesToLoad = 6, imagesLoaded = 0;
        for (let i = 1; i <= 6; i++) {
          const img = new Image();
          img.onload  = () => { imagesLoaded++; if (imagesLoaded === imagesToLoad) safeRedraw(); };
          img.onerror = () => { imagesLoaded++; if (imagesLoaded === imagesToLoad) safeRedraw(); };
          img.src = `themes/${themeName}/${i}.png`;
          blockImages[themeName].push(img);
        }
        ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].forEach(l => { blockImages[l] = null; });
      } else {
        ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].forEach(l => {
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
        global.currentColors = { I: '#00f0ff', J: '#0044ff', L: '#ff6600', O: '#ffff33', S: '#00ff44', T: '#ff00cc', Z: '#ff0033' };
      } else if (themeName === 'neon') {
        global.currentColors = { I: '#00ffff', J: '#007bff', L: '#ff8800', O: '#ffff00', S: '#00ff00', T: '#ff00ff', Z: '#ff0033' };
      } else if (themeName === 'nuit') {
        global.currentColors = { I: '#ccc', J: '#ccc', L: '#ccc', O: '#ccc', S: '#ccc', T: '#ccc', Z: '#ccc' };
      } else {
        global.currentColors = { I: '#5cb85c', J: '#388e3c', L: '#7bb661', O: '#cddc39', S: '#a2d149', T: '#558b2f', Z: '#9ccc65' };
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

    function saveHistory() {
      history.push({
        board: board.map(row => row.map(cell => cell && typeof cell === 'object' ? { ...cell } : cell)),
        currentPiece: JSON.parse(JSON.stringify(currentPiece)),
        nextPiece: JSON.parse(JSON.stringify(nextPiece)),
        heldPiece: heldPiece ? JSON.parse(JSON.stringify(heldPiece)) : null,
        score, combo, linesCleared, dropInterval,
      });
      if (history.length > 7) history.shift();
    }

    async function getJetons() {
      return (await userData.getJetons?.()) ?? 0;
    }
    async function useJeton() {
      const solde = await getJetons();
      if (solde > 0) {
        await userData.addJetons(-1);
      }
    }

    function showFakeAd() {
      return new Promise(resolve => {
        const ad = document.createElement('div');
        ad.style = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;';
        ad.innerHTML = `<div>${t('ad.fake')}<br>${t('ad.wait')}</div>`;
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
      if (!sb) return;
      let field = (duelPlayerNum === 1) ? 'score1' : 'score2';
      await sb.from('duels').update({ [field]: myScore }).eq('id', duelId);
      let tries = 0, otherScore = null;
      while (tries++ < 40) {
        let { data } = await sb.from('duels').select('*').eq('id', duelId).single();
        if (duelPlayerNum === 1 && data?.score2 != null) { otherScore = data.score2; break; }
        if (duelPlayerNum === 2 && data?.score1 != null) { otherScore = data.score1; break; }
        await new Promise(r => setTimeout(r, 1500));
      }
      let msg = `
        <div style="font-weight:bold;">${tt('duel.finished','Duel terminé')}</div>
        <div>${tt('duel.yourscore','Votre score')} <b>${myScore}</b></div>
        <div>${tt('duel.opponentscore',"Score de l'adversaire")} <b>${otherScore != null ? otherScore : tt('duel.waiting','En attente…')}</b></div>
      `;
      let div = document.createElement('div');
      div.id = 'duel-popup';
      div.style = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2em;';
      div.innerHTML = `<div style="background:#23294a;padding:2em 2em 1em 2em;border-radius:1.2em;box-shadow:0 0 12px #39ff1477;text-align:center;">${msg}</div>`;
      document.body.appendChild(div);
    }
    // -------------------

    // =========================
    // AUTOSAVE / RESUME (LOCAL + CLOUD)
    // =========================
    const SAVE_KEY = `vblocks:autosave:${mode}:v2`; // par mode
    const SAVE_TTL_MS = 1000 * 60 * 60 * 48; // 48h
    const CAN_RESUME = (mode !== 'duel'); // Par équité, pas de reprise en duel

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
        ts: Date.now()
      };
    }
    function clearSavedGame() {
      try { localStorage.removeItem(SAVE_KEY); } catch (_e) {}
      // cloud aussi
      saveStateCloud(null).catch(()=>{});
    }
    function safeParse(json) {
      try { return JSON.parse(json); } catch { return null; }
    }

    function saveStateNowLocal() {
      if (!CAN_RESUME) return;
      try {
        const payload = { version: 2, ts: Date.now(), state: getSavableState() };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      } catch (_e) {}
    }
    async function saveStateCloud(stateOrNull) {
      // Optionnel : nécessite table vblocks_saves (user_id uuid, mode text, payload jsonb, updated_at timestamptz default now())
      if (!CAN_RESUME || !sb) return;
      const userId = getUserId();
      if (!userId) return;
      try {
        if (stateOrNull === null) {
          await sb.from('vblocks_saves').delete().eq('user_id', userId).eq('mode', mode);
        } else {
          const payload = { version: 2, ts: Date.now(), state: stateOrNull };
          await sb.from('vblocks_saves').upsert(
            { user_id: userId, mode, payload },
            { onConflict: 'user_id,mode' }
          );
        }
      } catch (_e) { /* silencieux */ }
    }
    async function loadSavedCloud() {
      if (!CAN_RESUME || !sb) return null;
      const userId = getUserId();
      if (!userId) return null;
      try {
        const { data, error } = await sb
          .from('vblocks_saves')
          .select('payload')
          .eq('user_id', userId)
          .eq('mode', mode)
          .maybeSingle();
        if (error || !data || !data.payload) return null;
        const p = data.payload;
        if ((Date.now() - (p.ts || p.state?.ts || 0)) > SAVE_TTL_MS) return null;
        return p.state || null;
      } catch (_e) { return null; }
    }
    function loadSavedLocal() {
      if (!CAN_RESUME) return null;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = safeParse(raw);
      if (!parsed || !parsed.state) return null;
      if ((Date.now() - (parsed.ts || parsed.state.ts || 0)) > SAVE_TTL_MS) {
        try { localStorage.removeItem(SAVE_KEY); } catch (_e) {}
        return null;
      }
      if (parsed.state.mode !== mode) return null;
      return parsed.state;
    }

    async function saveStateNow() {
      if (!CAN_RESUME) return;
      const state = getSavableState();
      saveStateNowLocal();
      await saveStateCloud(state).catch(()=>{});
    }

    let saveTimer = null;
    function scheduleSave() {
      if (!CAN_RESUME) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveStateNow, 300);
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

        if (s.theme && THEMES.includes(s.theme) && s.theme !== currentTheme) {
          changeTheme(s.theme);
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
      } catch (e) {
        console.warn('[resume] restore error', e);
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

    // Popup de reprise (avec i18n)
    function showResumePopup(savedState) {
      const overlay = document.createElement('div');
      overlay.id = 'resume-popup';
      overlay.style = `
        position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);
        display:flex;align-items:center;justify-content:center;
      `;
      const html = `
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
      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      overlay.querySelector('#resume-yes').onclick = () => {
        overlay.remove();
        restoreFromSave(savedState);
      };
      overlay.querySelector('#resume-restart').onclick = () => {
        clearSavedGame();
        overlay.remove();
        restartGameHard(); // nouveau restart propre
      };
    }

    // URL index pour "Quitter"
    const INDEX_URL = global.GAME_INDEX_URL || 'index.html';

    // === RESTART PROPRE GLOBAL (utile en cours de partie ou fin) ===
    function restartGameHard() {
      // stop timers
      stopSoftDrop();
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

      // UI
      const scoreEl = document.getElementById('score');
      if (scoreEl) scoreEl.textContent = '0';
      drawMiniPiece(nextCtx, null);
      drawMiniPiece(holdCtx, null);
      safeRedraw();

      clearSavedGame();

      // start new
      nextPiece = newPiece();
      reset();
      saveHistory();
      window.startMusicForGame?.();
      requestAnimationFrame(update);
    }
    // Expose facultatif si tu as un bouton "Recommencer" en HUD
    global.restartGameHard = restartGameHard;

    // Nouvelle popup de fin de partie (UNIQUEMENT recommencer/quitter)
    function showEndPopup(points) {
      paused = true;
      stopSoftDrop();
      safeRedraw();

      // on efface ttes sauvegardes → pas de "reprendre"
      clearSavedGame();

      (async function saveScoreAndRewards(points) {
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
      })(points);

      const old = document.getElementById('gameover-popup');
      if (old) old.remove();

      if (mode === 'duel') {
        handleDuelEnd(points);
        return;
      }

      const popup = document.createElement('div');
      popup.id = 'gameover-popup';
      popup.style = `
        position: fixed; left:0; top:0; width:100vw; height:100vh; z-index:99999;
        background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center;
      `;
      popup.innerHTML = `
        <div style="background:#23294a;border-radius:1em;padding:24px 16px;box-shadow:0 0 14px #3ff7;min-width:240px;max-width:92vw;text-align:center">
          <div style="font-size:1.2em;font-weight:bold;margin-bottom:10px;">
            <span>${tt('end.title','Partie terminée')}</span><br>
            <span>+${points} ${tt('end.points','points')}</span>
          </div>
          <div style="opacity:.9;margin-bottom:14px">
            ${tt('end.subtitle','Que voulez-vous faire ?')}
          </div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button id="end-restart" style="padding:.6em 1.1em;border-radius:.8em;border:none;background:#39f;color:#fff;cursor:pointer;">
              ${tt('end.restart','Recommencer')}
            </button>
            <button id="end-quit" style="padding:.6em 1.1em;border-radius:.8em;border:none;background:#444;color:#fff;cursor:pointer;">
              ${tt('end.quit','Quitter')}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(popup);

      document.getElementById('end-restart').onclick = function () {
        popup.remove();
        restartGameHard();
      };

      document.getElementById('end-quit').onclick = function () {
        window.location.href = INDEX_URL;
      };
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
      if (paused) stopSoftDrop();
      safeRedraw();
      if (!paused && !gameOver) requestAnimationFrame(update);
    }
    global.togglePause = togglePause;

    setTimeout(() => {
      let btn = document.getElementById('pause-btn');
      if (btn) btn.onclick = (e) => { e.preventDefault(); togglePause(); };
      // Si tu as un bouton "recommencer" en HUD
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

    function computeScore(lines) {
      let pts = 0;
      switch (lines) {
        case 1: pts = 10; break;
        case 2: pts = 30; break;
        case 3: pts = 50; break;
        case 4: pts = 80; break;
        default: pts = 0;
      }
      if (mode !== 'infinite' && combo > 1 && lines > 0) {
        pts += (combo - 1) * 5;
      }
      return pts;
    }

    async function startGame() {
      paused = false;
      gameOver = false;
      lastTime = 0;

      if (mode === 'duel') await setupDuelSequence();
      nextPiece = newPiece();
      reset();
      saveHistory();
      window.startMusicForGame?.();
      requestAnimationFrame(update);
    }

    function newPiece() {
      let typeId;
      if (mode === 'duel') typeId = getDuelNextPieceId();
      else typeId = Math.floor(Math.random() * PIECES.length);

      let shape = PIECES[typeId];
      let letter = LETTERS[typeId];
      let obj = {
        shape,
        letter,
        x: Math.floor((COLS - shape[0].length) / 2),
        y: 0
      };

      if (currentTheme === 'space' || currentTheme === 'vitraux') {
        let numbers = [1,2,3,4,5,6];
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
          if (val) {
            const x = currentPiece.x + dx;
            const y = currentPiece.y + dy;
            if (y >= 0) {
              if (currentTheme === 'space' || currentTheme === 'vitraux') {
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

    function rotatePiece() {
      const shape = currentPiece.shape;
      let oldVariants = null;
      if (currentTheme === 'space' || currentTheme === 'vitraux') oldVariants = currentPiece.variants;

      currentPiece.shape = shape[0].map((_, i) => shape.map(r => r[i])).reverse();
      if (currentTheme === 'space' || currentTheme === 'vitraux') {
        if (oldVariants && oldVariants[0]) {
          currentPiece.variants = oldVariants[0].map((_, i) => oldVariants.map(r => r[i])).reverse();
        }
      }

      if (collision()) {
        currentPiece.shape = shape;
        if (currentTheme === 'space' || currentTheme === 'vitraux') currentPiece.variants = oldVariants;
      } else {
        scheduleSave();
      }
    }

    function clonePiece(p) {
      return JSON.parse(JSON.stringify(p));
    }

    // === HOLD = échange instantané sans remonter, avec petits "kicks" anti-collision ===
    function tryApplyPieceAt(p, x, y) {
      const backup = { x: p.x, y: p.y };
      p.x = x; p.y = y;
      const ok = !collision(p);
      if (!ok) { p.x = backup.x; p.y = backup.y; }
      return ok;
    }
    function tryKickPlace(p, targetX, targetY) {
      // ordre de kicks: (0,0), (-1,0), (1,0), (0,-1), (-2,0), (2,0), (0,-2)
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

      // positions actuelles conservées
      const cx = currentPiece.x;
      const cy = currentPiece.y;
      const cshape = currentPiece.shape.map(r=>r.slice());
      const cvars  = currentPiece.variants ? currentPiece.variants.map(r=>r.slice()) : null;
      const clet   = currentPiece.letter;

      if (!heldPiece) {
        // on met la pièce courante en réserve, et on prend la prochaine SANS remonter
        heldPiece = clonePiece(currentPiece);
        currentPiece = clonePiece(nextPiece);
        nextPiece = newPiece();
      } else {
        // échange simple
        const tmp = clonePiece(currentPiece);
        currentPiece = clonePiece(heldPiece);
        heldPiece = tmp;
      }

      // garder position/orientation
      currentPiece.x = cx;
      currentPiece.y = cy;

      // petits kicks si collision immédiate
      if (collision(currentPiece)) {
        if (!tryKickPlace(currentPiece, cx, cy)) {
          // échange impossible → annuler proprement
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

      holdUsed = false; // illimité
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

    // === HARD DROP (descente instantanée jusqu'au fantôme) ===
    function hardDrop() {
      if (!currentPiece) return;
      const ghost = getGhostPiece();
      if (!ghost) return;
      currentPiece.y = ghost.y;
      stopSoftDrop(); // au cas où
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

      if ((currentTheme === 'space' || currentTheme === 'vitraux') && blockImages[currentTheme]) {
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
              (currentTheme === 'space' || currentTheme === 'vitraux') ? ghost.variants?.[dy]?.[dx] : 0
            );
          })
        );
      }

      board.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (!cell) return;
          if (currentTheme === 'space' || currentTheme === 'vitraux') {
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
              (currentTheme === 'space' || currentTheme === 'vitraux') ? currentPiece.variants?.[dy]?.[dx] : 0
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
            (currentTheme === 'space' || currentTheme === 'vitraux') ? piece.variants?.[y]?.[x] : 0
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
    const SOFT_DROP_INTERVAL = 45;   // (aligné) chute rapide sur maintien
    const HOLD_ACTIVATION_MS = 180;
    let mustLiftFingerForNextSoftDrop = false;

    // Verrou de geste pour éviter les glissements latéraux
    let gestureMode = 'none'; // 'none' | 'horizontal' | 'vertical'
    const HORIZ_THRESHOLD = 20; // (aligné) latéral plus vif
    const DEAD_ZONE = 10;
    const VERTICAL_LOCK_EARLY_MS = 140;

    // flags de swipe
    let didHardDrop = false;

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
      mustLiftFingerForNextSoftDrop = true; // anti “yo-yo”
    }

    function isQuickSwipeUp(elapsed, dy) {
      return (elapsed < 220) && (dy < -42);
    }
    function isQuickSwipeDown(elapsed, dy) {
      return (elapsed < 220) && (dy > 42);
    }

    let startX, startY, movedX, movedY, dragging = false, touchStartTime = 0;
    let holdToDropTimeout = null;

    canvas.addEventListener('touchstart', function (e) {
      if (gameOver) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      movedX = 0; movedY = 0;
      dragging = true;
      touchStartTime = Date.now();
      gestureMode = 'none';
      didHardDrop = false;

      clearTimeout(holdToDropTimeout);
      holdToDropTimeout = setTimeout(() => {
        if (dragging && !softDropActive) {
          gestureMode = 'vertical';  // lock vertical au moment du drop
          startSoftDrop();
        }
      }, HOLD_ACTIVATION_MS);
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      const t = e.touches[0];
      const now = Date.now();
      const elapsed = now - touchStartTime;

      movedX = t.clientX - startX;
      movedY = t.clientY - startY;

      // HARD DROP : flick down rapide → descente instantanée
      if (!softDropActive && isQuickSwipeDown(elapsed, movedY) && !didHardDrop) {
        didHardDrop = true;
        gestureMode = 'vertical';
        clearTimeout(holdToDropTimeout);
        hardDrop();
        dragging = false;
        return;
      }

      // si vertical ou soft-drop actif → ignorer horizontal
      if (gestureMode === 'vertical' || softDropActive || elapsed >= VERTICAL_LOCK_EARLY_MS) {
        gestureMode = 'vertical';
        if (!softDropActive && isQuickSwipeUp(elapsed, movedY)){
          rotatePiece();
          touchStartTime = now;
          startY = t.clientY;
        }
        clearTimeout(holdToDropTimeout);
        return;
      }

      // détection du mode horizontal
      if (gestureMode === 'none') {
        if (Math.abs(movedX) > Math.max(Math.abs(movedY), DEAD_ZONE) && Math.abs(movedX) > HORIZ_THRESHOLD) {
          gestureMode = 'horizontal';
          clearTimeout(holdToDropTimeout);
        }
      }

      // déplacements latéraux (seuil 20px)
      if (gestureMode === 'horizontal') {
        if (movedX > HORIZ_THRESHOLD)  { move(1);  startX = t.clientX; }
        if (movedX < -HORIZ_THRESHOLD) { move(-1); startX = t.clientX; }
        if (Math.abs(movedX) > 18) clearTimeout(holdToDropTimeout);
        return;
      }

      // rotation par swipe up rapide
      if (!softDropActive && isQuickSwipeUp(elapsed, movedY)) {
        rotatePiece();
        touchStartTime = now;
        startY = t.clientY;
      }

      // swipe bas non rapide : drop + éventuellement enclencher soft-drop
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

      if (softDropActive) {
        stopSoftDrop();
        mustLiftFingerForNextSoftDrop = false;
        gestureMode = 'none';
        return;
      }

      if (wasHard) {
        didHardDrop = false;
        gestureMode = 'none';
        return;
      }

      // tap court => rotation si pas de drop ni de glissé horizontal
      const pressDuration = Date.now() - touchStartTime;
      const isShortPress = pressDuration < 200;
      const hasDropped   = Math.abs(movedY) > 18;
      if (gestureMode !== 'horizontal' && isShortPress && !hasDropped && Math.abs(movedX) < 10) {
        rotatePiece();
      }

      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
    }, { passive: true });

    canvas.addEventListener('touchcancel', function () {
      dragging = false;
      clearTimeout(holdToDropTimeout);
      if (softDropActive) stopSoftDrop();
      mustLiftFingerForNextSoftDrop = false;
      gestureMode = 'none';
      didHardDrop = false;
    }, { passive: true });

    document.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
      if (gameOver || paused) return;
      switch (e.key) {
        case 'ArrowLeft':  move(-1);    break;
        case 'ArrowRight': move(1);     break;
        case 'ArrowDown':  dropPiece(); break;
        case 'ArrowUp':    rotatePiece(); break;
        case ' ':          hardDrop(); break; // hard-drop clavier
        case 'c': case 'C': holdPieceSwapStay();  break;
      }
    });

    window.addEventListener('blur', stopSoftDrop);

    // === SUPABASE Fonctions ===
    function getUserId() {
      if (typeof userData !== 'undefined' && userData.getUserId) return userData.getUserId();
      return (window.sbUser && window.sbUser.id) || null;
    }
    async function setLastScoreSupabase(score) {
      if (!sb) return;
      const userId = getUserId();
      if (!userId) return;
      await sb.from('users').update({ score }).eq('id', userId);
    }
    async function setHighScoreSupabase(score) {
      if (!sb) return;
      const userId = getUserId();
      if (!userId) return;
      await sb.from('users').update({ highscore: score }).eq('id', userId);
    }
    async function getHighScoreSupabase() {
      if (!sb) return 0;
      const userId = getUserId();
      if (!userId) return 0;
      const { data, error } = await sb.from('users').select('highscore').eq('id', userId).single();
      if (error) return 0;
      return data?.highscore || 0;
    }

    // ===== LANCEMENT avec reprise =====
    (async function boot() {
      if (CAN_RESUME) {
        // priorité au cloud (changement de téléphone) puis local
        const savedCloud = await loadSavedCloud();
        if (savedCloud) {
          paused = true;
          showResumePopup(savedCloud);
          return;
        }
        const savedLocal = loadSavedLocal();
        if (savedLocal) {
          paused = true;
          showResumePopup(savedLocal);
          return;
        }
      }
      startGame();
    })();
  }

  global.VBlocksGame = { initGame };
})(this);
