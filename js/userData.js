// =============================
// INIT SUPABASE (création unique, mode Capacitor / Web)
// =============================
const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

if (!window.sb) {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const sb = window.sb;
// Expose aussi en global pour les tests console
if (!window.supabase) window.supabase = sb;

// == THEMES VBLOCKS ==
const ALL_THEMES = [
  "neon",   // par défaut, toujours débloqué (UI)
  "nuit", "nature", "bubble", "retro",
  "vitraux", "angelique", "luxury", "space", "cyber", "arabic", "grece", "japon"
];
window.getAllThemes = function () { return ALL_THEMES; };

// Normalisation des clés de thèmes (évite accents/espaces/majuscules)
function normalizeThemeKey(k){
  return String(k || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'');
}

// Thème courant (local, purement visuel)
function getCurrentTheme() {
  return localStorage.getItem("themeVBlocks") || "neon";
}
function setCurrentTheme(theme) {
  localStorage.setItem("themeVBlocks", theme);
}

// Appliquer un thème local immédiatement + notifier app/onglets
function applyLocalTheme(themeKey) {
  const t = normalizeThemeKey(themeKey || 'neon');
  // cache local
  setCurrentTheme(t);

  // set data-theme (HTML & body pour compat)
  try { document.documentElement.setAttribute('data-theme', t); } catch {}
  try { document.body && document.body.setAttribute('data-theme', t); } catch {}

  // feuille de style dédiée si tu utilises <link id="theme-style">
  const link = document.getElementById('theme-style');
  if (link) link.href = `themes/${t}.css`;

  // notifier le jeu (même onglet)
  try { window.dispatchEvent(new CustomEvent('vblocks-theme-changed', { detail:{ theme: t } })); } catch {}

  // notifier autres onglets
  try { localStorage.setItem('themeVBlocks', t); } catch {}
}

// =============================
// AUTH ANONYME + MIGRATION LEGACY
// =============================

// (legacy) ID local historique — on ne s’en sert plus pour écrire,
// mais on l’utilise 1x pour lier l’ancien profil à l’auth anonyme
function getLegacyLocalUserId() {
  return localStorage.getItem('user_id') || null;
}

// Pseudo local
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

// Langue
function normalizeLangForCloud(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  if (["FR","EN","ES","DE","IT","PT","PT-BR","NL","AR","IDN","JP","KO"].includes(c)) return c;

  const lower = c.toLowerCase();
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
  return null;
}
function detectPreferredLangForCloud() {
  const list = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || navigator.userLanguage];
  for (const c of list) {
    const n = normalizeLangForCloud(c);
    if (n) return n;
  }
  return "EN";
}
function getLang() {
  const stored = localStorage.getItem('langue');
  const nStored = normalizeLangForCloud(stored);
  if (nStored) return nStored;
  return detectPreferredLangForCloud();
}

// --- 1) S’assurer qu’on a une session anonyme ---
async function ensureAuth() {
  try {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) console.warn('[auth.getSession] warn:', error?.message);
    if (!session) {
      const { error: errAnon } = await sb.auth.signInAnonymously();
      if (errAnon) throw errAnon;
    }
  } catch (e) {
    console.error('[ensureAuth] échec auth anonyme:', e?.message || e);
    throw e;
  }
}

// --- 2) Lier l’auth anonyme à l’ancien profil local (si existant) ---
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

// --- 3) Créer la ligne user si besoin (via RPC sécurisée) ---
async function ensureUserRow() {
  try {
    const lang = getLang();
    const pseudoFallback = getPseudoLocal();
    await sb.rpc('ensure_user', { default_lang: lang, default_pseudo: pseudoFallback });
  } catch (e) {
    console.warn('[ensureUserRow] non bloquant:', e?.message || e);
  }
}

// --- 4) Bootstrap global à appeler au démarrage de l’app ---
async function bootstrapAuthAndProfile() {
  await ensureAuth();
  await linkLegacyIfNeeded();
  await ensureUserRow();
}

// Récup id auth courant
async function getAuthUserId() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user?.id || null;
  } catch { return null; }
}

// =============================
// LECTURES / ÉCRITURES SÉCURISÉES (RPC + direct)
// =============================

// Lecture profil : RPC get_balances, sinon fallback direct table `users`.
// + Si la RPC ne renvoie PAS themes_possedes, on complète par un SELECT direct.
async function getProfileSecure() {
  await bootstrapAuthAndProfile();

  // 1) Essayer la RPC
  try {
    const { data, error } = await sb.rpc('get_balances'); // renvoie 1 ligne
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) || {};

    // PATCH: si la RPC ne renvoie pas themes_possedes, select direct
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

  // 2) Fallback direct sur la table users (id OU auth_id)
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

// --- LANG (update direct, sans RPC) ---
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
// Liste “possédés” reste en base pour les déblocages/achats
async function getUnlockedThemesCloud() {
  const p = await getProfileSecure(); // lit get_balances (puis fallback direct)
  let arr = [];

  const raw = p?.themes_possedes;

  // 1) Déjà un tableau JS -> OK
  if (Array.isArray(raw)) {
    arr = raw;

  // 2) JSON string -> parse
  } else if (typeof raw === 'string' && raw.trim()) {
    let parsed = null;
    try {
      parsed = JSON.parse(raw); // ex: '["retro","neon"]'
    } catch { /* ignore */ }

    if (Array.isArray(parsed)) {
      arr = parsed;
    } else {
      // 3) Fallback CSV / text[] aplati -> split
      // enlève { } éventuels (format Postgres array), puis split virgules/espaces
      const cleaned = raw.replace(/[{}]/g, '');
      arr = cleaned.split(/[,\s]+/).map(s => s.replace(/^"(.*)"$/, '$1')).filter(Boolean);
    }
  }

  // 2bis) Si on a toujours rien, on force un SELECT ciblé 'themes_possedes'
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
            try { const p2 = JSON.parse(r2); if (Array.isArray(p2)) arr = p2; } catch {
              const cleaned2 = r2.replace(/[{}]/g, '');
              arr = cleaned2.split(/[,\s]+/).map(s => s.replace(/^"(.*)"$/, '$1')).filter(Boolean);
            }
          }
        }
      }
    } catch {}
  }

  // 3) Normalise + unique
  const norm = [...new Set((arr || []).map(normalizeThemeKey).filter(Boolean))];

  // 4) Sécurité UI : 'neon' toujours utilisable si rien ne remonte
  if (!norm.includes('neon')) norm.push('neon');

  return norm;
}

// Achat serveur (inchangé)
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
// À appeler au boot d’une page pour appliquer le thème stocké localement
async function syncThemeFromLocal() {
  try {
    const t = normalizeThemeKey(getCurrentTheme() || 'neon');
    // data-theme et CSS
    document.documentElement.setAttribute('data-theme', t);
    if (document.body) document.body.setAttribute('data-theme', t);
    const link = document.getElementById('theme-style');
    if (link) link.href = `themes/${t}.css`;
  } catch(e) {
    // silencieux
  }
}

// =============================
// UI HELPERS (profil / pseudo / concours / popups)
// =============================
async function updatePseudoUI() {
  try {
    const prof = await getProfileSecure();
    const pseudo = prof?.pseudo || getPseudoLocal();
    setPseudoLocal(pseudo);
    const el = document.getElementById("profilPseudo");
    if (el) el.textContent = pseudo;
  } catch {
    const el = document.getElementById("profilPseudo");
    if (el) el.textContent = getPseudoLocal();
  }
}

function setupPseudoPopup() {
  const popup = document.getElementById("popupPseudo");
  const input = document.getElementById("newPseudo");
  const errorDiv = document.getElementById("pseudoError");
  const btnChange = document.getElementById("btnChangePseudo");
  const btnSave = document.getElementById("btnSavePseudo");
  const btnCancel = document.getElementById("btnCancelPseudo");
  if (!popup || !btnChange || !btnSave || !btnCancel) return;

  btnChange.onclick = () => {
    popup.classList.add("active");
    errorDiv.textContent = "";
    input.value = getPseudoLocal();
  };
  btnCancel.onclick = () => {
    popup.classList.remove("active");
  };
  btnSave.onclick = async () => {
    const pseudo = input.value.trim();
    if (pseudo.length < 3) {
      errorDiv.textContent = "Pseudo trop court.";
      return;
    }
    try {
      await updatePseudoSecure(pseudo);
      await updatePseudoUI();
      popup.classList.remove("active");
    } catch (e) {
      errorDiv.textContent = e?.message || "Erreur";
    }
  };
}

// Bouton concours affiché selon config
async function checkConcoursStatus() {
  try {
    const { data, error } = await sb
      .from('config')
      .select('concours_enabled')
      .eq('id', 'global')
      .single();
    if (!error) {
      const el = document.getElementById("btnConcours");
      if (el) el.style.display = data?.concours_enabled ? "block" : "none";
    }
  } catch {}
}

// Popups ciblées
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

// Realtime popups
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

// Thème (nouveau flux 100% local)
userData.applyLocalTheme     = applyLocalTheme;
userData.syncThemeFromLocal  = syncThemeFromLocal;

window.updatePseudoUI        = updatePseudoUI;
window.setupPseudoPopup      = setupPseudoPopup;
window.bootstrapAuthAndProfile = bootstrapAuthAndProfile;

// Confort : expose aussi ces helpers
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
    console.log('[debugDumpThemes] normalized possédés=', norm);
  } catch {}
  console.log('[debugDumpThemes] local themeVBlocks  =', getCurrentTheme());
};
