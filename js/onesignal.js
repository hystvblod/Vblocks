(function () {
  const APP_ID = "23cf996f-ec9b-4d8d-8991-2471353aa863";

  const LS_PROMPT_PENDING = "vb_os_prompt_pending_v1";
  const LS_PROMPT_DONE = "vb_os_prompt_done_v1";

  let booted = false;

  function getOneSignal() {
    try {
      return window.plugins?.OneSignal || null;
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

      await OneSignal.login?.(String(uid));
    } catch (_) {}
  }

  async function initOneSignal() {
    if (booted) return true;
    if (!isNative()) return false;

    const OneSignal = getOneSignal();
    if (!OneSignal) {
      console.warn("[OneSignal] plugin introuvable");
      return false;
    }

    try {
      OneSignal.Debug?.setLogLevel?.(6);
    } catch (_) {}

    try {
      if (typeof OneSignal.initialize === "function") {
        OneSignal.initialize(APP_ID);
      } else if (typeof OneSignal.setAppId === "function") {
        OneSignal.setAppId(APP_ID);
      } else {
        console.warn("[OneSignal] initialize/setAppId introuvable");
        return false;
      }

      booted = true;
      await syncUser();
      return true;
    } catch (e) {
      console.warn("[OneSignal] initOneSignal() failed", e);
      return false;
    }
  }

  async function requestNativePermission() {
    const ok = await initOneSignal();
    if (!ok) {
      return { attempted: false, accepted: false };
    }

    try {
      const alreadyDone = localStorage.getItem(LS_PROMPT_DONE) === "1";
      if (alreadyDone) {
        return { attempted: false, accepted: false };
      }
    } catch (_) {}

    try {
      const OneSignal = getOneSignal();
      const accepted = await OneSignal?.Notifications?.requestPermission?.(false);

      localStorage.setItem(LS_PROMPT_DONE, "1");
      return { attempted: true, accepted: !!accepted };
    } catch (e) {
      console.warn("[OneSignal] requestNativePermission() failed", e);
      return { attempted: false, accepted: false };
    }
  }

  function preparePromptOnNextIndex() {
    try {
      localStorage.setItem(LS_PROMPT_PENDING, "1");
    } catch (_) {}
  }

  async function maybePromptOnIndexAfterGameReturn() {
    try {
      const alreadyDone = localStorage.getItem(LS_PROMPT_DONE) === "1";
      const pending = localStorage.getItem(LS_PROMPT_PENDING) === "1";

      if (alreadyDone || !pending) return false;

      localStorage.removeItem(LS_PROMPT_PENDING);

      const result = await requestNativePermission();
      return !!result.accepted;
    } catch (_) {
      return false;
    }
  }

  window.VROneSignal = {
    init: initOneSignal,
    syncUser,
    requestNativePermission,
    preparePromptOnNextIndex,
    maybePromptOnIndexAfterGameReturn
  };

  document.addEventListener("deviceready", function () {
    initOneSignal();
  }, false);
})();
