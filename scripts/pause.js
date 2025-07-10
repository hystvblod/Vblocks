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
  const music = document.getElementById("music");

  const themeButtons = document.querySelectorAll(".theme-select-button");

  if (!settingsButton || !settingsMenu || !themeButton || !closeSettingsButton || !backFromThemeButton || !themeStyle) {
    console.error("Un ou plusieurs éléments du DOM manquent !");
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
      if (newTheme && typeof changeTheme === 'function') {
        changeTheme(newTheme); // Appelle la fonction de changement de thème
        hideAllMenus();
      } else {
        console.error("Erreur : fonction changeTheme() non trouvée !");
      }
    });
  });

  function showSettingsMenu() {
    paused = true;
    if (music && !music.paused) music.pause();
    settingsMenu.style.display = "flex";
    themeMenu.style.display = "none";
  }

  function hideSettingsMenu() {
    paused = false;
    if (music && music.paused) music.play();
    settingsMenu.style.display = "none";
    themeMenu.style.display = "none";
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

  function hideAllMenus() {
    settingsMenu.style.display = "none";
    themeMenu.style.display = "none";
    paused = false;
    if (music && music.paused) music.play();
  }
});
