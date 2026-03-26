(function () {
  const APP_ID = "23cf996f-ec9b-4d8d-8991-2471353aa863";

  const LS_PROMPT_PENDING = "vb_os_prompt_pending_v1";
  const LS_PROMPT_DONE = "vb_os_prompt_done_v1";

  let booted = false;

  function getOneSignal() {
    try {
      return window.plugins?.OneSignal || window.OneSignal || null;
    } catch (_) {
      return null;
    }
  }

  function isNative() {
    try {
      return !!window.cordova;
    } catch (_) {
      return false;
    }
  }

  async function syncUser() {
    try {
      const OneSignal = getOneSignal();
      if (!OneSignal) return;

      const uid = await window.userData?.getAuthUserId?.();
      if (!uid) return;

      // Lier le device OneSignal à ton user applicatif
      await OneSignal.login?.(String(uid));
    } catch (_) {}
  }

  async function initOneSignal() {
    if (booted) return;
    booted = true;

    if (!isNative()) return;

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    try {
      // Debug local si besoin, enlève en prod si tu veux
      OneSignal.Debug?.setLogLevel?.(6);
    } catch (_) {}

    try {
      // Init officielle côté plugin JS
      OneSignal.initialize?.(APP_ID);
    } catch (_) {}

    try {
      await syncUser();
    } catch (_) {}
  }

  async function maybePromptOnIndexAfterGameReturn() {
    try {
      const OneSignal = getOneSignal();
      if (!OneSignal) return false;

      const alreadyDone = localStorage.getItem(LS_PROMPT_DONE) === "1";
      const pending = localStorage.getItem(LS_PROMPT_PENDING) === "1";

      if (alreadyDone || !pending) return false;

      localStorage.removeItem(LS_PROMPT_PENDING);

      let accepted = false;
      try {
        accepted = await OneSignal.Notifications?.requestPermission?.(false);
      } catch (_) {}

      localStorage.setItem(LS_PROMPT_DONE, "1");
      return !!accepted;
    } catch (_) {
      return false;
    }
  }

  function preparePromptOnNextIndex() {
    try {
      localStorage.setItem(LS_PROMPT_PENDING, "1");
    } catch (_) {}
  }

  window.VROneSignal = {
    init: initOneSignal,
    syncUser,
    preparePromptOnNextIndex,
    maybePromptOnIndexAfterGameReturn
  };

  document.addEventListener("deviceready", function () {
    initOneSignal();
  }, false);
})();
