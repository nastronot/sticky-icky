// Pre-paint theme bootstrap: applies the default theme + accent classes to
// <html> synchronously so the first paint has correct surfaces. The async
// IndexedDB read in App.jsx swaps in the user's saved choice if it differs
// — those defaults match the :root fallback in studio.css, so the pre-load
// look never flashes for anyone on the default combo. Loaded as an external
// same-origin script so CSP only needs script-src 'self' (no fragile inline
// hash that would break under HTML/JS minification by edge proxies).
(function () {
  var el = document.documentElement;
  el.classList.add('theme-oled');
  el.classList.add('accent-zebra-yellow');
})();
