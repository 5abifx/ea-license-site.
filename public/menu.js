// Phones: the ☰ button opens the menu as a panel under the top bar
(function () {
  var btn = document.querySelector('[data-menu]');
  if (!btn) return;
  var set = function (open) { document.body.classList.toggle('menu-open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', function () { set(!document.body.classList.contains('menu-open')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  document.addEventListener('click', function (e) { if (e.target.closest('#site-nav a, #side-nav a')) set(false); });
})();

// "Replay" on the journal and desk: forget that the opening animations were seen today, then reload
(function () {
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-replay]')) return;
    try { sessionStorage.removeItem('plx'); localStorage.removeItem('intro:w'); localStorage.removeItem('intro:r'); sessionStorage.setItem('replay', '1'); } catch (err) { /* private mode */ }
    location.reload();
  });
})();
