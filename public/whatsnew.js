// What's new popup (src/whatsnew.js): a glass card on PC, a bottom sheet on phones.
// Members: shown once when #wn-data holds lines they have not seen; closing it marks them seen.
// Admin > What's new: "Preview popup" shows the draft the same way (nothing is marked seen) + the line counter.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // it.icon is the icon's path (src/whatsnew.js forPop); only path characters are let through
  function svg(d) { d = /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(d || '') ? d : 'M12 2v20M2 12h20'; return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  function safeLink(l) { return /^(\/(?!\/)|#[a-z-]+$)/i.test(l || '') ? l : ''; }

  var open = null;
  function show(data, preview) {
    if (open) return;
    var items = data.items || [];
    var bg = document.createElement('div');
    bg.className = 'wn-bg';
    bg.innerHTML = '<section class="wn-pop" role="dialog" aria-modal="true" aria-labelledby="wn-title">' +
      '<i class="wn-grab" aria-hidden="true"></i>' +
      '<div class="wn-top-row"><span class="wn-brand"><img src="/logo.png" alt="" width="30" height="18"><span>5ABI.FX update</span></span><span class="wn-chip">' + (preview ? 'Preview' : esc(data.at)) + '</span>' +
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
