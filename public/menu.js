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

// PC: fold the side menu into a slim icon rail for a full-screen page (remembered on this browser)
(function () {
  var btn = document.querySelector('[data-fold]');
  if (!btn) return;
  var root = document.documentElement;
  var sync = function () { var f = root.classList.contains('side-fold'); btn.setAttribute('aria-label', f ? 'Show the menu' : 'Hide the menu'); btn.title = f ? 'Show the menu' : 'Hide the menu (full screen)'; };
  btn.addEventListener('click', function () {
    root.classList.toggle('side-fold');
    try { localStorage.setItem('sideFold', root.classList.contains('side-fold') ? '1' : '0'); } catch (e) { /* private mode */ }
    sync();
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 320);   // charts redraw at the new width
  });
  sync();
})();
