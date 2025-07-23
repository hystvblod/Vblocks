// i18n.js
(function(global){
  // Dossier où sont stockées les langues (relatif au HTML courant)
  const LANG_PATH = "data/";

  // Liste des langues et correspondance code <-> fichier
  const LANG_CODES = [
    "FR", "EN", "ES", "DE", "IT", "PT", "PT-BR", "NL", "AR", "IDN", "JP", "KO"
  ];

  // Fonction pour récupérer le code langue, gère fallback (fr par défaut)
  function getLangCode() {
    let lang = (localStorage.getItem("langue") || "fr").toUpperCase().replace('-', '');
    if (lang === "PTBR") lang = "PT-BR";
    if (!LANG_CODES.includes(lang)) lang = "FR";
    return lang;
  }

  // Charge le fichier de langue choisi (Promise)
  async function loadLang(langCode) {
    let response;
    try {
      response = await fetch(`${LANG_PATH}${langCode}.json`);
      if (!response.ok) throw new Error("404");
      return await response.json();
    } catch (e) {
      // Fallback FR si fichier absent
      if (langCode !== "FR") return await loadLang("FR");
      return {};
    }
  }

  // Remplace tout dans le DOM avec data-i18n
  function applyI18n(i18nMap) {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      let key = el.getAttribute("data-i18n");
      if (!key) return;
      let txt = i18nMap[key];
      if (typeof txt === "string") {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = txt;
        } else {
          el.textContent = txt;
        }
      }
    });
  }

  // Méthode globale : appelable depuis le HTML ou n'importe où
  global.i18nTranslateAll = async function() {
    const langCode = getLangCode();
    const i18nMap = await loadLang(langCode);
    global.I18N_MAP = i18nMap; // Pour accès global si besoin
    applyI18n(i18nMap);
  };

  // Accès direct à la traduction d'une clé
  global.i18nGet = function(key) {
    if (global.I18N_MAP && global.I18N_MAP[key]) return global.I18N_MAP[key];
    return key;
  };

  // Charge et applique automatiquement à l'ouverture de la page
  window.addEventListener("DOMContentLoaded", global.i18nTranslateAll);

  // Permet de changer de langue dynamiquement (recharge le JSON et relance apply)
  global.setLang = async function(code) {
    localStorage.setItem("langue", code);
    await global.i18nTranslateAll();
  };

})(window);
