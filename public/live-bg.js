/* Live screen: a background behind the P&L, picked the same way as in Share Studio.
   Built-in moving looks (Smoke, Ember, Trading floor), free stock clips by topic (when the site has a clip key)
   or the member's own picture / clip. The choice is remembered on this device; an own file stays in this
   browser (IndexedDB) and is never uploaded. */
(function () {
  var root = document.querySelector('[data-lv]'); if (!root) return;
  var D = {}; try { D = JSON.parse(root.querySelector('[data-lv-data]').textContent); } catch (e) {}
  var hero = root.querySelector('.lv-hero'), layer = root.querySelector('[data-lv-bg]'), pn = document.querySelector('[data-lv-bgp]');
  var btn = root.querySelector('[data-lv-bgbtn]'), tiles = pn.querySelector('[data-lv-tiles]'), own = pn.querySelector('[data-lv-own]');
  var dimIn = pn.querySelector('[data-lv-dim]'), bwIn = pn.querySelector('[data-lv-bw]'), note = pn.querySelector('[data-lv-bgn]');
  var store = { get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  /* one design per kind of screen, saved on the account: PC, iPad / tablet, phone */
  var HERE = (function () {
    var sw = Math.min(screen.width, screen.height), lw = Math.max(screen.width, screen.height), touch = navigator.maxTouchPoints > 0;
    return sw < 600 ? 'phone' : touch && lw <= 1400 ? 'tab' : 'pc';
  })();
  var NAMES = { pc: 'PC', tab: 'iPad', phone: 'phone' };
  var B = {}, bgs = D.bgs || {};
  ['pc', 'tab', 'phone'].forEach(function (d) { B[d] = Object.assign({ k: 'none', dim: 0.5, bw: false, clip: null }, bgs[d] || (d === HERE ? store.get('lv.bg') : null) || {}); });
  var EDIT = HERE, S = B[EDIT], devs = pn.querySelector('.lv-devs'), devn = pn.querySelector('[data-lv-devn]');

  var BUILT = [['none', 'None', 'linear-gradient(135deg,#141416,#0a0a0b)'], ['smoke', 'Smoke', 'radial-gradient(circle at 35% 40%,#6b6b72,#141416 70%)'],
    ['ember', 'Ember', 'radial-gradient(circle at 50% 70%,#ff5a1f,#3a1206 60%,#0a0a0b)'], ['floor', 'Trading floor', 'linear-gradient(180deg,#0a0a0b 40%,#3a3a40)']];
  var TOPICS = D.stock ? [['racing', 'Racing'], ['dark', 'Dark city'], ['war', 'War'], ['beast', 'Beasts'], ['fight', 'Fight'], ['supercars', 'Supercars'], ['money', 'Money'], ['watches', 'Watches'], ['fire', 'Fire & storm']] : [];
  var thumbs = {};

  /* ---------- own file kept in this browser ---------- */
  function idb(mode, fn) {
    return new Promise(function (ok, no) {
      try {
        var r = indexedDB.open('lv-bg', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('f'); };
        r.onsuccess = function () { var tx = r.result.transaction('f', mode), q = fn(tx.objectStore('f')); tx.oncomplete = function () { ok(q && q.result); }; tx.onerror = function () { no(tx.error); }; };
        r.onerror = function () { no(r.error); };
      } catch (e) { no(e); }
    });
  }

  /* ---------- the layer ---------- */
  var cv = null, raf = 0, url = null;
  function clear() { cancelAnimationFrame(raf); raf = 0; cv = null; if (url) { URL.revokeObjectURL(url); url = null; } layer.innerHTML = ''; }
  function shade() { var d = document.createElement('i'); d.className = 'lv-sh'; layer.appendChild(d); }
  function media(src, isVid, fallback) {
    var m = document.createElement(isVid ? 'video' : 'img');
    if (isVid) { m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true; m.setAttribute('playsinline', ''); }
    m.onerror = function () { if (fallback && m.src.indexOf(fallback) < 0) { m.src = fallback; if (isVid) m.play().catch(function () {}); } };
    m.src = src; layer.appendChild(m); if (isVid) m.play().catch(function () {});
  }
  /* what shows on this screen (each item can be hidden; saved with the design for PC / iPad / phone) */
  var SHOWS = [['accts', 'Account tabs'], ['sub', 'Line under the number'], ['line', 'Day line'], ['today', 'Today'], ['todayr', 'Today R'], ['trades', 'Trades'],
    ['used', 'Daily loss used'], ['loss', 'Losses'], ['news', 'News countdown'], ['check', 'Pre-trade checklist'], ['feel', 'Feelings'], ['mark', 'Mark this moment']];
  var showsEl = pn.querySelector('[data-lv-shows]');
  function hides() {
    var h = S.hide || [];
    [].forEach.call(document.querySelectorAll('[data-h]'), function (el) { if (!pn.contains(el)) el.classList.toggle('lv-off', h.indexOf(el.dataset.h) > -1); });
    root.classList.toggle('lv-nostats', ['today', 'todayr', 'trades', 'used', 'loss', 'news'].every(function (k) { return h.indexOf(k) > -1; }));
  }
  function drawShows() {
    var h = S.hide || [];
    showsEl.innerHTML = SHOWS.map(function (x) { return '<button type="button" data-hk="' + x[0] + '" aria-pressed="' + (h.indexOf(x[0]) < 0) + '">' + x[1] + '</button>'; }).join('');
  }
  showsEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-hk]'); if (!b) return;
    var h = (S.hide || []).slice(), i = h.indexOf(b.dataset.hk);
    if (i > -1) h.splice(i, 1); else h.push(b.dataset.hk);
    S.hide = h; save(); drawShows(); hides();
  });
  function paint() {
    clear();
    hides();
    layer.classList.toggle('built', ['smoke', 'ember', 'floor'].indexOf(S.k) > -1);
    root.classList.toggle('has-bg', S.k !== 'none');
    layer.classList.toggle('bw', !!S.bw); layer.style.setProperty('--dim', S.dim);
    if (S.k === 'none') return;
    if (S.k === 'own') {
      idb('readonly', function (st) { return st.get('own'); }).then(function (f) {
        if (!f) { root.classList.remove('has-bg'); if (!pn.hidden) note.textContent = 'Your picture is kept on the device you added it on. Tap My own to add it on this one.'; return; }
        if (S.k !== 'own') return; url = URL.createObjectURL(f); media(url, /^video\//.test(f.type)); shade();
      }).catch(function () {});
      return;
    }
    if (S.clip && S.clip.k === S.k) { media(S.clip.url, true, '/journal/studio/clip?u=' + encodeURIComponent(S.clip.url)); shade(); return; }
    if (TOPICS.some(function (t) { return t[0] === S.k; })) { shuffle(S.k); return; }
    cv = document.createElement('canvas'); layer.appendChild(cv); shade(); loop(0);
  }

  /* built-in looks: light and slow, no canvas blur (phones) */
  var t0 = 0, scrolled = 0, box = { w: 0, h: 0 };
  window.addEventListener('scroll', function () { scrolled = Date.now(); }, { passive: true });
  window.addEventListener('touchmove', function () { scrolled = Date.now(); }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(function () { box.w = 0; }).observe(layer);
  else window.addEventListener('resize', function () { box.w = 0; });
  function loop(now) {
    if (!cv) return;
    if (!t0) t0 = now; var tm = (now - t0) / 1000;
    // paused while the finger scrolls, and the size is read only when the box changes (iPhone scroll shake)
    if (Date.now() - scrolled < 250) { raf = requestAnimationFrame(loop); return; }
    if (!box.w) { box.w = layer.clientWidth; box.h = layer.clientHeight; }
    var W = box.w, H = box.h; if (!W || !H) { box.w = 0; raf = requestAnimationFrame(loop); return; }
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var a = cv.getContext('2d'); a.fillStyle = '#0a0a0c'; a.fillRect(0, 0, W, H);
    var g, i;
    if (S.k === 'ember') {
      for (i = 0; i < 4; i++) {
        var x = W * (0.3 + 0.4 * ((Math.sin(tm * 0.21 + i * 1.9) + 1) / 2)), y = H * (0.75 + 0.2 * Math.sin(tm * 0.17 + i)), r = Math.max(W, H) * (0.35 + 0.08 * i);
        g = a.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,90,31,' + (0.34 - i * 0.06).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,90,31,0)');
        a.fillStyle = g; a.fillRect(0, 0, W, H);
      }
      for (i = 0; i < 26; i++) {   // sparks drifting up
        var sx = (i * 137.5 % 100) / 100 * W + Math.sin(tm * 0.8 + i) * 12, sy = H - ((tm * (14 + i % 7 * 5) + i * 53) % (H + 40));
        a.fillStyle = 'rgba(255,150,90,' + (0.25 + 0.35 * ((i * 7) % 10) / 10).toFixed(2) + ')'; a.fillRect(sx, sy, 2, 2);
      }
    } else if (S.k === 'floor') {
      var hz = H * 0.35; a.strokeStyle = '#d8d8de'; a.lineWidth = 1;
      for (i = 0; i < 18; i++) { var k = (i + (tm * 0.35) % 1) / 18, yy = hz + Math.pow(k, 2.2) * (H - hz); a.globalAlpha = 0.04 + 0.22 * k; a.beginPath(); a.moveTo(0, yy); a.lineTo(W, yy); a.stroke(); }
      for (i = -16; i <= 16; i++) { a.globalAlpha = 0.1; a.beginPath(); a.moveTo(W / 2 + i * 14, hz); a.lineTo(W / 2 + i * W * 0.12, H); a.stroke(); }
      a.globalAlpha = 1; g = a.createRadialGradient(W / 2, hz, 10, W / 2, hz, Math.max(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = g; a.fillRect(0, 0, W, H);
    } else {   // smoke
      for (i = 0; i < 6; i++) {
        var px = W * (0.15 + 0.7 * ((Math.sin(tm * 0.12 + i * 1.7) + 1) / 2)), py = H * (0.1 + 0.8 * ((Math.cos(tm * 0.1 + i * 2.3) + 1) / 2)), pr = Math.max(W, H) * (0.3 + 0.06 * i);
        g = a.createRadialGradient(px, py, 0, px, py, pr); g.addColorStop(0, 'rgba(215,215,225,' + (0.24 - i * 0.025).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        a.fillStyle = g; a.fillRect(0, 0, W, H);
      }
    }
    raf = requestAnimationFrame(loop);
  }

  /* free stock clip for a topic (same source as Share Studio); tapping the tile again shuffles */
  function shuffle(k) {
    note.textContent = 'Finding a clip…';
    fetch('/journal/studio/clips?topic=' + encodeURIComponent(k) + (hero.clientWidth > hero.clientHeight ? '&wide=1' : ''), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); }).then(function (j) {
        var l = (j.clips || []).filter(function (x) { return !S.clip || x.url !== S.clip.url; });
        if (!l.length) throw new Error('No clips came back. Tap it again.');
        var c = l[Math.floor(Math.random() * l.length)];
        S.clip = { k: k, url: c.url, by: c.by || '', page: c.page || '', src: c.src || '' }; save(); paint(); credit();
      }).catch(function (e) { note.textContent = e.message || 'Could not load a clip. Try again.'; });
  }
  function credit() {
    if (S.k === 'own') note.textContent = 'Your own file. It stays on this device and is never uploaded.';
    else if (S.clip && S.clip.k === S.k) note.innerHTML = 'Clip by ' + esc(S.clip.by || 'a creator') + (S.clip.page ? ' on <a href="' + esc(S.clip.page) + '" target="_blank" rel="noopener">' + esc(S.clip.src || 'Pixabay') + '</a>' : '') + '. Tap the tile again to shuffle.';
    else note.textContent = 'Your own picture or clip stays on this device. It is never uploaded.';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var sendT = 0;
  function save() {
    if (EDIT === HERE) store.set('lv.bg', S);
    var dev = EDIT, bg = JSON.stringify(S);
    clearTimeout(sendT); sendT = setTimeout(function () {   // saved on the account, so it comes back on any screen of this kind
      fetch('/journal/live/bg', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'dev=' + dev + '&bg=' + encodeURIComponent(bg) }).catch(function () {});
    }, 500);
  }
  function syncDevs() {
    [].forEach.call(devs.querySelectorAll('[data-dev]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.dev === EDIT)); b.classList.toggle('here', b.dataset.dev === HERE); });
    devn.textContent = EDIT === HERE ? 'This is your ' + NAMES[HERE] + ' design. It comes back on any ' + NAMES[HERE] + ' you sign in on.'
      : 'Editing your ' + NAMES[EDIT] + ' design, shown here as a preview. This screen goes back to its own design when you close this.';
  }
  function edit(dev) { EDIT = dev; S = B[dev]; syncDevs(); dimIn.value = S.dim; bwIn.checked = !!S.bw; drawTiles(); drawShows(); paint(); credit(); }
  devs.addEventListener('click', function (e) { var b = e.target.closest('[data-dev]'); if (b && b.dataset.dev !== EDIT) edit(b.dataset.dev); });

  /* ---------- the panel ---------- */
  function drawTiles() {
    var h = BUILT.map(function (b) { return tile(b[0], b[1], 'background:' + b[2]); }).join('');
    h += TOPICS.map(function (t) { return tile(t[0], t[1], thumbs[t[0]] ? "background:#111 url('" + thumbs[t[0]] + "') center/cover" : 'background:linear-gradient(135deg,#1c1c1f,#0d0d0e)', true); }).join('');
    h += tile('own', 'My own', 'background:linear-gradient(135deg,#232326,#101011)', false, true);
    tiles.innerHTML = h;
  }
  function tile(k, l, st, clip, plus) {
    return '<button type="button" class="lv-tile" data-k="' + k + '" aria-pressed="' + (S.k === k) + '"><i style="' + st + '">' + (plus ? '+' : clip ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' : '') + '</i><span>' + l + '</span></button>';
  }
  var thumbsAsked = false;
  function open(on) {
    pn.hidden = !on; btn.setAttribute('aria-expanded', String(on));
    if (!on) { if (EDIT !== HERE) edit(HERE); return; }
    syncDevs();
    var r = btn.getBoundingClientRect(); pn.style.top = (r.bottom + 8) + 'px';
    if (innerWidth < 560) { pn.style.left = '12px'; pn.style.right = '12px'; } else { pn.style.left = 'auto'; pn.style.right = Math.max(12, innerWidth - r.right) + 'px'; }
    dimIn.value = S.dim; bwIn.checked = !!S.bw; drawTiles(); drawShows(); credit();
    if (D.stock && !thumbsAsked) {
      thumbsAsked = true;
      TOPICS.forEach(function (t) {
        fetch('/journal/studio/clips?topic=' + t[0], { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
          var c = (j.clips || []).find(function (x) { return x.thumb; }); if (c) { thumbs[t[0]] = c.thumb; var el = tiles.querySelector('[data-k="' + t[0] + '"] i'); if (el) el.style.background = "#111 url('" + c.thumb + "') center/cover"; }
        }).catch(function () {});
      });
    }
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); open(pn.hidden); });
  pn.querySelector('[data-lv-bgx]').onclick = function () { open(false); };
  pn.addEventListener('click', function (e) { e.stopPropagation(); });   // tiles are redrawn on click; keep the panel open
  document.addEventListener('click', function (e) { if (!pn.hidden && !pn.contains(e.target) && e.target !== btn) open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pn.hidden) open(false); });
  tiles.addEventListener('click', function (e) {
    var b = e.target.closest('.lv-tile'); if (!b) return; var k = b.dataset.k;
    if (k === 'own') { own.click(); return; }
    var again = S.k === k && TOPICS.some(function (t) { return t[0] === k; });
    S.k = k; if (again) { save(); drawTiles(); shuffle(k); return; }
    save(); drawTiles(); paint(); credit();
  });
  own.onchange = function () {
    var f = own.files[0]; if (!f) return;
    idb('readwrite', function (st) { return st.put(f, 'own'); }).then(function () { S.k = 'own'; save(); drawTiles(); paint(); credit(); })
      .catch(function () { note.textContent = 'This browser could not keep the file. Try a smaller one.'; });
    own.value = '';
  };
  dimIn.oninput = function () { S.dim = +dimIn.value; layer.style.setProperty('--dim', S.dim); save(); };
  bwIn.onchange = function () { S.bw = bwIn.checked; layer.classList.toggle('bw', S.bw); save(); };

  paint();
})();
