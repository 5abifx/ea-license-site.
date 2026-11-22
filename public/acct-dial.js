// Account picker dial (journal, Desk, Insights; owner picked style B1, 2026-11-22): on a computer the row of account
// boxes becomes one floating strip with no card behind it. The chosen account sits in the middle with a thin orange
// line under it; the others fade and shrink to the sides (with 5+ boxes it turns all the way round). Scroll over it, use ‹ › or the arrow keys to turn; click
// the middle one (or press Enter) to open that account. Phones keep the swipe row. Styles: public/fit.css (.ad-*).
(function () {
  if (!matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll('.accts:not(.ad)').forEach(function (bar) {
    var items = [].slice.call(bar.querySelectorAll(':scope > a.acct'));
    if (items.length < 3) return;
    bar.classList.add('ad');
    var drum = document.createElement('div'); drum.className = 'ad-drum'; drum.tabIndex = 0;
    drum.setAttribute('aria-label', 'Accounts: scroll or use the arrow keys to turn, Enter to open');
    items.forEach(function (a) { drum.appendChild(a); });
    var prev = document.createElement('button'), next = document.createElement('button');
    prev.type = next.type = 'button'; prev.className = next.className = 'ad-arr';
    prev.textContent = '‹'; next.textContent = '›';
    prev.setAttribute('aria-label', 'Previous account'); next.setAttribute('aria-label', 'Next account');
    bar.appendChild(prev); bar.appendChild(drum); bar.appendChild(next);
    var on = Math.max(0, items.findIndex(function (a) { return a.classList.contains('on'); })), cur = on;
    function lay() {
      var w = Math.max(140, Math.min(190, drum.clientWidth * 0.19)), L = items.length;
      items.forEach(function (a, i) {
        var d = i - cur;
        if (L >= 5) { if (d > L / 2) d -= L; else if (d < -L / 2) d += L; }   // turns round like a real dial
        var k = Math.abs(d);
        a.style.transform = 'translate(calc(-50% + ' + (d * w) + 'px), -50%) scale(' + (k ? (k === 1 ? 0.86 : 0.76) : 1) + ')';
        a.style.opacity = k === 0 ? 1 : k === 1 ? 0.5 : k === 2 ? 0.28 : 0;
        a.style.pointerEvents = k > 2 ? 'none' : '';
        a.classList.toggle('cur', !d); a.tabIndex = -1;
      });
      prev.disabled = L < 5 && cur === 0; next.disabled = L < 5 && cur === L - 1;
      bar.classList.toggle('moved', cur !== on);
    }
    function go(i) { var L = items.length; cur = L >= 5 ? (i + L) % L : Math.max(0, Math.min(L - 1, i)); lay(); }
    items.forEach(function (a, i) {
      a.addEventListener('click', function (e) { if (i !== cur) { e.preventDefault(); go(i); } });   // a side one turns the dial first
    });
    prev.onclick = function () { go(cur - 1); }; next.onclick = function () { go(cur + 1); };
    var lock = 0;
    drum.addEventListener('wheel', function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return;
      e.preventDefault(); var t = Date.now(); if (t - lock < 180) return; lock = t; go(cur + (d > 0 ? 1 : -1));
    }, { passive: false });
    drum.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(cur + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(cur - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); items[cur].click(); }
    });
    if (window.ResizeObserver) new ResizeObserver(lay).observe(drum); else window.addEventListener('resize', lay);
    lay();
  });
})();
