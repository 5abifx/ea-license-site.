// Live screen (/journal/live): numbers that move, a liquid guard orb, the open trade drawn as it runs.
// Data comes from the page (src/live.js). The open trade needs the Journal EA live pulse; ?demo=1 plays a sample.
(function () {
  var root = document.querySelector('[data-lv]'); if (!root) return;
  var D = {}; try { D = JSON.parse(root.querySelector('[data-lv-data]').textContent); } catch (e) { /* empty page */ }
  var $ = function (k) { return root.querySelector('[data-lv-' + k + ']'); };
  var cur = D.cur === 'USD' || !D.cur ? '$' : '';
  var suf = D.cur && D.cur !== 'USD' ? ' ' + D.cur : '';
  var fmtM = function (v, dec) { var a = Math.abs(v); return (v < 0 ? '−' : v > 0 ? '+' : '') + cur + a.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }) + suf; };
  var fmtR = function (v) { return v === null || v === undefined ? '' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + 'R'; };
  var two = function (n) { return String(n).padStart(2, '0'); };
  var mmss = function (s) { s = Math.max(0, Math.round(s)); return (s >= 3600 ? Math.floor(s / 3600) + ':' + two(Math.floor(s / 60) % 60) : two(Math.floor(s / 60))) + ':' + two(s % 60); };
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var css = getComputedStyle(root);
  var ACC = (css.getPropertyValue('--accent') || '#ff5a1f').trim() || '#ff5a1f';
  var WIN = '#26c6a0', LOSS = '#f0464b', WARN = '#f5a524';

  // ---------- numbers that glide instead of jumping ----------
  function Tw(el, fmt) { this.el = el; this.fmt = fmt; this.v = 0; this.to = 0; }
  Tw.prototype.set = function (v, now) { this.to = v; if (now) this.v = v; };
  Tw.prototype.step = function () { if (!this.el) return; var d = this.to - this.v; this.v = Math.abs(d) < 0.01 ? this.to : this.v + d * 0.14; this.el.textContent = this.fmt(this.v); };

  // ---------- state ----------
  var S = {
    state: 'flat', today: D.today || { net: 0, r: null, n: 0, list: [] }, guard: D.guard || {}, news: D.news,
    pos: null, hist: [], lockEnd: 0, revEnd: 0,
  };
  var tw = {
    today: new Tw($('today'), function (v) { return fmtM(Math.round(v)); }),
    fl: new Tw($('fl'), function (v) { return fmtM(Math.round(v)); }),
    used: new Tw($('used'), function (v) { return Math.round(v) + '%'; }),
  };

  // ---------- canvases ----------
  function fit(c) { if (!c) return null; var r = c.getBoundingClientRect(); var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c.getContext('2d'); }
  function glowLine(c, pts, opt) {
    var g = fit(c); if (!g || pts.length < 2) { if (g) g.clearRect(0, 0, c.width, c.height); return; }
    var W = c.width, H = c.height, pad = 8 * dpr;
    var lo = Math.min.apply(null, pts.concat(opt.lo !== undefined ? [opt.lo] : [])), hi = Math.max.apply(null, pts.concat(opt.hi !== undefined ? [opt.hi] : []));
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    var x = function (i) { return pad + (i / (pts.length - 1)) * (W - pad * 2 - (opt.endRoom || 0)); };
    var y = function (v) { return pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2); };
    g.clearRect(0, 0, W, H);
    // zero / entry line
    g.setLineDash([3 * dpr, 5 * dpr]); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = dpr; g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke(); g.setLineDash([]);
    (opt.marks || []).forEach(function (m) { g.strokeStyle = m.c; g.globalAlpha = .35; g.beginPath(); g.moveTo(0, y(m.v)); g.lineTo(W, y(m.v)); g.stroke(); g.globalAlpha = 1; });
    var col = opt.color;
    // area
    var grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, hexA(col, .28)); grd.addColorStop(1, hexA(col, 0));
    g.beginPath(); pts.forEach(function (v, i) { var X = x(i), Y = y(v); if (!i) g.moveTo(X, Y); else { var px = x(i - 1), py = y(pts[i - 1]); g.quadraticCurveTo(px, py, (px + X) / 2, (py + Y) / 2); } });
    g.lineTo(x(pts.length - 1), y(pts[pts.length - 1])); g.lineTo(x(pts.length - 1), H); g.lineTo(x(0), H); g.closePath(); g.fillStyle = grd; g.fill();
    // glowing line
    g.save(); g.shadowColor = col; g.shadowBlur = 14 * dpr; g.strokeStyle = col; g.lineWidth = 2.4 * dpr; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(function (v, i) { var X = x(i), Y = y(v); if (!i) g.moveTo(X, Y); else { var px = x(i - 1), py = y(pts[i - 1]); g.quadraticCurveTo(px, py, (px + X) / 2, (py + Y) / 2); } });
    g.lineTo(x(pts.length - 1), y(pts[pts.length - 1])); g.stroke(); g.restore();
    // breathing end point
    var ex = x(pts.length - 1), ey = y(pts[pts.length - 1]), t = performance.now() / 1000, br = (Math.sin(t * 3) + 1) / 2;
    g.fillStyle = hexA(col, .18 + .14 * br); g.beginPath(); g.arc(ex, ey, (8 + 8 * br) * dpr, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, 3.6 * dpr, 0, 7); g.fill();
  }
  function hexA(h, a) { if (h.indexOf('rgb') === 0) return h.replace(/rgba?\(([^)]+?)(,\s*[\d.]+)?\)/, 'rgba($1,' + a + ')'); var n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }

  // liquid orb: daily loss used, water that keeps moving ("aab" = water)
  function orb(c, frac, col) {
    var g = fit(c); if (!g) return; var W = c.width, H = c.height, R = Math.min(W, H) / 2 - 4 * dpr, cx = W / 2, cy = H / 2, t = performance.now() / 1000;
    g.clearRect(0, 0, W, H);
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(0, 0, W, H);
    var level = cy + R - frac * 2 * R;
    [[.55, 1.4, 0, .9], [.35, 1.9, 2, 1.3]].forEach(function (L, k) {
      g.beginPath(); g.moveTo(0, H);
      for (var X = 0; X <= W; X += 4 * dpr) g.lineTo(X, level + Math.sin(X / W * Math.PI * 2 * L[1] + t * L[3] + L[2]) * 5 * dpr * (1 - k * .3));
      g.lineTo(W, H); g.closePath();
      var gr = g.createLinearGradient(0, level - 10, 0, H); gr.addColorStop(0, hexA(col, L[0] + .2)); gr.addColorStop(1, hexA(col, L[0] * .35));
      g.fillStyle = gr; g.fill();
    });
    // bubbles
    for (var i = 0; i < 6; i++) { var p = (t * .15 + i / 6) % 1, bx = cx + Math.sin(i * 9.1 + t) * R * .55, by = H - p * (H - level); if (by > level + 6 * dpr) { g.fillStyle = 'rgba(255,255,255,' + (.25 * (1 - p)) + ')'; g.beginPath(); g.arc(bx, by, (1.5 + (i % 3)) * dpr, 0, 7); g.fill(); } }
    g.restore();
    // glass rim + highlight
    g.lineWidth = 1.5 * dpr; g.strokeStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    var hl = g.createLinearGradient(cx - R, cy - R, cx, cy); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = hl; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(cx, cy, R - 6 * dpr, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
    g.shadowColor = col; g.shadowBlur = 24 * dpr; g.strokeStyle = hexA(col, .3); g.lineWidth = 1 * dpr; g.beginPath(); g.arc(cx, cy, R + 1 * dpr, 0, 7); g.stroke(); g.shadowBlur = 0;
  }

  // liquid tube: stop -> entry -> target, filled to where price is now, with a moving surface
  function tube(c, x, col) {
    var g = fit(c); if (!g) return; var W = c.width, H = c.height, r = H / 2, t = performance.now() / 1000, ent = W / 3;
    g.clearRect(0, 0, W, H);
    g.save(); rr(g, 0, 0, W, H, r); g.clip();
    var bg = g.createLinearGradient(0, 0, W, 0); bg.addColorStop(0, 'rgba(240,70,75,.18)'); bg.addColorStop(.333, 'rgba(255,255,255,.04)'); bg.addColorStop(1, 'rgba(38,198,160,.18)');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var px = Math.max(r, Math.min(W - r, x * W)), a = Math.min(ent, px), b = Math.max(ent, px);
    g.beginPath(); g.moveTo(a, H);
    for (var Y = H; Y >= 0; Y -= 2 * dpr) g.lineTo((px > ent ? a : a + Math.sin(Y / H * 6 + t * 4) * 3 * dpr), Y);
    for (var Y2 = 0; Y2 <= H; Y2 += 2 * dpr) g.lineTo((px > ent ? b + Math.sin(Y2 / H * 6 + t * 4) * 3 * dpr : b), Y2);
    g.closePath();
    var lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, hexA(col, .95)); lg.addColorStop(1, hexA(col, .45));
    g.fillStyle = lg; g.fill();
    // shine moving along the liquid
    var sx = a + ((t * 0.35) % 1) * (b - a); var sh = g.createLinearGradient(sx - 30 * dpr, 0, sx + 30 * dpr, 0); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.5, 'rgba(255,255,255,.35)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(a, 0, b - a, H);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 2 * dpr, W, 2 * dpr);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = dpr; rr(g, .5, .5, W - 1, H - 1, r); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(ent - dpr, 3 * dpr, 2 * dpr, H - 6 * dpr);
    // price bead
    g.save(); g.shadowColor = '#fff'; g.shadowBlur = 12 * dpr; g.fillStyle = '#fff'; g.beginPath(); g.arc(px, H / 2, r * .62, 0, 7); g.fill(); g.restore();
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function breath(c) {
    var g = fit(c); if (!g) return; var W = c.width, H = c.height, t = performance.now() / 1000, ph = (Math.sin(t * Math.PI / 4 - Math.PI / 2) + 1) / 2;
    g.clearRect(0, 0, W, H);
    for (var k = 3; k >= 0; k--) { g.fillStyle = 'rgba(240,70,75,' + (.06 + k * .02) + ')'; g.beginPath(); g.arc(W / 2, H / 2, (W / 2 - 6 * dpr) * (.55 + .45 * ph) * (1 - k * .12), 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.arc(W / 2, H / 2, (W / 2 - 6 * dpr) * (.55 + .45 * ph), 0, 7); g.stroke();
    var bt = $('bt'); if (bt) bt.textContent = Math.sin(t * Math.PI / 4) > 0 ? 'Breathe out' : 'Breathe in';
  }

  // ---------- painting the numbers ----------
  function paintToday() {
    var T = S.today; tw.today.set(T.net);
    var el = $('today'); if (el) el.style.color = T.net < 0 ? 'var(--loss)' : '#f2f2f4';
    var r = $('todayr'); if (r) { r.textContent = fmtR(T.r); r.className = T.r < 0 ? 'l' : 'w'; }
    var n = $('todayn'); if (n) { var w = T.list.filter(function (x) { return x[0] > 0; }).length; n.textContent = T.n ? T.n + ' trade' + (T.n === 1 ? '' : 's') + ' · ' + w + ' won · ' + (T.n - w) + ' lost' : 'No trades yet today'; }
    var d = $('dots'); if (d) { var html = ''; T.list.forEach(function (x, i) { html += '<i class="' + (x[0] >= 0 ? 'w' : 'l') + '" style="animation-delay:' + (i * 60) + 'ms"></i>'; }); for (var k = T.list.length; k < Math.max(5, T.list.length); k++) html += '<i></i>'; d.innerHTML = html; }
  }
  function paintGuard() {
    var G = S.guard, dl = G.daily;
    var used = dl && dl.allow ? Math.min(100, (dl.used / dl.allow) * 100) : 0;
    tw.used.set(used);
    var left = $('left'); if (left) left.textContent = dl ? 'used · ' + fmtM(Math.max(0, dl.allow - dl.used)).replace('+', '') + ' left' : 'Set your daily limit on the Desk';
    var lo = $('loss'); if (lo) { lo.textContent = (G.losses || 0) + ' of ' + (G.maxLosses || 2); lo.className = G.losses >= (G.maxLosses || 2) ? 'l' : ''; }
    var tr = $('trades'); if (tr) tr.textContent = (G.trades || 0) + ' of ' + (G.maxTrades || 5);
    var k = $('kat'); if (k) { k.textContent = S.state === 'lock' ? 'Paused' : 'Armed'; k.className = S.state === 'lock' ? 'l' : 'w'; }
  }
  function orbColor() { return S.state === 'near' ? WARN : S.state === 'lock' ? LOSS : '#e9e9ee'; }

  // ---------- the open trade ----------
  function paintPos() {
    var P = S.pos; if (!P) return;
    var R = P.pnl / P.risk;
    tw.fl.set(P.pnl);
    var fl = $('fl'); if (fl) fl.style.color = P.pnl < 0 ? 'var(--loss)' : 'var(--win)';
    var fr = $('flr'); if (fr) { fr.textContent = fmtR(R); fr.className = R < 0 ? 'l' : 'w'; }
    root.dataset.tone = P.pnl < 0 ? 'loss' : 'win';
    var tm = $('tim'); if (tm) tm.textContent = 'In trade ' + mmss((Date.now() - P.since) / 1000);
    var sd = $('side'); if (sd) { sd.textContent = (P.side === 'SELL' ? 'Sell ' : 'Buy ') + P.lots.toFixed(2); sd.className = 'lv-side' + (P.side === 'SELL' ? ' sell' : ''); }
    var sy = $('sym'); if (sy) sy.textContent = P.sym;
    var sl = $('sl'); if (sl) sl.textContent = fmtM(-P.risk);
    var tp = $('tp'); if (tp) tp.textContent = fmtM(P.risk * P.rr);
  }

  // ---------- moments ----------
  function go(st) {
    S.state = st; root.dataset.state = st;
    root.querySelectorAll('[data-lv-go]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lvGo === st)); });
    $('rev').hidden = st !== 'closed'; $('lock').hidden = st !== 'lock';
    if (st !== 'trade' && st !== 'near' && st !== 'closed') delete root.dataset.tone;
    if (D.demo) demoMoment(st);
    paintToday(); paintGuard();
  }

  // ---------- sample session (?demo=1) until the EA sends a live pulse ----------
  var base = null;
  function demoMoment(st) {
    if (!base) base = { today: JSON.parse(JSON.stringify(S.today)), guard: JSON.parse(JSON.stringify(S.guard)) };
    var T = JSON.parse(JSON.stringify(base.today)), G = JSON.parse(JSON.stringify(base.guard));
    if (!T.n) { T = { net: 412, r: 1.6, n: 3, list: [[260, 1.1], [-250, -1], [402, 1.5]] }; }
    if (!G.daily) G.daily = { allow: 5000, used: 0, pct: 5 };
    G.daily.used = 1600; G.trades = T.n; G.losses = 1;
    if (st === 'near') { T = { net: -3880, r: -3.9, n: 4, list: [[300, .3], [420, .4], [-4600, -4.6], [0, 0]] }; G.daily.used = 4300; G.losses = 1; G.trades = 4; }
    if (st === 'closed') { T.list = T.list.concat([[186, .7]]); T.n++; T.net += 186; T.r = (T.r || 0) + .7; G.trades = T.n; }
    if (st === 'lock') { T = { net: -380, r: -1.5, n: 3, list: [[120, .5], [-250, -1], [-250, -1]] }; G.daily.used = 3800; G.losses = 2; G.trades = 3; S.lockEnd = Date.now() + (24 * 60 + 10) * 1000; }
    S.today = T; S.guard = G;
    if (st === 'trade' || st === 'near' || st === 'closed') {
      if (!S.pos) { S.pos = { sym: 'XAUUSD', side: 'BUY', lots: 0.4, risk: 250, rr: 2, pnl: 140, since: Date.now() - (14 * 60 + 22) * 1000 }; S.hist = []; var v = 0, sd = 11; for (var i = 0; i < 90; i++) { sd = (sd * 16807) % 2147483647; v += ((sd / 2147483647) - .44) * 16; v = Math.max(-140, v); S.hist.push(v); } var k0 = 140 - v; S.hist = S.hist.map(function (x, i) { return x + k0 * i / 89; }); }
      if (st === 'near') { S.pos.pnl = -150; S.hist = S.hist.map(function (v, i) { return v * .35 - i * 2.1; }); }
      if (st === 'closed') { S.pos.pnl = 186; S.revEnd = Date.now() + 8000; $('revn').textContent = fmtM(186) + ' · +0.7R'; $('revn').style.color = 'var(--win)'; $('revh').textContent = 'XAUUSD buy closed · 21 min'; }
      paintPos(); tw.fl.set(S.pos.pnl, true);
    }
    if (S.news === null || S.news === undefined || st === 'near') S.news = { name: 'US CPI', cur: 'USD', t: Date.now() + (st === 'near' ? 4 * 60 + 12 : 18 * 60 + 4) * 1000 };
    var c = $('conn'); if (c) c.querySelector('span').textContent = 'Sample trade · live in 2 s';
  }
  function demoTick() {
    if (!S.pos || (S.state !== 'trade' && S.state !== 'near')) return;
    var drift = S.state === 'near' ? -.53 : -.46;
    S.pos.pnl = Math.max(-S.pos.risk * .96, Math.min(S.pos.risk * S.pos.rr * .96, S.pos.pnl + (Math.random() + drift) * 14));
    S.hist.push(S.pos.pnl); if (S.hist.length > 120) S.hist.shift();
    paintPos();
  }

  // ---------- clocks ----------
  function clocks() {
    var now = new Date();
    var ny = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    var c = $('clock'); if (c) c.textContent = ny + ' New York';
    var m = +ny.slice(0, 2) * 60 + +ny.slice(3);
    var SESS = [['Asia', 19 * 60, 27 * 60], ['London', 3 * 60, 8 * 60], ['NY AM', 8 * 60, 12 * 60], ['NY PM', 12 * 60, 17 * 60]];
    var s = $('sess'), label = 'After hours';
    SESS.forEach(function (x) { var mm = x[2] > 1440 && m < x[1] ? m + 1440 : m; if (mm >= x[1] && mm < x[2]) label = x[0] + ' · ' + mmss((x[2] - mm) * 60).replace(/:\d\d$/, '') + ' left'; });
    if (s) s.textContent = label.replace(/ · (\d+):(\d+) left/, function (_, h, mi) { return ' · ' + (+h ? +h + 'h ' : '') + +mi + ' min left'; });
    var n = $('news'), N = S.news;
    if (N && N.t > Date.now()) {
      var left = (N.t - Date.now()) / 1000;
      $('nn').textContent = (N.cur ? N.cur + ' · ' : '') + N.name; $('cd').textContent = left > 6 * 3600 ? 'later today' : 'in ' + mmss(left);
      n.classList.toggle('hot', left < 5 * 60);
    } else if (n) { $('nn').textContent = 'None coming up'; $('cd').textContent = ''; n.classList.remove('hot'); }
    if (S.state === 'lock') $('lcd').textContent = mmss((S.lockEnd - Date.now()) / 1000);
    if (S.state === 'closed') { var r = Math.ceil((S.revEnd - Date.now()) / 1000); $('revt').textContent = r > 0 ? 'Closes by itself in ' + r + ' s · change it later in the journal' : 'Saved to the trade'; }
  }

  // ---------- frame loop ----------
  function frame() {
    tw.today.step(); tw.used.step(); if (S.pos) tw.fl.step();
    if (!document.hidden) {
      var eq = [0], acc = 0; S.today.list.forEach(function (x) { acc += x[0]; eq.push(acc); });
      if (S.pos && (S.state === 'trade' || S.state === 'near')) eq.push(acc + S.pos.pnl);
      glowLine($('eq'), eq.length > 1 ? eq : [0, 0], { color: acc < 0 ? LOSS : ACC, endRoom: 14 * dpr });
      if (S.pos && root.querySelector('.lv-open').offsetParent) {
        var col = S.pos.pnl < 0 ? LOSS : WIN;
        glowLine($('path'), S.hist, { color: col, lo: -S.pos.risk * .3, hi: S.pos.risk * .6, endRoom: 14 * dpr });
        var x = S.pos.pnl < 0 ? (1 + S.pos.pnl / S.pos.risk) / 3 : 1 / 3 + (S.pos.pnl / (S.pos.risk * S.pos.rr)) * 2 / 3;
        tube($('tube'), x, col);
      }
      var used = S.guard.daily && S.guard.daily.allow ? S.guard.daily.used / S.guard.daily.allow : 0;
      orb($('orb'), Math.max(.02, Math.min(1, tw.used.v / 100 || used)), orbColor());
      if (S.state === 'lock') breath($('breath'));
    }
    requestAnimationFrame(frame);
  }

  // ---------- taps ----------
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lvGo) { go(b.dataset.lvGo); return; }
    var grp = b.closest('.lv-feel, .lv-opts');
    if (grp) { var on = b.getAttribute('aria-pressed') === 'true'; grp.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', String(!on)); return; }
    if (b.hasAttribute('data-lv-mark')) {
      var t = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
      b.textContent = 'Marked ' + t; b.classList.add('done'); setTimeout(function () { b.textContent = 'Mark this moment'; b.classList.remove('done'); }, 1800); return;
    }
    if (b.hasAttribute('data-lv-priv')) { var p = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(p)); root.classList.toggle('lv-private', p); return; }
    if (b.hasAttribute('data-lv-full')) {
      var d = document;
      if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen(); else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(function () {});
    }
  });
  // keep the screen awake while the live screen is open (iPad / phone on a stand)
  var lock = null;
  function wake() { if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {}); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !lock) wake(); });
  wake();

  var st = D.demo ? (new URLSearchParams(location.search).get('m') || (location.hash || '').slice(1) || 'trade') : (S.guard.streak >= (S.guard.maxLosses || 2) ? 'lock' : 'flat');
  if (st === 'lock' && !D.demo) S.lockEnd = Date.now() + 30 * 60 * 1000;
  go(['flat', 'trade', 'near', 'closed', 'lock'].indexOf(st) > -1 ? st : 'flat');
  tw.today.v = 0; tw.used.v = 0;
  clocks(); setInterval(clocks, 1000);
  if (D.demo) setInterval(demoTick, 700);
  requestAnimationFrame(frame);
})();
