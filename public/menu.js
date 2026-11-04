// Phones: the ☰ button opens the menu as a panel under the top bar
(function () {
  var btn = document.querySelector('[data-menu]');
  if (!btn) return;
  var set = function (open) { document.body.classList.toggle('menu-open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', function () { set(!document.body.classList.contains('menu-open')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  document.addEventListener('click', function (e) { if (e.target.closest('#site-nav a, #side-nav a')) set(false); });
})();
