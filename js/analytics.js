// =============================
// analytics.js — Firebase Analytics (no-import / global)
// =============================
(function () {
  'use strict';

  if (window.VRAnalytics) return;

  var Cap = window.Capacitor || {};
  var FirebaseAnalytics = null;

  function getPlugin() {
    if (FirebaseAnalytics) return FirebaseAnalytics;

    try {
      if (Cap.registerPlugin) {
        FirebaseAnalytics = Cap.registerPlugin('FirebaseAnalytics');
        return FirebaseAnalytics;
      }
    } catch (_) {}

    try {
      if (Cap.Plugins && Cap.Plugins.FirebaseAnalytics) {
        FirebaseAnalytics = Cap.Plugins.FirebaseAnalytics;
        return FirebaseAnalytics;
      }
    } catch (_) {}

    return null;
  }

  function isNative() {
    try {
      if (Cap.getPlatform) return Cap.getPlatform() !== 'web';
    } catch (_) {}

    try {
      if (Cap.isNativePlatform) return !!Cap.isNativePlatform();
    } catch (_) {}

    return !!window.cordova;
  }

  function getPlatformName() {
    try {
      if (Cap.getPlatform) return String(Cap.getPlatform() || 'web');
    } catch (_) {}
    return 'web';
  }

  function getPageName() {
    try {
      var file = (location.pathname || '').split('/').pop() || 'index.html';
      file = file.toLowerCase();

      if (file === '' || file === 'index.html') return 'index';

      return file
        .replace('.html', '')
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/-/g, '_');
    } catch (_) {
      return 'unknown';
    }
  }

  function truncateString(value, maxLen) {
    if (value === undefined || value === null) return undefined;
    var s = String(value);
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  }

  function cleanParams(params) {
    var out = {};
    var src = params || {};

    Object.keys(src).forEach(function (key) {
      var value = src[key];

      if (value === undefined || value === null || value === '') return;

      if (typeof value === 'number') {
        if (Number.isFinite(value)) out[key] = value;
        return;
      }

      if (typeof value === 'boolean') {
        out[key] = value ? 1 : 0;
        return;
      }

      if (Array.isArray(value)) {
        out[key] = truncateString(value.join(','), 100);
        return;
      }

      out[key] = truncateString(value, 100);
    });

    return out;
  }

  async function logEvent(name, params) {
    try {
      if (!isNative()) return false;

      var plugin = getPlugin();
      if (!plugin || !plugin.logEvent) return false;

      await plugin.logEvent({
        name: String(name),
        params: cleanParams(params)
      });

      return true;
    } catch (e) {
      console.warn('[analytics] logEvent failed:', name, e && e.message ? e.message : e);
      return false;
    }
  }

  async function setCurrentScreen(screenName) {
    try {
      if (!isNative()) return false;

      var plugin = getPlugin();
      if (!plugin || !plugin.setCurrentScreen) return false;

      var screen = truncateString(screenName || getPageName(), 36) || 'unknown';

      await plugin.setCurrentScreen({
        screenName: screen,
        screenClassOverride: screen
      });

      return true;
    } catch (e) {
      console.warn('[analytics] setCurrentScreen failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  async function setUserIdFromApp() {
    try {
      if (!isNative()) return false;

      var plugin = getPlugin();
      if (!plugin || !plugin.setUserId) return false;

      try {
        if (window.userData && typeof window.userData.ensureAuth === 'function') {
          await window.userData.ensureAuth();
        }
      } catch (_) {}

      var uid = null;
      try {
        if (typeof window.getUserId === 'function') {
          uid = await window.getUserId();
        }
      } catch (_) {}

      await plugin.setUserId({
        userId: uid || null
      });

      return true;
    } catch (e) {
      console.warn('[analytics] setUserId failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  async function setUserProperty(key, value) {
    try {
      if (!isNative()) return false;

      var plugin = getPlugin();
      if (!plugin || !plugin.setUserProperty) return false;

      await plugin.setUserProperty({
        key: String(key),
        value: value == null ? null : String(value)
      });

      return true;
    } catch (e) {
      console.warn('[analytics] setUserProperty failed:', key, e && e.message ? e.message : e);
      return false;
    }
  }

  async function refreshUserProperties() {
    try {
      await setUserProperty('language', (localStorage.getItem('langue') || 'EN').toUpperCase());
      await setUserProperty('theme', localStorage.getItem('themeVBlocks') || 'cyber');
      await setUserProperty('no_ads', localStorage.getItem('no_ads') === '1' ? '1' : '0');
      await setUserProperty('platform', getPlatformName());
    } catch (_) {}
  }

  var pageOpenSent = false;
  var initRunning = false;

  async function initPage() {
    if (initRunning) return;
    initRunning = true;

    try {
      await setUserIdFromApp();
      await refreshUserProperties();

      var page = getPageName();
      var screenOk = await setCurrentScreen(page);

      if (!pageOpenSent) {
        var eventOk = await logEvent('page_open', { page: page });
        if (screenOk || eventOk) pageOpenSent = true;
      }
    } finally {
      initRunning = false;
    }
  }

  function fireAndForget(promise) {
    try {
      if (promise && typeof promise.catch === 'function') {
        promise.catch(function () {});
      }
    } catch (_) {}
  }

  window.VRAnalytics = {
    getPlugin: getPlugin,
    isNative: isNative,
    getPageName: getPageName,
    logEvent: logEvent,
    setCurrentScreen: setCurrentScreen,
    setUserIdFromApp: setUserIdFromApp,
    setUserProperty: setUserProperty,
    refreshUserProperties: refreshUserProperties,
    initPage: initPage
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      fireAndForget(initPage());
    }, { once: true });
  } else {
    fireAndForget(initPage());
  }

  document.addEventListener('deviceready', function () {
    fireAndForget(initPage());
  }, { once: true });

  document.addEventListener('resume', function () {
    fireAndForget(refreshUserProperties());
    fireAndForget(setCurrentScreen(getPageName()));
  });

  window.addEventListener('storage', function (e) {
    if (!e) return;
    if (e.key === 'langue' || e.key === 'themeVBlocks' || e.key === 'no_ads') {
      fireAndForget(refreshUserProperties());
    }
  });

  window.addEventListener('vblocks-theme-changed', function (e) {
    var theme = null;
    try { theme = e && e.detail ? e.detail.theme : null; } catch (_) {}
    fireAndForget(refreshUserProperties());
    fireAndForget(logEvent('theme_change', {
      theme: theme || (localStorage.getItem('themeVBlocks') || 'cyber')
    }));
  });
})();
