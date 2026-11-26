// Profile picture picker (src/avatar.js): opens from the round avatar in the top bar or Account > Profile picture.
// Upload a photo (cropped to a square and shrunk to 256px here, so only ~20 KB is sent), pick a site picture, or keep the letter.
(function () {
  if (window.__avInit) return; window.__avInit = true;
  var PRESETS = { logo: '/logo.png', katana: '/look/katana.jpg', hyper: '/look/hyper.jpg', gt: '/look/gt.jpg', coupe: '/look/coupe.jpg',
    nightrun: '/look/nightrun.jpg', chrome: '/look/chrome.jpg', rivers: '/look/rivers.jpg', ridge: '/look/ridge.jpg' };
  var open = null;

  function current() { var b = document.querySelector('.tb-av'); return b ? b.innerHTML : ''; }
  function setAll(src, logo) {
    document.querySelectorAll('.tb-av').forEach(function (b) {
      if (src) b.innerHTML = '<img class="av-img' + (logo ? ' av-logo' : '') + '" src="' + src + '" alt="">';
      else b.textContent = b.getAttribute('data-letter') || 'M';
    });
  }
  function letter() { var b = document.querySelector('.tb-av'); return (b && b.getAttribute('data-letter')) || 'M'; }

  function show() {
    if (open) return;
    document.querySelectorAll('[data-tb-close]').forEach(function (s) { s.click(); });   // close the phone menu first
    var bg = document.createElement('div');
    bg.className = 'av-bg';
    bg.innerHTML = '<section class="av-pop" role="dialog" aria-modal="true" aria-labelledby="av-t">' +
      '<i class="av-grab" aria-hidden="true"></i>' +
      '<div class="av-head"><span class="av-prev" id="av-prev">' + current() + '</span><div><h2 id="av-t">Profile picture</h2><p>Shown in your top bar. Only you see it.</p></div>' +
      '<button type="button" class="av-x" data-av-close aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<label class="av-up"><input type="file" accept="image/*" id="av-file"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg><span><b>Upload your photo</b><small>Any picture from your phone or computer</small></span></label>' +
      '<div class="av-lbl">Or pick one</div><div class="av-grid">' +
      Object.keys(PRESETS).map(function (k) { return '<button type="button" class="av-pick' + (k === 'logo' ? ' av-logo' : '') + '" data-av-pick="' + k + '" aria-label="' + k + '"><img src="' + PRESETS[k] + '" alt="" loading="lazy"></button>'; }).join('') +
      '<button type="button" class="av-pick av-letter" data-av-pick="" aria-label="Use my letter">' + letter() + '</button></div>' +
      '<p class="av-msg" id="av-msg" role="status"></p></section>';
    document.body.appendChild(bg);
    open = bg;
    requestAnimationFrame(function () { bg.classList.add('in'); });
    function close() { if (!open) return; bg.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(function () { bg.remove(); }, 250); open = null; }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    function msg(t) { var m = bg.querySelector('#av-msg'); if (m) m.textContent = t; }
    function done(src, logo) { setAll(src, logo); var p = bg.querySelector('#av-prev'); if (p) p.innerHTML = current(); msg('Saved.'); setTimeout(close, 450); }
    bg.addEventListener('click', function (e) {
      if (e.target === bg || e.target.closest('[data-av-close]')) return close();
      var pk = e.target.closest('[data-av-pick]');
      if (!pk) return;
      var k = pk.getAttribute('data-av-pick');
      fetch('/api/avatar', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pick: k }) })
        .then(function (r) { return r.json(); }).then(function (j) { done(j.src || '', k === 'logo'); }).catch(function () { msg('Could not save. Try again.'); });
    });
    bg.querySelector('#av-file').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      msg('Saving…');
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        var s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          fetch('/api/avatar/upload', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg' }, body: b })
            .then(function (r) { return r.json(); }).then(function (j) { if (j.src) done(j.src, false); else msg(j.error || 'Could not save.'); })
            .catch(function () { msg('Could not save. Try again.'); });
        }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { msg('That picture could not be opened. Try a JPG or PNG.'); };
      img.src = url;
    });
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-av-open]');
    if (!o) return;
    e.preventDefault(); e.stopPropagation();
    show();
  }, true);
})();
