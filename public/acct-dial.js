// Account picker dial (journal, Desk, Insights; owner's idea, 2026-11-22): on a computer the row of account boxes
// becomes one small card that turns like the "Sessions, ranked" dial. Scroll over it or use ▲ ▼ to turn, click the
// middle one (or press Enter) to open that account. Phones keep the swipe row. Styles: public/fit.css (.ad-*).
(function () {
  if (!matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll('.accts:not(.ad)').forEach(function (bar) {
    var items = [].slice.call(bar.querySelectorAll(':scope > a.acct'));
    if (items.length < 3) return;
    bar.classList.add('ad');
    var drum = document.createElement('div'); drum.className = 'ad-drum'; drum.tabIndex = 0;
    drum.setAttribute('aria-label', 'Accounts: scroll or use the arrow keys to turn, Enter to open');
    items.forEach(function (a) { drum.appendChild(a); });
    var side = document.createElement('div'); side.className = 'ad-side';
    side.innerHTML = '<button type="button" data-d="-1" aria-label="Previous account">▲</button><span class="ad-n"></span><button type="button" data-d="1" aria-label="Next account">▼</button>';
    bar.appendChild(drum); bar.appendChild(side);
    var on = Math.max(0, items.findIndex(function (a) { return a.classList.contains('on'); })), cur = on, n = side.querySelector('.ad-n');
    function lay() {
      items.forEach(function (a, i) {
        var d = i - cur, k = Math.abs(d);
        a.style.transform = 'translateY(calc(-50% + ' + (d * 38) + 'px)) scale(' + (1 - Math.min(k, 2) * 0.16) + ')';
        a.style.opacity = k === 0 ? 1 : k === 1 ? 0.38 : 0;
        a.style.pointerEvents = k > 1 ? 'none' : '';
        a.classList.toggle('cur', !d); a.tabIndex = -1;
      });
      n.textContent = (cur + 1) + ' / ' + items.length;
      bar.classList.toggle('moved', cur !== on);
    }
    function go(i) { cur = Math.max(0, Math.min(items.length - 1, i)); lay(); }
    items.forEach(function (a, i) {
      a.addEventListener('click', function (e) { if (i !== cur) { e.preventDefault(); go(i); } });   // a side one turns the dial first
    });
    side.addEventListener('click', function (e) { var b = e.target.closest('[data-d]'); if (b) go(cur + Number(b.dataset.d)); });
    var lock = 0;
    drum.addEventListener('wheel', function (e) {
      e.preventDefault(); var t = Date.now(); if (t - lock < 180) return; lock = t; go(cur + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    drum.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); go(cur + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); go(cur - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); items[cur].click(); }
    });
    lay();
  });
})();
