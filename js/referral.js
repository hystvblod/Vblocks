(function () {
  "use strict";

  const FETCHED_KEY = "vblocks_install_referrer_fetched_v1";
  const PENDING_INVITER_KEY = "vblocks_install_referrer_pending_inviter_v1";
  const PENDING_RAW_KEY = "vblocks_install_referrer_pending_raw_v1";

  const INVITE_BASE_URL = "https://hystvblod.github.io/vblocks-invite/invite.html";
  const INDEX_SHARE_PROMPT_STATE_KEY = "vblocks_referral_index_share_state_v2";
  const INDEX_SHARE_PROMPT_QUEUE_KEY = "vblocks_referral_index_share_queue_v2";
  const INDEX_SHARE_PROMPT_MIN_RUNS = 12;
  const INDEX_SHARE_PROMPT_MIN_MS = 3 * 24 * 60 * 60 * 1000;
  const INDEX_SHARE_PROMPT_MAX_SHOWS = 2;

  function t(key, fallback) {
    try {
      if (typeof window.i18nGet === "function") {
        const v = window.i18nGet(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback || key;
  }

  function isNativeAndroid() {
    try {
      return !!window.Capacitor?.isNativePlatform?.() &&
             window.Capacitor?.getPlatform?.() === "android";
    } catch (_) {
      return false;
    }
  }

  function getInstallReferrerPlugin() {
    try {
      if (window.Capacitor?.registerPlugin) {
        return window.Capacitor.registerPlugin("InstallReferrer");
      }
      return window.Capacitor?.Plugins?.InstallReferrer || null;
    } catch (_) {
      return null;
    }
  }

  function getSharePlugin() {
    try {
      if (window.Capacitor?.registerPlugin) {
        return window.Capacitor.registerPlugin("Share");
      }
      return window.Capacitor?.Plugins?.Share || null;
    } catch (_) {
      return null;
    }
  }

  async function getCurrentUid() {
    try { await window.bootstrapAuthAndProfile?.(); } catch (_) {}

    try {
      if (window.userData?.getUserId) {
        const uid = await window.userData.getUserId();
        if (uid) return uid;
      }
    } catch (_) {}

    const sb = window.sb;
    if (!sb?.auth) return "";

    try {
      const s = await sb.auth.getSession();
      const uid = s?.data?.session?.user?.id || "";
      if (uid) return uid;
    } catch (_) {}

    try {
      const r = await sb.auth.getUser();
      return r?.data?.user?.id || "";
    } catch (_) {
      return "";
    }
  }

  function buildInviteUrl(uid) {
    return INVITE_BASE_URL + "?inviter_uuid=" + encodeURIComponent(uid);
  }

  async function shareInvite() {
    const uid = await getCurrentUid();
    if (!uid) return false;

    const url = buildInviteUrl(uid);
    const text = t("referral.share_text", "Télécharge VBlocks ici : {url}")
      .replaceAll("{url}", url);

    const Share = getSharePlugin();

    try {
      if (Share?.share) {
        await Share.share({
          title: t("referral.share_title", "Inviter un ami"),
          text,
          dialogTitle: t("referral.share_title", "Inviter un ami")
        });
        return true;
      }
    } catch (_) {}

    try {
      if (navigator.share) {
        await navigator.share({
          title: t("referral.share_title", "Inviter un ami"),
          text
        });
        return true;
      }
    } catch (_) {}

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        alert(t("referral.link_copied", "Lien copié"));
        return true;
      }
    } catch (_) {}

    return false;
  }

  async function fetchReferrerOnceFromNative() {
    if (!isNativeAndroid()) return;
    if (localStorage.getItem(FETCHED_KEY) === "1") return;

    const plugin = getInstallReferrerPlugin();
    if (!plugin?.getInstallReferrer) return;

    try {
      const data = await plugin.getInstallReferrer();

      if (data?.canRetry) return;

      localStorage.setItem(FETCHED_KEY, "1");

      const inviterUuid = String(data?.inviterUuid || "").trim();
      const rawReferrer = String(data?.rawReferrer || "").trim();

      if (inviterUuid) {
        localStorage.setItem(PENDING_INVITER_KEY, inviterUuid);
        localStorage.setItem(PENDING_RAW_KEY, rawReferrer);
      }
    } catch (_) {}
  }

  async function claimPendingReferral() {
    const pendingInviter = String(localStorage.getItem(PENDING_INVITER_KEY) || "").trim();
    if (!pendingInviter) return;

    const pendingRaw = String(localStorage.getItem(PENDING_RAW_KEY) || "").trim();

    try { await window.bootstrapAuthAndProfile?.(); } catch (_) {}

    const sb = window.sb;
    if (!sb?.rpc) return;

    try {
      const { data, error } = await sb.rpc("secure_claim_referral_install", {
        p_inviter: pendingInviter,
        p_raw: pendingRaw || null
      });

      if (error) return;

      const reason = String(data?.reason || "");

      if (data?.ok && (reason === "claimed" || reason === "already_processed")) {
        localStorage.removeItem(PENDING_INVITER_KEY);
        localStorage.removeItem(PENDING_RAW_KEY);
        return;
      }

      if (
        reason === "self_referral" ||
        reason === "invalid_inviter" ||
        reason === "inviter_limit_reached"
      ) {
        localStorage.removeItem(PENDING_INVITER_KEY);
        localStorage.removeItem(PENDING_RAW_KEY);
      }
    } catch (_) {}
  }

  function getPageName() {
    try {
      const file = String(window.location.pathname || "").split("/").pop() || "";
      return file.replace(/\.html$/i, "").trim().toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function isIndexPage() {
    return getPageName() === "index";
  }

  function readIndexSharePromptState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(INDEX_SHARE_PROMPT_STATE_KEY) || "{}");
      return {
        completedRuns: Math.max(0, Number(parsed.completedRuns || 0) || 0),
        lastShownRun: Math.max(0, Number(parsed.lastShownRun || 0) || 0),
        lastShownAt: Math.max(0, Number(parsed.lastShownAt || 0) || 0),
        shownCount: Math.max(0, Number(parsed.shownCount || 0) || 0)
      };
    } catch (_) {
      return {
        completedRuns: 0,
        lastShownRun: 0,
        lastShownAt: 0,
        shownCount: 0
      };
    }
  }

  function writeIndexSharePromptState(state) {
    try {
      localStorage.setItem(INDEX_SHARE_PROMPT_STATE_KEY, JSON.stringify({
        completedRuns: Math.max(0, Number(state?.completedRuns || 0) || 0),
        lastShownRun: Math.max(0, Number(state?.lastShownRun || 0) || 0),
        lastShownAt: Math.max(0, Number(state?.lastShownAt || 0) || 0),
        shownCount: Math.max(0, Number(state?.shownCount || 0) || 0)
      }));
    } catch (_) {}
  }

  function registerCompletedRun() {
    const state = readIndexSharePromptState();
    state.completedRuns += 1;
    writeIndexSharePromptState(state);
    return state;
  }

  function canShowIndexSharePrompt(state) {
    const st = state || readIndexSharePromptState();
    if (Math.max(0, Number(st.shownCount || 0) || 0) >= INDEX_SHARE_PROMPT_MAX_SHOWS) return false;
    if (!st.lastShownRun && !st.lastShownAt) return true;

    const enoughRuns =
      (Math.max(0, Number(st.completedRuns || 0) || 0) - Math.max(0, Number(st.lastShownRun || 0) || 0)) >= INDEX_SHARE_PROMPT_MIN_RUNS;
    const enoughTime =
      (Date.now() - Math.max(0, Number(st.lastShownAt || 0) || 0)) >= INDEX_SHARE_PROMPT_MIN_MS;

    return enoughRuns && enoughTime;
  }

  function maybeQueueIndexSharePrompt(shouldOffer) {
    if (!shouldOffer) return false;
    const state = readIndexSharePromptState();
    if (!canShowIndexSharePrompt(state)) return false;
    try { sessionStorage.setItem(INDEX_SHARE_PROMPT_QUEUE_KEY, "1"); } catch (_) {}
    return true;
  }

  function markIndexSharePromptShown() {
    const state = readIndexSharePromptState();
    state.lastShownRun = Math.max(0, Number(state.completedRuns || 0) || 0);
    state.lastShownAt = Date.now();
    state.shownCount = Math.max(0, Number(state.shownCount || 0) || 0) + 1;
    writeIndexSharePromptState(state);
    return state;
  }

  function showIndexSharePromptPopup() {
    return new Promise((resolve) => {
      let root = document.getElementById("vr-referral-index-share-popup");
      if (!root) {
        root = document.createElement("div");
        root.id = "vr-referral-index-share-popup";
        root.style.cssText = [
          "position:fixed",
          "inset:0",
          "z-index:100220",
          "display:none",
          "align-items:center",
          "justify-content:center",
          "padding:18px",
          "background:rgba(0,0,0,.62)",
          "backdrop-filter:blur(8px)"
        ].join(";");

        root.innerHTML = `
          <div role="dialog" aria-modal="true" style="position:relative;width:min(430px,92vw);border-radius:22px;padding:20px 18px;background:linear-gradient(180deg, rgba(36,55,117,.98), rgba(28,35,76,.98));border:1px solid rgba(255,255,255,.14);box-shadow:0 18px 42px rgba(0,0,0,.32);color:#fff;">
            <button id="vr-referral-index-share-popup-close" type="button" style="position:absolute;top:12px;right:12px;width:38px;height:38px;border:none;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:18px;font-weight:900;cursor:pointer;">×</button>

            <div id="vr-referral-index-share-popup-title" style="font-size:22px;line-height:1.15;font-weight:900;margin-bottom:10px;text-align:center;padding:0 26px;"></div>

            <div id="vr-referral-index-share-popup-body" style="font-size:14px;line-height:1.5;color:rgba(255,255,255,.94);margin-bottom:14px;text-align:center;"></div>

            <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px;text-align:center;flex-wrap:wrap;">
              <span style="font-size:17px;font-weight:900;">${t("referral.invite_and_earn_btn", "Inviter et gagner")}</span>
              <img src="assets/images/vcoin.webp" alt="" style="width:22px;height:22px;object-fit:contain;" />
              <span style="font-size:18px;font-weight:900;">+500</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr;gap:10px;">
              <button id="vr-referral-index-share-popup-main" type="button" style="min-height:54px;border:none;border-radius:16px;background:linear-gradient(90deg,#7fbeff 0%,#63dcfb 100%);color:#fff;font-weight:900;font-size:18px;letter-spacing:.2px;cursor:pointer;box-shadow:0 10px 24px rgba(99,220,251,.28);">
                ${t("referral.invite_btn", "Inviter")}
              </button>
              <button id="vr-referral-index-share-popup-later" type="button" style="min-height:48px;border:none;border-radius:16px;background:rgba(255,255,255,.15);color:#fff;font-weight:800;cursor:pointer;">
                ${t("common.later", "Plus tard")}
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(root);
      }

      const titleEl = document.getElementById("vr-referral-index-share-popup-title");
      const bodyEl = document.getElementById("vr-referral-index-share-popup-body");
      const closeBtn = document.getElementById("vr-referral-index-share-popup-close");
      const mainBtn = document.getElementById("vr-referral-index-share-popup-main");
      const laterBtn = document.getElementById("vr-referral-index-share-popup-later");

      if (titleEl) titleEl.textContent = t("referral.share_popup_title", "Tu aimes VBlocks ?");
      if (bodyEl) bodyEl.textContent = t("referral.share_popup_body", "Partage-le avec tes proches, fais découvrir le jeu et gagne des VCoins quand une invitation est validée.");

      const close = () => {
        root.style.display = "none";
        root.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (mainBtn) mainBtn.onclick = null;
        if (laterBtn) laterBtn.onclick = null;
        document.removeEventListener("keydown", onKeyDown);
        resolve(true);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") close();
      };

      root.onclick = (e) => {
        if (e.target === root) close();
      };
      if (closeBtn) closeBtn.onclick = close;
      if (laterBtn) laterBtn.onclick = close;
      if (mainBtn) {
        mainBtn.onclick = async () => {
          try { await shareInvite(); } catch (_) {}
          close();
        };
      }

      root.style.display = "flex";
      document.addEventListener("keydown", onKeyDown);

      if (mainBtn?.animate) {
        mainBtn.animate(
          [
            { transform: "scale(1)", boxShadow: "0 10px 24px rgba(99,220,251,.28)" },
            { transform: "scale(1.03)", boxShadow: "0 14px 30px rgba(99,220,251,.42)" },
            { transform: "scale(1)", boxShadow: "0 10px 24px rgba(99,220,251,.28)" }
          ],
          {
            duration: 1400,
            iterations: Infinity,
            easing: "ease-in-out"
          }
        );
      }

      setTimeout(() => mainBtn?.focus?.(), 0);
    });
  }

  async function maybeShowQueuedIndexSharePrompt() {
    if (!isIndexPage()) return false;

    let queued = false;
    try {
      queued = sessionStorage.getItem(INDEX_SHARE_PROMPT_QUEUE_KEY) === "1";
    } catch (_) {}
    if (!queued) return false;

    try { sessionStorage.removeItem(INDEX_SHARE_PROMPT_QUEUE_KEY); } catch (_) {}

    const state = readIndexSharePromptState();
    if (!canShowIndexSharePrompt(state)) return false;

    markIndexSharePromptShown();
    await showIndexSharePromptPopup();
    return true;
  }

  function showAndroidOnlyInvitePopup() {
    return new Promise((resolve) => {
      let root = document.getElementById("vr-referral-platform-popup");

      if (!root) {
        root = document.createElement("div");
        root.id = "vr-referral-platform-popup";
        root.style.cssText = [
          "position:fixed",
          "inset:0",
          "z-index:100180",
          "display:none",
          "align-items:center",
          "justify-content:center",
          "padding:20px",
          "background:rgba(0,0,0,.62)",
          "backdrop-filter:blur(8px)"
        ].join(";");

        root.innerHTML = `
          <div style="width:min(420px,92vw);background:linear-gradient(180deg, rgba(36,55,117,.98), rgba(28,35,76,.98));border:1px solid rgba(255,255,255,.16);border-radius:1.45em;padding:16px;box-shadow:0 18px 42px rgba(0,0,0,.28);color:#fff;">
            <div id="vr-referral-platform-popup-text" style="font-size:14px;line-height:1.45;color:rgba(255,255,255,.94);margin-bottom:14px;"></div>
            <button id="vr-referral-platform-popup-ok" type="button" style="width:100%;min-height:48px;border:none;border-radius:999px;background:linear-gradient(90deg,#7fbeff 0%,#63dcfb 100%);color:#fff;font-weight:800;cursor:pointer;"></button>
          </div>
        `;

        document.body.appendChild(root);
      }

      const textEl = document.getElementById("vr-referral-platform-popup-text");
      const okBtn = document.getElementById("vr-referral-platform-popup-ok");

      if (textEl) {
        textEl.textContent = t(
          "referral.android_only_popup.text",
          "Seule la version Android est disponible pour le moment. La version iOS est en cours et ne peut donc pas être téléchargée pour le moment."
        );
      }

      if (okBtn) {
        okBtn.textContent = t("common.continue", "Continuer");
      }

      const close = () => {
        root.style.display = "none";
        root.onclick = null;
        if (okBtn) okBtn.onclick = null;
        resolve(true);
      };

      root.onclick = (e) => {
        if (e.target === root) close();
      };
      if (okBtn) okBtn.onclick = close;

      root.style.display = "flex";
    });
  }

  function bindInviteButtons() {
    ["pf_invite_btn", "cp_invite_btn"].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.boundReferral === "1") return;

      btn.dataset.boundReferral = "1";
      btn.addEventListener("click", async () => {
        await shareInvite();
      });
    });
  }

  async function bootReferral() {
    await fetchReferrerOnceFromNative();
    await claimPendingReferral();
    bindInviteButtons();
    await maybeShowQueuedIndexSharePrompt();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootReferral().catch(() => {});
  });

  window.VReferral = {
    bootReferral,
    shareInvite,
    registerCompletedRun,
    maybeQueueIndexSharePrompt,
    showIndexSharePromptPopup
  };
})();
