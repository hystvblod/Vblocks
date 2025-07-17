(function(global){
  'use strict';

  function initGame(opts){
    const mode = (opts && opts.mode) || 'classic';

    // --- OPTION : pièce fantôme activée (par défaut true)
    let ghostPieceEnabled = localStorage.getItem('ghostPiece') !== 'false'; // true si null ou 'true'
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

    //--- RESPONSIVE ---
    function resizeCanvas(){
      const top = document.querySelector('h1')?.offsetHeight || 0;
      const scoreEl = document.getElementById('score')?.offsetHeight || 0;
      const highscoreEl = document.getElementById('highscore')?.offsetHeight || 0;
      const buttons = document.getElementById('controls')?.offsetHeight || 0;
      const options = document.getElementById('options')?.offsetHeight || 0;
      const reserved = top + scoreEl + highscoreEl + buttons + options + 80;
      const availableHeight = window.innerHeight - reserved;
      const availableWidth = window.innerWidth * 0.9;
      const blockW = Math.floor(availableWidth / COLS);
      const blockH = Math.floor(availableHeight / ROWS);
      BLOCK_SIZE = Math.min(blockW, blockH, 30);
      canvas.width = COLS * BLOCK_SIZE;
      canvas.height = ROWS * BLOCK_SIZE;
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
      drawBoard();
    }
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('load', resizeCanvas);

    // --- THEMES (identique à avant) ---
    const THEMES = ['nuit', 'neon', 'nature', 'bubble', 'retro'];
    let currentTheme = localStorage.getItem('themeVBlocks') || 'neon';
    let currentThemeIndex = THEMES.indexOf(currentTheme);
    const blockImages = {};
    function loadBlockImages(themeName){
      const themesWithPNG = ['bubble','nature', "vitraux"];
      ['I','J','L','O','S','T','Z'].forEach(l => {
        if(themesWithPNG.includes(themeName)){
          const img = new Image();
          img.onload = () => drawBoard();
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

    // --- JEU ---
    let board = Array.from({length: ROWS}, () => Array(COLS).fill(''));
    let currentPiece, nextPiece, heldPiece = null;
    let holdUsed = false;
    let score = 0;
    let highscore = Number(localStorage.getItem('vblocks_highscore') || 0);
    let dropInterval = 500;
    let lastTime = 0;
    let gameOver = false;
    let paused = false;
    let combo = 0;
    let linesCleared = 0;
    let nextLevel = 10;

    const scoreEl = document.getElementById('score');
    const highEl = document.getElementById('highscore');
    if(scoreEl) scoreEl.textContent = '0';
    if(highEl) highEl.textContent = highscore;

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

    function updateBestScore(){
      let best = localStorage.getItem('vblocks_best_score');
      if(!best || score > best){
        localStorage.setItem('vblocks_best_score', score);
      }
    }

    function computeScore(lines){
      let pts = 0;
      switch(lines){
        case 1: pts = 10; break;
        case 2: pts = 30; break;
        case 3: pts = 50; break;
        case 4: pts = 80; break;
        default: pts = 0;
      }
      if(mode !== 'challenge' && combo > 1 && lines > 0) pts += (combo-1)*5;
      return pts;
    }

    function addBoutiquePoints(pts){
      let old = Number(localStorage.getItem('vblocks_boutique_points') || 0);
      localStorage.setItem('vblocks_boutique_points', old + pts);
    }

    function newPiece(){
      const typeId = Math.floor(Math.random()*PIECES.length);
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
        combo++;
        linesCleared += lines;
        let pts = computeScore(lines, combo);
        score += pts;
        addBoutiquePoints(pts);
        if(scoreEl) scoreEl.textContent = score;
        if(score > highscore){
          highscore = score;
          localStorage.setItem('vblocks_highscore', highscore);
          if(highEl) highEl.textContent = highscore;
        }
        updateBestScore();
        if(mode === 'classic' && linesCleared >= nextLevel){
          dropInterval = Math.max(100, dropInterval - 50);
          nextLevel += 10;
        }
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
        reset();
        if(collision()){
          if(mode === 'challenge') endChallenge(false); else alert('\uD83C\uDFAE Game Over !');
          gameOver = true;
        }
      }
    }

    function rotatePiece(){
      const shape = currentPiece.shape;
      currentPiece.shape = shape[0].map((_,i)=>shape.map(r=>r[i])).reverse();
      if(collision()) currentPiece.shape = shape;
    }

    function holdPiece(){
      if(holdUsed) return;
      if(!heldPiece){
        heldPiece = {...currentPiece};
        reset();
      }else{
        [heldPiece, currentPiece] = [{...currentPiece},{...heldPiece}];
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

    function drawMiniPiece(c, piece, size=20){
      c.clearRect(0,0,120,120);
      if(!piece) return;
      const shape = piece.shape;
      const w = shape[0].length; const h = shape.length;
      const offsetX = (120 - w*size)/2;
      const offsetY = (120 - h*size)/2;
      shape.forEach((row,y)=>
        row.forEach((val,x)=>{ if(val){
          const px = offsetX + x*size; const py = offsetY + y*size;
          const color = global.currentColors?.[piece.letter] || '#999';
          c.fillStyle = color;
          c.fillRect(px,py,size,size);
          c.strokeStyle = '#333';
          c.strokeRect(px,py,size,size);
        }})
      );
    }

    function reset(){
      currentPiece = nextPiece || newPiece();
      nextPiece = newPiece();
      holdUsed = false;
      drawMiniPiece(nextCtx, nextPiece);
    }

    // === Challenge mode specifics ===
    const CHALLENGE_LIST = [
      { num:1,type:'lines',goal:2,time:25 },
      { num:2,type:'lines',goal:3,time:28 },
      { num:3,type:'lines',goal:4,time:30 }
    ];
    let totalLines = 0;
    let challengeIndex = 0;
    let challengeStartLines = 0;
    let challengeStartScore = 0;
    let challengeTimer = 0;
    let timerInterval = null;
    let challengeRunning = false;

    function showChallenge(){
      const defi = CHALLENGE_LIST[challengeIndex];
      const numEl = document.getElementById('challenge-num');
      const defEl = document.getElementById('challenge-defi');
      const timEl = document.getElementById('challenge-timer');
      if(!defi || !numEl || !defEl || !timEl) return;
      numEl.textContent = defi.num;
      defEl.textContent = defi.type === 'lines'
        ? `Fais ${defi.goal} lignes en ${defi.time}s`
        : `Marque ${defi.goal} points en ${defi.time}s`;
      timEl.textContent = defi.time + 's';
    }

    function startChallenge(){
      const defi = CHALLENGE_LIST[challengeIndex];
      challengeStartLines = totalLines;
      challengeStartScore = score;
      challengeTimer = defi.time;
      challengeRunning = true;
      const timEl = document.getElementById('challenge-timer');
      if(timEl) timEl.textContent = challengeTimer + 's';
      timerInterval = setInterval(()=>{
        challengeTimer--;
        if(timEl) timEl.textContent = challengeTimer + 's';
        if(challengeTimer <= 0) endChallenge(false);
      },1000);
    }

    function checkChallenge(){
      if(!challengeRunning) return;
      const defi = CHALLENGE_LIST[challengeIndex];
      if(defi.type==='lines' && (totalLines-challengeStartLines)>=defi.goal) endChallenge(true);
      if(defi.type==='points' && (score-challengeStartScore)>=defi.goal) endChallenge(true);
    }

    function endChallenge(success){
      clearInterval(timerInterval);
      challengeRunning = false;
      alert(success ? 'Bravo, d\u00e9fi r\u00e9ussi !' : 'Temps \u00e9coul\u00e9 ou objectif non atteint.');
      window.location.reload();
    }

    function newTurn(){
      currentPiece = nextPiece;
      nextPiece = newPiece();
      holdUsed = false;
    }

    function endGame(){
      endChallenge(false);
    }

    // --- TOUCH CONTROLS ---
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
        if(movedX > 24){ move(1); startX = t.clientX; }  // Droite
        if(movedX < -24){ move(-1); startX = t.clientX; } // Gauche
      }else{
        if(movedY > 28){ dropPiece(); startY = t.clientY; } // Bas
        if(movedY < -28){ rotatePiece(); startY = t.clientY; } // Haut
      }
    });
    canvas.addEventListener('touchend', function(e){
      dragging = false;
      // Tap court (taper pour pivoter)
      if(Math.abs(movedX) < 10 && Math.abs(movedY) < 10){
        rotatePiece();
      }
    });

    // Tap sur l'encadré "Réserve" = HOLD
    holdCanvas.addEventListener('touchstart', function(e){
      holdPiece();
    });
    holdCanvas.addEventListener('click', function(e){
      holdPiece();
    });

    // --- CONTROLES CLAVIER ---
    document.addEventListener('keydown', e => {
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
      if(e.key==='p' || e.key==='P'){ paused = !paused; if(!paused) update(); drawBoard(); return; }
      if(gameOver || paused) return;
      switch(e.key){
        case 'ArrowLeft': move(-1); break;
        case 'ArrowRight': move(1); break;
        case 'ArrowDown': dropPiece(); break;
        case 'ArrowUp': rotatePiece(); break;
        case 'c': case 'C': holdPiece(); break;
        case ' ': if(mode==='challenge' && !challengeRunning) startChallenge(); break;
      }
    });

    nextPiece = newPiece();
    reset();

    function update(time=0){
      if(gameOver || paused) return;
      const delta = time - lastTime;
      if(delta > dropInterval){
        dropPiece();
        lastTime = time;
      }
      drawBoard();
      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);

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
      if(mode==='challenge') showChallenge();
    });
  }

  global.VBlocksGame = { initGame };
})(this);
