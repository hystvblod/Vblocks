(function (global) {
  "use strict";

  const LANG_PATH = "data/";
  const DEFAULT_LANG = "EN";

  const STORAGE_KEY = "langue";
  const EXPLICIT_KEY = "vblocks_lang_selected";

  const SUP = ["FR","EN","ES","ES-LATAM","DE","IT","PT","PT-BR","NL","AR","IDN","JP","KO"];
  const RTL = new Set(["AR"]);

  const HTML_LANG = {
    "FR": "fr",
    "EN": "en",
    "ES": "es",
    "ES-LATAM": "es-419",
    "DE": "de",
    "IT": "it",
    "PT": "pt",
    "PT-BR": "pt-BR",
    "NL": "nl",
    "AR": "ar",
    "IDN": "id",
    "JP": "ja",
    "KO": "ko"
  };

  const LANGUAGE_CHOICES = [
    {
      code: "FR",
      ui: "FR",
      aria: "Français",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="10" height="20" x="0" y="0" fill="#1f4fbf"/><rect width="10" height="20" x="10" y="0" fill="#ffffff"/><rect width="10" height="20" x="20" y="0" fill="#d11f2e"/></svg>`
    },
    {
      code: "EN",
      ui: "EN",
      aria: "English",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#fff"/><g fill="#b22234"><rect y="0" width="30" height="1.538"/><rect y="3.076" width="30" height="1.538"/><rect y="6.152" width="30" height="1.538"/><rect y="9.228" width="30" height="1.538"/><rect y="12.304" width="30" height="1.538"/><rect y="15.38" width="30" height="1.538"/><rect y="18.456" width="30" height="1.544"/></g><rect width="12.6" height="10.77" fill="#3c3b6e"/><g fill="#fff" opacity="0.95"><circle cx="1.8" cy="1.6" r=".35"/><circle cx="3.6" cy="1.6" r=".35"/><circle cx="5.4" cy="1.6" r=".35"/><circle cx="7.2" cy="1.6" r=".35"/><circle cx="9.0" cy="1.6" r=".35"/><circle cx="10.8" cy="1.6" r=".35"/><circle cx="2.7" cy="2.8" r=".35"/><circle cx="4.5" cy="2.8" r=".35"/><circle cx="6.3" cy="2.8" r=".35"/><circle cx="8.1" cy="2.8" r=".35"/><circle cx="9.9" cy="2.8" r=".35"/><circle cx="1.8" cy="4.0" r=".35"/><circle cx="3.6" cy="4.0" r=".35"/><circle cx="5.4" cy="4.0" r=".35"/><circle cx="7.2" cy="4.0" r=".35"/><circle cx="9.0" cy="4.0" r=".35"/><circle cx="10.8" cy="4.0" r=".35"/><circle cx="2.7" cy="5.2" r=".35"/><circle cx="4.5" cy="5.2" r=".35"/><circle cx="6.3" cy="5.2" r=".35"/><circle cx="8.1" cy="5.2" r=".35"/><circle cx="9.9" cy="5.2" r=".35"/><circle cx="1.8" cy="6.4" r=".35"/><circle cx="3.6" cy="6.4" r=".35"/><circle cx="5.4" cy="6.4" r=".35"/><circle cx="7.2" cy="6.4" r=".35"/><circle cx="9.0" cy="6.4" r=".35"/><circle cx="10.8" cy="6.4" r=".35"/><circle cx="2.7" cy="7.6" r=".35"/><circle cx="4.5" cy="7.6" r=".35"/><circle cx="6.3" cy="7.6" r=".35"/><circle cx="8.1" cy="7.6" r=".35"/><circle cx="9.9" cy="7.6" r=".35"/><circle cx="1.8" cy="8.8" r=".35"/><circle cx="3.6" cy="8.8" r=".35"/><circle cx="5.4" cy="8.8" r=".35"/><circle cx="7.2" cy="8.8" r=".35"/><circle cx="9.0" cy="8.8" r=".35"/><circle cx="10.8" cy="8.8" r=".35"/></g></svg>`
    },
    {
      code: "DE",
      ui: "DE",
      aria: "Deutsch",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="6.67" y="0" fill="#111"/><rect width="30" height="6.67" y="6.67" fill="#d11f2e"/><rect width="30" height="6.66" y="13.34" fill="#f4c300"/></svg>`
    },
    {
      code: "ES",
      ui: "ES",
      aria: "Español",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="5" y="0" fill="#c8102e"/><rect width="30" height="10" y="5" fill="#f4c300"/><rect width="30" height="5" y="15" fill="#c8102e"/></svg>`
    },
    {
      code: "ES-LATAM",
      ui: "ES-LATAM",
      aria: "Español (LatAm)",
      flag: `<svg viewBox="0 0 260 280" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="18" y="18" width="224" height="244" rx="26" fill="#ffffff"/>
    <path
      d="M 143.9 157.2 L 130.3 148.1 L 115.0 123.2 L 119.3 113.0 L 115.9 108.3 L 127.1 94.0 L 124.0 80.9 L 120.0 79.1 L 116.1 84.1 L 102.1 76.2 L 96.7 66.3 L 49.9 51.7 L 21.6 14.0 L 16.4 13.3 L 31.3 38.4 L 16.1 24.1 L 18.7 21.6 L 10.0 10.0 L 41.1 12.3 L 48.6 19.6 L 57.3 19.2 L 63.0 28.0 L 68.5 29.5 L 66.9 41.1 L 76.4 52.1 L 87.1 48.8 L 88.6 43.8 L 98.0 42.2 L 92.5 58.7 L 108.7 60.5 L 107.5 72.7 L 112.2 78.9 L 119.9 77.1 L 127.9 79.9 L 133.6 72.8 L 142.8 68.8 L 143.0 78.7 L 148.1 69.6 L 153.2 74.3 L 171.7 74.1 L 178.3 79.4 L 180.4 72.7 L 180.9 80.7 L 185.4 83.7 L 186.3 82.2 L 184.3 77.9 L 187.0 76.2 L 185.4 74.0 L 192.3 76.7 L 191.8 79.7 L 197.6 79.0 L 203.1 82.7 L 205.8 88.8 L 214.3 92.4 L 225.7 95.2 L 231.7 100.0 L 235.2 107.8 L 243.8 116.3 L 250.0 124.7 L 249.9 141.1 L 241.5 149.4 L 237.5 164.9 L 234.6 179.4 L 223.3 184.8 L 209.0 189.3 L 204.1 198.5 L 191.8 213.9 L 185.6 222.2 L 171.9 227.2 L 169.1 231.5 L 160.4 235.5 L 160.0 240.5 L 155.7 245.3 L 158.9 249.3 L 150.8 255.7 L 153.0 257.0 L 152.3 261.5 L 142.8 268.3 L 125.3 261.8 L 123.2 250.7 L 129.0 240.4 L 126.6 239.1 L 131.2 228.6 L 132.8 224.2 L 137.6 202.8 L 142.5 185.5 L 142.2 168.0 L 135.6 161.0 Z"
      fill="none"
      stroke="#174e6a"
      stroke-width="7.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`
    },
    {
      code: "PT",
      ui: "PT",
      aria: "Português",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="12" height="20" x="0" y="0" fill="#1a7f3b"/><rect width="18" height="20" x="12" y="0" fill="#c8102e"/><circle cx="12" cy="10" r="4.5" fill="#f4c300" opacity="0.95"/></svg>`
    },
    {
      code: "PT-BR",
      ui: "PTBR",
      aria: "Português (BR)",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#1a7f3b"/><path d="M15 3 L26 10 L15 17 L4 10 Z" fill="#f4c300"/><circle cx="15" cy="10" r="4" fill="#1f4fbf"/></svg>`
    },
    {
      code: "IT",
      ui: "IT",
      aria: "Italiano",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="10" height="20" x="0" y="0" fill="#1a7f3b"/><rect width="10" height="20" x="10" y="0" fill="#ffffff"/><rect width="10" height="20" x="20" y="0" fill="#c8102e"/></svg>`
    },
    {
      code: "NL",
      ui: "NL",
      aria: "Nederlands",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="6.67" y="0" fill="#ae1e28"/><rect width="30" height="6.67" y="6.67" fill="#ffffff"/><rect width="30" height="6.66" y="13.34" fill="#21468b"/></svg>`
    },
    {
      code: "AR",
      ui: "AR",
      aria: "العربية",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#ffffff"/><rect width="30" height="10" y="0" fill="#198754"/><polygon points="7,10 16,5 16,15" fill="#fff"/><circle cx="21" cy="10" r="3.2" fill="#198754"/></svg>`
    },
    {
      code: "IDN",
      ui: "ID",
      aria: "Bahasa Indonesia",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="10" y="0" fill="#d11f2e"/><rect width="30" height="10" y="10" fill="#ffffff"/></svg>`
    },
    {
      code: "JP",
      ui: "JP",
      aria: "日本語",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#ffffff"/><circle cx="15" cy="10" r="5" fill="#d11f2e"/></svg>`
    },
    {
      code: "KO",
      ui: "KO",
      aria: "한국어",
      flag: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#ffffff"/><circle cx="15" cy="10" r="5" fill="#c8102e"/><path d="M15 5a5 5 0 0 0 0 10a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 0 0-5Z" fill="#0a3a87" opacity="0.95"/></svg>`
    }
  ];

  let CURRENT_LANG = DEFAULT_LANG;
  let I18N_MAP = {};
  let bootPromise = null;
  let pickerPromise = null;

  function normalize(code) {
    if (!code) return null;

    let c = String(code).trim();
    c = c.replace("_", "-");
    const lower = c.toLowerCase();

    if (lower.startsWith("pt-br")) return "PT-BR";
    if (lower.startsWith("pt")) return "PT";
    if (lower.startsWith("en")) return "EN";
    if (lower.startsWith("fr")) return "FR";
    if (lower.startsWith("de")) return "DE";
    if (lower === "es-419" || lower.startsWith("es-419") || lower === "es-latam" || lower.startsWith("es-latam")) return "ES-LATAM";
    if (lower.startsWith("es")) return "ES";
    if (lower.startsWith("it")) return "IT";
    if (lower.startsWith("nl")) return "NL";
    if (lower === "ar" || lower.startsWith("ar-")) return "AR";
    if (lower === "id" || lower.startsWith("id-")) return "IDN";
    if (lower === "ja" || lower.startsWith("ja-")) return "JP";
    if (lower === "ko" || lower.startsWith("ko-")) return "KO";

    const up = lower.toUpperCase();
    if (SUP.includes(up)) return up;

    return null;
  }

  function detectPreferredLang() {
    const list = (Array.isArray(navigator.languages) && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || navigator.userLanguage];

    for (const c of list) {
      const n = normalize(c);
      if (n && SUP.includes(n)) return n;
    }

    return DEFAULT_LANG;
  }

  function getSavedLang() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const nStored = normalize(stored);
      return nStored && SUP.includes(nStored) ? nStored : "";
    } catch (_) {
      return "";
    }
  }

  function hasExplicitLanguageChoice() {
    try {
      return localStorage.getItem(EXPLICIT_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markExplicitLanguageChoice() {
    try {
      localStorage.setItem(EXPLICIT_KEY, "1");
    } catch (_) {}
  }

  async function loadLang(langCode) {
    const normalized = normalize(langCode) || DEFAULT_LANG;

    try {
      const res = await fetch(`${LANG_PATH}${normalized}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error("Not OK");
      return await res.json();
    } catch (_) {
      if (normalized !== DEFAULT_LANG) {
        try {
          const res2 = await fetch(`${LANG_PATH}${DEFAULT_LANG}.json`, { cache: "no-store" });
          if (res2.ok) return await res2.json();
        } catch (_) {}
      }
      return {};
    }
  }

  function applyDocumentLangAndDir(langCode) {
    const htmlLang = HTML_LANG[langCode] || String(langCode || DEFAULT_LANG).toLowerCase();
    document.documentElement.setAttribute("lang", htmlLang);

    const isRtl = RTL.has(langCode);
    document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
    if (document.body) {
      document.body.classList.toggle("rtl", !!isRtl);
    }
  }

  function setElementText(el, txt) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = txt;
      return;
    }

    if (typeof txt === "string" && txt.indexOf("<") !== -1) {
      el.innerHTML = txt;
    } else {
      el.textContent = txt;
    }
  }

  function applyI18n(map) {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const txt = map[key];
      if (typeof txt === "string") {
        setElementText(el, txt);
      }
    });
  }

  function emitLangChanged() {
    try {
      global.dispatchEvent(new CustomEvent("vblocks:i18n:changed", {
        detail: {
          lang: CURRENT_LANG,
          map: I18N_MAP
        }
      }));
    } catch (_) {}
  }

  async function syncRemoteLang(langCode) {
    try {
      if (global.userData?.updateLangDirect) {
        await global.userData.updateLangDirect(langCode);
      }
    } catch (e) {
      console.warn("[i18n] remote lang sync failed:", e?.message || e);
    }
  }

  function ensureLanguagePickerStyles() {
    if (document.getElementById("vb-language-picker-style")) return;

    const style = document.createElement("style");
    style.id = "vb-language-picker-style";
    style.textContent = `
      .vrLangOverlay{
        position:fixed;
        inset:0;
        z-index:999999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:16px;
        background:rgba(7,10,18,.82);
        backdrop-filter:blur(10px);
      }

      .vrLangModal{
        width:min(92vw,560px);
        background:linear-gradient(180deg,rgba(18,25,43,.98),rgba(11,16,28,.98));
        border:1px solid rgba(255,255,255,.12);
        border-radius:24px;
        box-shadow:0 20px 60px rgba(0,0,0,.45);
        padding:18px 16px 16px;
        color:#fff;
      }

      .vrLangTitle{
        text-align:center;
        font-weight:900;
        font-size:clamp(24px,4.8vw,34px);
        line-height:1.1;
        margin:0 0 16px;
      }

      .vrLangOverlay .vr-langGrid{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap:10px;
        margin-top:22px;
        margin-bottom:6px;
      }

      .vrLangOverlay .vr-langBtn{
        width:100%;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:flex-start;
        gap:7px;
        padding:10px 4px 8px;
        border-radius:14px;
        border:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        color:inherit;
        cursor:pointer;
        -webkit-tap-highlight-color: transparent;
        text-align:center;
      }

      .vrLangOverlay .vr-langBtn:active{
        transform:scale(.98);
      }

      .vrLangOverlay .vr-langBtn.isSelected{
        outline:0;
        box-shadow:0 0 0 2px rgba(255,255,255,.22), 0 14px 34px rgba(0,0,0,.26) !important;
        background:transparent !important;
        border:0 !important;
      }

      .vrLangOverlay .vr-flagBox{
        width:46px;
        height:32px;
        border-radius:0;
        overflow:visible;
        border:0 !important;
        outline:0 !important;
        box-shadow:none !important;
        background:transparent !important;
        flex:0 0 auto;
      }

      .vrLangOverlay .vr-flagBox svg{
        width:100%;
        height:100%;
        display:block;
      }

      .vrLangOverlay .vr-langText{
        display:block !important;
        width:100%;
        min-height:24px;
        font-size:10px;
        font-weight:800;
        line-height:1.15;
        color:rgba(255,255,255,.96);
        text-align:center;
        white-space:normal;
        word-break:break-word;
      }

      .vrLangActions{
        display:flex;
        justify-content:center;
        margin-top:18px;
      }

      .vrLangConfirm{
        width:68px;
        height:68px;
        min-width:68px;
        min-height:68px;
        padding:0;
        border:0;
        border-radius:18px;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#0b1020;
        background:#ffffff;
        box-shadow:0 12px 30px rgba(0,0,0,.28);
        cursor:pointer;
        transition:transform .12s ease, opacity .12s ease, box-shadow .12s ease;
      }

      .vrLangConfirm:active{
        transform:scale(.98);
      }

      .vrLangConfirm[disabled]{
        opacity:.45;
        cursor:default;
        transform:none;
        box-shadow:none;
      }

      .vrLangConfirm svg{
        width:34px;
        height:34px;
        display:block;
      }
    `;
    document.head.appendChild(style);
  }

  function showLanguagePicker() {
    if (pickerPromise) return pickerPromise;

    pickerPromise = new Promise((resolve) => {
      ensureLanguagePickerStyles();

      const active = "";
      let selected = "";

      const overlay = document.createElement("div");
      overlay.className = "vrLangOverlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Choose your language");

      const modal = document.createElement("div");
      modal.className = "vrLangModal";

      const title = document.createElement("div");
      title.className = "vrLangTitle";
      title.textContent = "Choose your language";
      modal.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "vr-langGrid";

      const buttons = [];
      let confirmBtn = null;

      function refreshActiveState() {
        buttons.forEach((btn) => {
          const isOn = btn.getAttribute("data-lang") === selected;
          btn.classList.toggle("isSelected", isOn);
        });

        if (confirmBtn) {
          confirmBtn.disabled = !selected;
        }
      }

      LANGUAGE_CHOICES.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vr-langBtn";
        btn.setAttribute("data-lang", item.code);
        btn.setAttribute("aria-label", item.aria || item.ui);

        const flag = document.createElement("div");
        flag.className = "vr-flagBox";
        flag.innerHTML = item.flag;

        const txt = document.createElement("div");
        txt.className = "vr-langText";

        const name = document.createElement("div");
        name.textContent = item.aria || item.ui;

        txt.appendChild(name);
        btn.appendChild(flag);
        btn.appendChild(txt);

        btn.addEventListener("click", () => {
          selected = item.code;
          refreshActiveState();
        });

        buttons.push(btn);
        grid.appendChild(btn);
      });

      modal.appendChild(grid);

      const actions = document.createElement("div");
      actions.className = "vrLangActions";

      confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "vrLangConfirm";
      confirmBtn.disabled = true;
      confirmBtn.setAttribute("aria-label", "Confirm");
      confirmBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 12.5L9.5 17L19 7.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      `;

      confirmBtn.addEventListener("click", async () => {
        const chosen = normalize(selected || "");
        if (!chosen) return;

        try {
          await setLang(chosen, { markExplicit: true, syncRemote: true });
        } catch (_) {
          try { localStorage.setItem(STORAGE_KEY, chosen); } catch (_) {}
          try { markExplicitLanguageChoice(); } catch (_) {}
        }

        overlay.remove();
        pickerPromise = null;
        resolve(chosen);
      });

      actions.appendChild(confirmBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      const mountTarget = document.body || document.documentElement;
      mountTarget.appendChild(overlay);

      refreshActiveState();
    });

    return pickerPromise;
  }

  async function resolveInitialLang(forcedLang) {
    const forced = normalize(forcedLang);
    if (forced && SUP.includes(forced)) return forced;

    const saved = getSavedLang();
    if (saved) return saved;

    return await showLanguagePicker();
  }

  async function applyCurrentLang(langCode) {
    CURRENT_LANG = normalize(langCode) || DEFAULT_LANG;
    applyDocumentLangAndDir(CURRENT_LANG);

    I18N_MAP = await loadLang(CURRENT_LANG);
    global.I18N_MAP = I18N_MAP;

    applyI18n(I18N_MAP);
    emitLangChanged();

    return CURRENT_LANG;
  }

  async function initI18n(forcedLang) {
    const wanted = await resolveInitialLang(forcedLang);
    return await applyCurrentLang(wanted);
  }

  async function setLang(code, options) {
    const opts = Object.assign(
      { markExplicit: true, syncRemote: true },
      options || {}
    );

    const n = normalize(code) || DEFAULT_LANG;

    try {
      localStorage.setItem(STORAGE_KEY, n);
    } catch (_) {}

    if (opts.markExplicit) {
      markExplicitLanguageChoice();
    }

    await applyCurrentLang(n);

    if (opts.syncRemote) {
      await syncRemoteLang(n);
    }

    return CURRENT_LANG;
  }

  function getCurrentLangCode() {
    return CURRENT_LANG || getSavedLang() || detectPreferredLang() || DEFAULT_LANG;
  }

  async function retranslateCurrentPage() {
    const langCode = getCurrentLangCode();
    return await applyCurrentLang(langCode);
  }

  function i18nGet(key) {
    return (I18N_MAP && I18N_MAP[key]) || key;
  }

  function boot() {
    if (bootPromise) return bootPromise;

    bootPromise = initI18n().catch(async (e) => {
      console.warn("[i18n] boot failed:", e);

      const fallback = getSavedLang() || detectPreferredLang() || DEFAULT_LANG;

      try {
        await applyCurrentLang(fallback);
      } catch (_) {
        CURRENT_LANG = DEFAULT_LANG;
        I18N_MAP = {};
        global.I18N_MAP = I18N_MAP;
        applyDocumentLangAndDir(DEFAULT_LANG);
      }

      return CURRENT_LANG;
    });

    return bootPromise;
  }

  global.i18nTranslateAll = async function () {
    if (!bootPromise) {
      return await boot();
    }
    return await retranslateCurrentPage();
  };

  global.i18nGet = i18nGet;

  global.setLang = async function (code) {
    return await setLang(code, { markExplicit: true, syncRemote: true });
  };

  global.VRI18n = {
    initI18n: (forcedLang) => forcedLang ? initI18n(forcedLang) : boot(),
    setLang: global.setLang,
    getLang: getCurrentLangCode,
    normalizeLang: normalize,
    t: (key, fallback) => {
      const v = i18nGet(key);
      return v === key ? String(fallback || "") : v;
    }
  };

  if (document.readyState === "loading") {
    global.i18nReady = new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", function () {
        Promise.resolve(boot()).then(resolve).catch(function () {
          resolve(DEFAULT_LANG);
        });
      }, { once: true });
    });
  } else {
    global.i18nReady = Promise.resolve(boot()).catch(function () {
      return DEFAULT_LANG;
    });
  }
})(window);
