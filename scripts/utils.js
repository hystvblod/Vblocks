function whenReady(fn) {
  if (window.cordova || window.Capacitor) {
    document.addEventListener('deviceready', fn, false);
  } else if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { whenReady };
} else {
  window.whenReady = whenReady;
}
