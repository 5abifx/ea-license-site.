// Public profile page: draws each shared trade as a small 9:16 card from its real MT5 candles
(function () {
  var data = []; try { data = JSON.parse(document.getElementById('pf-data').textContent); } catch (e) {}
  var box = document.getElementById('pf-cards');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sign(n, d) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (box) box.innerHTML = data.map(function (t, i) {
    var v = t.r != null ? t.r : t.p != null ? t.p : t.m;
    var win = v == null ? true : v >= 0;
    var big = t.r != null ? sign(t.r, 1) + 'R' : t.p != null ? sign(t.p, 2) + '%' : t.m != null ? sign(t.m, 2) : '';
    var sub = [t.p != null && t.r != null ? sign(t.p, 2) + '% of account' : '', t.m != null ? sign(t.m, 2) + ' ' + esc(t.cur) : ''].filter(Boolean).join(' · ');
    var d = t.t ? MON[+t.t.slice(5, 7) - 1] + ' ' + (+t.t.slice(8, 10)) : '';
    return '<div class="pf-card"><canvas data-i="' + i + '" data-w="' + (win ? 1 : 0) + '"></canvas><div class="t"><span><b>' + esc(t.s) + '</b> · ' + (t.d === 'BUY' ? 'Buy' : 'Sell') + '</span><span>' + d + '</span></div>' +
      '<div class="b"><div class="r ' + (win ? 'up' : 'down') + '">' + big + '</div><div class="s">' + (sub || '&nbsp;') + '</div></div><img class="mark" src="/logo.png" alt=""></div>';
  }).join('');

  function draw() {
    document.querySelectorAll('.pf-card canvas').forEach(function (c) {
      var t = data[+c.dataset.i], r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (!r.width) return;
      c.width = r.width * dpr; c.height = r.height * dpr;
      var g = c.getContext('2d'); g.scale(dpr, dpr);
      var W = r.width, H = r.height, win = c.dataset.w === '1';
      var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#101015'); bg.addColorStop(1, '#07070a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      var glow = g.createRadialGradient(W * .5, H * .95, 0, W * .5, H * .95, W);
      glow.addColorStop(0, win ? 'rgba(38,198,160,.18)' : 'rgba(240,70,75,.16)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
      var k = (t.c || []).filter(function (q) { return q && q.length === 4 && isFinite(q[1]) && isFinite(q[2]); });
      if (k.length < 3) return;
      var lo = Infinity, hi = -Infinity;
      k.forEach(function (q) { lo = Math.min(lo, q[2]); hi = Math.max(hi, q[1]); });
      [t.e, t.x].forEach(function (p) { if (p != null && isFinite(p)) { lo = Math.min(lo, p); hi = Math.max(hi, p); } });
      if (!(hi > lo)) return;
      var top = H * .16, bot = H * .66, y = function (v) { return top + (hi - v) / (hi - lo) * (bot - top); };
      var cw = W / (k.length + 1);
      if (t.e != null && t.x != null) {
        g.fillStyle = win ? 'rgba(38,198,160,.12)' : 'rgba(240,70,75,.12)';
        g.fillRect(0, Math.min(y(t.e), y(t.x)), W, Math.abs(y(t.e) - y(t.x)));
        g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(0, y(t.e)); g.lineTo(W, y(t.e)); g.stroke(); g.setLineDash([]);
      }
      k.forEach(function (q, i) {
        var x = cw * (i + .5), up = q[3] >= q[0];
        g.strokeStyle = g.fillStyle = up ? '#26c6a0' : '#f0464b';
        g.lineWidth = 1; g.beginPath(); g.moveTo(x + cw * .3, y(q[1])); g.lineTo(x + cw * .3, y(q[2])); g.stroke();
        g.fillRect(x, Math.min(y(q[0]), y(q[3])), Math.max(1, cw * .6), Math.max(1.2, Math.abs(y(q[0]) - y(q[3]))));
      });
    });
    document.querySelectorAll('canvas[data-cover]').forEach(function (c) {
      var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; if (!r.width) return;
      c.width = r.width * dpr; c.height = r.height * dpr;
      var g = c.getContext('2d'); g.scale(dpr, dpr);
      var W = r.width, H = r.height, s = +c.dataset.cover * 7919 % 233280 || 19, v = H * .7;
      var rnd = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      g.beginPath();
      for (var x = 0; x <= W; x += 6) { v += (rnd() - .56) * 7; v = Math.max(H * .2, Math.min(H * .85, v)); x ? g.lineTo(x, v) : g.moveTo(x, v); }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.4; g.stroke();
      g.lineTo(W, H); g.lineTo(0, H); g.closePath();
      var f = g.createLinearGradient(0, 0, 0, H); f.addColorStop(0, 'rgba(255,255,255,.10)'); f.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = f; g.fill();
    });
  }
  draw(); addEventListener('resize', draw);

  // Share: the phone's share sheet when there is one, else copy the link
  document.querySelectorAll('[data-share]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.dataset.share, old = b.textContent;
      if (navigator.share) { navigator.share({ title: b.dataset.title, url: url }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
        b.textContent = 'Link copied ✓'; setTimeout(function () { b.textContent = old; }, 1600);
      }).catch(function () { prompt('Copy your link', url); });
    });
  });
})();
