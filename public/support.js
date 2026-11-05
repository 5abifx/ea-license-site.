// Corner "Need help?" button: opens/closes the contact panel (markup from src/support.js)
(function () {
  var root = document.getElementById('sup'), btn = document.getElementById('sup-btn'), panel = document.getElementById('sup-panel');
  if (!root || !btn || !panel) return;
  var store = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  if (store('supSeen')) root.classList.add('seen');
  var set = function (open) {
    panel.hidden = !open;
    root.classList.toggle('open', open);
    root.classList.remove('peek');
    btn.setAttribute('aria-expanded', String(open));
    if (open) { root.classList.add('seen'); store('supSeen', '1'); }
  };
  btn.addEventListener('click', function (e) { e.stopPropagation(); set(panel.hidden); });
  document.addEventListener('click', function (e) { if (!panel.hidden && !root.contains(e.target)) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); } });
  // first visit: show the "Need help?" label for a few seconds so people notice it
  if (!store('supSeen')) {
    setTimeout(function () { if (panel.hidden) root.classList.add('peek'); }, 4000);
    setTimeout(function () { root.classList.remove('peek'); }, 11000);
  }
})();
