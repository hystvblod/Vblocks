(function(global){
  'use strict';

  let highscoreCloud = 0; // Record cloud global

  function initGame(opts){
    const mode = (opts && opts.mode) || 'classic'; // 'classic', 'infini', 'duel'
    // Pour le DUEL
    const duelId = opts?.duelId || null;
    const duelPlayerNum = opts?.duelPlayerNum || 1; // 1 ou 2
    let piecesSequence = null;
    let piecesUsed = 0;

    // --- OPTION : pièce fantôme activée (par défaut true)
    let ghostPieceEnabled = localStorage.getItem('ghostPiece') !== 'false';
    global.toggleGhostPiece = function(enabled) {
      ghostPieceEnabled = !!enabled;
      localStorage.setItem('ghostPiece', ghostPieceEnabled ? 'true' : 'false');
      drawBoard();
    };

    //--- SETUP CANVAS ---
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

    // --- THEMES ---
    const THEMES = ['nuit', 'neon', 'nature', 'bubble', 'retro', 'space'];
    let currentTheme = localStorage.getItem('themeVBlocks') || 'neon';
    let currentThemeIndex = THEMES.indexOf(currentTheme);
    const blockImages = {};
function loadBlockImages(themeName){
  const themesWithPNG = ['bubble','nature', "vitraux", "luxury", 'space', "candy"];
  let imagesToLoad = 0, imagesLoaded = 0;

  ['I','J','L','O','S','T','Z'].forEach(l => {
    if(themesWithPNG.includes(themeName)){
      imagesToLoad++;
      const img = new Image();
      img.onload = () => {
        imagesLoaded++;
        // Quand TOUTES les images sont chargées, on redessine la pièce suivante
        if(imagesLoaded === imagesToLoad) {
          if(typeof drawMiniPiece === "function") {
            drawMiniPiece(nextCtx, nextPiece);
          }
        }
        drawBoard(); // Si besoin, pour la grille
      };
      img.src = `themes/${themeName}/${l}.png`;
      blockImages[l] = img;
    }else{
      blockImages[l] = null;
    }
  });
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

    // === HISTORIQUE POUR REWIND ===
    let history = [];
    function saveHistory() {
      history.push({
        board: board.map(row => row.slice()),
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

    // --- POPUP/REWIND ---
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
        ad.style = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;";
        ad.innerHTML = "<div>Publicité...<br>Attends 3 secondes</div>";
        document.body.appendChild(ad);
        setTimeout(()=>{ad.remove();resolve();},3000);
      });
    }

    // ----- DUEL --------
    async function setupDuelSequence() {
      // player1: la séquence existe déjà (crée avant lancement) !
      // player2: attends que player1 ait push la séquence
      if (!duelId) return;
      let tries = 0, data = null;
      while (tries++ < 20) {
        let res = await sb.from('duels').select('*').eq('id', duelId).single();
        if (res?.data && res.data.pieces_seq) { data = res.data; break; }
        await new Promise(r=>setTimeout(r,1500));
      }
      if (!data) throw new Error("Duel introuvable ou séquence absente.");
      piecesSequence = data.pieces_seq.split(',').map(x=>parseInt(x));
      piecesUsed = 0;
    }

    function getDuelNextPieceId() {
      if (!piecesSequence) return Math.floor(Math.random()*PIECES.length);
      if (piecesUsed >= piecesSequence.length) return Math.floor(Math.random()*PIECES.length);
      return piecesSequence[piecesUsed++];
    }

    // FIN JEU DUEL
    async function handleDuelEnd(myScore) {
      let field = (duelPlayerNum === 1) ? "score1" : "score2";
      await sb.from('duels').update({ [field]: myScore }).eq('id', duelId);
      // Attend le score adverse
      let tries = 0, otherScore = null;
      while(tries++ < 40) {
        let { data } = await sb.from('duels').select('*').eq('id', duelId).single();
        if (duelPlayerNum === 1 && data?.score2 != null) { otherScore = data.score2; break; }
        if (duelPlayerNum === 2 && data?.score1 != null) { otherScore = data.score1; break; }
        await new Promise(r=>setTimeout(r,1500));
      }
      let msg = `<div style="font-weight:bold;">DUEL TERMINÉ !</div>
      <div>Ton score : <b>${myScore}</b></div>
      <div>Score adverse : <b>${otherScore != null ? otherScore : "En attente..."}</b></div>
      <button onclick="location.reload()">Rejouer</button>`;
      let div = document.createElement("div");
      div.id = "duel-popup";
      div.style = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2em;";
      div.innerHTML = `<div style="background:#23294a;padding:2em 2em 1em 2em;border-radius:1.2em;box-shadow:0 0 12px #39ff1477;text-align:center;">${msg}</div>`;
      document.body.appendChild(div);
    }
    // -------------------

    function showEndPopup(points) {
      paused = true;
      drawBoard();

      (async function saveScoreAndRewards(points) {
        try {
          // Score cloud
          await setLastScoreSupabase(points);

          // Highscore cloud : check, set only if better
          const cloudHigh = await getHighScoreSupabase();
          if (points > cloudHigh) {
            await setHighScoreSupabase(points);
            highscoreCloud = points;
            updateHighscoreDisplay();
          }
          // Ajout VCoins (bonus supabase)
          await userData.addVCoins?.(points);
          updateBalancesHeader();
        } catch (err) {
          alert("Erreur lors de la sauvegarde du score ou des VCoins !");
          console.error(err);
        }
      })(points);

      // Popup UI
      const old = document.getElementById('gameover-popup');
      if (old) old.remove();

      // Ajoute gestion DUEL ici !
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
        <div style="background:#23294a;border-radius:1em;padding:24px 16px;box-shadow:0 0 14px #3ff7;min-width:220px">
          <div style="font-size:1.2em;font-weight:bold;margin-bottom:10px;">
            <span>Partie terminée !</span><br>
            <span>+${points} points gagnés !</span>
          </div>
          <div style="margin-bottom:10px">
            <span>Solde jetons : <b id="solde-jetons-popup">…</b></span>
          </div>
          <button id="popup-jeton">Utiliser 1 jeton pour reprendre</button><br>
          <button id="popup-pub" style="margin-top:8px">Regarder une pub pour reprendre</button><br>
          <button id="popup-stop" style="margin-top:16px">Quitter</button>
        </div>
      `;
      document.body.appendChild(popup);
      getJetons().then(solde=>{
        document.getElementById("solde-jetons-popup").textContent = solde;
        document.getElementById("popup-jeton").disabled = (solde<=0);
      });

      document.getElementById('popup-jeton').onclick = async function() {
        await useJeton();
        removePopup();
        rewind();
      };
      document.getElementById('popup-pub').onclick = function() {
        showFakeAd().then(()=>{
          removePopup();
          rewind();
        });
      };
      document.getElementById('popup-stop').onclick = function() {
        removePopup();
        window.location.reload();
      };
      function removePopup() {
        popup.remove();
        paused = false;
        gameOver = false;
      }
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
      let t = setInterval(()=>{
        countdown--;
        overlay.textContent = countdown;
        if (countdown <= 0) {
          clearInterval(t);
          overlay.remove();
          paused = false;
          gameOver = false;
          lastTime = performance.now();
          requestAnimationFrame(update);
        }
      },1000);
    }

    // Pause (SVG bouton et touche P)
    function togglePause() {
      paused = !paused;
      drawBoard();
      if (!paused && !gameOver) {
        requestAnimationFrame(update);
      }
    }
    global.togglePause = togglePause;

    // Ecoute le bouton pause
    setTimeout(()=>{
      let btn = document.getElementById('pause-btn');
      if(btn) btn.onclick = (e)=>{ e.preventDefault(); togglePause(); };
    }, 200);

    // ---- TABLE NES ----
    const SPEED_TABLE = [
      800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
       83,  83,  83,  67,  67,  67,  50,  50,  50,  33,
       33,  33,  33,  33,  33,  33,  33,  33,  17
    ];

    const scoreEl = document.getElementById('score');
    const highEl = document.getElementById('highscore');
    if(scoreEl) scoreEl.textContent = '0';
    if(highEl) highEl.textContent = '0';

    // Affiche le record dynamique en temps réel (cloud)
    async function updateHighscoreDisplay(){
      highscoreCloud = await userData.getHighScore?.() ?? 0;
      if(highEl) highEl.textContent = highscoreCloud;
    }
    document.addEventListener('DOMContentLoaded', updateHighscoreDisplay);

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
      // DUEL : setup la séquence AVANT de démarrer
      if (mode === 'duel') await setupDuelSequence();
      nextPiece = newPiece();
      reset();
      saveHistory();
      requestAnimationFrame(update);
    }

    function newPiece(){
      let typeId;
      if(mode === 'duel') {
        typeId = getDuelNextPieceId();
      } else {
        typeId = Math.floor(Math.random()*PIECES.length);
      }
      return {
        shape: PIECES[typeId],
        letter: LETTERS[typeId],
        x: Math.floor((COLS - PIECES[typeId][0].length)/2),
        y: 0
      };
    }

    function collision(p = currentPiece){
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
      currentPiece.shape.forEach((row, dy) =>
        row.forEach((val, dx) => {
          if(val){
            const x = currentPiece.x + dx;
            const y = currentPiece.y + dy;
            if(y >= 0) board[y][x] = currentPiece.letter;
          }
        })
      );
      clearLines();
    }

    function clearLines(){
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
        if(scoreEl) scoreEl.textContent = score;

        // Record cloud
        if (score > highscoreCloud) {
          highscoreCloud = score;
          if (highEl) highEl.textContent = highscoreCloud;
          if (userData.setHighScore) {
            userData.setHighScore(score).then(() => {
              if (window.updateHighScoreDisplay) window.updateHighScoreDisplay();
            });
          }
        }

        // --- Gestion des vitesses ---
        if(mode === 'classic' || mode === 'duel') {
          let level = Math.floor(linesCleared / 10);
          if (level >= SPEED_TABLE.length) level = SPEED_TABLE.length - 1;
          if (mode === 'classic') dropInterval = SPEED_TABLE[level];
          // En duel : tu veux la même progression, sinon retire la ligne ci-dessus
        }
        // En mode "infini", on NE TOUCHE JAMAIS à dropInterval (vitesse reste constante)
      }else{
        combo = 0;
      }
    }

    function move(offset){
      currentPiece.x += offset;
      if(collision()) currentPiece.x -= offset;
    }

    function dropPiece(){
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
      const shape = currentPiece.shape;
      currentPiece.shape = shape[0].map((_,i)=>shape.map(r=>r[i])).reverse();
      if(collision()) currentPiece.shape = shape;
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

    // --- GHOST PIECE ---
    function getGhostPiece(){
      if(!ghostPieceEnabled) return null;
      let ghost = JSON.parse(JSON.stringify(currentPiece));
      while(!collision(ghost)){ ghost.y++; }
      ghost.y--;
      return ghost;
    }

    function drawBlockCustom(c, x, y, letter, size=BLOCK_SIZE, ghost=false){
      const img = blockImages[letter];
      const px = x*size, py = y*size;
      if(ghost){
        c.globalAlpha = 0.33;
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

      // --- GHOST PIECE
      const ghost = getGhostPiece();
      if(ghost){
        ghost.shape.forEach((row,dy)=>
          row.forEach((val,dx)=>{ if(val) drawBlockCustom(ctx,ghost.x+dx,ghost.y+dy,ghost.letter,BLOCK_SIZE,true); })
        );
      }
      // --- Board
      board.forEach((row,y)=>
        row.forEach((letter,x)=>{ if(letter) drawBlockCustom(ctx,x,y,letter); })
      );
      // --- Current piece
      currentPiece.shape.forEach((row,dy)=>
        row.forEach((val,dx)=>{ if(val) drawBlockCustom(ctx,currentPiece.x+dx,currentPiece.y+dy,currentPiece.letter); })
      );
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
              cellSize
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
    }
function update(now) {
  if (paused || gameOver) return;
  if (!lastTime) lastTime = now;
  const delta = now - lastTime;
  if (delta > dropInterval) {
    dropPiece();
    lastTime = now;
  }
  drawBoard();
  requestAnimationFrame(update);
}
    // HEADER : vcoins + jetons
    async function updateBalancesHeader(){
      const vcoins = await userData.getVCoins?.();
      const jetons = await userData.getJetons?.();
      if(document.getElementById('vcoin-amount')) document.getElementById('vcoin-amount').textContent = (vcoins ?? '--');
      if(document.getElementById('jeton-amount')) document.getElementById('jeton-amount').textContent = (jetons ?? '--');
    }

    document.addEventListener('DOMContentLoaded', ()=>{
      const btnTheme = document.getElementById('theme-btn');
      const btnMusic = document.getElementById('music-btn');
      if(btnTheme){
        btnTheme.addEventListener('click', ()=>{
          currentThemeIndex = (currentThemeIndex+1)%THEMES.length;
          changeTheme(THEMES[currentThemeIndex]);
        });
      }
      if(btnMusic){
        btnMusic.addEventListener('click', ()=>{
          const music = document.getElementById('music');
          if(!music) return;
          if(music.paused){ music.play(); btnMusic.textContent='\ud83d\udd0a Musique'; }
          else{ music.pause(); btnMusic.textContent='\ud83d\udd07 Muet'; }
        });
      }
      updateBalancesHeader();
      updateHighscoreDisplay();
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
      // Swipe gauche/droite
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

    // Fonctions SUPABASE (doivent être dispo globalement, ex via userData.js)
    async function setLastScoreSupabase(score) {
      const userId = getUserId();
      await sb.from('users').update({ score }).eq('id', userId);
    }
    async function setHighScoreSupabase(score) {
      const userId = getUserId();
      await sb.from('users').update({ highscore: score }).eq('id', userId);
    }
    async function getHighScoreSupabase() {
      const userId = getUserId();
      const { data, error } = await sb.from('users').select('highscore').eq('id', userId).single();
      if (error) return 0;
      return data?.highscore || 0;
    }

    // Lancement auto
    startGame();
  }

  global.VBlocksGame = { initGame };
})(this);
