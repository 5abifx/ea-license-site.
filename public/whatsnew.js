// What's new popup (src/whatsnew.js): a glass card on PC, a bottom sheet on phones.
// Members: shown once when #wn-data holds lines they have not seen; closing it marks them seen.
// Admin > What's new: "Preview popup" shows the draft the same way (nothing is marked seen) + the line counter.
(function () {
  var ICONS = {
    star: 'M12 3l2.5 6 6.5.5-5 4 1.5 6.5L12 16l-5.5 4 1.5-6.5-5-4 6.5-.5z',
    video: 'M4 5h16v14H4zM10 9l5 3-5 3z',
    learn: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5',
    note: 'M5 4h10l4 4v12H5zM9 12h6M9 16h4',
    chart: 'M3 17l5-6 4 4 6-8 3 4',
    clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2',
    phone: 'M8 2h8v20H8zM11 18h2',
    user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 21c1-4 5-6 8-6s7 2 8 6',
    shield: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function svg(k) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICONS[k] || ICONS.star) + '"/></svg>'; }
  function safeLink(l) { return /^(\/(?!\/)|#[a-z-]+$)/i.test(l || '') ? l : ''; }

  var open = null;
  function show(data, preview) {
    if (open) return;
    var items = data.items || [];
    var bg = document.createElement('div');
    bg.className = 'wn-bg';
    bg.innerHTML = '<section class="wn-pop" role="dialog" aria-modal="true" aria-labelledby="wn-title">' +
      '<i class="wn-grab" aria-hidden="true"></i>' +
      '<div class="wn-top-row"><span class="wn-chip">' + (preview ? 'Preview' : 'Updated ' + esc(data.at)) + '</span>' +
      '<button type="button" class="wn-x" data-wn-close aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div><h2 id="wn-title" class="wn-h2">What\'s <em>new</em></h2><p class="wn-sub">' + items.length + (items.length === 1 ? ' thing' : ' things') + ' added since your last visit.</p></div>' +
      '<div class="wn-list">' + items.map(function (it) {
        var link = safeLink(it.link);
        var inner = '<span class="wn-ic">' + svg(it.icon) + '</span><span class="wn-tx"><b>' + esc(it.name) + '</b> <span>' + esc(it.line) + '</span></span>';
        return link ? '<a class="wn-row" href="' + esc(link) + '" data-wn-go' + (link === '#tour' ? ' data-tour-open' : '') + '>' + inner + '<i class="wn-go" aria-hidden="true">›</i></a>' : '<div class="wn-row">' + inner + '</div>';
      }).join('') + '</div>' +
      '<div class="wn-foot"><a class="wn-ghost" href="/whats-new">See all updates</a><button type="button" class="wn-white" data-wn-close>Got it <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>' +
      '</section>';
    document.body.appendChild(bg);
    open = bg;
    requestAnimationFrame(function () { bg.classList.add('in'); });
    var btn = bg.querySelector('.wn-white'); if (btn) btn.focus({ preventScroll: true });

    function close() {
      if (!open) return;
      if (!preview) seen();
      bg.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { bg.remove(); }, 260);
      open = null;
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', function (e) {
      if (e.target === bg || e.target.closest('[data-wn-close]')) { e.preventDefault(); close(); return; }
      var go = e.target.closest('[data-wn-go], .wn-ghost');
      if (go) { if (preview) { e.preventDefault(); return; } close(); }   // the link then opens as normal (the tour link opens the tour)
    });
  }

  function seen() {
    try { fetch('/api/whatsnew/seen', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body: '{}' }); } catch (e) {}
    document.querySelectorAll('.wn-dot').forEach(function (d) { d.remove(); });
    document.querySelectorAll('a.wn-has').forEach(function (a) { a.classList.remove('wn-has'); var c = a.querySelector('.count'); if (c) c.remove(); });
    var t = document.querySelector('.wn-top'); if (t) t.classList.remove('on');
  }

  // members: wait until the welcome / tour screens are gone, then show the new lines once
  var el = document.getElementById('wn-data');
  if (el) {
    var data; try { data = JSON.parse(el.textContent); } catch (e) { data = null; }
    if (data && data.items && data.items.length) {
      var tries = 0;
      (function wait() {
        var busy = document.querySelector('.intro, .tr-card, .tr-pick, .ob-wrap') || document.body.classList.contains('menu-open');
        if (busy && tries++ < 120) return setTimeout(wait, 500);
        setTimeout(function () { show(data, false); }, 700);
      })();
    }
  }

  // Admin > What's new
  document.addEventListener('click', function (e) {
    var p = e.target.closest('[data-wn-preview]');
    if (!p) return;
    var items = []; try { items = JSON.parse(p.getAttribute('data-wn-preview')); } catch (err) {}
    show({ at: '', items: items }, true);
  });
  var line = document.querySelector('[data-wn-line]'), count = document.querySelector('[data-wn-count]');
  if (line && count) line.addEventListener('input', function () { count.textContent = line.value.length + ' / ' + line.maxLength; });
})();
