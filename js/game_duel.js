(function(global){
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
      }).catch(()=>{});
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
    if (isMusicAlwaysMuted() || music.paused) {
      btn.textContent = '🔇 Muet';
    } else {
      btn.textContent = '🎵 Musique';
    }
  }
  window.setMusicAlwaysMuted = function(val) {
    localStorage.setItem('alwaysMuteMusic', val ? 'true' : 'false');
    if (val) pauseMusic();
    refreshMusicBtn();
  }
  window.startMusicForGame = function() {
    if (!music) return;
    if (isMusicAlwaysMuted()) {
      pauseMusic();
      return;
    }
    music.currentTime = 0;
    playMusicAuto();
  }
  window.addEventListener("storage", (e) => {
    if (e.key === "alwaysMuteMusic") {
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
    if (btnMusic) {
      btnMusic.onclick = function() {
        if (isMusicAlwaysMuted()) return;
        if (music.paused) {
          music.play();
          btnMusic.textContent = '🎵 Musique';
        } else {
          music.pause();
          btnMusic.textContent = '🔇 Muet';
        }
      };
      refreshMusicBtn();
    }
  });
  // ==== FIN MUSIQUE ====

  // Fonction i18n de traduction
  function t(key, params) {
    if (window.i18nGet) {
      let str = window.i18nGet(key);
      if(params) Object.keys(params).forEach(k => {
        str = str.replace(`{${k}}`, params[k]);
      });
      return str;
    }
    if (window.I18N_MAP && window.I18N_MAP[key]) {
      let str = window.I18N_MAP[key];
      if(params) Object.keys(params).forEach(k => {
        str = str.replace(`{${k}}`, params[k]);
      });
      return str;
    }
    return key;
  }

  function initGame(opts){
    console.log("[initGame] opts=", opts);

    const mode = 'duel';
    const duelId = opts?.duelId || null;
    const duelPlayerNum = opts?.duelPlayerNum || 1;
    let piecesSequence = null;
    let piecesUsed = 0;

    let ghostPieceEnabled = localStorage.getItem('ghostPiece') !== 'false';
    global.toggleGhostPiece = function(enabled) {
      ghostPieceEnabled = !!enabled;
      localStorage.setItem('ghostPiece', ghostPieceEnabled ? 'true' : 'false');
      drawBoard();
    };

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const holdCanvas = document.getElementById('holdCanvas');
    const holdCtx = holdCanvas.getContext('2d');
    const nextCanvas = document.getElementById('nextCanvas');
    const nextCtx = nextCanvas.getContext('2d');
    const COLS = 10, ROWS = 20;
    let BLOCK_SIZE = 30;
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;

    const THEMES = ['nuit', 'neon', 'nature', 'bubble', 'retro', 'space', 'vitraux'];
    let currentTheme = localStorage.getItem('themeVBlocks') || 'neon';
    let currentThemeIndex = THEMES.indexOf(currentTheme);
    const blockImages = {};
    function loadBlockImages(themeName){
      const themesWithPNG = ['bubble','nature', "vitraux", "luxury", 'space', "angelique", "cyber"];
      if(themeName === 'space' || themeName === 'vitraux') {
        blockImages[themeName] = [];
        let imagesToLoad = 6, imagesLoaded = 0;
        for (let i=1; i<=6; i++) {
          const img = new Image();
          img.onload = () => {
            imagesLoaded++;
            if(imagesLoaded === imagesToLoad) drawBoard();
          };
          img.src = `themes/${themeName}/${i}.png`;
          blockImages[themeName].push(img);
        }
        ['I','J','L','O','S','T','Z'].forEach(l => {
          blockImages[l] = null;
        });
      } else {
        ['I','J','L','O','S','T','Z'].forEach(l => {
          if(themesWithPNG.includes(themeName)){
            const img = new Image();
            img.onload = () => { drawBoard(); };
            img.src = `themes/${themeName}/${l}.png`;
            blockImages[l] = img;
          }else{
            blockImages[l] = null;
          }
        });
      }
      currentTheme = themeName;
      if(themeName === 'retro'){
        global.currentColors = {I:'#00f0ff',J:'#0044ff',L:'#ff6600',O:'#ffff33',S:'#00ff44',T:'#ff00cc',Z:'#ff0033'};
      }else if(themeName === 'neon'){
        global.currentColors = {I:'#00ffff',J:'#007bff',L:'#ff8800',O:'#ffff00',S:'#00ff00',T:'#ff00ff',Z:'#ff0033'};
      }else if(themeName === 'nuit'){
        global.currentColors = {I:'#ccc',J:'#ccc',L:'#ccc',O:'#ccc',S:'#ccc',T:'#ccc',Z:'#ccc'};
      }else{
        global.currentColors = {I:'#5cb85c',J:'#388e3c',L:'#7bb661',O:'#cddc39',S:'#a2d149',T:'#558b2f',Z:'#9ccc65'};
      }
    }
    function changeTheme(themeName){
      document.body.setAttribute('data-theme', themeName);
      const style = document.getElementById('theme-style');
      if(style) style.href = `themes/${themeName}.css`;
      setTimeout(() => loadBlockImages(themeName), 100);
      currentThemeIndex = THEMES.indexOf(themeName);
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

    let board = Array.from({length: ROWS}, () => Array(COLS).fill(''));
    let currentPiece = null;
    let nextPiece = null;
    let heldPiece = null;
    let holdUsed = false;
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
        board: board.map(row => row.map(cell => cell && typeof cell === "object" ? {...cell} : cell)),
        currentPiece: JSON.parse(JSON.stringify(currentPiece)),
        nextPiece: JSON.parse(JSON.stringify(nextPiece)),
        heldPiece: heldPiece ? JSON.parse(JSON.stringify(heldPiece)) : null,
        score,
        combo,
        linesCleared,
        dropInterval,
      });
      if (history.length > 7) history.shift();
    }

    // ==== DUEL ONLY ==== //
    async function setupDuelSequence() {
      if (!duelId) return;
      let tries = 0, data = null;
      while (tries++ < 20) {
        let res = await sb.from('duels').select('*').eq('id', duelId).single();
        if (res?.data && res.data.pieces_seq) { data = res.data; break; }
        await new Promise(r=>setTimeout(r,1500));
      }
      if (!data) throw new Error(t("error.duel_not_found"));
      piecesSequence = data.pieces_seq.split(',').map(x=>parseInt(x));
      piecesUsed = 0;
      console.log("[setupDuelSequence] piecesSequence loaded:", piecesSequence);
    }
    function getDuelNextPieceId() {
      if (!piecesSequence) {
        const rnd = Math.floor(Math.random()*PIECES.length);
        console.log("[getDuelNextPieceId] Fallback rnd:", rnd);
        return rnd;
      }
      if (piecesUsed >= piecesSequence.length) {
        const rnd = Math.floor(Math.random()*PIECES.length);
        console.log("[getDuelNextPieceId] End of sequence, fallback:", rnd);
        return rnd;
      }
      console.log("[getDuelNextPieceId] From seq idx", piecesUsed, "->", piecesSequence[piecesUsed]);
      return piecesSequence[piecesUsed++];
    }
    async function handleDuelEnd(myScore) {
      let field = (duelPlayerNum === 1) ? "score1" : "score2";
      await sb.from('duels').update({ [field]: myScore }).eq('id', duelId);
      let tries = 0, otherScore = null;
      while(tries++ < 40) {
        let { data } = await sb.from('duels').select('*').eq('id', duelId).single();
        if (duelPlayerNum === 1 && data?.score2 != null) { otherScore = data.score2; break; }
        if (duelPlayerNum === 2 && data?.score1 != null) { otherScore = data.score1; break; }
        await new Promise(r=>setTimeout(r,1500));
      }
      let msg = `
        <div style="font-weight:bold;">${t("duel.finished")}</div>
        <div>${t("duel.yourscore")} <b>${myScore}</b></div>
        <div>${t("duel.opponentscore")} <b>${otherScore != null ? otherScore : t("duel.waiting")}</b></div>
      `;
      let div = document.createElement("div");
      div.id = "duel-popup";
      div.style = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2em;";
      div.innerHTML = `<div style="background:#23294a;padding:2em 2em 1em 2em;border-radius:1.2em;box-shadow:0 0 12px #39ff1477;text-align:center;">${msg}</div>`;
      document.body.appendChild(div);
    }
    // ==== FIN DUEL ==== //

    function showEndPopup(points) {
      paused = true;
      drawBoard();
      // DUEL -> handleDuelEnd SEUL
      handleDuelEnd(points);
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
      drawBoard();

      let countdown = 5;
      const overlay = document.createElement('div');
      overlay.id = "countdown-overlay";
      overlay.style = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);
        color:#fff;display:flex;align-items:center;justify-content:center;font-size:4em;z-index:99998;
      `;
      overlay.textContent = countdown;
      document.body.appendChild(overlay);
      let tmr = setInterval(()=>{
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
      },1000);
    }

    function togglePause() {
      paused = !paused;
      drawBoard();
      if (!paused && !gameOver) {
        requestAnimationFrame(update);
      }
    }
    global.togglePause = togglePause;

    setTimeout(()=>{
      let btn = document.getElementById('pause-btn');
      if(btn) btn.onclick = (e)=>{ e.preventDefault(); togglePause(); };
    }, 200);

    const SPEED_TABLE = [
      800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
       83,  83,  83,  67,  67,  67,  50,   50,  50,  33,
       33,  33,  33,  33,  33,  33,  33,  33,  17
    ];

    function computeScore(lines){
      let pts = 0;
      switch(lines){
        case 1: pts = 10; break;
        case 2: pts = 30; break;
        case 3: pts = 50; break;
        case 4: pts = 80; break;
        default: pts = 0;
      }
      if(combo > 1 && lines > 0) pts += (combo-1)*5;
      return pts;
    }

    async function startGame(){
      console.log("[startGame] called");
      await setupDuelSequence();
      console.log("[startGame] setupDuelSequence ok");
      nextPiece = newPiece();
      console.log("[startGame] nextPiece:", nextPiece);
      reset();
      console.log("[startGame] after reset: currentPiece=", currentPiece, "nextPiece=", nextPiece, "board=", board);
      saveHistory();
      window.startMusicForGame();
      requestAnimationFrame(update);
    }

    function newPiece(){
      let typeId = getDuelNextPieceId();
      if (isNaN(typeId) || typeId < 0 || typeId > 6) {
        console.warn("[newPiece] typeId invalid, fallback to 3", typeId);
        typeId = 3;
      }
      let shape = PIECES[typeId];
      let letter = LETTERS[typeId];
      let obj = {
        shape: shape,
        letter: letter,
        x: Math.floor((COLS - shape[0].length)/2),
        y: 0
      };
  if(currentTheme === 'space' || currentTheme === 'vitraux'){
  // Liste 1 à 6 mélangée
  let numbers = [1,2,3,4,5,6];
  for(let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  let idx = 0;
  obj.variants = shape.map(row => row.map(val => val ? numbers[idx++] : null));
}

      console.log("[newPiece] created:", obj);
      return obj;
    }

    function collision(p = currentPiece){
      if (!p) {
        console.warn("[collision] called with null piece!", p);
        return false;
      }
      return p.shape.some((row, dy) =>
        row.some((val, dx) => {
          if(!val) return false;
          const x = p.x + dx;
          const y = p.y + dy;
          return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
        })
      );
    }

    function merge(){
      console.log("[merge] currentPiece", currentPiece);
      currentPiece.shape.forEach((row, dy) =>
        row.forEach((val, dx) => {
          if(val){
            const x = currentPiece.x + dx;
            const y = currentPiece.y + dy;
            if(y >= 0){
              if(currentTheme === 'space' || currentTheme === 'vitraux'){
                board[y][x] = { letter: currentPiece.letter, variant: currentPiece.variants?.[dy]?.[dx] ?? 0 };
              } else {
                board[y][x] = currentPiece.letter;
              }
            }
          }
        })
      );
      clearLines();
    }

    function clearLines() {
      let lines = 0;
      board = board.filter(row => {
        if(row.every(cell => cell !== '')){ lines++; return false; }
        return true;
      });
      while(board.length < ROWS) board.unshift(Array(COLS).fill(''));
      if(lines > 0){
        if(window.vibrateIfEnabled) window.vibrateIfEnabled(lines >= 4 ? 200 : 70);
        combo++;
        linesCleared += lines;
        let pts = computeScore(lines, combo);
        score += pts;
        let level = Math.floor(linesCleared / 8);
        if (level >= SPEED_TABLE.length) level = SPEED_TABLE.length - 1;
        dropInterval = SPEED_TABLE[level];
        console.log("[clearLines] lines:", lines, "score:", score, "level:", level);
      } else {
        combo = 0;
      }
    }

    function move(offset){
      if (!currentPiece) { console.warn("[move] no currentPiece!"); return; }
      currentPiece.x += offset;
      if(collision()) currentPiece.x -= offset;
    }

    function dropPiece(){
      if (!currentPiece) { console.warn("[dropPiece] no currentPiece!"); return; }
      currentPiece.y++;
      if(collision()){
        currentPiece.y--;
        merge();
        saveHistory();
        reset();
        if(collision()){
          showEndPopup(score);
          gameOver = true;
        }
      }
    }

    function rotatePiece(){
      if (!currentPiece) { console.warn("[rotatePiece] no currentPiece!"); return; }
      const shape = currentPiece.shape;
      currentPiece.shape = shape[0].map((_,i)=>shape.map(r=>r[i])).reverse();
      if(currentTheme === 'space' || currentTheme === 'vitraux'){
        const old = currentPiece.variants;
        currentPiece.variants = old[0].map((_,i)=>old.map(r=>r[i])).reverse();
      }
      if(collision()) {
        currentPiece.shape = shape;
        if(currentTheme === 'space' || currentTheme === 'vitraux'){
          currentPiece.variants = old;
        }
      }
    }

    function holdPiece() {
      if (holdUsed) return;
      if (!heldPiece) {
        heldPiece = {...currentPiece};
        reset();
      } else {
        [heldPiece, currentPiece] = [{...currentPiece}, {...heldPiece}];
      }
      holdUsed = true;
      drawMiniPiece(holdCtx, heldPiece);
    }

    function getGhostPiece(){
      if(!ghostPieceEnabled) return null;
      let ghost = JSON.parse(JSON.stringify(currentPiece));
      let ct = 0;
      while(!collision(ghost) && ct < 30){ ghost.y++; ct++; }
      ghost.y--;
      return ghost;
    }

    function drawBlockCustom(c, x, y, letter, size=BLOCK_SIZE, ghost=false, variant=0){
      let img = blockImages[letter];
      const px = x*size, py = y*size;
      if(ghost){
        c.globalAlpha = 0.33;
      }
      if((currentTheme === 'space' || currentTheme === 'vitraux') && blockImages[currentTheme]) {
        let v = variant ?? 0;
        if (typeof letter === "object" && letter.letter) {
          v = letter.variant ?? 0;
          letter = letter.letter;
        }
        const arr = blockImages[currentTheme];
        img = arr[v % arr.length];
      }
      if(img && img.complete && img.naturalWidth > 0){
        c.drawImage(img, px, py, size, size);
      }else{
        if(currentTheme === 'nuit'){
          c.fillStyle = '#ccc';
          c.fillRect(px, py, size, size);
        }else if(currentTheme === 'neon'){
          const color = global.currentColors?.[letter] || '#fff';
          c.fillStyle = ghost ? '#111' : '#111';
          c.fillRect(px, py, size, size);
          c.shadowColor = color;
          c.shadowBlur = ghost ? 3 : 15;
          c.strokeStyle = color;
          c.lineWidth = 2;
          c.strokeRect(px+1, py+1, size-2, size-2);
          c.shadowBlur = 0;
        }else if(currentTheme === 'retro'){
          const color = global.currentColors?.[letter] || '#fff';
          c.fillStyle = color;
          c.fillRect(px, py, size, size);
          c.strokeStyle = '#000';
          c.lineWidth = 1;
          c.strokeRect(px, py, size, size);
        }else{
          const fb = global.currentColors?.[letter] || '#999';
          c.fillStyle = fb;
          c.fillRect(px, py, size, size);
          c.strokeStyle = '#333';
          c.strokeRect(px, py, size, size);
        }
      }
      if(ghost){
        c.globalAlpha = 1.0;
      }
    }

    function drawBoard(){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if (!currentPiece || !currentPiece.shape) {
        console.warn("[drawBoard] Rien à dessiner !", {currentPiece, board});
        return;
      }
      const ghost = getGhostPiece();
      if(ghost){
        ghost.shape.forEach((row,dy)=>
          row.forEach((val,dx)=>{
            if(val) drawBlockCustom(ctx,ghost.x+dx,ghost.y+dy,ghost.letter,BLOCK_SIZE,true,
              (currentTheme === 'space' || currentTheme === 'vitraux') ? ghost.variants?.[dy]?.[dx] : 0
            );
          })
        );
      }
      board.forEach((row,y)=>
        row.forEach((cell,x)=>{
          if(cell) {
            if(currentTheme === 'space' || currentTheme === 'vitraux'){
              drawBlockCustom(ctx,x,y,cell.letter||cell, BLOCK_SIZE, false, cell.variant||0);
            } else {
              drawBlockCustom(ctx,x,y,cell);
            }
          }
        })
      );
      // ==== SECONDE MODIF, SÉCURISATION ==== //
      if(currentPiece && currentPiece.shape){
        currentPiece.shape.forEach((row,dy)=>
          row.forEach((val,dx)=>{
            if(val) drawBlockCustom(ctx,currentPiece.x+dx,currentPiece.y+dy,currentPiece.letter,BLOCK_SIZE,false,
              (currentTheme === 'space' || currentTheme === 'vitraux') ? currentPiece.variants?.[dy]?.[dx] : 0
            );
          })
        );
      }
      console.log("[drawBoard] OK, currentPiece:", currentPiece, "board:", board);
    }

    function drawMiniPiece(c, piece) {
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
      if (!piece) return;
      const shape = piece.shape;
      let minX = 10, minY = 10, maxX = -10, maxY = -10;
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
        (c.canvas.width - 2 * PAD) / w,
        (c.canvas.height - 2 * PAD) / h
      );
      const offsetX = (c.canvas.width - (w * cellSize)) / 2 - minX * cellSize;
      const offsetY = (c.canvas.height - (h * cellSize)) / 2 - minY * cellSize;
      shape.forEach((row, y) => {
        row.forEach((val, x) => {
          if (val) {
            c.save();
            c.translate(offsetX, offsetY);
            drawBlockCustom(
              c,
              x,
              y,
              piece.letter,
              cellSize,
              false,
              (currentTheme === 'space' || currentTheme === 'vitraux') ? piece.variants?.[y]?.[x] : 0
            );
            c.restore();
          }
        });
      });
    }

    function reset(){
      currentPiece = nextPiece;
      nextPiece = newPiece();
      holdUsed = false;
      drawMiniPiece(nextCtx, nextPiece);
      drawMiniPiece(holdCtx, heldPiece);
      console.log("[reset] currentPiece=", currentPiece, "nextPiece=", nextPiece);
    }
    function update(now) {
      if (paused || gameOver) {
        //console.log("[update] Paused or game over, skip");
        return;
      }
      if (!lastTime) lastTime = now;
      const delta = now - lastTime;
      if (delta > dropInterval) {
        dropPiece();
        lastTime = now;
      }
      drawBoard();
      requestAnimationFrame(update);
    }

    document.addEventListener('DOMContentLoaded', ()=>{
      const btnTheme = document.getElementById('theme-btn');
      if(btnTheme){
        btnTheme.addEventListener('click', ()=>{
          currentThemeIndex = (currentThemeIndex+1)%THEMES.length;
          changeTheme(THEMES[currentThemeIndex]);
        });
      }
    });

    // --- TOUCH CONTROLS & CLAVIER
    let startX, startY, movedX, movedY, dragging = false, touchStartTime = 0;
    canvas.addEventListener('touchstart', function(e){
      if(gameOver) return;
      if(e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      movedX = movedY = 0;
      dragging = true;
      touchStartTime = Date.now();
    });
    canvas.addEventListener('touchmove', function(e){
      if(!dragging) return;
      const t = e.touches[0];
      movedX = t.clientX - startX;
      movedY = t.clientY - startY;
      if(Math.abs(movedX) > Math.abs(movedY)){
        if(movedX > 24){ move(1); startX = t.clientX; }
        if(movedX < -24){ move(-1); startX = t.clientX; }
      }else{
        if(movedY > 28){ dropPiece(); startY = t.clientY; }
        if(movedY < -28){ rotatePiece(); startY = t.clientY; }
      }
    });
    canvas.addEventListener('touchend', function(e){
      dragging = false;
      if(Math.abs(movedX) < 10 && Math.abs(movedY) < 10){
        rotatePiece();
      }
    });
    holdCanvas.addEventListener('touchstart', function(e){
      holdPiece();
    });
    holdCanvas.addEventListener('click', function(e){
      holdPiece();
    });
    document.addEventListener('keydown', e => {
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
      if(e.key==='p' || e.key==='P'){ togglePause(); return; }
      if(gameOver || paused) return;
      switch(e.key){
        case 'ArrowLeft': move(-1); break;
        case 'ArrowRight': move(1); break;
        case 'ArrowDown': dropPiece(); break;
        case 'ArrowUp': rotatePiece(); break;
        case 'c': case 'C': holdPiece(); break;
      }
    });

    // ==== LANCEMENT ====
    startGame();
  }

  global.VBlocksGame = { initGame };
})(this);
