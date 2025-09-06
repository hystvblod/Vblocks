<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title data-i18n="boutique.titre"></title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Libs / app -->
  <script src="js/vendor/supabase-2.42.5.min.js"></script>
  <script src="js/i18n.js"></script>
  <script src="js/userData.js"></script>

  <!-- Cordova d'abord (fourni dans l'APK ; 404 en web = normal) -->
  <script src="cordova.js"></script>

  <!-- IAP core + Ads + UI boutique -->
  <script src="js/achat.js"></script>
  <script src="js/pub.js"></script>
  <script src="js/boutique.js"></script>

  <link rel="stylesheet" href="style/main.css" />
  <style>
    html, body { height:auto; min-height:100%; overflow:auto; }
    body { overscroll-behavior-y:auto; }
    .container-boutique { padding-bottom: 80px; }
    .achats-list, .themes-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .themes-list { margin-top:.5rem; }
    .theme-card.special-cartouche { cursor:pointer; transition:transform .06s ease, box-shadow .2s ease; user-select:none; align-items:center; justify-content:space-between; position:relative; }
    .theme-card.special-cartouche:hover { transform: translateY(-1px); }
    .theme-card .theme-ico{ display:none !important; }
    .theme-card .theme-label, .theme-card .prix-label { color:#fff !important; }
    .theme-card .theme-label{ font-weight:700; letter-spacing:.2px; }
    .theme-card.unlocked { opacity:1; }
    .theme-card.locked { opacity:.95; }
    .achats-list .prix-label { color:#fff; font-weight:700; }
    .themes-list .theme-card .theme-label{ font-size:clamp(1.06rem,1.7vw,1.32rem); line-height:1.2; }
    .theme-card.unlocked{ filter:grayscale(35%) brightness(.92); }
    .theme-card.unlocked .prix-label{ display:none !important; }
    .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.58); display:none; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(2px); }
    .modal{ width:min(520px,92vw); border-radius:16px; background:var(--card-bg,#17181c); color:var(--body-color,#e9e9e9); border:1px solid rgba(255,255,255,0.08); box-shadow:0 12px 40px rgba(0,0,0,.4); overflow:hidden; }
    .modal-header{ display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08); font-weight:700; }
    .modal-body{ padding:14px 16px 4px 16px; text-align:center; }
    .modal-body img{ width:100%; height:auto; border-radius:12px; background:rgba(255,255,255,0.03); }
    .modal-actions{ display:flex; gap:10px; justify-content:center; align-items:center; padding:16px; }
    .btn{ appearance:none; border:0; border-radius:12px; padding:12px 16px; font-weight:700; cursor:pointer; }
    .btn-primary{ background:linear-gradient(135deg,#5c8df7,#7a5cf7); color:#fff; }
    .btn-ghost{ background:transparent; color:#ddd; border:1px solid rgba(255,255,255,.15); }
    .badge{ display:inline-flex; align-items:center; justify-content:center; padding:10px 14px; border-radius:999px; background:rgba(255,255,255,.08); color:#ddd; font-weight:700; border:1px solid rgba(255,255,255,.12); }
    .modal-close{ background:transparent; border:0; color:#bbb; cursor:pointer; padding:8px; border-radius:10px; }
    .modal-close:hover{ background:rgba(255,255,255,.06); }
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="top-left">
      <a href="index.html" class="btn-back" title="" tabindex="0">
        <svg viewBox="0 0 36 36" fill="none">
          <path d="M23.5 28L15 19.5L23.5 11" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
    <div class="top-right">
      <a href="profil.html" class="btn-icon"><img src="assets/icons/user.svg" alt="Profil" /></a>
      <a href="parametres.html" class="btn-icon"><img src="assets/icons/settings.svg" alt="Paramètres" /></a>
    </div>
  </div>

  <div class="container-boutique">
    <div class="shop-title" data-i18n="boutique.titre"></div>

    <div id="soldeVCoins" class="vcoins-bar">
      <img src="assets/images/vcoin.webp" alt="VCoins" class="vcoin-ico" />
      <span class="vcoins-solde">--</span>
      <img src="assets/images/jeton.webp" alt="Jetons" class="vcoin-ico" style="margin-left:18px;" />
      <span class="vcoins-solde">--</span>
    </div>

    <div class="section-label" data-i18n="boutique.section.vcoins"></div>
    <div class="achats-list" id="achats-list"></div>

    <div class="section-label" style="margin-top:1.5em;" data-i18n="boutique.section.themes"></div>
    <div class="themes-list" id="themes-list"></div>
  </div>

  <!-- MODAL -->
  <div class="modal-backdrop" id="themeModalBackdrop" aria-hidden="true" inert>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="themeModalTitle">
      <div class="modal-header">
        <div id="themeModalTitle"></div>
        <button class="modal-close" id="themeModalClose" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body"><img id="themeModalImage" src="" alt="" /></div>
      <div class="modal-actions" id="themeModalActions"></div>
    </div>
  </div>
</body>
</html>
