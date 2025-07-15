const THEMES = [
  { key: "bubble",     name: "Bubble",     locked: false },
  { key: "nature",     name: "Nature",     locked: false },
  { key: "nuit",       name: "Nuit",       locked: false },
  { key: "luxury",     name: "Luxury",     locked: true  },
  { key: "space",      name: "Space",      locked: true  },
  { key: "candy",      name: "Candy",      locked: true  },
  { key: "cyber",      name: "Cyber",      locked: true  },
  { key: "gothic",     name: "Gothic",     locked: true  },
  { key: "pixel",      name: "Pixel Art",  locked: true  },
  { key: "halloween",  name: "Halloween",  locked: true  }
];

let unlocked = JSON.parse(localStorage.getItem('unlockedThemes') || '["bubble","nature","nuit"]');
let current = localStorage.getItem('theme') || "bubble";

function unlockTheme(key) {
  if (!unlocked.includes(key)) {
    unlocked.push(key);
    localStorage.setItem('unlockedThemes', JSON.stringify(unlocked));
    renderThemes();
  }
}
function useTheme(key) {
  current = key;
  localStorage.setItem('theme', key);
  renderThemes();
  alert("Nouveau style activé : " + THEMES.find(t=>t.key===key).name);
}
function renderThemes() {
  const list = document.getElementById('themes-list');
  list.innerHTML = "";
  THEMES.forEach(theme => {
    const isUnlocked = unlocked.includes(theme.key);
    const card = document.createElement('div');
    card.className = 'theme-card' + (current === theme.key ? " selected" : "") + (isUnlocked ? "" : " locked");
    card.innerHTML = `
      <div class="theme-name">${theme.name}</div>
      <img class="theme-img" src="img/theme_${theme.key}.png" alt="" loading="lazy">
    `;
    if (isUnlocked) {
      card.innerHTML += (current === theme.key)
        ? `<button class="theme-btn selected" disabled>Sélectionné</button>`
        : `<button class="theme-btn" onclick="useTheme('${theme.key}')">Utiliser</button>`;
    } else {
      card.innerHTML += `<button class="theme-btn locked" onclick="unlockTheme('${theme.key}')">Débloquer</button>`;
    }
    list.appendChild(card);
  });
}
renderThemes();
