// Study room (src/study.js): full-screen PC workbench. Chart Ink (hand-drawn marks on screenshots) sits in the middle.
// PREVIEW: sample trades, pictures and setups so the owner can try how it works. Nothing is saved yet.
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('sr-app')) return;
  const H = document.documentElement; H.classList.add('sr-full');
  addEventListener('swap:leave', () => H.classList.remove('sr-full'), { once: true });
  const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const uid = () => Math.random().toString(36).slice(2, 9), seedNew = () => (Math.random() * 1e9) | 0;
  const R = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + 'R';
  const DPR = () => Math.min(devicePixelRatio || 1, 2);
  function fitCv(cv) { const d = DPR(), w = cv.clientWidth, h = cv.clientHeight; cv.width = w * d; cv.height = h * d; const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return [x, w, h]; }
  function spark(cv, pts, col) {
    const [x, w, h] = fitCv(cv); if (!w) return; let s = 0; const c = [0, ...pts.map((v) => (s += v))], lo = Math.min(...c), hi = Math.max(...c), Y = (v) => h - 3 - (v - lo) / ((hi - lo) || 1) * (h - 6), X = (i) => i / (c.length - 1) * w;
    x.strokeStyle = col; x.lineWidth = 1.6; x.lineJoin = 'round'; x.beginPath(); c.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.stroke();
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col + '33'); g.addColorStop(1, col + '00'); x.lineTo(w, h); x.lineTo(0, h); x.fillStyle = g; x.fill();
  }

  /* ---------- sample data ---------- */
  const SETS = [
    { n: 'Absorption at value high', c: '#ff5a1f', rule: 'Sell the 3rd tap. Half off at 1R.', r: [1.6, -1, 2.1, 1.4, -1, 1.8, -1], last: '20 Nov' },
    { n: 'Buy at value low', c: '#26c6a0', rule: 'Only while the heatmap wall below holds.', r: [0.8, -1, 1.2, -1, 2, 0.9, -1, 1.1, 0.6], last: '19 Nov' },
    { n: 'Exhaustion at poor high', c: '#5cc8ff', rule: 'Wait for delta to flip first.', r: [2.2, 1.9, -1, 2.6], last: '14 Nov' },
    { n: 'Open drive with trend', c: '#f6d743', rule: 'First pullback only. No chasing.', r: [1.5, -1, -1, 0.9, -1, 1.2, -0.6], last: '12 Nov' },
    { n: 'Stacked imbalance retest', c: '#b18cff', rule: 'Needs work: 5 of 8 lost in Asia.', r: [-1, 1.4, -1, -1, 0.8, -1, -1, 1.2], last: '6 Nov' }];
  SETS.forEach((s) => { const w = s.r.filter((v) => v > 0), l = s.r.filter((v) => v <= 0), gw = w.reduce((a, b) => a + b, 0), gl = -l.reduce((a, b) => a + b, 0);
    s.won = Math.round(w.length / s.r.length * 100); s.exp = (gw - gl) / s.r.length; s.pf = gl ? gw / gl : gw; s.tot = gw - gl; });
  const INBOX = [['XAUUSD', 'sell', 'Thu 20 Nov · 09:42', -184, -1, 'No screenshot yet'], ['NAS100', 'buy', 'Wed 19 Nov · 10:05', 612, 2.4, '2 pictures, no setup'],
    ['XAUUSD', 'buy', 'Wed 19 Nov · 15:22', 203, 1.1, 'No notes yet'], ['EURUSD', 'sell', 'Tue 18 Nov · 08:31', -96, -0.6, 'No screenshot yet']];
  const PAST = [['14 Nov', 2.1, 'Sold the 3rd tap, half off at 1R, rest ran to the POC.'], ['12 Nov', 1.4, 'Two taps only, but big sellers on the footprint.'], ['6 Nov', -1, '1st tap. Too early, no absorption yet.'], ['3 Nov', 1.8, 'Heatmap wall above held all morning.'], ['29 Oct', 1.6, 'Clean 3 taps in the New York open.'], ['27 Oct', -1, 'Against my bias on a trend day.']];

  /* ---------- quotes ---------- */
  const Q = [['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'], ['We suffer more often in imagination than in reality.', 'Seneca'],
    ['No man is free who is not master of himself.', 'Epictetus'], ['We are what we repeatedly do.', 'Will Durant'], ['Lost the battle, not the war.', '5ABI.FX']];
  let qi = 0; const qe = $('sr-q');
  const showQ = () => { qe.classList.add('out'); setTimeout(() => { qe.innerHTML = '“' + Q[qi][0] + '”<small>' + Q[qi][1] + '</small>'; qe.classList.remove('out'); qi = (qi + 1) % Q.length; }, qe.innerHTML ? 700 : 0); };
  showQ(); setInterval(showQ, 11000);

  /* ---------- sample pictures (drawn, so the preview needs no images) ---------- */
  function mt5(W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), r = rng(7);
    g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, W, H);
    const ax = W - 110, lo = 3994, hi = 4026, Y = (v) => 60 + (hi - v) / (hi - lo) * (H - 120);
    g.strokeStyle = '#15151b'; g.lineWidth = 1; g.font = '17px Manrope, sans-serif'; g.fillStyle = '#6b6b75';
    for (let p = 3996; p <= 4024; p += 4) { g.beginPath(); g.moveTo(0, Y(p)); g.lineTo(ax, Y(p)); g.stroke(); g.fillText(p.toFixed(1), ax + 14, Y(p) + 6); }
    g.fillStyle = '#c9c9d0'; g.font = '600 20px Manrope, sans-serif'; g.fillText('XAUUSD · M1 · MT5', 24, 36);
    g.fillStyle = '#6b6b75'; g.font = '15px Manrope, sans-serif'; g.fillText('Sample chart, not real data', 230, 36);
    const N = 90, C = []; let p = 4003;
    for (let i = 0; i < N; i++) { const t = i < 26 ? 4003 + i * 0.36 : i < 34 ? 4012.6 : i < 40 ? 4011 : i < 46 ? 4012.8 : i < 62 ? 4012 - (i - 46) * 0.55 : 4003.5 + (i - 62) * 0.62;
      const o = p, cl = o + (t - o) * 0.6 + (r() - 0.5) * 1.4; C.push([o, Math.max(o, cl) + r() * 1.1, Math.min(o, cl) - r() * 1.1, cl]); p = cl; }
    const cw = (ax - 30) / N, X = (i) => 15 + i * cw + cw / 2;
    const zone = (a, b, col) => { g.fillStyle = col; g.fillRect(X(44), Math.min(Y(a), Y(b)), X(80) - X(44), Math.abs(Y(a) - Y(b))); };
    zone(4012.4, 4000, 'rgba(38,198,160,.12)'); zone(4012.4, 4018.6, 'rgba(240,70,75,.14)');
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(0, Y(4013.2)); g.lineTo(ax, Y(4013.2)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#8a8a94'; g.font = '15px Manrope, sans-serif'; g.fillText('VAH 4013.2', 24, Y(4013.2) - 8);
    C.forEach((k, i) => { const up = k[3] >= k[0]; g.strokeStyle = up ? '#e8e8ec' : '#7a7a84'; g.fillStyle = up ? '#e8e8ec' : '#25252b'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(X(i), Y(k[1])); g.lineTo(X(i), Y(k[2])); g.stroke(); const y1 = Y(Math.max(k[0], k[3])); g.fillRect(X(i) - cw * 0.32, y1, cw * 0.64, Math.max(2, Y(Math.min(k[0], k[3])) - y1));
      if (!up) { g.strokeStyle = '#7a7a84'; g.strokeRect(X(i) - cw * 0.32, y1, cw * 0.64, Math.max(2, Y(Math.min(k[0], k[3])) - y1)); } });
    [[4000, 'TP 4000.0', '#26c6a0', '#03130e'], [4018.6, 'SL 4018.6', '#f0464b', '#fff'], [4012.4, 'Sell 4012.4', '#fff', '#000']].forEach(([v, t, bg, fg]) => { g.fillStyle = bg; g.fillRect(ax + 2, Y(v) - 13, 106, 26); g.fillStyle = fg; g.font = '600 14px Manrope, sans-serif'; g.fillText(t, ax + 8, Y(v) + 5); });
    g.fillStyle = '#6b6b75'; g.font = '15px Manrope, sans-serif'; ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15'].forEach((t, i) => g.fillText(t, 20 + i * (ax - 60) / 5, H - 22));
    return { c, tap: [[X(28), Y(4013.6)], [X(37), Y(4013.4)], [X(44), Y(4013.9)]], entry: [X(46), Y(4012.4)], stop: [X(64), Y(4004)], Y, ax };
  }
  function shot(kind, seed, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), r = rng(seed); x.fillStyle = '#09090c'; x.fillRect(0, 0, W, H);
    if (kind === 'heat') {
      for (let i = 0; i < 120; i++) { const y = r() * H, h = 3 + r() * H * 0.012, a = r(); x.fillStyle = a > 0.88 ? `rgba(255,${130 + r() * 90 | 0},40,${0.55 + r() * 0.4})` : `rgba(${30 + r() * 50 | 0},${60 + r() * 90 | 0},${130 + r() * 110 | 0},${0.2 + r() * 0.35})`; x.fillRect(0, y, W, h); }
      x.fillStyle = 'rgba(255,170,60,.85)'; x.fillRect(W * 0.35, H * 0.28, W * 0.62, H * 0.022);
      x.strokeStyle = '#fff'; x.lineWidth = Math.max(1.5, W / 600); x.beginPath(); let p = H * 0.55; for (let i = 0; i <= W; i += W / 260) { p += (r() - 0.5) * H * 0.018; p = Math.max(H * 0.31, Math.min(H * 0.8, p)); i ? x.lineTo(i, p) : x.moveTo(i, p); } x.stroke();
      for (let i = 0; i < 16; i++) { x.fillStyle = r() > 0.4 ? 'rgba(240,70,75,.6)' : 'rgba(38,198,160,.6)'; x.beginPath(); x.arc(W * 0.3 + r() * W * 0.65, H * 0.3 + r() * H * 0.12, (3 + r() * 16) * W / 900, 0, 7); x.fill(); }
    } else if (kind === 'fp') {
      const cols = 7, rows = 16, cw = W / cols, rh = H / rows;
      for (let cI = 0; cI < cols; cI++) { const mid = (rows * (0.32 + r() * 0.2)) | 0;
        for (let k = 0; k < rows; k++) { if (Math.abs(k - mid) > 4 + r() * 2) continue; const v = r(), bid = r() > 0.45; x.fillStyle = bid ? `rgba(240,70,75,${0.12 + v * 0.45})` : `rgba(38,198,160,${0.12 + v * 0.45})`; x.fillRect(cI * cw + 6, k * rh + 1, cw - 12, rh - 2);
          if (W > 300) { x.fillStyle = 'rgba(255,255,255,.8)'; x.font = `${Math.max(9, rh * 0.5)}px Manrope, sans-serif`; x.fillText((v * 900 | 0) + ' x ' + (r() * 900 | 0), cI * cw + 12, k * rh + rh * 0.7); } }
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1; x.strokeRect(cI * cw + 4, (mid - 4) * rh, cw - 8, rh * 9); }
      if (W > 300) { x.fillStyle = '#c9c9d0'; x.font = `600 ${H * 0.028}px Manrope, sans-serif`; x.fillText('Footprint · GC · 1 min · sample', 14, H - 14); }
    } else {
      let p = H * 0.55; const n = 40; for (let i = 0; i < n; i++) { const o = p, cl = o + (r() - 0.5) * H * 0.07, xx = 8 + i * (W - 16) / n, bw = (W - 16) / n * 0.55;
        x.strokeStyle = cl < o ? '#ddd' : '#777'; x.fillStyle = cl < o ? '#ddd' : '#2a2a30'; x.lineWidth = Math.max(1, W / 900); x.beginPath(); x.moveTo(xx + bw / 2, Math.min(o, cl) - r() * H * 0.02); x.lineTo(xx + bw / 2, Math.max(o, cl) + r() * H * 0.02); x.stroke(); x.fillRect(xx, Math.min(o, cl), bw, Math.max(1, Math.abs(cl - o))); p = cl; }
      for (let k = 0; k < 24; k++) { x.fillStyle = k === 9 ? 'rgba(255,90,31,.45)' : 'rgba(255,255,255,.14)'; x.fillRect(W - 4 - r() * W * 0.24, k * H / 24 + 1, W, H / 24 - 2); }
      if (W > 300) { x.fillStyle = '#c9c9d0'; x.font = `600 ${H * 0.028}px Manrope, sans-serif`; x.fillText('Volume profile · GC · 5 min · sample', 14, H - 14); }
    }
    return c;
  }

  /* ---------- Chart Ink engine (hand-drawn marks) ---------- */
  const cv = $('ci-cv'), ctx = cv.getContext('2d'), stage = $('ci-stage'), typer = $('ci-type');
  const COLORS = [['#ffffff', 'White'], ['#ff5a1f', 'Orange'], ['#26c6a0', 'Teal'], ['#f0464b', 'Red'], ['#f6d743', 'Yellow'], ['#5cc8ff', 'Blue']];
  const FONTS = [['Architects Daughter', 'Print caps'], ['Caveat', 'Marker'], ['Kalam', 'Felt tip'], ['Patrick Hand', 'Neat'], ['Permanent Marker', 'Bold']];
  const LABELS = ['Absorption', 'Value high', 'Entry', 'Stop', 'Target', '1R', 'Big sellers', 'Heatmap wall', '3rd tap', 'Half off here'];
  const S = { tool: 'select', color: '#ffffff', size: 4, font: 'Architects Daughter', fs: 40, sel: null, drag: null };
  let B = null; // current board {bg, objs, hist}

  function wobble(poly, seed, amp, step = 6) { const r = rng(seed), out = []; let o = 0;
    for (let i = 1; i < poly.length; i++) { const [ax, ay] = poly[i - 1], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, n = Math.max(1, Math.ceil(L / step));
      for (let k = (i === 1 ? 0 : 1); k <= n; k++) { const t = k / n; o = o * 0.86 + (r() - 0.5) * amp; out.push([ax + dx * t + nx * o, ay + dy * t + ny * o]); } } return out; }
  function ink(c, pts, size, color, seed, dashed) { c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    if (dashed) { c.lineWidth = size; c.setLineDash([size * 3.2, size * 2.6]); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]); return; }
    const r = rng(seed + 101); let w = 1; for (let i = 1; i < pts.length; i++) { w += (r() - 0.5) * 0.14; w = Math.min(1.18, Math.max(0.78, w)); c.lineWidth = size * w; c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); } }
  function handLine(c, x1, y1, x2, y2, size, color, seed, dashed) { const r = rng(seed), L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, a = r() * size * 0.8, b = r() * size * 1.6;
    ink(c, wobble([[x1 - ux * a, y1 - uy * a], [x2 + ux * b, y2 + uy * b]], seed + 3, Math.min(1.4 + size * 0.18, 3.2)), size, color, seed, dashed); }
  function handEllipse(c, o) { const r = rng(o.seed), cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = Math.abs(o.w / 2), ry = Math.abs(o.h / 2), st = r() * Math.PI * 2, sw = Math.PI * 2 * (1.07 + r() * 0.1), tl = (r() - 0.5) * 0.14, pts = [];
    for (let i = 0; i <= 72; i++) { const t = i / 72, a = st + sw * t, k = 0.96 + 0.08 * t, ex = Math.cos(a) * rx * k, ey = Math.sin(a) * ry * k; pts.push([cx + ex * Math.cos(tl) - ey * Math.sin(tl), cy + ex * Math.sin(tl) + ey * Math.cos(tl)]); }
    ink(c, wobble(pts, o.seed + 5, Math.min(0.9 + o.size * 0.1, 2), 5), o.size, o.color, o.seed); }
  function handRect(c, x, y, w, h, size, color, seed) { const r = rng(seed), j = () => (r() - 0.5) * size * 1.4;
    handLine(c, x + j(), y + j(), x + w + j(), y + j(), size, color, seed + 11); handLine(c, x + w + j(), y + j(), x + w + j(), y + h + j(), size, color, seed + 22);
    handLine(c, x + w + j(), y + h + j(), x + j(), y + h + j(), size, color, seed + 33); handLine(c, x + j(), y + h + j(), x + j(), y + j(), size, color, seed + 44); }
  function handArrow(c, o) { const r = rng(o.seed), { x1, y1, x2, y2 } = o, L = Math.hypot(x2 - x1, y2 - y1) || 1, bend = (r() - 0.5) * 0.22 * L, mx = (x1 + x2) / 2 + (-(y2 - y1) / L) * bend, my = (y1 + y2) / 2 + ((x2 - x1) / L) * bend, pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push([u * u * x1 + 2 * u * t * mx + t * t * x2, u * u * y1 + 2 * u * t * my + t * t * y2]); }
    ink(c, wobble(pts, o.seed + 3, Math.min(1 + o.size * 0.15, 2.6)), o.size, o.color, o.seed);
    const ang = Math.atan2(y2 - my, x2 - mx), hl = Math.max(16, o.size * 5.5) * (0.9 + r() * 0.25);
    for (const s of [-1, 1]) { const a = ang + Math.PI + s * (0.5 + (r() - 0.5) * 0.15); handLine(c, x2, y2, x2 + Math.cos(a) * hl, y2 + Math.sin(a) * hl, o.size, o.color, o.seed + (s > 0 ? 71 : 83)); } }
  const fontStr = (o) => `${o.fs}px "${o.font}", "Comic Sans MS", cursive`;
  function textBox(o) { ctx.save(); ctx.font = fontStr(o); const lines = String(o.text || ' ').split('\n'), lh = o.fs * 1.12, w = Math.max(...lines.map((l) => ctx.measureText(l || ' ').width)); ctx.restore(); return { lines, lh, w, h: lines.length * lh }; }
  function drawText(c, o) { const m = textBox(o); c.save(); c.translate(o.x, o.y); c.rotate(o.rot || 0); c.font = fontStr(o); c.fillStyle = o.color; c.textBaseline = 'top';
    m.lines.forEach((l, i) => c.fillText(l, 0, i * m.lh + o.fs * 0.04)); const sw = Math.max(2, o.fs / 18);
    if (o.box) { const p = o.fs * 0.22; handRect(c, -p, -p * 0.7, m.w + p * 2, m.h + p * 1.2, sw, o.color, o.seed + 13); if (o.box === 2) handRect(c, -p * 1.55, -p * 1.2, m.w + p * 3.1, m.h + p * 2.2, sw, o.color, o.seed + 29); }
    if (o.ul) handLine(c, -o.fs * 0.05, m.h + o.fs * 0.06, m.w + o.fs * 0.08, m.h + o.fs * 0.02, sw, o.color, o.seed + 9); c.restore(); }
  function bbox(o) {
    if (o.type === 'text') { const m = textBox(o), p = o.box ? o.fs * 0.36 : o.fs * 0.06; return { x: o.x - p, y: o.y - p, w: m.w + p * 2, h: m.h + p * 2 }; }
    if (o.type === 'ellipse' || o.type === 'rect') return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
    if (o.type === 'arrow' || o.type === 'line') return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    const xs = o.pts.map((p) => p[0]), ys = o.pts.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  const segD = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
  function hit(o, x, y, tol) { if (o.type === 'arrow' || o.type === 'line') return segD(x, y, o.x1, o.y1, o.x2, o.y2) < tol + o.size;
    if (o.type === 'pen') { for (let i = 1; i < o.pts.length; i++) if (segD(x, y, ...o.pts[i - 1], ...o.pts[i]) < tol + o.size) return true; return false; }
    const b = bbox(o); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol; }
  function handles(o) { if (!o || o.type === 'pen') return []; if (o.type === 'arrow' || o.type === 'line') return [['p1', o.x1, o.y1], ['p2', o.x2, o.y2]]; const b = bbox(o); return [['se', b.x + b.w, b.y + b.h]]; }
  const uiScale = () => cv.width / (cv.getBoundingClientRect().width || cv.width);
  function drawObj(c, o) { switch (o.type) {
    case 'text': drawText(c, o); break; case 'arrow': handArrow(c, o); break; case 'line': handLine(c, o.x1, o.y1, o.x2, o.y2, o.size, o.color, o.seed, o.dashed); break;
    case 'ellipse': handEllipse(c, o); break; case 'rect': handRect(c, Math.min(o.x, o.x + o.w), Math.min(o.y, o.y + o.h), Math.abs(o.w), Math.abs(o.h), o.size, o.color, o.seed); break;
    case 'pen': ink(c, o.pts, o.size, o.color, o.seed); break; } }
  function paint(c, b, W, Hh, sel) { c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh); if (!b) return; if (b.bg) c.drawImage(b.bg, 0, 0, W, Hh);
    const k = W / 1600; c.save(); c.scale(k, k); for (const o of b.objs) drawObj(c, o);
    const o = sel && b.objs.find((q) => q.id === sel);
    if (o) { const u = uiScale(), bb = bbox(o), p = 6 * u; c.strokeStyle = 'rgba(255,90,31,.95)'; c.lineWidth = 1.5 * u; c.setLineDash([6 * u, 5 * u]); c.strokeRect(bb.x - p, bb.y - p, bb.w + p * 2, bb.h + p * 2); c.setLineDash([]);
      for (const [, hx, hy] of handles(o)) { c.fillStyle = '#ff5a1f'; c.strokeStyle = '#000'; c.beginPath(); c.arc(hx, hy, 7 * u, 0, 7); c.fill(); c.stroke(); } }
    c.restore(); }
  let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(ctx, B, cv.width, cv.height, S.sel); if (typer.hidden === false) placeTyper(); }); };
  function sizeCanvas() { const r = stage.getBoundingClientRect(), mw = r.width - 24, mh = r.height - 24; if (mw <= 0) return; const w = Math.min(mw, mh * 16 / 9); cv.style.width = w + 'px'; cv.style.height = w * 9 / 16 + 'px'; redraw(); }
  // board space is always 1600 x 900; the canvas pixel size is fixed at that too
  const snap = () => { B.hist.push(JSON.stringify(B.objs)); if (B.hist.length > 80) B.hist.shift(); };
  function undo() { if (!B.hist.length) return; B.objs = JSON.parse(B.hist.pop()); if (!B.objs.find((o) => o.id === S.sel)) S.sel = null; endType(); redraw(); thumbs(); }
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 1600 / r.width, (e.clientY - r.top) * 900 / r.height]; };
  const selObj = () => B.objs.find((o) => o.id === S.sel);
  const pick = (x, y) => { const t = 8 * uiScale(); for (let i = B.objs.length - 1; i >= 0; i--) if (hit(B.objs[i], x, y, t)) return B.objs[i]; return null; };

  // inline handwriting: a see-through text box sits over the note while you type
  let typing = null;
  function placeTyper() { const o = typing && B.objs.find((q) => q.id === typing); if (!o) return endType(); const r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = r.width / 1600, m = textBox(o);
    Object.assign(typer.style, { left: (r.left - sr.left + o.x * k - 4) + 'px', top: (r.top - sr.top + o.y * k - 2) + 'px', width: (m.w * k + 40) + 'px', height: (m.h * k + 8) + 'px', font: `${o.fs * k}px "${o.font}", cursive` }); }
  function startType(o) { typing = o.id; typer.hidden = false; typer.value = o.text; placeTyper(); setTimeout(() => { typer.focus(); typer.select(); }, 30); }
  function endType() { if (!typing) return; const o = B.objs.find((q) => q.id === typing); if (o && !o.text.trim()) B.objs = B.objs.filter((q) => q !== o); typing = null; typer.hidden = true; redraw(); thumbs(); }
  let tSnap = false;
  typer.addEventListener('input', () => { const o = B.objs.find((q) => q.id === typing); if (!o) return; if (!tSnap) { snap(); tSnap = true; } o.text = typer.value; redraw(); });
  typer.addEventListener('blur', () => { tSnap = false; endType(); });
  typer.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); typer.blur(); } });

  cv.addEventListener('pointerdown', (e) => {
    if (!B) return; cv.setPointerCapture(e.pointerId); const [x, y] = pt(e), base = { color: S.color, size: S.size, seed: seedNew(), id: uid() };
    if (S.tool === 'select') { const o = selObj(), k = uiScale();
      for (const [h, hx, hy] of handles(o)) if (Math.hypot(x - hx, y - hy) < 14 * k) { snap(); S.drag = { mode: h, x, y, orig: JSON.parse(JSON.stringify(o)), bw: bbox(o).w }; return; }
      const t = pick(x, y); if (t) { snap(); S.sel = t.id; S.drag = { mode: 'move', x, y, orig: JSON.parse(JSON.stringify(t)), moved: false }; syncBar(); } else S.sel = null; redraw(); return; }
    snap(); let o;
    if (S.tool === 'text') { o = { ...base, type: 'text', x, y: y - S.fs * 0.5, text: '', fs: S.fs, font: S.font, box: 0, ul: false, rot: 0 }; B.objs.push(o); S.sel = o.id; redraw(); startType(o); return; }
    if (S.tool === 'arrow' || S.tool === 'line') o = { ...base, type: S.tool, x1: x, y1: y, x2: x, y2: y, dashed: S.tool === 'line' };
    else if (S.tool === 'ellipse' || S.tool === 'rect') o = { ...base, type: S.tool, x, y, w: 0, h: 0 };
    else o = { ...base, type: 'pen', pts: [[x, y]] };
    B.objs.push(o); S.sel = o.id; S.drag = { mode: 'create', x, y }; redraw(); });
  cv.addEventListener('pointermove', (e) => { const d = S.drag; if (!d) return; const [x, y] = pt(e), dx = x - d.x, dy = y - d.y, o = selObj(); if (!o) return;
    if (d.mode === 'create') { if (o.type === 'arrow' || o.type === 'line') { o.x2 = x; o.y2 = e.shiftKey && o.type === 'line' ? o.y1 : y; }
      else if (o.type === 'pen') { const l = o.pts[o.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 2) o.pts.push([x, y]); }
      else { o.w = dx; o.h = dy; if (e.shiftKey) { const m = Math.max(Math.abs(dx), Math.abs(dy)); o.w = Math.sign(dx || 1) * m; o.h = Math.sign(dy || 1) * m; } } }
    else if (d.mode === 'move') { const g = d.orig; d.moved = true; if ('x1' in o) { o.x1 = g.x1 + dx; o.y1 = g.y1 + dy; o.x2 = g.x2 + dx; o.y2 = g.y2 + dy; } else if (o.type === 'pen') o.pts = g.pts.map((p) => [p[0] + dx, p[1] + dy]); else { o.x = g.x + dx; o.y = g.y + dy; } }
    else if (d.mode === 'p1') { o.x1 = x; o.y1 = y; } else if (d.mode === 'p2') { o.x2 = x; o.y2 = y; }
    else if (d.mode === 'se') { const g = d.orig; if (o.type === 'text') o.fs = Math.max(12, g.fs * (1 + dx / Math.max(20, d.bw))); else { o.w = Math.max(8, Math.abs(g.w) + dx) * Math.sign(g.w || 1); o.h = Math.max(8, Math.abs(g.h) + dy) * Math.sign(g.h || 1); } }
    redraw(); });
  const endDrag = () => { const d = S.drag; S.drag = null; if (!d) return; const o = selObj(); if (d.mode === 'move' && !d.moved) B.hist.pop();
    if (d.mode === 'create' && o) { const b = bbox(o); if (b.w < 4 && b.h < 4 && o.type !== 'pen') { B.objs = B.objs.filter((q) => q !== o); S.sel = null; B.hist.pop(); }
      else if (o.type === 'pen' && o.pts.length > 2) { const p = o.pts; o.pts = p.map((q, i) => (i === 0 || i === p.length - 1 ? q : [(p[i - 1][0] + q[0] * 2 + p[i + 1][0]) / 4, (p[i - 1][1] + q[1] * 2 + p[i + 1][1]) / 4])); } }
    redraw(); thumbs(); };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('dblclick', (e) => { const t = pick(...pt(e)); if (t && t.type === 'text') { S.sel = t.id; redraw(); startType(t); } });

  function setTool(t) { S.tool = t; document.querySelectorAll('.ci-tool[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t)); cv.style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair'; }
  document.querySelectorAll('.ci-tool[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('ci-undo').onclick = undo;
  const sws = $('ci-sws'); sws.innerHTML = COLORS.map(([c, n]) => `<button type="button" class="ci-sw" style="background:${c}" data-c="${c}" title="${n}" aria-label="${n} ink"></button>`).join('');
  sws.querySelectorAll('.ci-sw').forEach((b) => (b.onclick = () => setProp('color', b.dataset.c)));
  const bar = $('ci-bar');
  bar.innerHTML = `<div class="ci-chips">${LABELS.map((l) => `<button type="button" class="ci-chip">${l}</button>`).join('')}</div>
    <select id="ci-font" aria-label="Handwriting">${FONTS.map(([f, d]) => `<option value="${f}" style="font-family:'${f}'">${d}</option>`).join('')}</select>
    <div class="ci-seg" id="ci-size" aria-label="Pen size">${[['S', 3, 30], ['M', 4, 40], ['L', 6, 58]].map(([l, s, f]) => `<button type="button" data-s="${s}" data-f="${f}">${l}</button>`).join('')}</div>
    <span id="ci-swslot"></span><button type="button" class="ci-act" id="ci-copy" title="Copy the marked-up picture">Copy</button><button type="button" class="ci-act" id="ci-png" title="Save as PNG">Save PNG</button>`;
  bar.querySelectorAll('.ci-chip').forEach((b) => (b.onclick = () => { snap(); const o = { id: uid(), type: 'text', text: b.textContent, fs: S.fs, font: S.font, color: S.color, box: 0, ul: false, seed: seedNew(), rot: 0, x: 0, y: 0 };
    const m = textBox(o); o.x = 800 - m.w / 2 + (Math.random() - 0.5) * 200; o.y = 430 + (Math.random() - 0.5) * 200; B.objs.push(o); S.sel = o.id; setTool('select'); redraw(); thumbs(); }));
  $('ci-swslot').replaceWith(sws);
  $('ci-font').onchange = (e) => setProp('font', e.target.value);
  bar.querySelectorAll('#ci-size button').forEach((b) => (b.onclick = () => { setProp('size', +b.dataset.s); setProp('fs', +b.dataset.f); }));
  function setProp(k, v) { S[k] = v; const o = selObj();
    if (o && ((k === 'color') || (k === 'size' && o.type !== 'text') || ((k === 'font' || k === 'fs') && o.type === 'text'))) { snap(); o[k] = v; }
    syncBar(); redraw(); thumbs(); }
  function syncBar() { const o = selObj(); if (o) { S.color = o.color; if (o.type === 'text') { S.font = o.font; } }
    sws.querySelectorAll('.ci-sw').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === S.color)); $('ci-font').value = S.font;
    bar.querySelectorAll('#ci-size button').forEach((b) => b.classList.toggle('on', +b.dataset.s === S.size)); }
  const exportCv = () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; paint(c.getContext('2d'), B, 1600, 900, null); return c; };
  $('ci-png').onclick = () => exportCv().toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'study-' + tabs[cur].name.replace(/\W+/g, '-').toLowerCase() + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
  $('ci-copy').onclick = () => exportCv().toBlob(async (b) => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Copied. Paste it in Discord or send it to your mentor.'); } catch (e) { toast('Copy is blocked here. Use Save PNG.'); } });
  let toastT; function toast(m) { let t = stage.querySelector('.ci-toast'); if (!t) { t = document.createElement('div'); t.className = 'ci-toast'; t.setAttribute('role', 'status'); stage.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3000); }

  document.addEventListener('keydown', (e) => {
    if (!$('v-study').classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); snap(); B.objs = B.objs.filter((o) => o.id !== S.sel); S.sel = null; redraw(); thumbs(); return; }
    if (e.key === 'Escape') { S.sel = null; redraw(); return; }
    const m = { v: 'select', t: 'text', a: 'arrow', o: 'ellipse', r: 'rect', l: 'line', p: 'pen' }[e.key.toLowerCase()]; if (m && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(m); });

  /* ---------- picture tabs (one board per picture) ---------- */
  const T = (x, y, text, fs, extra) => ({ id: uid(), type: 'text', x, y, text, fs, font: 'Architects Daughter', color: '#ffffff', box: 0, ul: false, seed: seedNew(), rot: 0, ...extra });
  const m5 = mt5(1600, 900);
  const tabs = [
    { name: 'MT5 chart', sub: 'from the Journal EA', bg: m5.c, objs: [
      ...m5.tap.map(([x, y], i) => ({ id: uid(), type: 'ellipse', x: x - 26, y: y - 26, w: 52, h: 46, color: i === 2 ? '#ff5a1f' : '#ffffff', size: 4, seed: seedNew() })),
      T(m5.tap[0][0] - 70, m5.tap[0][1] - 110, '3 taps,\nno break', 40),
      { id: uid(), type: 'arrow', x1: m5.entry[0] + 150, y1: m5.entry[1] - 150, x2: m5.entry[0] + 22, y2: m5.entry[1] - 14, color: '#ff5a1f', size: 4, seed: seedNew() },
      T(m5.entry[0] + 160, m5.entry[1] - 200, 'Sold the 3rd tap', 40, { color: '#ff5a1f' }),
      { id: uid(), type: 'line', x1: m5.entry[0], y1: m5.Y(4006.2), x2: m5.ax - 20, y2: m5.Y(4006.2), color: '#26c6a0', size: 3, seed: seedNew(), dashed: true },
      T(m5.ax - 330, m5.Y(4006.2) + 14, '1R: take half here', 36, { color: '#26c6a0' }),
      T(70, 640, 'LESSON', 84, { rot: -0.02 }), T(74, 740, 'Took nothing at 1R.\nIt came back for my stop.', 36),
      T(1120, 760, '−1.0R', 64, { box: 2, color: '#f0464b', rot: 0.015 })] },
    { name: 'DeepCharts', sub: 'footprint', bg: shot('fp', 11, 1600, 900), objs: [
      { id: uid(), type: 'rect', x: 680, y: 190, w: 250, h: 300, color: '#ff5a1f', size: 4, seed: seedNew() },
      T(960, 200, 'Big sellers\nsat here', 44, { color: '#ff5a1f' }), { id: uid(), type: 'arrow', x1: 950, y1: 330, x2: 940, y2: 330, color: '#ff5a1f', size: 4, seed: seedNew() },
      T(120, 70, 'ABSORPTION', 70, { ul: true })] },
    { name: 'Heatmap', sub: 'liquidity', bg: shot('heat', 5, 1600, 900), objs: [
      { id: uid(), type: 'ellipse', x: 520, y: 210, w: 900, h: 100, color: '#ffffff', size: 4, seed: seedNew() }, T(560, 120, 'Wall above held all morning', 42)] },
    { name: 'NinjaTrader', sub: 'volume profile', bg: shot('mp', 21, 1600, 900), objs: [] }];
  tabs.forEach((t) => (t.hist = []));
  let cur = 0;
  function renderTabs() {
    $('sr-tabs').innerHTML = tabs.map((t, i) => `<button type="button" class="sr-tab${i === cur ? ' on' : ''}" data-i="${i}"><canvas width="108" height="64"></canvas><span><b>${t.name}</b><small>${t.sub}</small></span>${t.objs.length ? `<em>${t.objs.length}</em>` : ''}</button>`).join('')
      + '<button type="button" class="sr-tab add" id="sr-addpic" title="Paste (Ctrl+V), drop or choose a screenshot"><span>+</span><span><b>Add a screenshot</b><small>paste, drop or choose</small></span></button><input type="file" id="sr-file" accept="image/*" hidden>';
    $('sr-tabs').querySelectorAll('.sr-tab[data-i]').forEach((b) => (b.onclick = () => openTab(+b.dataset.i)));
    $('sr-addpic').onclick = () => $('sr-file').click(); $('sr-file').onchange = (e) => { addPic(e.target.files[0]); e.target.value = ''; };
    thumbs(); }
  function thumbs() { document.querySelectorAll('#sr-tabs .sr-tab[data-i]').forEach((b) => { const t = tabs[b.dataset.i], c = b.querySelector('canvas'); paint(c.getContext('2d'), t, 108, 64, null);
    let em = b.querySelector('em'); if (t.objs.length) { if (!em) { em = document.createElement('em'); b.appendChild(em); } em.textContent = t.objs.length; } else if (em) em.remove(); }); }
  function openTab(i) { endType(); cur = i; B = tabs[i]; S.sel = null; document.querySelectorAll('#sr-tabs .sr-tab[data-i]').forEach((b) => b.classList.toggle('on', +b.dataset.i === i)); $('ci-hint').hidden = !!B.bg; redraw(); }
  function addPic(f) { if (!f || !/^image\//.test(f.type)) return toast('That is not a picture. Use a PNG or JPG screenshot.');
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1600, 900);
      const s = Math.min(1600 / im.width, 900 / im.height), w = im.width * s, h = im.height * s; g.drawImage(im, (1600 - w) / 2, (900 - h) / 2, w, h);
      tabs.push({ name: 'Screenshot ' + (tabs.length - 3), sub: 'added just now', bg: c, objs: [], hist: [] }); renderTabs(); openTab(tabs.length - 1); toast('Added. Mark it up, it saves with this trade.'); };
    im.onerror = () => toast('Could not read that picture.'); im.src = URL.createObjectURL(f); }
  ['dragenter', 'dragover'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.add('drop'); }));
  ['dragleave', 'drop'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.remove('drop'); }));
  stage.addEventListener('drop', (e) => addPic(e.dataTransfer.files[0]));
  document.addEventListener('paste', (e) => { if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/')); if (it) { e.preventDefault(); go('study'); addPic(it.getAsFile()); } });

  /* ---------- left: inbox and setups ---------- */
  $('sr-inbox').innerHTML = INBOX.map((t, k) => `<div class="sr-it${k ? '' : ' on'}"><div><b><span class="sr-dot"></span>${t[0]} ${t[1]}</b></div><div class="v ${t[3] < 0 ? 'neg' : 'pos'}">${t[3] < 0 ? '−' : '+'}$${Math.abs(t[3])}<small>${R(t[4])}</small></div><small>${t[2].slice(4)} · <span class="hint">${t[5]}</span></small></div>`).join('');
  document.querySelectorAll('#sr-inbox .sr-it').forEach((r) => (r.onclick = () => document.querySelectorAll('#sr-inbox .sr-it').forEach((x) => x.classList.toggle('on', x === r))));
  let setI = 0;
  $('sr-sets').innerHTML = SETS.map((s, i) => `<div class="sr-set${i ? '' : ' on'}" data-i="${i}"><i style="background:${s.c}"></i><b>${s.n}</b><canvas></canvas><small>${s.r.length} trades · <span class="${s.exp < 0 ? 'neg' : 'pos'}">${R(s.exp)}</span> each</small></div>`).join('');
  const setsSpark = () => document.querySelectorAll('#sr-sets .sr-set').forEach((d) => { const s = SETS[d.dataset.i]; spark(d.querySelector('canvas'), s.r, s.c); });
  document.querySelectorAll('#sr-sets .sr-set').forEach((d) => (d.onclick = () => pickSet(+d.dataset.i)));
  function pickSet(i) { setI = i; document.querySelectorAll('#sr-sets .sr-set').forEach((d) => d.classList.toggle('on', +d.dataset.i === i)); head(); }
  function head() { const s = SETS[setI]; $('sr-setname').textContent = s.n; $('sr-done').textContent = 'Save to “' + s.n + '”';
    $('sr-nums').innerHTML = `<div><span class="sr-k">Seen</span><b>${s.r.length}×</b></div><div><span class="sr-k">Won</span><b>${s.won}%</b></div><div><span class="sr-k">Per trade</span><b class="${s.exp < 0 ? 'neg' : 'pos'}">${R(s.exp)}</b></div><div><span class="sr-k">Profit factor</span><b>${s.pf.toFixed(2)}</b></div><div><span class="sr-k">Last</span><b>${s.last}</b></div><canvas id="sr-hs"></canvas>`;
    spark($('sr-hs'), s.r, s.c); }

  /* ---------- right: environment ---------- */
  const ENV = [['Where', ['Value high', 'Value low', 'POC', 'Poor high', 'Poor low', 'Outside value'], 'Value high'], ['What happened', ['Absorption', 'Exhaustion', 'Big trades', 'Stacked imbalance', 'Delta flip', 'Heatmap wall held'], 'Absorption'],
    ['Day', ['Balance', 'Trend', 'Open drive', 'News'], 'Balance'], ['Session', ['Asia', 'London', 'NY open', 'NY PM'], 'NY open']];
  const env = ENV.map((g) => new Set([g[2]])); env[1].add('Heatmap wall held');
  $('sr-env').innerHTML = ENV.map((g, i) => `<div class="sr-eg"><span>${g[0]}</span><div class="sr-ec">${g[1].map((c) => `<button type="button" data-g="${i}" class="${env[i].has(c) ? 'on' : ''}">${c}</button>`).join('')}<button type="button" title="Add your own word">+</button></div></div>`).join('');
  $('sr-env').querySelectorAll('button[data-g]').forEach((b) => (b.onclick = () => { const s = env[b.dataset.g]; s.has(b.textContent) ? s.delete(b.textContent) : s.add(b.textContent); b.classList.toggle('on'); match(); }));
  function match() { const w = env[1].has('Absorption'), a = env[0].has('Value high'), s = SETS[0];
    $('sr-match').innerHTML = w && a ? `<span class="nm">Absorption at value high</span>You saved this before <b>${s.r.length} times</b>: <span class="pos">${s.r.filter((v) => v > 0).length} won</span>, <span class="neg">${s.r.filter((v) => v <= 0).length} lost</span>, <b>${R(s.exp)}</b> a trade.<div class="sr-mini">${s.r.map((v) => `<i class="${v > 0 ? 'w' : ''}"></i>`).join('')}</div>`
      : `<span class="nm">${[...env[1]][0] || 'Something'} at ${([...env[0]][0] || 'somewhere').toLowerCase()}</span>New environment. Saving starts a new setup in your playbook.`; }
  match();
  document.querySelectorAll('#sr-grade button').forEach((b) => (b.onclick = () => document.querySelectorAll('#sr-grade button').forEach((x) => x.classList.toggle('on', x === b))));
  $('sr-fix').onclick = (e) => { e.target.textContent = 'Added to your Focus panel ✓'; };
  $('sr-done').onclick = (e) => { e.target.textContent = 'Saved to your playbook ✓'; const d = document.querySelector('#sr-inbox .sr-it.on .sr-dot'); if (d) d.classList.add('done'); };

  /* ---------- bottom strip: same setup before ---------- */
  const pastPics = PAST.map((p, i) => shot(i % 2 ? 'heat' : 'fp', 40 + i * 7, 1600, 900));
  $('sr-past').innerHTML = PAST.map((p, i) => `<button type="button" class="sr-pt" data-i="${i}"><canvas width="92" height="56"></canvas><span>${p[0]}<b class="${p[1] < 0 ? 'neg' : 'pos'}">${R(p[1])}</b></span></button>`).join('');
  document.querySelectorAll('#sr-past .sr-pt').forEach((b) => { b.querySelector('canvas').getContext('2d').drawImage(pastPics[b.dataset.i], 0, 0, 92, 56); b.onclick = () => { cmpI = +b.dataset.i; go('compare'); }; });

  /* ---------- compare ---------- */
  let cmpI = 0;
  const pastMarks = (i) => [{ id: uid(), type: 'rect', x: 600 + i * 20, y: 160, w: 320, h: 340, color: PAST[i][1] > 0 ? '#26c6a0' : '#f0464b', size: 9, seed: 900 + i }, T(960, 560, PAST[i][1] > 0 ? 'Sellers held,\n3rd tap' : 'Too early', 84, { color: PAST[i][1] > 0 ? '#26c6a0' : '#f0464b', seed: 950 + i })];
  function compare() {
    const p = PAST[cmpI], took = p[2].includes('half');
    $('sr-cmp').innerHTML = `<div class="sr-cpick"><span class="sr-k" style="margin-right:6px">Compare with</span>${PAST.map((q, i) => `<button type="button" data-i="${i}" class="${i === cmpI ? 'on' : ''}">${q[0]} · ${R(q[1])}</button>`).join('')}</div>
      <div class="sr-cside"><canvas width="1600" height="900"></canvas><div class="b"><h3>This trade · 20 Nov <span class="neg">−1.0R</span></h3><p>Sold the 3rd tap. Took nothing at 1R. It turned and took my stop.</p></div></div>
      <div class="sr-cside"><canvas width="1600" height="900"></canvas><div class="b"><h3>${p[0]} <span class="${p[1] < 0 ? 'neg' : 'pos'}">${R(p[1])}</span></h3><p>${p[2]}</p></div></div>
      <div class="sr-diff"><span class="sr-k">What was different</span>
        <div class="sr-drow"><span>Tap</span><span>3rd</span><span>${p[2].includes('1st') ? '1st' : p[2].includes('Two') ? '2nd' : '3rd'}</span></div>
        <div class="sr-drow x"><span>Half off at 1R</span><span>No</span><span>${took ? 'Yes' : 'No'}</span></div>
        <div class="sr-drow"><span>Session</span><span>NY open</span><span>NY open</span></div>
        <div class="sr-drow"><span>Heatmap wall</span><span>Held</span><span>${p[2].includes('wall') ? 'Held' : 'None'}</span></div>
        <p class="sr-lesson">${took ? 'Same picture. The only change was taking half at 1R.' : 'Look at the tap and the footprint before the entry.'}</p></div>`;
    const cs = $('sr-cmp').querySelectorAll('.sr-cside canvas');
    paint(cs[0].getContext('2d'), tabs[0], 1600, 900, null); paint(cs[1].getContext('2d'), { bg: pastPics[cmpI], objs: pastMarks(cmpI) }, 1600, 900, null);
    $('sr-cmp').querySelectorAll('.sr-cpick button').forEach((b) => (b.onclick = () => { cmpI = +b.dataset.i; compare(); })); }

  /* ---------- playbook ---------- */
  let flt = 'All';
  function curves() { const cvs = $('sr-curves'), [x, w, h] = fitCv(cvs); if (!w) return;
    const series = SETS.map((s) => { let c = 0; return [0, ...s.r.filter((v) => (flt === 'Wins' ? v > 0 : flt === 'Losses' ? v <= 0 : true)).map((v) => (c += v))]; });
    const all = series.flat(), lo = Math.min(0, ...all), hi = Math.max(1, ...all), n = Math.max(...series.map((s) => s.length)) - 1, P = 34, Y = (v) => 10 + (hi - v) / (hi - lo) * (h - 30), X = (i) => P + i / n * (w - P - 8);
    x.font = '10px Manrope, sans-serif'; x.fillStyle = '#6b6b75'; x.strokeStyle = 'rgba(255,255,255,.05)';
    for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) { x.beginPath(); x.moveTo(P, Y(v)); x.lineTo(w, Y(v)); x.stroke(); x.fillText((v > 0 ? '+' : '') + v + 'R', 0, Y(v) + 3); }
    x.strokeStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.moveTo(P, Y(0)); x.lineTo(w, Y(0)); x.stroke();
    series.forEach((s, k) => { x.strokeStyle = SETS[k].c; x.lineWidth = k === setI ? 2.6 : 1.6; x.globalAlpha = k === setI ? 1 : 0.75; x.beginPath(); s.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.stroke();
      x.fillStyle = SETS[k].c; x.beginPath(); x.arc(X(s.length - 1), Y(s[s.length - 1]), 3, 0, 7); x.fill(); }); x.globalAlpha = 1;
    x.fillStyle = '#6b6b75'; x.fillText('trade 1', P, h - 4); x.fillText('trade ' + n, w - 44, h - 4);
    $('sr-leg').innerHTML = SETS.map((s, k) => `<span><i style="background:${s.c}"></i>${s.n} <b class="${series[k][series[k].length - 1] < 0 ? 'neg' : 'pos'}">${R(series[k][series[k].length - 1])}</b></span>`).join(''); }
  document.querySelectorAll('#sr-flt button').forEach((b) => (b.onclick = () => { flt = b.textContent; document.querySelectorAll('#sr-flt button').forEach((x) => x.classList.toggle('on', x === b)); curves(); }));
  const PAIRS = [['Absorption at value high', 'Heatmap wall held', 5, 7.4], ['Buy at value low', 'NY open', 6, 5.1], ['Exhaustion at poor high', 'Delta flip', 3, 4.8], ['Absorption at value high', 'Balance day', 4, 3.2], ['Stacked imbalance retest', 'Asia', 5, -3.4]];
  $('sr-pairs').innerHTML = PAIRS.map((p, i) => `<div class="sr-pair"><em>${i + 1}</em><span>${p[0]} <b>+</b> ${p[1]}</span><b class="v ${p[3] < 0 ? 'neg' : 'pos'}">${R(p[3])}</b><small>${p[2]} trades together</small></div>`).join('');
  $('sr-cards').innerHTML = SETS.map((s, i) => `<div class="sr-card" data-i="${i}" style="--c:${s.c}"><h3>${s.n}</h3><p class="r">“${s.rule}”</p><canvas></canvas>
    <div class="sr-cg"><div><span class="sr-k">Per trade</span><b class="${s.exp < 0 ? 'neg' : 'pos'}">${R(s.exp)}</b></div><div><span class="sr-k">Profit f.</span><b>${s.pf.toFixed(2)}</b></div><div><span class="sr-k">Won</span><b>${s.won}%</b></div></div>
    <div class="ft"><span>${s.r.length} trades</span><span>Last traded ${s.last}</span></div></div>`).join('');
  document.querySelectorAll('.sr-card').forEach((c) => (c.onclick = () => { pickSet(+c.dataset.i); go('study'); }));
  const book = () => { curves(); document.querySelectorAll('.sr-card').forEach((c) => { const s = SETS[c.dataset.i]; spark(c.querySelector('canvas'), s.r, s.c); }); };

  /* ---------- modes ---------- */
  function go(m) { document.querySelectorAll('.sr-modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); document.querySelectorAll('.sr-view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + m));
    if (m === 'study') requestAnimationFrame(sizeCanvas); if (m === 'compare') compare(); if (m === 'book') requestAnimationFrame(book); }
  document.querySelectorAll('.sr-modes button').forEach((b) => (b.onclick = () => go(b.dataset.m)));
  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));

  /* ---------- boot ---------- */
  renderTabs(); openTab(0); setTool('select'); syncBar(); head(); setsSpark();
  const start = { '#compare': 'compare', '#playbook': 'book' }[location.hash]; go(start || 'study');
  addEventListener('resize', () => { sizeCanvas(); setsSpark(); head(); if ($('v-book').classList.contains('on')) book(); });
  Promise.all(FONTS.map((f) => document.fonts.load(`40px "${f[0]}"`).catch(() => {}))).then(() => { redraw(); thumbs(); });
})();
