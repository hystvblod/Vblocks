// =============================
// userData.js — Version durcie (anti-429 / anti-409) + Pause musique auto
// Patch 2025-09-06 : expose getUserId global (compat duel.html)
// =============================

// ---------- INIT SUPABASE (création unique) ----------
const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

if (!window.sb) {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const sb = window.sb;

// expose pour les fetch() manuels (Edge Functions, etc.)
if (!window.SUPABASE_URL) window.SUPABASE_URL = SUPABASE_URL;
if (!window.SUPABASE_ANON_KEY) window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
// confort console
if (!window.supabase) window.supabase = sb;

/* =====================================================
   PAUSE MUSIQUE AUTO (global, sans import/bundler)
   - Stoppe la musique quand l’app passe en arrière-plan
     (bouton Home / app switcher) ou quand la page est masquée.
   - Fournit aussi setMusicAlwaysMuted(true/false) utilisé par Paramètres.
   ===================================================== */
(function setupGlobalMusicGuards(){
  const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const App = Plugins.App;

  function getMusicEl() {
    return window.music || document.getElementById('music') || null;
  }

  // Mute persistant (utilisé par settings.html)
  window.setMusicAlwaysMuted = function(val){
    try { localStorage.setItem('alwaysMuteMusic', val ? 'true' : 'false'); } catch(_){}
    const m = getMusicEl();
    if (m) {
      try { m.muted = !!val; } catch(_){}
      if (val && !m.paused) { try { m.pause(); } catch(_){ } }
    }
    // notifier les autres pages/onglets éventuellement ouverts
    try {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'alwaysMuteMusic',
        newValue: val ? 'true' : 'false'
      }));
    } catch(_){}
  };

  // Appliquer le mute persistant au chargement de chaque page
  (function applyInitialMute(){
    const m = getMusicEl();
    const muted = (localStorage.getItem('alwaysMuteMusic') === 'true');
    if (m) {
      try { m.muted = muted; } catch(_){}
      if (muted && !m.paused) { try { m.pause(); } catch(_){ } }
    }
  })();

  // 1) App passe en arrière-plan (Home / multitâche)
  if (App && App.addListener) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        const m = getMusicEl();
        if (m && typeof m.pause === 'function') {
          try { m.pause(); } catch(_){}
        }
      }
    });
  }

  // 2) Fallback : page masquée (visibilitychange)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const m = getMusicEl();
      if (m && !m.paused) {
        try { m.pause(); } catch(_){}
      }
    }
  });

  // 3) Quand on quitte / décharge la page
  window.addEventListener('pagehide', () => { const m = getMusicEl(); if (m) { try { m.pause(); } catch(_){ } }});
  window.addEventListener('beforeunload', () => { const m = getMusicEl(); if (m) { try { m.pause(); } catch(_){ } }});

  // 4) Petite API pratique avant navigation manuelle
  window.pauseMusicNow = function(){
    const m = getMusicEl();
    if (m) { try { m.pause(); } catch(_){ } }
  };
})();


// =============================
// THEMES VBLOCKS
// =============================
const ALL_THEMES = [
  'neon', // toujours débloqué côté UI
  'nuit','nature','bubble','retro',
  'vitraux','angelique','luxury','space','cyber','arabic','grece','japon'
];
window.getAllThemes = () => ALL_THEMES;

function normalizeThemeKey(k){
  return String(k || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'');
}

function getCurrentTheme() {
  return localStorage.getItem('themeVBlocks') || 'retro';
}
function setCurrentTheme(theme) {
  localStorage.setItem('themeVBlocks', theme);
}

function applyLocalTheme(themeKey) {
  const t = normalizeThemeKey(themeKey || 'retro');
  setCurrentTheme(t); // écrit dans localStorage
  try { document.documentElement.setAttribute('data-theme', t); } catch {}
  try { document.body?.setAttribute('data-theme', t); } catch {}
  const link = document.getElementById('theme-style');
  if (link) link.href = `themes/${t}.css`;
  try { window.dispatchEvent(new CustomEvent('vblocks-theme-changed', { detail:{ theme: t } })); } catch {}
  // (inutile de refaire localStorage.setItem ici)
}



// =============================
// AUTH ANONYME + MIGRATION LEGACY
// =============================
function getLegacyLocalUserId() {
  return localStorage.getItem('user_id') || null;
}

// pseudo local
function getPseudoLocal() {
  let pseudo = localStorage.getItem('pseudo');
  if (!pseudo) {
    pseudo = 'Player_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('pseudo', pseudo);
  }
  return pseudo;
}
function setPseudoLocal(pseudo) {
  localStorage.setItem('pseudo', pseudo);
}

// langue
function normalizeLangForCloud(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  if (['FR','EN','ES','DE','IT','PT','PT-BR','NL','AR','IDN','JP','KO'].includes(c)) return c;

  const lower = c.toLowerCase();
  if (lower.startsWith('pt-br')) return 'PT-BR';
  if (lower.startsWith('pt'))    return 'PT';
  if (lower.startsWith('en'))    return 'EN';
  if (lower.startsWith('fr'))    return 'FR';
  if (lower.startsWith('de'))    return 'DE';
  if (lower.startsWith('es'))    return 'ES';
  if (lower.startsWith('it'))    return 'IT';
  if (lower.startsWith('nl'))    return 'NL';
  if (lower === 'ar' || lower.startsWith('ar-')) return 'AR';
  if (lower === 'id' || lower.startsWith('id-')) return 'IDN';
  if (lower === 'ja' || lower.startsWith('ja-')) return 'JP';
  if (lower === 'ko' || lower.startsWith('ko-')) return 'KO';
  return null;
}
function detectPreferredLangForCloud() {
  const list = (Array.isArray(navigator.languages) && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || navigator.userLanguage];
  for (const c of list) {
    const n = normalizeLangForCloud(c);
    if (n) return n;
  }
  return 'EN';
}
function getLang() {
  const stored = localStorage.getItem('langue');
  const nStored = normalizeLangForCloud(stored);
  if (nStored) return nStored;
  return detectPreferredLangForCloud();
}


// ---------- AUTH: lock fort contre les rafales ----------
let ensureAuthPromise = null;
async function ensureAuth() {
  if (ensureAuthPromise) return ensureAuthPromise;
  ensureAuthPromise = (async () => {
    try {
      const { data: { session }, error } = await sb.auth.getSession();
      if (error) console.warn('[auth.getSession] warn:', error?.message);
      if (!session) {
        const { error: errAnon } = await sb.auth.signInAnonymously();
        if (errAnon) throw errAnon;
        // petite marge : relit session pour stabiliser l’état
        await sb.auth.getSession().catch(()=>{});
      }
    } catch (e) {
      console.error('[ensureAuth] échec auth anonyme:', e?.message || e);
      ensureAuthPromise = null; // reset lock si échec, pour retry propre
      throw e;
    }
  })();
  return ensureAuthPromise;
}

// lier ancien profil local → auth anonyme
async function linkLegacyIfNeeded() {
  const legacy = getLegacyLocalUserId();
  if (!legacy) return;

  const already = localStorage.getItem('legacy_linked');
  if (already === '1') return;

  try {
    const { error } = await sb.rpc('link_auth_to_legacy', { legacy_id: legacy });
    if (!error) localStorage.setItem('legacy_linked', '1');
  } catch (e) {
    console.warn('[linkLegacyIfNeeded] non bloquant:', e?.message || e);
  }
}


// ---------- ensure_user: anti-409 + anti-429 ----------
async function ensureUserRow() {
  try {
    // UID
    var auth = await sb.auth.getUser();
    var uid = (auth && auth.data && auth.data.user) ? auth.data.user.id : null;
    if (!uid) return;

    var flagKey = 'ud:ensured:' + uid;
    if (sessionStorage.getItem(flagKey) === '1' || localStorage.getItem(flagKey) === '1') {
      return;
    }

    // ---- LANG/LOCALE détectées côté device ----
    // locale complète (ex: 'fr-FR', 'es-MX', 'en-US'), en minuscule
    var localeFull = (navigator.language || 'en').toLowerCase();
    try {
      if (navigator.languages && navigator.languages.length) {
        // prend une locale qui a un tiret si possible
        var pref = null;
        for (var i = 0; i < navigator.languages.length; i++) {
          var cand = String(navigator.languages[i] || '');
          if (cand.indexOf('-') !== -1) { pref = cand; break; }
        }
        if (!pref) pref = navigator.languages[0];
        if (pref) localeFull = String(pref).toLowerCase();
      }
    } catch (_) {}

    // langue normalisée pour la DB (toujours MAJ : 'FR','ES','PT-BR',…)
    var langNorm = normalizeLangForCloud(localeFull) || getLang();

    // Pays du device depuis les locales (ex: 'es-MX' -> 'MX')
    var cc = (function () {
      var cand = [];
      try {
        var ro = Intl.DateTimeFormat().resolvedOptions();
        if (ro && ro.locale) cand.push(ro.locale);
      } catch (_) {}
      try {
        if (navigator.languages && navigator.languages.length) {
          for (var i = 0; i < navigator.languages.length; i++) cand.push(navigator.languages[i]);
        }
      } catch (_) {}
      try {
        if (navigator.language) cand.push(navigator.language);
      } catch (_) {}
      for (var j = 0; j < cand.length; j++) {
        var m = String(cand[j] || '').match(/-([A-Za-z]{2})$/);
        if (m) return m[1].toUpperCase(); // 'FR','BE','MX', ...
      }
      return null;
    })();

    // (Optionnel) fallback Capacitor Device.getLanguageTag() si dispo
    try {
      if (!cc && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Device && window.Capacitor.Plugins.Device.getLanguageTag) {
        var dt = await window.Capacitor.Plugins.Device.getLanguageTag();
        var tag = (dt && (dt.value || dt.tag || dt.languageTag)) ? (dt.value || dt.tag || dt.languageTag) : '';
        var m2 = String(tag).match(/-([A-Za-z]{2})$/);
        if (m2) cc = m2[1].toUpperCase();
      }
    } catch (_) {}

    // ---- ensure_user RPC (création si besoin) ----
    var pseudoFallback = getPseudoLocal();
    var rpc = await sb.rpc('ensure_user', { default_lang: langNorm, default_pseudo: pseudoFallback });
    if (rpc && rpc.error) {
      var code = String(rpc.error.code || rpc.error.status || '');
      var msg  = String(rpc.error.message || '').toLowerCase();
      // Rate limit -> backoff 500ms et retry 1 fois
      if (code === '429' || msg.indexOf('too many') !== -1) {
        await new Promise(function (r) { setTimeout(r, 500); });
        rpc = await sb.rpc('ensure_user', { default_lang: langNorm, default_pseudo: pseudoFallback });
      }
      // 409 = conflit = déjà créé ailleurs -> on continue, on fait juste l'update
    }

    // ---- Aligne la DB avec langue/locale/pays ----
 // ---- Aligne la DB avec langue/pays (sans locale_full si elle n'existe pas) ----
var update = { lang: langNorm };
if (cc) update.country = cc;

try {
  await sb.from('users')
    .update(update)
    .or('id.eq.' + uid + ',auth_id.eq.' + uid);
} catch (_) {}


    // Marque comme fait
    sessionStorage.setItem(flagKey, '1');
    localStorage.setItem(flagKey, '1');
  } catch (e) {
    console.warn('[ensureUserRow] exception:', (e && e.message) ? e.message : e);
  }
}

// ---------- bootstrap global (le SEUL point d’entrée côté pages) ----------
let bootstrapAuthAndProfilePromise = null;
async function bootstrapAuthAndProfile() {
  if (bootstrapAuthAndProfilePromise) return bootstrapAuthAndProfilePromise;
  bootstrapAuthAndProfilePromise = (async () => {
    await ensureAuth();
    await linkLegacyIfNeeded();
    await ensureUserRow();
  })();
  return bootstrapAuthAndProfilePromise;
}

async function getAuthUserId() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user?.id || null;
  } catch { return null; }
}

// --- Patch duel.html compatibility: getUserId global ---
async function getUserIdGlobal() {
  // Assure l’auth + ensure_user avant de retourner l’UID
  await bootstrapAuthAndProfile();
  return await getAuthUserId();
}


// =============================
// LECTURES / ÉCRITURES (RPC + fallback direct)
// =============================
async function getProfileSecure() {
  await bootstrapAuthAndProfile();

  // 1) RPC
  try {
    const { data, error } = await sb.rpc('get_balances');
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) || {};

    // compléter themes_possedes si absent
    if (typeof row.themes_possedes === 'undefined') {
      const uid = await getAuthUserId();
      if (uid) {
        const { data: direct, error: e2 } = await sb
          .from('users')
          .select('themes_possedes')
          .or(`id.eq.${uid},auth_id.eq.${uid}`)
          .maybeSingle();
        if (!e2 && direct) row.themes_possedes = direct.themes_possedes;
      }
    }
    return row;
  } catch (e) {
    console.warn('[getProfileSecure] RPC get_balances KO, fallback direct:', e?.message || e);
  }

  // 2) Fallback direct
  const uid = await getAuthUserId();
  if (!uid) return {};
  try {
    const { data, error } = await sb
      .from('users')
      .select('id, auth_id, pseudo, lang, vcoins, jetons, highscore, lastscore, themes_possedes')
      .or(`id.eq.${uid},auth_id.eq.${uid}`)
      .maybeSingle();
    if (error) {
      console.warn('[getProfileSecure] direct users error:', error);
      return {};
    }
    return data || {};
  } catch (e) {
    console.warn('[getProfileSecure] direct users exception:', e?.message || e);
    return {};
  }
}

// --- PSEUDO ---
async function updatePseudoSecure(newPseudo) {
  await bootstrapAuthAndProfile();
  const np = String(newPseudo || '').trim();
  if (np.length < 3) throw new Error('Pseudo trop court.');
  const { error } = await sb.rpc('update_pseudo_secure', { new_pseudo: np });
  if (error) throw error;
  setPseudoLocal(np);
  return true;
}

// --- LANG (update direct) ---
async function updateLangDirect(langCode) {
  const normalized = normalizeLangForCloud(langCode);
  if (!normalized) throw new Error('Langue invalide');

  await bootstrapAuthAndProfile();
  const uid = await getAuthUserId();
  if (!uid) throw new Error('No auth user');

  const { error } = await sb
    .from('users')
    .update({ lang: normalized })
    .or(`id.eq.${uid},auth_id.eq.${uid}`);
  if (error) throw error;
  return true;
}

// --- VCOINS ---
async function addVCoinsSecure(amount) {
  await bootstrapAuthAndProfile();
  const delta = parseInt(amount, 10) || 0;
  const { error } = await sb.rpc('ajouter_vcoins', { montant: delta });
  if (error) throw error;
}
async function getVCoinsSecure() {
  const p = await getProfileSecure();
  return p?.vcoins || 0;
}

// --- JETONS ---
async function addJetonsSecure(amount) {
  await bootstrapAuthAndProfile();
  const delta = parseInt(amount, 10) || 0;
  const { error } = await sb.rpc('ajouter_jetons', { montant: delta });
  if (error) throw error;
}
async function getJetonsSecure() {
  const p = await getProfileSecure();
  return p?.jetons || 0;
}

// --- THEMES ---
async function getUnlockedThemesCloud() {
  const p = await getProfileSecure();
  let arr = [];
  const raw = p?.themes_possedes;

  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {}
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else {
      const cleaned = raw.replace(/[{}]/g, '');
      arr = cleaned.split(/[,\s]+/).map(s => s.replace(/^"(.*)"$/, '$1')).filter(Boolean);
    }
  }

  // si rien, reselect ciblé
  if (!arr || arr.length === 0) {
    try {
      const uid = await getAuthUserId();
      if (uid) {
        const { data: d2, error: e2 } = await sb
          .from('users')
          .select('themes_possedes')
          .or(`id.eq.${uid},auth_id.eq.${uid}`)
          .maybeSingle();
        if (!e2 && d2) {
          const r2 = d2.themes_possedes;
          if (Array.isArray(r2)) arr = r2;
          else if (typeof r2 === 'string' && r2.trim()) {
            try { const p2 = JSON.parse(r2); if (Array.isArray(p2)) arr = p2; }
            catch {
              const cleaned2 = r2.replace(/[{}]/g, '');
              arr = cleaned2.split(/[,\s]+/).map(s => s.replace(/^"(.*)"$/, '$1')).filter(Boolean);
            }
          }
        }
      }
    } catch {}
  }

  const norm = [...new Set((arr || []).map(normalizeThemeKey).filter(Boolean))];
  if (!norm.includes('neon')) norm.push('neon'); // sécurité UI
  return norm;
}

async function setUnlockedThemesCloud(themes) {
  await bootstrapAuthAndProfile();
  const { error } = await sb.rpc('set_themes_secure', { themes });
  if (error) throw error;
  return true;
}
async function purchaseThemeSecure(themeKey, price) {
  await bootstrapAuthAndProfile();
  const { error } = await sb.rpc('purchase_theme', {
    theme_key: String(themeKey),
    price: parseInt(price, 10) || 0
  });
  if (error) throw error;
  return true;
}

// --- SCORES ---
function getLocalHighScore() {
  return parseInt(localStorage.getItem('highscore') || '0', 10);
}
function setLocalHighScore(score) {
  localStorage.setItem('highscore', String(score));
}
async function setHighScoreSecure(score) {
  await bootstrapAuthAndProfile();
  const val = parseInt(score, 10) || 0;
  const { error } = await sb.rpc('set_highscore_secure', { new_score: val });
  if (error) throw error;
}
async function getHighScoreSecure() {
  const p = await getProfileSecure();
  return p?.highscore || 0;
}
async function setLastScoreSecure(score) {
  await bootstrapAuthAndProfile();
  const val = parseInt(score, 10) || 0;
  const { error } = await sb.rpc('set_lastscore_secure', { last_score: val });
  if (error) throw error;
}
function updateScoreIfHigher(newScore) {
  const current = getLocalHighScore();
  if (newScore > current) {
    setLocalHighScore(newScore);
    setHighScoreSecure(newScore).catch(() => {});
  }
}

// =============================
// SYNC THÈME (Local uniquement)
// =============================
async function syncThemeFromLocal() {
  try {
    const t = normalizeThemeKey(getCurrentTheme() || 'retro');
    document.documentElement.setAttribute('data-theme', t);
    if (document.body) document.body.setAttribute('data-theme', t);
    const link = document.getElementById('theme-style');
    if (link) link.href = `themes/${t}.css`;
  } catch(e) { /* silencieux */ }
}

// =============================
// UI HELPERS
// =============================
async function updatePseudoUI() {
  try {
    const prof = await getProfileSecure();
    const pseudo = prof?.pseudo || getPseudoLocal();
    setPseudoLocal(pseudo);
    const el = document.getElementById('profilPseudo');
    if (el) el.textContent = pseudo;
  } catch {
    const el = document.getElementById('profilPseudo');
    if (el) el.textContent = getPseudoLocal();
  }
}

function setupPseudoPopup() {
  const popup = document.getElementById('popupPseudo');
  const input = document.getElementById('newPseudo');
  const errorDiv = document.getElementById('pseudoError');
  const btnChange = document.getElementById('btnChangePseudo');
  const btnSave = document.getElementById('btnSavePseudo');
  const btnCancel = document.getElementById('btnCancelPseudo');
  if (!popup || !btnChange || !btnSave || !btnCancel) return;

  btnChange.onclick = () => {
    popup.classList.add('active');
    errorDiv.textContent = '';
    input.value = getPseudoLocal();
  };
  btnCancel.onclick = () => { popup.classList.remove('active'); };
  btnSave.onclick = async () => {
    const pseudo = (input.value || '').trim();
    if (pseudo.length < 3) { errorDiv.textContent = 'Pseudo trop court.'; return; }
    try {
      await updatePseudoSecure(pseudo);
      await updatePseudoUI();
      popup.classList.remove('active');
    } catch (e) {
      errorDiv.textContent = e?.message || 'Erreur';
    }
  };
}

// bouton concours
async function checkConcoursStatus() {
  try {
    const { data, error } = await sb
      .from('config')
      .select('concours_enabled')
      .eq('id', 'global')
      .single();
    if (!error) {
      const el = document.getElementById('btnConcours');
      if (el) el.style.display = data?.concours_enabled ? 'block' : 'none';
    }
  } catch {}
}

// popups ciblées
async function checkAndShowPopupOnce() {
  try {
    await bootstrapAuthAndProfile();
    const me = await getAuthUserId();
    if (!me) return;

    const { data, error } = await sb
      .from('messages_popup')
      .select('id,message,vue,created_at')
      .eq('userid', me)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return;

    const msg = data[0];
    if (!msg.vue) {
      alert(msg.message);
      await sb.from('messages_popup').update({ vue: true }).eq('id', msg.id);
    }
  } catch {}
}

// realtime popups
async function listenPopupsRealtime() {
  try {
    await bootstrapAuthAndProfile();
    const me = await getAuthUserId();
    if (!me) return;

    sb.channel('popups_for_' + me)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages_popup', filter: `userid=eq.${me}` },
        async (payload) => {
          const m = payload.new;
          alert(m.message);
          await sb.from('messages_popup').update({ vue: true }).eq('id', m.id);
        }
      )
      .subscribe();
  } catch {}
}


// =============================
// EXPORTS GLOBAUX
// =============================
window.userData = window.userData || {};
userData.getVCoins           = getVCoinsSecure;
userData.addVCoins           = addVCoinsSecure;
userData.getJetons           = getJetonsSecure;
userData.addJetons           = addJetonsSecure;
userData.getUnlockedThemes   = getUnlockedThemesCloud;
userData.setUnlockedThemes   = setUnlockedThemesCloud; // admin/debug
userData.purchaseTheme       = purchaseThemeSecure;

userData.getHighScore        = getHighScoreSecure;
userData.setHighScore        = setHighScoreSecure;
userData.setLastScore        = setLastScoreSecure;
userData.updateScoreIfHigher = updateScoreIfHigher;

userData.updateLangDirect    = updateLangDirect;

// thème (100% local)
userData.applyLocalTheme     = applyLocalTheme;
userData.syncThemeFromLocal  = syncThemeFromLocal;

window.updatePseudoUI        = updatePseudoUI;
window.setupPseudoPopup      = setupPseudoPopup;
window.bootstrapAuthAndProfile = bootstrapAuthAndProfile;

// --- exports auth / UID ---
userData.ensureAuth          = ensureAuth;
userData.getAuthUserId       = getAuthUserId;
userData.getUserId           = getUserIdGlobal;   // ✅ nouvel export haut-niveau
window.getUserId             = getUserIdGlobal;   // ✅ compat héritée (duel.html)

// confort
window.getCurrentTheme       = getCurrentTheme;
window.setCurrentTheme       = setCurrentTheme;

// =============================
// DEBUG
// =============================
window.debugDumpThemes = async function(){
  const prof = await getProfileSecure();
  console.log('[debugDumpThemes] raw themes_possedes =', prof?.themes_possedes);
  try {
    const norm = Array.isArray(prof?.themes_possedes)
      ? prof.themes_possedes.map(normalizeThemeKey)
      : [];
    console.log('[debugDumpThemes] normalized possédés =', norm);
  } catch {}
  console.log('[debugDumpThemes] local themeVBlocks =', getCurrentTheme());
};
