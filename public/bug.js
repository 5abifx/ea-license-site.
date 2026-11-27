// "Report a bug" (src/bugs.js): a row in the corner help panel, under "Request a feature".
// Members type what went wrong and/or add a screenshot: take one of this tab (PC browsers that allow it),
// pick a picture (phones: the screenshot they just took), or paste one (Ctrl+V). The page and screen size are
// added by themselves. The + button on wide screens (when the help panel is off) links here too: window.bugForm.
(function () {
  var I = {
    bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M9 7a3 3 0 016 0M12 11v9M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-2M20 20l-3-2"/>',
    cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    pic: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  };
  var svg = function (k, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[k] + '</svg>'; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  var touch = matchMedia('(hover: none)').matches;
  var canCapture = !touch && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';

  // any image (file, pasted, captured canvas) -> JPEG data URL, longest side 1600px
  function toJpeg(src, done) {
    var draw = function (img, w, h) {
      var k = Math.min(1, 1600 / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var g = c.getContext('2d'); g.fillStyle = '#050507'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      var d = c.toDataURL('image/jpeg', 0.82); if (d.length > 2.6e6) d = c.toDataURL('image/jpeg', 0.6);
      done(d);
    };
    if (src.tagName === 'VIDEO') return draw(src, src.videoWidth, src.videoHeight);
    var url = URL.createObjectURL(src), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); draw(img, img.naturalWidth, img.naturalHeight); };
    img.onerror = function () { URL.revokeObjectURL(url); done(null); };
    img.src = url;
  }

  // the form; onClose() puts back whatever it replaced
  function bugForm(onClose, titled) {
    var f = el('div', 'sup-form bug-form', (titled ? '<b class="bug-t">' + svg('bug', 16) + ' Report a bug</b>' : '') +
      '<textarea maxlength="2000" placeholder="What went wrong? What did you tap just before it happened?"></textarea>' +
      '<div class="bug-row">' + (canCapture ? '<button type="button" class="bug-btn bug-cap">' + svg('cam', 16) + '<span>Take screenshot</span></button>' : '') +
      '<label class="bug-btn">' + svg('pic', 16) + '<span>' + (touch ? 'Add screenshot' : 'Add picture') + '</span><input type="file" accept="image/*" hidden></label></div>' +
      '<div class="bug-prev" hidden><img alt="Your screenshot"><button type="button" class="bug-x" aria-label="Remove screenshot">×</button></div>' +
      '<small class="bug-note">' + (touch ? 'Take a screenshot first, then add it here.' : 'You can also paste a screenshot here (Ctrl+V).') + ' We add this page and your screen size by themselves.</small>' +
      '<button type="button" class="sup-send">Send report</button>');
    var ta = f.querySelector('textarea'), send = f.querySelector('.sup-send'), prev = f.querySelector('.bug-prev'), img = prev.querySelector('img');
    var file = f.querySelector('input[type=file]'), cap = f.querySelector('.bug-cap'), shot = null;
    f.addEventListener('click', function (e) { e.stopPropagation(); });
    var set = function (d) { shot = d; prev.hidden = !d; if (d) img.src = d; };
    prev.querySelector('.bug-x').addEventListener('click', function () { set(null); });
    file.addEventListener('change', function () { if (file.files[0]) toJpeg(file.files[0], set); file.value = ''; });
    f.addEventListener('paste', function (e) {
      var it = [].slice.call((e.clipboardData && e.clipboardData.items) || []).filter(function (i) { return /^image\//.test(i.type); })[0];
      if (it) { e.preventDefault(); toJpeg(it.getAsFile(), set); }
    });
    if (cap) cap.addEventListener('click', function () {
      navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }).then(function (stream) {
        var sup = document.getElementById('sup'), pop = f.closest('.fr-pop'), hide = [sup, pop].filter(Boolean);
        hide.forEach(function (h) { h.style.visibility = 'hidden'; });   // keep the help panel out of the picture
        var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream;
        var stop = function () { stream.getTracks().forEach(function (t) { t.stop(); }); hide.forEach(function (h) { h.style.visibility = ''; }); };
        v.play().then(function () {
          setTimeout(function () { toJpeg(v, function (d) { stop(); set(d); ta.focus(); }); }, 400);
        }).catch(stop);
      }).catch(function () { /* member cancelled the picker */ });
    });
    send.addEventListener('click', function () {
      if (ta.value.trim().length < 3 && !shot) { ta.focus(); ta.placeholder = 'Type a few words or add a screenshot first.'; return; }
      send.disabled = true; send.textContent = 'Sending…';
      fetch('/api/bug', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: ta.value, img: shot || '', page: location.pathname + location.search, screen: innerWidth + 'x' + innerHeight + ' @' + (devicePixelRatio || 1) + 'x' }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          f.innerHTML = '<div class="sup-done"><b>' + (j.ok ? 'Thank you!' : esc(j.error || 'Could not send')) + '</b> ' + (j.ok ? 'Got it. We look at every report and fix it fast.' : 'Try again later.') + '</div>';
          setTimeout(onClose, j.ok ? 2800 : 2200);
        }).catch(function () { send.disabled = false; send.textContent = 'Send report'; });
    });
    setTimeout(function () { ta.focus(); }, 0);
    return f;
  }
  window.bugForm = bugForm;

  var list = document.querySelector('#sup-panel .sup-list');
  if (!list) return;
  var row = el('button', 'sup-req sup-bug', '<span class="sup-ic">' + svg('bug', 20) + '</span><span><b>Report a bug</b><small>Something broken? Send a screenshot or a note</small></span>');
  row.type = 'button';
  list.appendChild(row);
  row.addEventListener('click', function (e) {
    e.stopPropagation();
    var f = bugForm(function () { if (f.parentNode) f.parentNode.replaceChild(row, f); });
    list.replaceChild(f, row);
  });
})();
