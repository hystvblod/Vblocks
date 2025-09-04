/* ===========================
   boutique.js (IAP + UI boutique) — version sécurisée & alignée
   =========================== */

// --- Helper i18n universel
function t(key) {
  if (typeof window.i18nGet === 'function') {
    const v = window.i18nGet(key);
    return v && v !== key ? v : key;
  }
  if (window.i18n && window.i18n[key]) return window.i18n[key];
  return key;
}

// --- Normalisation clés
function normalizeThemeKey(k){
  return String(k || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'');
}

// --- Liste des thèmes/cadres possibles (noms optionnels pour fallback)
const THEMES = [
  { key: "bubble",     name: "Bubble" },
  { key: "nature",     name: "Nature" },
  { key: "nuit",       name: "Nuit" },
  { key: "luxury",     name: "Luxury" },
  { key: "space",      name: "Space" },
  { key: "angelique",  name: "Angélique" },
  { key: "cyber",      name: "Cyber" },
  { key: "vitraux",    name: "Vitraux" },
  { key: "retro",      name: "Rétro" },
  { key: "grece",      name: "Grèce" },
  { key: "japon",      name: "Japon" },
  { key: "arabic",     name: "Arabic" },
  { key: "neon",       name: "Neon" }
];

// Prix d’un thème (VCoins)
const THEME_PRICE = 5000;

/* ===========================
   Produits IAP (unifiés)
   =========================== */
const PRODUCT_IDS = (window.PRODUCT_IDS = window.PRODUCT_IDS || {
  points3000:  'points3000',
  points10000: 'points10000',
  jetons12:    'jetons12',
  jetons50:    'jetons50',
  nopub:       'nopub'
});

// Mémo des prix localisés
const PRICES_BY_ALIAS = (window.PRICES_BY_ALIAS = window.PRICES_BY_ALIAS || {});
// { alias: { price: "€0,99", currency: "EUR", micros: 990000 } }

/* ===========================
   Auth centralisée (pas de signInAnonymously ici)
   =========================== */
async function ensureAuthSafe() {
  try {
    if (typeof window.bootstrapAuthAndProfile === 'function') {
      await window.bootstrapAuthAndProfile(); // lock interne
    }
  } catch (_) {}
}

/* ===========================
   SUPABASE — Accès SÉCURISÉ (RPC)
   =========================== */

async function __getBalances() {
  await ensureAuthSafe();
  const sb = window.sb;
  const { data, error } = await sb.rpc('get_balances');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {};
}

// VCoins & Jetons
async function getVCoinsSupabase() {
  const b = await __getBalances();
  return b?.vcoins ?? 0;
}
async function addVCoinsSupabase(amount) {
  await ensureAuthSafe();
  const delta = Number(amount) || 0;
  const { error } = await window.sb.rpc('ajouter_vcoins', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.vcoins ?? 0;
}
async function getJetonsSupabase() {
  const b = await __getBalances();
  return b?.jetons ?? 0;
}
async function addJetonsSupabase(amount) {
  await ensureAuthSafe();
  const delta = Number(amount) || 0;
  const { error } = await window.sb.rpc('ajouter_jetons', { montant: delta });
  if (error) throw error;
  const b = await __getBalances();
  return b?.jetons ?? 0;
}

// Thèmes possédés (lecture robuste)
async function getUnlockedThemesCloud() {
  const b = await __getBalances();
  let raw = b?.themes_possedes;
  let arr = [];

  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    // tente JSON puis fallback Postgres text[]
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      const cleaned = raw.replace(/[{}]/g, '');
      arr = cleaned.split(/[,\s]+/).map(s => s.replace(/^"(.*)"$/, '$1')).filter(Boolean);
    }
  }

  // normalise + unique
  const norm = [...new Set(arr.map(normalizeThemeKey).filter(Boolean))];
  if (!norm.includes('neon')) norm.push('neon'); // “neon” toujours utilisable
  return norm;
}

// Setter (admin/debug)
async function setUnlockedThemesCloud(newThemes) {
  await ensureAuthSafe();
  const { error } = await window.sb.rpc('set_themes_secure', { themes: newThemes });
  if (error) throw error;
}

/* ===========================
   POPUP (ouverture/fermeture accessibles)
   =========================== */

function openThemeModal() {
  const modal = document.getElementById("themeModalBackdrop");
  if (!modal) return;
  modal.style.display = "flex";
  modal.removeAttribute("aria-hidden");
  modal.removeAttribute("inert");
  const closeBtn = document.getElementById("themeModalClose");
  if (closeBtn) closeBtn.focus();
}

function closeThemeModal() {
  const modal = document.getElementById("themeModalBackdrop");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.setAttribute("inert", "");
  modal.style.display = "none";
  const opener = document.getElementById("btnThemes") || document.querySelector("[data-open='themeModal']");
  if (opener) opener.focus();
  if (document.activeElement) document.activeElement.blur();
}

/* ===========================
   Asset helper (.webp -> fallback .png si besoin)
   =========================== */

function getThemeThumbTag(themeKey) {
  const key = normalizeThemeKey(themeKey);
  // 1) On pointe d’abord sur .webp (nom exact comme ta capture : "angelique.webp", "nuit.webp", etc.)
  // 2) Si erreur de chargement, on bascule automatiquement en .png
  const img = document.createElement('img');
  img.className = 'theme-img';
  img.loading = 'lazy';
  img.alt = '';

  // Chemins probables (mets le bon dossier si tu veux; ici on suppose les vignettes à côté du HTML ou dans assets/images/themes/)
  const candidates = [
    `${key}.webp`,
    `assets/images/themes/${key}.webp`,
    `assets/images/themes/${key}.png`,
    `img/${key}.webp`,
    `img/${key}.png`
  ];

  let idx = 0;
  function tryNext() {
    if (idx >= candidates.length) return;
    img.src = candidates[idx++];
  }
  img.onerror = tryNext;
  tryNext();

  return img;
}

/* ===========================
   Achat sécurisé (Supabase RPC)
   =========================== */

async function acheterTheme(themeKey, prix) {
  try {
    await ensureAuthSafe();
    // Vérif client (UI) — empêche le call si solde insuffisant
    const solde = await getVCoinsSupabase();
    const price = Number(prix) || THEME_PRICE;
    if (solde < price) {
      alert((t("boutique.alert.pasassez") || "Pas assez de VCoins.") + `\n(${solde} / ${price})`);
      return false;
    }

    // Appel serveur (doit RE-vérifier et débiter côté DB)
    const { error } = await window.sb.rpc('purchase_theme', {
      theme_key: String(themeKey),
      price: price
    });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("not enough vcoins")) {
        alert(t("boutique.alert.pasassez") || "Pas assez de VCoins.");
        return false;
      }
      alert("Erreur: " + error.message);
      return false;
    }

    await renderThemes();
    closeThemeModal();
    alert(t("theme.debloque") || "Thème débloqué !");
    return true;
  } catch (e) {
    alert("Erreur: " + (e.message || e));
    return false;
  }
}

/* ===========================
   UI
   =========================== */

// Activation locale + application immédiate
function getCurrentTheme() { return localStorage.getItem('themeVBlocks') || "neon"; }
function setCurrentTheme(theme) {
  localStorage.setItem('themeVBlocks', theme);
  if (window.userData?.applyLocalTheme) {
    try { window.userData.applyLocalTheme(theme); } catch {}
  }
}

// Achats / Pubs (⚠️ rebind après chaque render)
function setupBoutiqueAchats() {
  document.querySelectorAll('.special-cartouche').forEach(cartouche => {
    const label = cartouche.querySelector('.theme-label');
    if (!label) return;
    const key = label.dataset.i18n || label.textContent;

    // Achats via Store
    const alias = key?.split('.').pop();
    const pid = PRODUCT_IDS[alias];

    if (pid) {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = async () => {
        const IAP = (window.store && typeof window.store.order === 'function') ? window.store : null;
        if (IAP) {
          const ok = await (window.lancerPaiement ? window.lancerPaiement(alias) : Promise.resolve(true));
          if (ok) {
            try { await IAP.order(pid); } catch(e){ alert("Achat non abouti."); }
          }
        } else {
          alert("Achat via Store indisponible ici. Ouvre l’app installée depuis le Store.");
        }
      };
    }

    // PUB Reward
    if (key === 'boutique.cartouche.pub1jeton') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = () => (typeof window.showRewardBoutique === 'function' ? window.showRewardBoutique() : alert("Pub non disponible."));
    }
    if (key === 'boutique.cartouche.pub300points') {
      cartouche.style.cursor = 'pointer';
      cartouche.onclick = () => (typeof window.showRewardVcoins === 'function' ? window.showRewardVcoins() : alert("Pub non disponible."));
    }
  });
}

// Prix localisés -> injecte dans DOM
function renderAchats() {
  const $achatsList = document.getElementById('achats-list');
  if (!$achatsList) return;

  const html = ([ 
    { key: "boutique.cartouche.points3000",  icon:'<img src="assets/images/vcoin.webp" alt="Points">', color:'color-yellow' },
    { key: "boutique.cartouche.points10000", icon:'<img src="assets/images/vcoin.webp" alt="Points">', color:'color-purple' },
    { key: "boutique.cartouche.jetons12",    icon:'<img src="assets/images/jeton.webp" alt="jeton">',  color:'color-blue' },
    { key: "boutique.cartouche.jetons50",    icon:'<img src="assets/images/jeton.webp" alt="jeton">',  color:'color-purple' },
    { key: "boutique.cartouche.nopub",       icon:'<img src="assets/images/ads.png"   alt="No Ads">',  color:'color-yellow' },
    { key: "boutique.cartouche.pub1jeton",   icon:'<img src="assets/images/jeton.webp" alt="Pub">',    color:'color-green' },
    { key: "boutique.cartouche.pub300points",icon:'<img src="assets/images/vcoin.webp" alt="Pub">',    color:'color-blue' }
  ]).map(c => {
    const alias = c.key.split('.').pop();
    const price = PRICES_BY_ALIAS[alias]?.price || "…";
    return `
      <div class="special-cartouche ${c.color}">
        <span class="theme-ico">${c.icon}</span>
        <span class="theme-label" data-i18n="${c.key}">${t(c.key)}</span>
        <span class="prix-label">${price}</span>
      </div>
    `;
  }).join('');

  $achatsList.innerHTML = html;
  setupBoutiqueAchats();
}

// UI Thèmes (avec contrôle de solde)
async function renderThemes() {
  renderAchats();

  const list = document.getElementById('themes-list');
  if (!list) return;
  list.innerHTML = "";

  // Récupère solde & listes pour savoir quoi activer
  let solde = 0;
  try { solde = await getVCoinsSupabase(); } catch {}

  const unlocked = await getUnlockedThemesCloud();
  const current = normalizeThemeKey(getCurrentTheme());

  THEMES.forEach(theme => {
    const keyNorm = normalizeThemeKey(theme.key);
    const isUnlocked = unlocked.includes(keyNorm);
    const label = (t("theme." + theme.key) !== "theme." + theme.key) ? t("theme." + theme.key) : (theme.name || theme.key);

    const card = document.createElement('div');
    card.className = 'theme-card' + (current === keyNorm ? " selected" : "") + (isUnlocked ? "" : " locked");

    // vignette .webp (fallback .png auto)
    const img = getThemeThumbTag(theme.key);

    const header = document.createElement('div');
    header.className = 'theme-name';
    header.textContent = label;

    const btn = document.createElement('button');
    btn.className = 'theme-btn';

    if (isUnlocked) {
      if (current === keyNorm) {
        btn.textContent = t("boutique.btn.selectionne") || "Sélectionné";
        btn.disabled = true;
        btn.classList.add('selected');
      } else {
        btn.textContent = t("boutique.btn.utiliser") || "Utiliser";
        btn.onclick = () => { setCurrentTheme(keyNorm); renderThemes(); };
      }
    } else {
      const insuffisant = solde < THEME_PRICE;
      const prixTxt = (t("boutique.btn.debloquer") || "Débloquer ({PRICE})").replace("{PRICE}", THEME_PRICE);
      btn.textContent = prixTxt;
      if (insuffisant) {
        btn.disabled = true;
        btn.title = `${t("boutique.alert.pasassez") || "Pas assez de VCoins."} (${solde}/${THEME_PRICE})`;
        btn.classList.add('locked');
      } else {
        btn.onclick = () => acheterTheme(keyNorm, THEME_PRICE);
      }
    }

    card.appendChild(header);
    card.appendChild(img);
    card.appendChild(btn);
    list.appendChild(card);
  });

  // Solde à jour (si tu affiches quelque part .vcoins-solde / .jetons-solde)
  const soldeEls = document.querySelectorAll('.vcoins-solde');
  try { if (soldeEls[0]) soldeEls[0].textContent = solde; } catch {}
  try { const j = await getJetonsSupabase(); const els = document.querySelectorAll('.jetons-solde'); if (els[0]) els[0].textContent = j; } catch {}
}

/* ===========================
   Init DOM
   =========================== */
document.addEventListener("DOMContentLoaded", function() {
  renderThemes();
});

/* ===========================
   Store init (Cordova Purchase)
   =========================== */
document.addEventListener('deviceready', function() {
  const IAP = (window.store && typeof window.store.register === 'function') ? window.store : null;
  if (!IAP) {
    console.warn("[IAP] Plugin purchase non dispo");
    return;
  }

  // Register (nopub = NON_CONSUMABLE)
  Object.entries(PRODUCT_IDS).forEach(([alias, id]) => {
    const type = (alias === 'nopub') ? IAP.NON_CONSUMABLE : IAP.CONSUMABLE;
    IAP.register({ id, alias, type });
  });

  // Alimente PRICES_BY_ALIAS en continu
  try {
    IAP.when('product').updated((p) => {
      const alias = p.alias || Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === p.id) || p.id;
      if (p && p.price) {
        PRICES_BY_ALIAS[alias] = {
          price:    p.price || "",
          currency: p.currency || "",
          micros:   p.priceMicros || 0
        };
      }
      try { renderAchats(); } catch (_) {}
    });
  } catch (_) {}

  // Handlers IAP (validation & crédit)
  Object.entries(PRODUCT_IDS).forEach(([alias, id]) => {
    IAP.when(id).approved(async (p) => {
      try {
        // Idéalement: validation côté serveur (backend) puis crédit
        if (typeof window.acheterProduitVercel === 'function') {
          await window.acheterProduitVercel(alias);
        } else {
          // Fallback direct Supabase (dev/test seulement)
          if (alias === 'points3000')   await window.sb.rpc('ajouter_vcoins', { montant: 3000 });
          if (alias === 'points10000')  await window.sb.rpc('ajouter_vcoins', { montant: 10000 });
          if (alias === 'jetons12')     await window.sb.rpc('ajouter_jetons', { montant: 12 });
          if (alias === 'jetons50')     await window.sb.rpc('ajouter_jetons', { montant: 50 });
          if (alias === 'nopub')        await window.sb.rpc('ajouter_nopub');
        }
        p.finish();
        await renderThemes();
        alert("Achat réussi !");
      } catch (e) {
        console.warn("[IAP] post-achat erreur:", e);
        p.finish();
        alert("Erreur post-achat.");
      }
    });
  });

  IAP.ready(function() {
    IAP.products.forEach(prod => {
      const foundAlias = Object.keys(PRODUCT_IDS).find(a => PRODUCT_IDS[a] === prod.id) || prod.alias;
      if (foundAlias) {
        PRICES_BY_ALIAS[foundAlias] = {
          price:    prod.price || "",
          currency: prod.currency || "",
          micros:   prod.priceMicros || 0
        };
      }
    });
    renderAchats();
    setupBoutiqueAchats();
  });

  IAP.error(e => console.warn('[IAP] error:', e));
  IAP.refresh();
});
