(function () {
  "use strict";

  const FETCHED_KEY = "vblocks_install_referrer_fetched_v1";
  const PENDING_INVITER_KEY = "vblocks_install_referrer_pending_inviter_v1";
  const PENDING_RAW_KEY = "vblocks_install_referrer_pending_raw_v1";

  const PLAY_URL_BASE = "https://play.google.com/store/apps/details?id=com.vboldstudio.VBlocks";

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
    const raw = "inviter_uuid=" + encodeURIComponent(uid);
    return PLAY_URL_BASE + "&referrer=" + encodeURIComponent(raw);
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
        await showAndroidOnlyInvitePopup();
        await shareInvite();
      });
    });
  }

  async function bootReferral() {
    await fetchReferrerOnceFromNative();
    await claimPendingReferral();
    bindInviteButtons();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootReferral().catch(() => {});
  });

  window.VReferral = {
    bootReferral,
    shareInvite
  };
})();
