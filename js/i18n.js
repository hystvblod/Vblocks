// i18n.js — auto-détection + override utilisateur + fallback + gestion RTL/LTR + lang BCP47 + HTML-safe rendering
(function (global) {
  // Emplacement des JSON de langue
  const LANG_PATH = "data/";

  // Langues supportées (noms de fichiers disponibles)
  const SUP = ["FR","EN","ES","DE","IT","PT","PT-BR","NL","AR","IDN","JP","KO"];

  // Langues en écriture droite→gauche
  const RTL = new Set(["AR"]);

  // Mapping code-fichier -> code BCP47 pour <html lang="...">
  const HTML_LANG = {
    "FR": "fr",
    "EN": "en",
    "ES": "es",
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

  // Normalise un code navigateur -> code de fichier
  function normalize(code) {
    if (!code) return null;
    let c = String(code).trim();
    c = c.replace('_','-');
    const lower = c.toLowerCase();

    // cas spéciaux vers nos fichiers
    if (lower.startsWith("pt-br")) return "PT-BR";
    if (lower.startsWith("pt"))    return "PT";
    if (lower.startsWith("en"))    return "EN";
    if (lower.startsWith("fr"))    return "FR";
    if (lower.startsWith("de"))    return "DE";
    if (lower.startsWith("es"))    return "ES";
    if (lower.startsWith("it"))    return "IT";
    if (lower.startsWith("nl"))    return "NL";
    if (lower === "ar" || lower.startsWith("ar-")) return "AR";
    if (lower === "id" || lower.startsWith("id-")) return "IDN";
    if (lower === "ja" || lower.startsWith("ja-")) return "JP";
    if (lower === "ko" || lower.startsWith("ko-")) return "KO";

    // si on nous passe déjà un code fichier valide
    const up = lower.toUpperCase();
    if (SUP.includes(up)) return up;

    return null;
  }

  // Détecte la meilleure langue côté device
  function detectPreferredLang() {
    const list = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || navigator.userLanguage];

    for (const c of list) {
      const n = normalize(c);
      if (n && SUP.includes(n)) return n;
    }
    return "EN"; // fallback global (mets "FR" si tu veux forcer FR par défaut)
  }

  // Lit l'override utilisateur (Paramètres) OU auto-détection
  function getLangCode() {
    const stored = localStorage.getItem("langue"); // override manuel
    const nStored = normalize(stored);
    if (nStored && SUP.includes(nStored)) return nStored;
    return detectPreferredLang();
  }

  async function loadLang(langCode) {
    try {
      const res = await fetch(`${LANG_PATH}${langCode}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error("Not OK");
      return await res.json();
    } catch (_) {
      // Fallback final si fichier manquant
      if (langCode !== "EN") {
        try {
          const res2 = await fetch(`${LANG_PATH}EN.json`, { cache: "no-store" });
          if (res2.ok) return await res2.json();
        } catch {}
      }
      return {};
    }
  }

  // Applique lang & direction sur <html> et classe utilitaire sur <body>
  function applyDocumentLangAndDir(langCode) {
    const htmlLang = HTML_LANG[langCode] || langCode.toLowerCase();
    document.documentElement.setAttribute("lang", htmlLang);

    const isRtl = RTL.has(langCode);
    document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
    document.body && document.body.classList.toggle("rtl", !!isRtl);
  }

  // Insère le texte : si la chaîne contient du HTML (ex. <br>), on utilise innerHTML
  function setElementText(el, txt) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = txt;
      return;
    }
    // rendu HTML contrôlé (les JSON sont sous ton contrôle)
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

  global.i18nTranslateAll = async function () {
    const langCode = getLangCode();
    applyDocumentLangAndDir(langCode);

    const i18nMap = await loadLang(langCode);
    global.I18N_MAP = i18nMap;
    applyI18n(i18nMap);
  };

  global.i18nGet = function (key) {
    return (global.I18N_MAP && global.I18N_MAP[key]) || key;
  };

  global.setLang = async function (code) {
    const n = normalize(code);
    if (n && SUP.includes(n)) {
      localStorage.setItem("langue", n); // on stocke AU FORMAT FICHIER (FR, EN, PT-BR…)
    } else {
      localStorage.removeItem("langue");
    }
    await global.i18nTranslateAll();
    // à toi de rafraîchir l’écran si nécessaire
  };

  window.addEventListener("DOMContentLoaded", global.i18nTranslateAll);
})(window);

// Optionnel: promesse d’init prête
window.i18nReady = (async () => { await window.i18nTranslateAll(); })();
