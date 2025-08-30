// =============================
// INIT SUPABASE (création unique, mode Capacitor / Web)
// =============================
const SUPABASE_URL = 'https://youhealyblgbwjhsskca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWhlYWx5YmxnYndqaHNza2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjAwMzcsImV4cCI6MjA2NDQzNjAzN30.2PUwMKq-xQOF3d2J_gg9EkZSBEbR-X5DachRUp6Auiw';

if (!window.sb) {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const sb = window.sb;

// == THEMES VBLOCKS ==
const ALL_THEMES = [
  "neon",   // par défaut, toujours débloqué
  "nuit", "nature", "bubble", "retro",
  "vitraux", "angelique", "luxury", "space", "cyber",   "arabic", "grece", "japon" 
];
window.getAllThemes = function () { return ALL_THEMES; };

// Thème courant (local, purement visuel)
function getCurrentTheme() {
  return localStorage.getItem("themeVBlocks") || "neon";
}
function setCurrentTheme(theme) {
  localStorage.setItem("themeVBlocks", theme);
}

// =============================
// AUTH ANONYME + MIGRATION LEGACY
// =============================

// (legacy) ID local historique — on ne s’en sert plus pour écrire,
// mais on l’utilise 1x pour lier l’ancien profil à l’auth anonyme
function getLegacyLocalUserId() {
  return localStorage.getItem('user_id') || null;
}

// Pseudo local (cache UI, on passe ensuite par RPC sécurisée pour écrire)
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

// Langue — alignée sur i18n.js (mêmes clés)
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
    // lie auth.uid() -> users.auth_id = me pour l'ancienne ligne id = legacy
    const { error } = await sb.rpc('link_auth_to_legacy', { legacy_id: legacy });
    if (!error) {
      localStorage.setItem('legacy_linked', '1');
    }
  } catch (e) {
    console.warn('[linkLegacyIfNeeded] non bloquant:', e?.message || e);
  }
}

// --- 3) Créer la ligne user si besoin (via RPC sécurisée) ---
async function ensureUserRow() {
  try {
    const lang = getLang();
    const pseudoFallback = getPseudoLocal();
    // crée le profil si inexistant (id = auth.uid() OU déjà mappé via auth_id)
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

// Regroupe les champs courants du profil
async function getProfileSecure() {
  await bootstrapAuthAndProfile();
  const { data, error } = await sb.rpc('get_balances'); // renvoie 1 ligne
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) || {};
  // fallback minimum si table vide (ne devrait pas arriver)
  if (!row.themes_possedes || !Array.isArray(row.themes_possedes)) {
    row.themes_possedes = ["neon","retro"]; // ← ajouté retro par défaut
  }
  return row;
}

// --- PSEUDO ---
async function updatePseudoSecure(newPseudo) {
  await bootstrapAuthAndProfile();
  const np = String(newPseudo || '').trim();
  if (np.length < 3) throw new Error('Pseudo trop court.');
  const { error } = await sb.rpc('update_pseudo_secure', { new_pseudo: np });
  if (error) throw error;
  setPseudoLocal(np); // garde le cache visuel en phase
  return true;
}

// --- LANG (update direct, sans RPC) ---
async function updateLangDirect(langCode) {
  const normalized = normalizeLangForCloud(langCode);
  if (!normalized) throw new Error('Langue invalide');

  await bootstrapAuthAndProfile();
  const { data: { user } } = await sb.auth.getUser();
  const uid = user?.id;
  if (!uid) throw new Error('No auth user');

  // Met à jour la ligne où id==uid OU auth_id==uid (migration legacy)
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
  // On relit si besoin via getProfileSecure()
}
async function getVCoinsSecure() {
  const p = await getProfileSecure();
  return p.vcoins || 0;
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
  return p.jetons || 0;
}

// --- THEMES ---
async function getUnlockedThemesCloud() {
  const p = await getProfileSecure();
  return Array.isArray(p.themes_possedes) ? p.themes_possedes : ["neon","retro"]; // ← fallback harmonisé
}
async function setUnlockedThemesCloud(themes) {
  // Normalement on passe par purchase_theme() côté serveur pour les achats.
  // Si besoin admin/debug: setter sécurisé (optionnel).
  await bootstrapAuthAndProfile();
  const { error } = await sb.rpc('set_themes_secure', { themes });
  if (error) throw error;
  return true;
}
async function purchaseThemeSecure(themeKey, price) {
  await bootstrapAuthAndProfile();
  const { error } = await sb.rpc('purchase_theme', { theme_key: String(themeKey), price: parseInt(price, 10) || 0 });
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
  return p.highscore || 0;
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
    // on ne bloque pas sur l’async
    setHighScoreSecure(newScore).catch(() => {});
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

// Popups ciblées (table messages_popup.userid = auth.uid())
// + marquage "vue"
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
      alert(msg.message); // remplace par ta modale custom si besoin
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
userData.getVCoins         = getVCoinsSecure;
userData.addVCoins         = addVCoinsSecure;
userData.getJetons         = getJetonsSecure;
userData.addJetons         = addJetonsSecure;
userData.getUnlockedThemes = getUnlockedThemesCloud;
userData.setUnlockedThemes = setUnlockedThemesCloud; // admin/debug
userData.purchaseTheme     = purchaseThemeSecure;

userData.getHighScore      = getHighScoreSecure;
userData.setHighScore      = setHighScoreSecure;
userData.setLastScore      = setLastScoreSecure;
userData.updateScoreIfHigher = updateScoreIfHigher;

// ⬇️ Export de la mise à jour directe de la langue
userData.updateLangDirect  = updateLangDirect;

window.updatePseudoUI      = updatePseudoUI;
window.setupPseudoPopup    = setupPseudoPopup;
window.bootstrapAuthAndProfile = bootstrapAuthAndProfile;

// Confort : expose aussi ces helpers
window.getCurrentTheme     = getCurrentTheme;
window.setCurrentTheme     = setCurrentTheme;
