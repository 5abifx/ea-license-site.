// Account picker dial (journal, Desk, Insights; owner picked style B1, 2026-11-22): on a computer the row of account
// boxes becomes one floating strip with no card behind it. The chosen account sits in the middle with a thin orange
// line under it; the others fade and shrink to the sides (with 5+ boxes it turns all the way round). Scroll over it, use ‹ › or the arrow keys to turn; click
// the middle one (or press Enter) to open that account. Phones get the same strip and swipe it. Styles: public/fit.css (.ad-*).
(function () {
  document.querySelectorAll('.accts:not(.ad)').forEach(function (bar) {
    var items = [].slice.call(bar.querySelectorAll(':scope > a.acct'));
    if (!items.length) return;
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
      var cw = drum.clientWidth, w = cw < 520 ? cw * 0.36 : Math.max(140, Math.min(190, cw * 0.19)), L = items.length;   // phones: neighbours peek at the edges
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
    // Desk: turning the dial loads that account's numbers in place (P&L calendar, month card, hidden-account bar),
    // everything from the dial down to the [data-live-end] marker, without leaving the page
    var end = null, wait = 0, ctl = null;   // the marker is found on first use: this script runs before the rest of the page is parsed
    function findEnd() { return (end = end || (bar.parentNode && bar.parentNode.querySelector('[data-live-end]'))); }
    function load() {
      var a = items[cur], href = a.getAttribute('href'); if (cur === on || !findEnd()) return;
      if (ctl) ctl.abort(); ctl = window.AbortController ? new AbortController() : null;
      var olds = []; for (var n = bar.nextElementSibling; n && n !== end; n = n.nextElementSibling) { olds.push(n); n.classList.add('ad-ld'); }
      fetch(href, { credentials: 'same-origin', signal: ctl && ctl.signal }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html'), nb = doc.querySelector('.accts'), ne = doc.querySelector('[data-live-end]');
        if (!nb || !ne) throw 0;
        var frag = [], n2;
        for (n2 = nb.nextElementSibling; n2 && n2 !== ne; n2 = n2.nextElementSibling) frag.push(n2);
        olds.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
        frag.forEach(function (f) {
          var el = document.importNode(f, true);
          end.parentNode.insertBefore(el, end);
          [].slice.call(el.tagName === 'SCRIPT' ? [el] : el.querySelectorAll('script')).forEach(function (s0) {   // scripts added this way don't run by themselves
            if (s0.type && s0.type !== 'text/javascript') return;
            var s1 = document.createElement('script'); if (s0.src) s1.src = s0.src; else s1.textContent = s0.textContent;
            s0.parentNode.replaceChild(s1, s0);
          });
        });
        items.forEach(function (x) { x.classList.remove('on'); }); a.classList.add('on'); on = cur; lay();
        try { history.replaceState(null, '', href); } catch (e) {}
      }).catch(function (e) { if (e && e.name === 'AbortError') return; location.href = href; });
    }
    function go(i) {
      var L = items.length; cur = L >= 5 ? (i + L) % L : Math.max(0, Math.min(L - 1, i)); lay();
      if (findEnd()) { clearTimeout(wait); wait = setTimeout(load, 350); }
    }
    items.forEach(function (a, i) {
      a.addEventListener('click', function (e) { if (i !== cur || (findEnd() && i === on)) { e.preventDefault(); go(i); } });   // a side one turns the dial first
    });
    prev.onclick = function () { go(cur - 1); }; next.onclick = function () { go(cur + 1); };
    var lock = 0;
    drum.addEventListener('wheel', function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return;
      e.preventDefault(); var t = Date.now(); if (t - lock < 180) return; lock = t; go(cur + (d > 0 ? 1 : -1));
    }, { passive: false });
    var sx = null;   // phones: swipe left / right to turn
    drum.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    drum.addEventListener('touchend', function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 30) go(cur + (dx < 0 ? 1 : -1)); }, { passive: true });
    drum.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(cur + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(cur - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); items[cur].click(); }
    });
    if (window.ResizeObserver) new ResizeObserver(lay).observe(drum); else window.addEventListener('resize', lay);
    lay();
  });
})();
