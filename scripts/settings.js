const { whenReady } = typeof module !== 'undefined' && module.exports
  ? require('./utils')
  : window;

whenReady(function() {
  const settingsButton = document.getElementById("settings-button");
  const settingsMenu = document.getElementById("settings-menu");
  const themeMenu = document.getElementById("theme-menu");

  const muteButton = document.getElementById("mute-button");
  const themeButton = document.getElementById("theme-button");
  const closeSettingsButton = document.getElementById("close-settings-button");
  const backFromThemeButton = document.getElementById("back-theme-button");
  const themeStyle = document.getElementById("theme-style");
  const themeButtons = document.querySelectorAll(".theme-select-button");
  const music = document.getElementById("music");

  if (!settingsButton || !settingsMenu || !themeMenu || !muteButton || !themeButton || !closeSettingsButton || !backFromThemeButton || !themeStyle) {
    console.error("Un ou plusieurs éléments du DOM sont introuvables !");
    return;
  }

  settingsButton.addEventListener("click", showSettingsMenu);
  muteButton.addEventListener("click", toggleMusic);
  themeButton.addEventListener("click", showThemeMenu);
  closeSettingsButton.addEventListener("click", hideSettingsMenu);
  backFromThemeButton.addEventListener("click", backToSettings);

  themeButtons.forEach(button => {
    button.addEventListener("click", function() {
      const newTheme = this.getAttribute("data-theme");
      if (newTheme) {
        themeStyle.setAttribute("href", `../themes/${newTheme}.css`);
        loadBlockImages(newTheme);
        drawBoard();
      }
      backToSettings(); // Revenir au menu paramètres
    });
  });

  function showSettingsMenu() {
    paused = true;
    if (music && !music.paused) music.pause();
    settingsMenu.style.display = "flex";
    themeMenu.style.display = "none";
  }

  function hideSettingsMenu() {
    settingsMenu.style.display = "none";
    themeMenu.style.display = "none";
    paused = false; // LE JEU REDÉMARRE seulement ici
    if (!gameOver) {
      requestAnimationFrame(update);
    }
    if (music && music.paused) music.play();
  }

  function toggleMusic() {
    if (!music) return;
    if (music.paused) {
      music.play();
      muteButton.textContent = "Mute Musique";
    } else {
      music.pause();
      muteButton.textContent = "Unmute Musique";
    }
  }

  function showThemeMenu() {
    settingsMenu.style.display = "none";
    themeMenu.style.display = "flex";
  }

  function backToSettings() {
    themeMenu.style.display = "none";
    settingsMenu.style.display = "flex";
  }
});
