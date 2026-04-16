(function () {
  "use strict";

  const STORAGE_KEY = "vblocks_crosspromo_state";
  const REWARD_AMOUNT = 600;
  const POSTGAME_MIN_DELAY_MS = 12 * 60 * 60 * 1000;
  const POSTGAME_FIRST_COMPLETED_RUNS = 4;
  const POSTGAME_AFTER_DISMISS_COMPLETED_RUNS = 6;

  const APPS = {
    vuniverse: {
      id: "vuniverse",
      packageName: "com.vboldstudio.vuniverse",
      androidUrl: "https://play.google.com/store/apps/details?id=com.vboldstudio.vuniverse",
      iosUrl: "",
      cover: "assets/images/crosspromo/vuniverse_cover.webp",
      shots: [
        "assets/images/crosspromo/vuniverse_01.webp",
        "assets/images/crosspromo/vuniverse_02.webp",
        "assets/images/crosspromo/vuniverse_03.webp"
      ],
      keyBase: "crosspromo.apps.vuniverse"
    },
    vchronicles: {
      id: "vchronicles",
      packageName: "com.vboldstudio.vchronicles",
      androidUrl: "https://play.google.com/store/apps/details?id=com.vboldstudio.vchronicles",
      iosUrl: "",
      cover: "assets/images/crosspromo/vchronicles_cover.webp",
      shots: [
        "assets/images/crosspromo/vchronicles_01.webp",
        "assets/images/crosspromo/vchronicles_02.webp",
        "assets/images/crosspromo/vchronicles_03.webp"
      ],
      keyBase: "crosspromo.apps.vchronicles"
    }
  };

  function t(key, fallback, vars) {
    let out = fallback || key;
    try {
      if (typeof window.i18nGet === "function") {
        const v = window.i18nGet(key);
        if (v && v !== key) out = v;
      }
    } catch (_) {}

    if (vars && typeof out === "string") {
      Object.keys(vars).forEach((k) => {
        out = out.replaceAll("{" + k + "}", String(vars[k]));
      });
    }
    return out;
  }

  function defaultAppState() {
    return {
      rewardClaimed: false,
      rewardEligible: false,
      installedDetected: false,
      clickedStore: false,
      pendingInstallCheck: false
    };
  }

  function defaultState() {
    return {
      lowVcoinsNextApp: "vuniverse",
      nextPostGameOfferIndex: 0,
      stateCreatedAt: Date.now(),
      lastCrossPromoAt: 0,
      completedRunsSinceLastPromo: 0,
      postGameRunsRequired: POSTGAME_FIRST_COMPLETED_RUNS,
      apps: {
        vuniverse: defaultAppState(),
        vchronicles: defaultAppState()
      }
    };
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = defaultState();
        writeState(fresh);
        return fresh;
      }

      const parsed = JSON.parse(raw);
      const base = defaultState();

      const state = {
        lowVcoinsNextApp: parsed?.lowVcoinsNextApp === "vchronicles" ? "vchronicles" : "vuniverse",
        nextPostGameOfferIndex: Number(parsed?.nextPostGameOfferIndex || 0) % 2,
        stateCreatedAt: Number(parsed?.stateCreatedAt || 0) || Date.now(),
        lastCrossPromoAt: Number(parsed?.lastCrossPromoAt || 0),
        completedRunsSinceLastPromo: Number(parsed?.completedRunsSinceLastPromo || parsed?.sessionStartsSinceLastPromo || 0),
        postGameRunsRequired:
          Number(parsed?.postGameRunsRequired || POSTGAME_FIRST_COMPLETED_RUNS) === POSTGAME_AFTER_DISMISS_COMPLETED_RUNS
            ? POSTGAME_AFTER_DISMISS_COMPLETED_RUNS
            : POSTGAME_FIRST_COMPLETED_RUNS,
        apps: {
          vuniverse: { ...base.apps.vuniverse, ...(parsed?.apps?.vuniverse || {}) },
          vchronicles: { ...base.apps.vchronicles, ...(parsed?.apps?.vchronicles || {}) }
        }
      };

      writeState(state);
      return state;
    } catch (_) {
      const fresh = defaultState();
      writeState(fresh);
      return fresh;
    }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function getAppLauncher() {
    try {
      if (window.Capacitor?.registerPlugin) {
        return window.Capacitor.registerPlugin("AppLauncher");
      }
      return window.Capacitor?.Plugins?.AppLauncher || null;
    } catch (_) {
      return null;
    }
  }

  function getBrowserPlugin() {
    try {
      if (window.Capacitor?.registerPlugin) {
        return window.Capacitor.registerPlugin("Browser");
      }
      return window.Capacitor?.Plugins?.Browser || null;
    } catch (_) {
      return null;
    }
  }

  function isNativeApp() {
    try {
      return !!window.Capacitor?.isNativePlatform?.();
    } catch (_) {
      return false;
    }
  }

  function getPlatform() {
    try {
      return window.Capacitor?.getPlatform?.() || "web";
    } catch (_) {
      return "web";
    }
  }

  async function canOpenTargetApp(app) {
    if (!isNativeApp()) return false;
    const AppLauncher = getAppLauncher();
    if (!AppLauncher?.canOpenUrl) return false;

    try {
      if (getPlatform() === "android") {
        const res = await AppLauncher.canOpenUrl({ url: app.packageName });
        return !!res?.value;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  async function openInstalledApp(app) {
    const AppLauncher = getAppLauncher();

    try {
      if (AppLauncher?.openUrl) {
        if (getPlatform() === "android") {
          await AppLauncher.openUrl({ url: app.packageName });
          return true;
        }
      }
    } catch (_) {}

    try {
      window.location.href = app.androidUrl || app.iosUrl || "";
      return true;
    } catch (_) {}

    return false;
  }

  async function openStore(appId) {
    const app = APPS[appId];
    if (!app) return false;

    const state = readState();
    state.apps[appId].clickedStore = true;
    state.apps[appId].pendingInstallCheck = true;
    writeState(state);

    const targetUrl = app.androidUrl || app.iosUrl || "";

    const Browser = getBrowserPlugin();
    if (Browser?.open) {
      try {
        await Browser.open({ url: targetUrl });
        return true;
      } catch (_) {}
    }

    try {
      window.open(targetUrl, "_blank");
      return true;
    } catch (_) {}

    try {
      window.location.href = targetUrl;
      return true;
    } catch (_) {}

    return false;
  }

  async function refreshInstalledStatus(appId) {
    const app = APPS[appId];
    if (!app) return false;

    const installed = await canOpenTargetApp(app);
    const state = readState();

    state.apps[appId].installedDetected = installed;

    if (installed && state.apps[appId].pendingInstallCheck && !state.apps[appId].rewardClaimed) {
      state.apps[appId].rewardEligible = true;
      state.apps[appId].pendingInstallCheck = false;
    }

    writeState(state);
    return installed;
  }

  async function refreshAllInstalledStatuses() {
    await Promise.all(Object.keys(APPS).map((appId) => refreshInstalledStatus(appId)));
  }

  async function claimReward(appId) {
    const state = readState();
    const row = state.apps[appId];
    if (!row || row.rewardClaimed || !row.rewardEligible) return false;
    if (!window.userData?.addVCoins) return false;

    try {
      await window.userData.addVCoins(REWARD_AMOUNT);
      row.rewardClaimed = true;
      row.rewardEligible = false;
      writeState(state);

      alert(
        t("crosspromo.reward_granted", "{app} détecté. +{amount} crédités.", {
          app: t(APPS[appId].keyBase + ".name", appId),
          amount: REWARD_AMOUNT
        })
      );

      await renderCrossPromoPage();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function getActionState(appId) {
    const state = readState();
    const row = state.apps[appId];
    if (!row) return "install";
    if (row.rewardClaimed) return "claimed";
    if (row.rewardEligible) return "claim";

    const installed = await canOpenTargetApp(APPS[appId]);
    if (installed) return "open";

    return "install";
  }

  function buildCard(app) {
    const name = t(app.keyBase + ".name", app.id);
    const desc = t(app.keyBase + ".store_desc", "");
    const shotsHtml = app.shots.map((src, i) => `
      <button class="cp-shot" type="button" data-shot-src="${src}" data-shot-alt="${name} ${i + 1}">
        <img src="${src}" alt="${name} ${i + 1}" draggable="false" />
      </button>
    `).join("");

    return `
      <article class="cp-app-card" data-app-id="${app.id}">
        <div class="cp-cover">
          <img src="${app.cover}" alt="${name}" draggable="false" />
        </div>

        <div class="cp-body">
          <h3 class="cp-app-name">${name}</h3>
          <p class="cp-app-desc">${desc}</p>

          <div class="cp-reward">
            <span>${t("crosspromo.reward_prefix", "GAGNER :")}</span>
            <img src="assets/images/crosspromo/vcoins.webp" alt="" draggable="false" />
            <span>+ ${REWARD_AMOUNT}</span>
          </div>

          <div class="cp-shots">${shotsHtml}</div>

          <div class="cp-card-actions">
            <button class="cp-claim-btn" type="button" data-app-main="${app.id}"></button>
          </div>
        </div>
      </article>
    `;
  }

  async function refreshButtons(root) {
    const mainButtons = root.querySelectorAll("[data-app-main]");

    for (const btn of mainButtons) {
      const appId = btn.getAttribute("data-app-main");
      const state = await getActionState(appId);

      btn.disabled = false;

      if (state === "claimed") {
        btn.textContent = t("crosspromo.cta_claimed", "Déjà réclamé");
        btn.disabled = true;
      } else if (state === "claim") {
        btn.textContent = t("crosspromo.cta_claim", "Réclamer");
      } else if (state === "open") {
        btn.textContent = t("crosspromo.cta_installed", "Déjà installé");
        btn.disabled = true;
      } else {
        btn.textContent = t("crosspromo.cta_install", "Télécharger");
      }
    }
  }

  function bindLightbox() {
    const root = document.getElementById("cp-lightbox");
    const img = document.getElementById("cp-lightbox-img");
    const closeBtn = document.getElementById("cp-lightbox-close");
    if (!root || !img || !closeBtn) return;

    document.querySelectorAll("[data-shot-src]").forEach((el) => {
      if (el.dataset.bound === "1") return;
      el.dataset.bound = "1";

      el.addEventListener("click", () => {
        img.src = el.getAttribute("data-shot-src") || "";
        img.alt = el.getAttribute("data-shot-alt") || "";
        root.classList.add("active");
        root.setAttribute("aria-hidden", "false");
      });
    });

    const close = () => {
      root.classList.remove("active");
      root.setAttribute("aria-hidden", "true");
      img.src = "";
      img.alt = "";
    };

    closeBtn.onclick = close;
    root.onclick = (e) => {
      if (e.target === root) close();
    };
  }

  async function renderCrossPromoPage() {
    const root = document.getElementById("crosspromo-apps");
    if (!root) return;

    await refreshAllInstalledStatuses();

    root.innerHTML = Object.values(APPS).map(buildCard).join("");
    await refreshButtons(root);

    root.querySelectorAll("[data-app-main]").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";

      btn.addEventListener("click", async () => {
        const appId = btn.getAttribute("data-app-main");
        const state = await getActionState(appId);

        if (state === "claim") {
          await claimReward(appId);
          await refreshButtons(root);
          return;
        }

        if (state === "open") {
          await openInstalledApp(APPS[appId]);
          return;
        }

        await openStore(appId);
      });
    });

    bindLightbox();
  }

  function createPopupRoot() {
    let root = document.getElementById("vr-crosspromo-popup");
    if (root) return root;

    root = document.createElement("div");
    root.id = "vr-crosspromo-popup";
    root.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:100150",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "padding:16px",
      "background:rgba(0,0,0,.62)",
      "backdrop-filter:blur(8px)"
    ].join(";");

    document.body.appendChild(root);
    return root;
  }

  function pickLowVcoinsApp() {
    const state = readState();
    const candidate = state.lowVcoinsNextApp === "vchronicles" ? "vchronicles" : "vuniverse";
    state.lowVcoinsNextApp = candidate === "vuniverse" ? "vchronicles" : "vuniverse";
    writeState(state);
    return candidate;
  }

  function pickPostGameApp() {
    const state = readState();
    const options = ["vuniverse", "vchronicles"];
    const appId = options[state.nextPostGameOfferIndex % options.length];
    state.nextPostGameOfferIndex = (state.nextPostGameOfferIndex + 1) % options.length;
    writeState(state);
    return appId;
  }

  async function showPopupForApp(appId, mode) {
    const app = APPS[appId];
    if (!app) return false;

    await refreshInstalledStatus(appId);
    const ctaState = await getActionState(appId);

    let mainLabel = t("crosspromo.cta_install", "Télécharger");
    if (ctaState === "claim") mainLabel = t("crosspromo.cta_claim", "Réclamer");
    if (ctaState === "open") mainLabel = t("crosspromo.cta_open", "Ouvrir");
    if (ctaState === "claimed") mainLabel = t("crosspromo.cta_claimed", "Déjà réclamé");

    const title =
      mode === "lowvcoins"
        ? t(app.keyBase + ".popup2.title", t(app.keyBase + ".name", appId))
        : t(app.keyBase + ".popup1.title", t(app.keyBase + ".name", appId));

    const body =
      mode === "lowvcoins"
        ? t(app.keyBase + ".popup2.body", t(app.keyBase + ".store_desc", ""))
        : t(app.keyBase + ".popup1.body", t(app.keyBase + ".store_desc", ""));

    const root = createPopupRoot();
    root.innerHTML = `
      <div style="width:min(420px,92vw);background:linear-gradient(180deg, rgba(36,55,117,.98), rgba(28,35,76,.98));border:1px solid rgba(255,255,255,.16);border-radius:1.45em;padding:16px;box-shadow:0 18px 42px rgba(0,0,0,.28);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
          <strong style="color:#fff;font-size:1.08rem;">${title}</strong>
          <button id="vr-crosspromo-close" type="button" style="width:38px;height:38px;border:none;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:1.1rem;font-weight:900;cursor:pointer;">×</button>
        </div>

        <div style="border-radius:1em;overflow:hidden;box-shadow:0 8px 18px rgba(0,0,0,.16);margin-bottom:12px;">
          <img src="${app.cover}" alt="${t(app.keyBase + ".name", appId)}" style="width:100%;display:block;aspect-ratio:16/9;object-fit:cover;" draggable="false" />
        </div>

        <p style="margin:0 0 12px;color:rgba(255,255,255,.93);line-height:1.42;">${body}</p>

        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(15,25,48,0.28);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:8px 12px;font-weight:900;color:#fff;margin-bottom:12px;">
          <span>${t("crosspromo.reward_prefix", "GAGNER :")}</span>
          <img src="assets/images/crosspromo/vcoins.webp" alt="" style="width:22px;height:22px;object-fit:contain;" draggable="false" />
          <span>+ ${REWARD_AMOUNT}</span>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button id="vr-crosspromo-main" type="button" style="flex:1;min-height:48px;border:none;border-radius:999px;background:linear-gradient(90deg,#7fbeff 0%,#63dcfb 100%);color:#fff;font-weight:800;cursor:pointer;">
            ${mainLabel}
          </button>
          <button id="vr-crosspromo-later" type="button" style="min-width:110px;min-height:48px;border:none;border-radius:999px;background:rgba(255,255,255,.15);color:#fff;font-weight:800;cursor:pointer;">
            ${t("crosspromo.cta_later", "Plus tard")}
          </button>
        </div>
      </div>
    `;

    root.style.display = "flex";

    const close = () => {
      root.style.display = "none";
      root.innerHTML = "";
    };

    const markDismissIfNeeded = () => {
      if (mode !== "postgame") return;
      const state = readState();
      state.postGameRunsRequired = POSTGAME_AFTER_DISMISS_COMPLETED_RUNS;
      writeState(state);
    };

    const markAcceptedIfNeeded = () => {
      if (mode !== "postgame") return;
      const state = readState();
      state.postGameRunsRequired = POSTGAME_FIRST_COMPLETED_RUNS;
      writeState(state);
    };

    root.onclick = (e) => {
      if (e.target === root) {
        markDismissIfNeeded();
        close();
      }
    };

    const closeBtn = document.getElementById("vr-crosspromo-close");
    const laterBtn = document.getElementById("vr-crosspromo-later");
    const mainBtn = document.getElementById("vr-crosspromo-main");

    if (closeBtn) closeBtn.onclick = () => {
      markDismissIfNeeded();
      close();
    };

    if (laterBtn) laterBtn.onclick = () => {
      markDismissIfNeeded();
      close();
    };

    if (mainBtn) {
      mainBtn.onclick = async () => {
        if (ctaState === "claim") {
          markAcceptedIfNeeded();
          await claimReward(appId);
          close();
          return;
        }
        if (ctaState === "open") {
          markAcceptedIfNeeded();
          await openInstalledApp(app);
          close();
          return;
        }
        markAcceptedIfNeeded();
        await openStore(appId);
        close();
      };
    }

    const state = readState();
    state.lastCrossPromoAt = Date.now();
    state.completedRunsSinceLastPromo = 0;
    writeState(state);

    return true;
  }

  function notifyCompletedRun() {
    const state = readState();
    state.completedRunsSinceLastPromo += 1;
    writeState(state);
  }

  async function showLowVcoinsPopupNow() {
    return showPopupForApp(pickLowVcoinsApp(), "lowvcoins");
  }

  async function maybeShowPostGamePromo(opts) {
    if (opts?.skipBecauseRewardAd) return false;

    const state = readState();
    const requiredRuns = Number(state.postGameRunsRequired || POSTGAME_FIRST_COMPLETED_RUNS);
    const enoughRuns = Number(state.completedRunsSinceLastPromo || 0) >= requiredRuns;
    const anchorTs = Math.max(Number(state.lastCrossPromoAt || 0), Number(state.stateCreatedAt || 0));
    const enoughDelay = (Date.now() - anchorTs) >= POSTGAME_MIN_DELAY_MS;

    if (!enoughRuns || !enoughDelay) return false;

    return showPopupForApp(pickPostGameApp(), "postgame");
  }

  async function maybeShowPopupFromContext(context) {
    if (context === "lowvcoins") return showLowVcoinsPopupNow();
    if (context === "postgame") return maybeShowPostGamePromo({ skipBecauseRewardAd: false });
    return false;
  }

  async function onResume() {
    await refreshAllInstalledStatuses();
    await renderCrossPromoPage();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if (window.i18nReady && typeof window.i18nReady.then === "function") {
        await window.i18nReady.catch(() => {});
      }
    } catch (_) {}

    await onResume();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) onResume().catch(() => {});
    });

    window.addEventListener("focus", () => {
      onResume().catch(() => {});
    });
  });

  window.VRCrossPromo = {
    maybeShowPopupFromContext,
    showLowVcoinsPopupNow,
    notifyCompletedRun,
    maybeShowPostGamePromo,
    queuePostGamePromoForIndex(skipBecauseRewardAd) {
      try {
        sessionStorage.setItem("vr_crosspromo_context", "postgame");
        return true;
      } catch (_) {
        return false;
      }
    },
    renderCrossPromoPage,
    openStore
  };
})();
