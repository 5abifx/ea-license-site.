// Members menu (top bar): Journal / Account / Owner buttons open their panel; the phone ☰ opens the full menu.
// One panel at a time; closes on a second click, the dimmed page, Escape, or after picking a page.
(function () {
  var tb = document.getElementById('tb');
  if (!tb) return;
  var cur = null;
  function close() {
    if (!cur) return;
    var p = document.getElementById('tbp-' + cur); if (p) p.classList.remove('open');
    tb.querySelectorAll('[data-tbp="' + cur + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    tb.classList.remove('open'); cur = null;
  }
  function open(k) {
    var was = cur; close(); if (was === k) return;
    var p = document.getElementById('tbp-' + k); if (!p) return;
    p.classList.add('open'); tb.classList.add('open'); cur = k;
    tb.querySelectorAll('[data-tbp="' + k + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    var first = p.querySelector('a, button'); if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }
  tb.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tbp]'); if (b) { e.preventDefault(); open(b.dataset.tbp); return; }
    if (e.target.closest('[data-tb-close]')) { close(); return; }
    if (e.target.closest('.tb-panel a')) close();
  });
  document.addEventListener('click', function (e) { if (cur && !tb.contains(e.target)) close(); });
  document.addEventListener('touchstart', function () {}, { passive: true });   // lets iPhone show the pressed (:active) look on the dock
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  // a panel opened on PC should not stay open when the window shrinks to the phone layout (and the other way)
  matchMedia('(max-width: 900px)').addEventListener('change', close);
})();
