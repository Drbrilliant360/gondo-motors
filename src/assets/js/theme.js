/* Gondo Motors — light / dark theme.
   Loaded in <head> before the stylesheets so the right theme is applied before first paint (no flash).
   Order of preference: the visitor's saved choice, then their system setting. */
(function () {
  'use strict';
  var KEY = 'gm.theme', root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() { try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; } }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0b15' : '#1a1a2e');
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', theme === 'dark');
      buttons[i].setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      var label = buttons[i].querySelector('[data-theme-label]'); if (label) label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    }
  }
  var current = function () { return saved() || (media && media.matches ? 'dark' : 'light'); };
  apply(current());
  document.addEventListener('DOMContentLoaded', function () { apply(current()); });
  // follow the system setting until the visitor chooses for themselves
  if (media) { var onChange = function () { if (!saved()) apply(current()); }; if (media.addEventListener) media.addEventListener('change', onChange); else if (media.addListener) media.addListener(onChange); }
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(current()); }); // keep other open tabs in step
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]'); if (!btn) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (err) { /* still switches for this page */ }
    apply(next);
  });
  // printed pages (reports, order pages) always use the light theme
  var before; window.addEventListener('beforeprint', function () { before = root.getAttribute('data-theme'); root.setAttribute('data-theme', 'light'); });
  window.addEventListener('afterprint', function () { if (before) root.setAttribute('data-theme', before); });
})();
