// Live screen (/journal/live): Desk-style hero that follows the session.
// Flat: today's P&L with today's line behind it and the pre-trade checklist.
// In a trade: the open trade's floating P&L, its line drawing as it runs, a hairline from stop to target.
// Data comes from the page (src/live.js). The open trade needs the Journal EA live pulse; ?demo=1 plays a sample.
(function () {
  var root = document.querySelector('[data-lv]'); if (!root) return;
  var D = {}; try { D = JSON.parse(root.querySelector('[data-lv-data]').textContent); } catch (e) { /* empty page */ }
  var $ = function (k) { return root.querySelector('[data-lv-' + k + ']'); };
  var cur = !D.cur || D.cur === 'USD' ? '$' : '', suf = D.cur && D.cur !== 'USD' ? ' ' + D.cur : '';
  var fmtM = function (v, dec) { var a = Math.abs(v); return (v < 0 ? '−' : v > 0 ? '+' : '') + cur + a.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }) + suf; };
  var fmtR = function (v) { return v === null || v === undefined ? '–' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + 'R'; };
  var two = function (n) { return String(n).padStart(2, '0'); };
  var mmss = function (s) { s = Math.max(0, Math.round(s)); return (s >= 3600 ? Math.floor(s / 3600) + ':' + two(Math.floor(s / 60) % 60) : two(Math.floor(s / 60))) + ':' + two(s % 60); };
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var ACC = (getComputedStyle(root).getPropertyValue('--accent') || '').trim() || '#ff5a1f';
  var POS = '#26c6a0', NEG = '#f0464b';

  // numbers glide to the new value
  function Tw(el, fmt) { this.el = el; this.fmt = fmt; this.v = 0; this.to = 0; }
  Tw.prototype.set = function (v, now) { this.to = v; if (now) this.v = v; };
  Tw.prototype.step = function () { if (!this.el) return; var d = this.to - this.v; this.v = Math.abs(d) < 0.01 ? this.to : this.v + d * 0.12; this.el.textContent = this.fmt(this.v); };
  var num = new Tw($('num'), function (v) { return fmtM(Math.round(v)); });

  var S = { state: 'flat', today: D.today || { net: 0, r: null, n: 0, list: [] }, guard: D.guard || {}, news: D.news, pos: null, hist: [], lockEnd: 0, revEnd: 0 };

  // ---------- the line behind the number (same feel as the Desk's month line) ----------
  function line(c, pts, col, live) {
    var r = c.getBoundingClientRect(), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return; if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    var g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    if (pts.length < 2) return;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts); if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    var pad = 10 * dpr, endRoom = live ? 18 * dpr : 0;
    var x = function (i) { return (i / (pts.length - 1)) * (W - endRoom); };
    var y = function (v) { return pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2); };
    var path = function () { g.beginPath(); pts.forEach(function (v, i) { var X = x(i), Y = y(v); if (!i) g.moveTo(X, Y); else { var px = x(i - 1), py = y(pts[i - 1]); g.quadraticCurveTo(px, py, (px + X) / 2, (py + Y) / 2); } }); g.lineTo(x(pts.length - 1), y(pts[pts.length - 1])); };
    // faint area under the line
    path(); g.lineTo(x(pts.length - 1), H); g.lineTo(0, H); g.closePath();
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, hexA(col, .10)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fill();
    // the line with its glow
    g.save(); g.shadowColor = col; g.shadowBlur = 10 * dpr; g.strokeStyle = hexA(col, live ? .85 : .5); g.lineWidth = 2 * dpr; g.lineJoin = 'round'; path(); g.stroke(); g.restore();
    if (live) {   // breathing tip
      var ex = x(pts.length - 1), ey = y(pts[pts.length - 1]), br = (Math.sin(performance.now() / 330) + 1) / 2;
      g.fillStyle = hexA(col, .14 + .12 * br); g.beginPath(); g.arc(ex, ey, (7 + 7 * br) * dpr, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, 3.2 * dpr, 0, 7); g.fill();
    }
  }
  function hexA(h, a) { var n = parseInt(h.replace('#', ''), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }

  // ---------- paint ----------
  function inTrade() { return S.pos && (S.state === 'trade' || S.state === 'near' || S.state === 'closed'); }
  function paint() {
    var T = S.today, G = S.guard, dl = G.daily, won = T.list.filter(function (x) { return x[0] > 0; }).length;
    var t = $('today'); t.textContent = T.n ? fmtM(T.net) : '–'; t.className = T.n ? (T.net < 0 ? 'neg' : 'pos') : '';
    var tr = $('todayr'); tr.textContent = fmtR(T.r); tr.className = T.r === null ? '' : T.r < 0 ? 'neg' : 'pos';
    $('trades').textContent = (G.trades || 0) + ' of ' + (G.maxTrades || 5);
    var lo = $('loss'); lo.textContent = (G.losses || 0) + ' of ' + (G.maxLosses || 2); lo.className = (G.losses || 0) >= (G.maxLosses || 2) ? 'neg' : '';
    var used = dl && dl.allow ? Math.min(100, Math.round((dl.used / dl.allow) * 100)) : null;
    $('used').textContent = used === null ? 'Not set' : used + '%';
    $('usedbar').style.width = (used || 0) + '%';
    $('dlw').title = dl ? fmtM(Math.max(0, dl.allow - dl.used)).replace('+', '') + ' left today' : 'Set your daily limit on the Desk';
    var sub = $('subl');
    if (inTrade()) {
      var P = S.pos, R = P.pnl / P.risk;
      $('lbl').textContent = P.sym + ' · ' + (P.side === 'SELL' ? 'Sell ' : 'Buy ') + P.lots.toFixed(2) + ' · ' + mmss((Date.now() - P.since) / 1000);
      num.set(P.pnl); $('num').style.color = P.pnl < 0 ? 'var(--neg)' : 'var(--pos)';
      sub.innerHTML = '<span><b class="' + (R < 0 ? 'neg' : 'pos') + '">' + fmtR(R) + '</b> right now</span><span>Risk <b>' + P.riskPct + '%</b></span><span>Planned <b>1 : ' + P.rr + '</b></span><span>Stop moved <b>No</b></span>';
      var x = P.pnl < 0 ? (1 + P.pnl / P.risk) / 3 : 1 / 3 + (P.pnl / (P.risk * P.rr)) * 2 / 3; x = Math.max(0, Math.min(1, x)) * 100;
      $('dot').style.left = x + '%';
      var f = $('fill'); f.style.left = Math.min(x, 33.3) + '%'; f.style.width = Math.abs(x - 33.3) + '%'; f.classList.toggle('dn', P.pnl < 0);
      $('sl').textContent = fmtM(-P.risk); $('tp').textContent = fmtM(P.risk * P.rr); $('ep').textContent = P.entry;
    } else {
      $('lbl').textContent = S.state === 'lock' ? 'Today P&L · paused' : 'Today P&L';
      num.set(T.net); $('num').style.color = T.net < 0 ? 'var(--neg)' : '#f4f4f5';
      sub.innerHTML = T.n ? '<span><b class="' + (T.r < 0 ? 'neg' : 'pos') + '">' + fmtR(T.r) + '</b> today</span><span><b>' + T.n + '</b> trade' + (T.n === 1 ? '' : 's') + '</span><span><b>' + won + '</b> won · <b>' + (T.n - won) + '</b> lost</span>' : '<span>No trades yet today</span>';
    }
  }

  function go(st) {
    S.state = st; root.dataset.state = st;
    root.querySelectorAll('[data-lv-go]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lvGo === st)); });
    $('rev').hidden = st !== 'closed'; $('lock').hidden = st !== 'lock';
    if (D.demo) demo(st);
    num.v = num.to; paint(); num.set(num.to, false);
  }

  // ---------- sample session (?demo=1) until the EA sends a live pulse ----------
  var base = null;
  function demo(st) {
    if (!base) base = { t: JSON.parse(JSON.stringify(S.today)), g: JSON.parse(JSON.stringify(S.guard)) };
    var T = JSON.parse(JSON.stringify(base.t)), G = JSON.parse(JSON.stringify(base.g));
    T = { net: 412, r: 1.6, n: 3, list: [[260, 1.1], [-250, -1], [402, 1.5]] };
    if (!G.daily) G.daily = { allow: 5000, used: 1600, pct: 5 }; else G.daily.used = 1600;
    G.trades = T.n; G.losses = T.list.filter(function (x) { return x[0] < 0; }).length;
    if (st === 'near') { T = { net: -3880, r: -3.9, n: 3, list: [[300, .3], [420, .4], [-4600, -4.6]] }; G.daily.used = 4300; G.losses = 1; G.trades = 3; }
    if (st === 'closed') { T.list = T.list.concat([[186, .7]]); T.n++; T.net += 186; T.r = (T.r || 0) + .7; G.trades = T.n; }
    if (st === 'lock') { T = { net: -380, r: -1.5, n: 3, list: [[120, .5], [-250, -1], [-250, -1]] }; G.daily.used = 600; G.losses = 2; G.trades = 3; S.lockEnd = Date.now() + (24 * 60 + 10) * 1000; }
    S.today = T; S.guard = G;
    if (st === 'trade' || st === 'near' || st === 'closed') {
      S.pos = { sym: 'XAUUSD', side: 'BUY', lots: 0.4, risk: 250, rr: 2, riskPct: 0.25, entry: '2,641.20', pnl: 140, since: Date.now() - (14 * 60 + 22) * 1000 };
      var v = 0, sd = 11; S.hist = [];
      for (var i = 0; i < 90; i++) { sd = (sd * 16807) % 2147483647; v += ((sd / 2147483647) - .44) * 16; v = Math.max(-140, v); S.hist.push(v); }
      var k = 140 - v; S.hist = S.hist.map(function (a, j) { return a + k * j / 89; });
      if (st === 'near') { S.pos.pnl = -150; S.hist = S.hist.map(function (a, j) { return a * .3 - j * 2; }); }
      if (st === 'closed') { S.pos.pnl = 186; S.revEnd = Date.now() + 8000; $('revn').textContent = fmtM(186) + ' · +0.7R'; $('revn').style.color = 'var(--pos)'; $('revh').textContent = 'XAUUSD buy closed · 21 min'; }
      num.set(S.pos.pnl, true);
    } else { S.pos = null; num.set(T.net, true); }
    S.news = { name: 'US CPI', cur: 'USD', t: Date.now() + (st === 'near' ? 4 * 60 + 12 : 18 * 60 + 4) * 1000 };
    $('conn').querySelector('span').textContent = st === 'flat' || st === 'lock' ? 'Sample · no open trade' : 'Sample trade · live';
  }
  function tick() {
    if (!S.pos || (S.state !== 'trade' && S.state !== 'near')) return;
    var drift = S.state === 'near' ? -.53 : -.46;
    S.pos.pnl = Math.max(-S.pos.risk * .96, Math.min(S.pos.risk * S.pos.rr * .96, S.pos.pnl + (Math.random() + drift) * 14));
    S.hist.push(S.pos.pnl); if (S.hist.length > 140) S.hist.shift();
    paint();
  }

  // ---------- clocks: news countdown, cooldown, review ----------
  function clocks() {
    var N = S.news, nn = $('nn'), cd = $('cd'), box = $('news');
    if (N && N.t > Date.now()) {
      var left = (N.t - Date.now()) / 1000;
      nn.textContent = N.name.length > 18 ? 'Red news' : N.name + ' in'; cd.textContent = left > 6 * 3600 ? 'Later' : mmss(left);
      box.classList.toggle('hot', left < 5 * 60);
    } else { nn.textContent = 'Next red news'; cd.textContent = 'None'; box.classList.remove('hot'); }
    if (S.state === 'lock') $('lcd').textContent = mmss((S.lockEnd - Date.now()) / 1000);
    if (S.state === 'closed') { var r = Math.ceil((S.revEnd - Date.now()) / 1000); $('revt').textContent = r > 0 ? 'Closes by itself in ' + r + ' s · change it later in the journal' : 'Saved to the trade'; }
    if (S.state === 'lock') $('bt').textContent = (Date.now() / 4000 | 0) % 2 ? 'Breathe out' : 'Breathe in';
    if (inTrade()) paint();
  }

  function frame() {
    num.step();
    if (!document.hidden) {
      var c = $('line');
      if (inTrade() && S.state !== 'closed') line(c, S.hist, S.pos.pnl < 0 ? NEG : POS, true);
      else { var eq = [0], a = 0; S.today.list.forEach(function (x) { a += x[0]; eq.push(a); }); line(c, eq.length > 2 ? eq : [], a < 0 ? NEG : ACC, false); }
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
    if (b.hasAttribute('data-lv-full')) { var d = document; if (d.fullscreenElement) d.exitFullscreen(); else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(function () {}); }
  });
  // keep the screen awake while the live screen is open (iPad / phone on a stand)
  var lock = null;
  function wake() { if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then(function (l) { lock = l; l.addEventListener('release', function () { lock = null; }); }).catch(function () {}); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !lock) wake(); });
  wake();

  var st = D.demo ? (new URLSearchParams(location.search).get('m') || 'trade') : (S.guard.streak >= (S.guard.maxLosses || 2) ? 'lock' : 'flat');
  if (st === 'lock' && !D.demo) S.lockEnd = Date.now() + 30 * 60 * 1000;
  go(['flat', 'trade', 'near', 'closed', 'lock'].indexOf(st) > -1 ? st : 'flat');
  num.v = 0;
  clocks(); setInterval(clocks, 1000);
  if (D.demo) setInterval(tick, 700);
  requestAnimationFrame(frame);
})();
