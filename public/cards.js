/* Trade cards: draws the 5ABI.FX share cards (cinematic theme, 9:16) on a canvas.
   Card 1 = the result in one of three styles (a Cinematic, b Chart first, c Ticket),
   card 2 = the real candles of the trade with entry, stop, target and exit.
   Used by the journal trade page. Exposes window.TradeCards. */
(function () {
const W = 1080, H = 1920, PAD = 80;
const state = { tpl: 'a', mode: 'money', rm: true, candles: [] };
const D = 'Sora, Manrope, system-ui, sans-serif';
const M = '"JetBrains Mono", ui-monospace, monospace';
const B = 'Manrope, system-ui, sans-serif';
const INK = '#f2f2f4', SOFT = '#c9c9cf', DIM = '#8a8a94', FAINT = '#6a6a74', ORANGE = '#ff6a2a';
const WIN = '#2fd3a6', LOSS = '#ff5a64', LINE = 'rgba(255,255,255,.1)';
const MINUS = '−';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const LOGO = new Image();
let last = null;
const logoWait = [];
LOGO.onload = () => { if (last) render(...last); logoWait.forEach((f) => f()); };
LOGO.src = '/logo.png';

/* ---------- numbers ---------- */
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const sign = n => (n < 0 ? MINUS : '+');
function money(n) { return n === null ? null : sign(n) + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pctTxt(n) { return n === null ? null : sign(n) + Math.abs(n).toFixed(2) + '%'; }
function rTxt(n) { if (n === null) return null; const a = Math.round(Math.abs(n) * 100) / 100; return sign(n) + (Number.isInteger(Math.round(a * 100) / 10) ? a.toFixed(1) : a.toFixed(2)) + 'R'; }
const VALUES = { money: t => money(num(t.pnl)), pct: t => pctTxt(num(t.pct)), r: t => rTxt(num(t.r)) };
function primary(t) { return VALUES[state.mode](t) || VALUES.money(t) || '—'; }
function secondary(t) {
  const shown = VALUES[state.mode](t) ? state.mode : 'money';
  return ['money', 'pct', 'r'].filter(k => k !== shown).map(k => VALUES[k](t)).filter(Boolean).join('  ·  ');
}
function isWin(t) { return (num(t.pnl) ?? num(t.r) ?? num(t.pct) ?? 0) >= 0; }
const acc = t => (isWin(t) ? WIN : LOSS);
function tsOf(s) { if (!s) return null; const v = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z'); return Number.isFinite(v) ? v : null; }
function duration(t) {
  const a = tsOf(t.open), b = tsOf(t.close);
  if (a === null || b === null || b < a) return '—';
  const m = Math.round((b - a) / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}
function dayTxt(s) { if (!s || s.length < 10) return ''; return `${Number(s.slice(8, 10))} ${MON.at(Number(s.slice(5, 7)) - 1)} ${s.slice(0, 4)}`; }
function timeTxt(s) { if (!s || s.length < 16) return '—'; return `${Number(s.slice(8, 10))} ${MON.at(Number(s.slice(5, 7)) - 1)} ${s.slice(11, 16)}`; }
function parsePartials(t) {
  if (!Array.isArray(t.partials)) return [];
  return t.partials.map(p => ({ price: num(p.price), t: tsOf(p.time) })).filter(p => p.price !== null && p.t !== null);
}
const label = t => [t.side, t.setup ? String(t.setup).toUpperCase() : ''].filter(Boolean).join(' · ');

/* ---------- canvas helpers ---------- */
function T(c, s, x, y, o = {}) {
  c.font = `${o.w || 400} ${o.size || 32}px ${o.fam || B}`;
  c.fillStyle = o.color || INK; c.textAlign = o.align || 'left'; c.textBaseline = 'alphabetic';
  if ('letterSpacing' in c) c.letterSpacing = (o.ls || 0) + 'px';
  c.fillText(String(s), x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}
function fitSize(c, s, max, size, fam, w, ls = 0) {
  c.font = `${w} ${size}px ${fam}`;
  if ('letterSpacing' in c) c.letterSpacing = ls + 'px';
  const m = c.measureText(String(s)).width;
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  return m > max ? Math.floor(size * max / m) : size;
}
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/* black with a faint orange heatmap glow, like the site */
function bg(c, glow = 1) {
  c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'lighter'; seed = 7;
  for (let i = 0; i < 9; i++) {
    const y = 120 + rnd() * 1700, w = 14 + rnd() * 40, a = (0.1 + rnd() * 0.35) * glow;
    for (let x = 0; x < W; x += 12) {
      const n = (Math.sin(x / 110 + i * 2) * 0.5 + 0.5) * (Math.sin(x / 31 - i) * 0.5 + 0.5);
      const g = c.createLinearGradient(0, y - w, 0, y + w);
      g.addColorStop(0, 'rgba(255,90,31,0)');
      g.addColorStop(0.5, `rgba(255,90,31,${(a * (0.2 + 0.8 * n) * (x / W * 0.8 + 0.2)).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,90,31,0)');
      c.fillStyle = g; c.fillRect(x, y - w, 12, w * 2);
    }
  }
  c.globalCompositeOperation = 'source-over';
  const v = c.createRadialGradient(W * 0.4, H * 0.5, 100, W * 0.5, H * 0.5, H * 0.75);
  v.addColorStop(0, 'rgba(5,5,7,.55)'); v.addColorStop(1, 'rgba(5,5,7,.95)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}
function brand(c, x, y, align = 'left') {
  const lw = 74, lh = LOGO.width ? lw * LOGO.height / LOGO.width : 46;
  c.font = `400 38px ${D}`;
  const tw = c.measureText('5ABI.FX').width, x0 = align === 'center' ? x - (tw + lw + 16) / 2 : x;
  if (LOGO.complete && LOGO.width) c.drawImage(LOGO, x0, y - lh / 2 - 2, lw, lh);
  T(c, '5ABI.FX', x0 + lw + 16, y + 13, { fam: D, size: 38 });
}
function head(c, t) {
  brand(c, PAD, 140);
  const h = t.handle || '5abifx.com';
  T(c, h, W - PAD, 153, { fam: M, size: fitSize(c, h, 420, 26, M, 400, 2), color: DIM, align: 'right', ls: 2 });
}
function foot(c, t) {
  const y = H - PAD;
  c.fillStyle = LINE; c.fillRect(PAD, y - 60, W - 2 * PAD, 2);
  if (state.rm) {
    const s = num(t.risk) !== null ? `RISK ${num(t.risk).toFixed(2)}% · PROTECTED BY KATANA` : 'PROTECTED BY KATANA';
    T(c, s, PAD, y, { fam: M, size: 24, color: ORANGE, ls: 4 });
  }
  T(c, dayTxt(t.close), W - PAD, y, { fam: M, size: 24, color: DIM, align: 'right', ls: 4 });
}
function grid(c, cells, x0, y0, cols, rowH, valSize) {
  const cw = (W - 2 * PAD) / cols;
  cells.forEach(([k, v], i) => {
    const x = x0 + (i % cols) * cw, y = y0 + Math.floor(i / cols) * rowH, s = String(v || '—');
    T(c, k, x, y, { fam: M, size: 20, color: FAINT, ls: 5 });
    T(c, s, x, y + 48, { fam: M, size: fitSize(c, s, cw - 24, valSize, M, 400) });
  });
}
const cellsOf = t => [['ENTRY', t.entry], ['EXIT', t.exit], ['LOTS', t.lots], ['STOP', t.sl], ['TARGET', t.tp], ['HELD', duration(t)]];

/* ---------- candles of this trade ---------- */
function windowOf(t) {
  const all = state.candles, o = tsOf(t.open), cl = tsOf(t.close);
  if (all.length < 2 || o === null || cl === null) return null;
  const near = ms => { let best = 0; all.forEach((k, i) => { if (Math.abs(k.t - ms) < Math.abs(all.at(best).t - ms)) best = i; }); return best; };
  const io = near(o), ic = Math.max(io, near(cl));
  let a = Math.max(0, io - 30), b = Math.min(all.length - 1, ic + 12);
  if (b - a > 90) a = Math.max(0, Math.min(io - 6, b - 90));
  return { all, a, b, io, ic, near };
}

/* card 1, style A: a light price line from entry to exit */
function priceLine(c, t, x0, x1, y0, h) {
  const e = num(t.entry), x = num(t.exit), w = windowOf(t);
  let L, ie = 0;
  if (w) {
    const from = Math.max(w.a, w.io - 8);
    L = w.all.slice(from, w.ic + 1).map(k => k.c);
    ie = w.io - from;
    if (e !== null) L[ie] = e;
    if (x !== null) L[L.length - 1] = x;
  } else if (e !== null && x !== null) L = [e, x];
  else return;
  if (L.length < 2) L = [L[0], L[0]];
  const lo = Math.min(...L), hi = Math.max(...L), sp = (hi - lo) || 1;
  const Y = v => y0 + h - (v - lo) / sp * h, step = (x1 - x0) / (L.length - 1);
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, 'rgba(242,242,244,0)'); g.addColorStop(0.3, 'rgba(242,242,244,.45)'); g.addColorStop(1, 'rgba(242,242,244,.9)');
  c.strokeStyle = g; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath();
  L.forEach((v, i) => (i ? c.lineTo(x0 + i * step, Y(v)) : c.moveTo(x0, Y(v)))); c.stroke();
  [[ie, 'ENTRY', INK], [L.length - 1, 'EXIT', acc(t)]].forEach(([i, l, col], n) => {
    const px = x0 + i * step, py = Y(L[i]);
    c.setLineDash([4, 8]); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px, y0 + h + 30); c.stroke(); c.setLineDash([]);
    c.fillStyle = col === INK ? 'rgba(255,255,255,.25)' : col + '55'; c.beginPath(); c.arc(px, py, 20, 0, 7); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(px, py, 8, 0, 7); c.fill();
    T(c, l, px, y0 + h + 68, { fam: M, size: 22, color: DIM, align: n ? 'right' : 'left', ls: 4 });
  });
}

/* candles with entry/stop/target lines, zones and the exit dot */
function chartArea(c, t, x0, y0, w, h) {
  const win = windowOf(t);
  if (!win) {
    T(c, 'No candles saved for this trade yet', x0 + w / 2, y0 + h / 2, { fam: M, size: 26, color: DIM, align: 'center' });
    return;
  }
  const { all, a, b, io, ic, near } = win, ks = all.slice(a, b + 1), buy = t.side !== 'SELL';
  const e = num(t.entry), x = num(t.exit), sl = num(t.sl), tp = num(t.tp);
  const prices = ks.flatMap(k => [k.h, k.l]).concat([e, x, sl, tp].filter(v => v !== null));
  let lo = Math.min(...prices), hi = Math.max(...prices); const pad = ((hi - lo) || 1) * 0.08; lo -= pad; hi += pad;
  const Y = v => y0 + h - (v - lo) / (hi - lo) * h, cw = w / ks.length, X = i => x0 + (i - a + 0.5) * cw;
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
  for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(x0, y0 + h * i / 6); c.lineTo(x0 + w, y0 + h * i / 6); c.stroke(); }
  const xa = X(io) - cw / 2, xb = X(ic) + cw / 2;
  if (e !== null && tp !== null) { c.fillStyle = 'rgba(47,211,166,.10)'; c.fillRect(xa, Math.min(Y(e), Y(tp)), xb - xa, Math.abs(Y(tp) - Y(e))); }
  const slRisk = e !== null && sl !== null && (buy ? sl < e : sl > e);
  if (slRisk) { c.fillStyle = 'rgba(255,90,100,.10)'; c.fillRect(xa, Math.min(Y(e), Y(sl)), xb - xa, Math.abs(Y(sl) - Y(e))); }
  ks.forEach((k, j) => {
    const i = a + j, cx = X(i), up = k.c >= k.o, col = up ? WIN : LOSS;
    c.globalAlpha = i >= io && i <= ic ? 1 : 0.55;
    c.strokeStyle = col; c.lineWidth = Math.max(1.5, Math.min(3, cw * 0.14));
    c.beginPath(); c.moveTo(cx, Y(k.h)); c.lineTo(cx, Y(k.l)); c.stroke();
    const bt = Y(Math.max(k.o, k.c)), bb = Y(Math.min(k.o, k.c));
    c.fillStyle = col; c.fillRect(cx - cw * 0.32, bt, cw * 0.64, Math.max(3, bb - bt));
  });
  c.globalAlpha = 1;
  // level lines with tags on the right, nudged apart so they never overlap
  const lines = [[tp, 'TARGET ' + t.tp, WIN], [sl, 'STOP ' + t.sl, LOSS], [e, 'ENTRY ' + t.entry, INK]].filter(z => z[0] !== null);
  lines.forEach(([v, , col]) => {
    c.setLineDash([6, 8]); c.strokeStyle = col; c.globalAlpha = 0.6; c.lineWidth = 2;
    c.beginPath(); c.moveTo(xa, Y(v)); c.lineTo(x0 + w, Y(v)); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  });
  const tags = lines.map(z => ({ z, y: Y(z[0]) })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < tags.length; i++) if (tags.at(i).y - tags.at(i - 1).y < 40) tags.at(i).y = tags.at(i - 1).y + 40;
  tags.forEach(({ z: [, l, col], y }) => {
    c.font = `500 20px ${M}`; const tw = c.measureText(l).width + 24;
    c.fillStyle = 'rgba(5,5,7,.85)'; c.fillRect(x0 + w - tw, y - 17, tw, 34);
    c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(x0 + w - tw, y - 17, tw, 34);
    T(c, l, x0 + w - 12, y + 7, { fam: M, size: 20, color: col, align: 'right', w: 500 });
  });
  const dot = (px, py, col, r) => { c.fillStyle = col + '55'; c.beginPath(); c.arc(px, py, r * 2.4, 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); };
  if (e !== null) { c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(X(io), Y(e), 18, 0, 7); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(X(io), Y(e), 7, 0, 7); c.fill(); }
  parsePartials(t).forEach(p => { const ip = near(p.t); if (ip >= a && ip <= b) dot(X(ip), Y(p.price), WIN, 6); });
  if (x !== null) dot(X(ic), Y(x), acc(t), 9);
}

/* ---------- card 1 styles ---------- */
function cardA(c, t) {
  bg(c); head(c, t);
  T(c, label(t), PAD, 420, { fam: M, size: 28, color: acc(t), ls: 6 });
  const sym = t.symbol || '';
  T(c, sym, PAD - 6, 560, { fam: D, w: 300, size: fitSize(c, sym, W - 2 * PAD, 150, D, 300, -4), ls: -4 });
  const r = primary(t);
  T(c, r, PAD - 14, 900, { fam: D, w: 200, size: fitSize(c, r, W - 2 * PAD, 400, D, 200, -12), color: acc(t), ls: -12 });
  T(c, secondary(t), PAD, 990, { fam: M, size: 36, color: SOFT });
  priceLine(c, t, PAD, W - PAD, 1070, 300);
  c.fillStyle = LINE; c.fillRect(PAD, 1500, W - 2 * PAD, 2);
  grid(c, cellsOf(t), PAD, 1570, 3, 110, 36);
  foot(c, t);
}
function cardB(c, t) {
  bg(c, 0.5); head(c, t);
  chartArea(c, t, 60, 240, W - 120, 860);
  T(c, label(t), PAD, 1210, { fam: M, size: 28, color: acc(t), ls: 6 });
  const sym = t.symbol || '';
  T(c, sym, PAD - 6, 1320, { fam: D, w: 300, size: fitSize(c, sym, W - 2 * PAD, 110, D, 300, -3), ls: -3 });
  const r = primary(t);
  T(c, r, PAD - 14, 1600, { fam: D, w: 200, size: fitSize(c, r, W - 2 * PAD, 300, D, 200, -10), color: acc(t), ls: -10 });
  T(c, [secondary(t), duration(t)].filter(s => s && s !== '—').join('  ·  '), PAD, 1680, { fam: M, size: 32, color: SOFT });
  foot(c, t);
}
function cardC(c, t) {
  bg(c, 0.45); brand(c, W / 2, 150, 'center');
  const cx = W / 2, cy = 780, R = 300, rv = num(t.r), win = isWin(t);
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.setLineDash([2, 12]);
  c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke(); c.setLineDash([]);
  // the ring fills with R: a full circle is 3R
  const fr = rv === null ? 1 : Math.min(1, Math.abs(rv) / 3);
  c.strokeStyle = acc(t); c.lineWidth = 6; c.lineCap = 'round'; c.globalAlpha = rv === null ? 0.35 : 1;
  c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (win ? 1 : -1) * Math.max(0.01, fr) * Math.PI * 2, !win); c.stroke();
  c.lineCap = 'butt'; c.globalAlpha = 1;
  const top = `${t.symbol || ''} · ${t.side || ''}`;
  T(c, top, cx, cy - 150, { fam: M, size: fitSize(c, top, R * 1.6, 30, M, 400, 6), color: DIM, align: 'center', ls: 6 });
  const r = primary(t);
  T(c, r, cx, cy + 70, { fam: D, w: 200, size: fitSize(c, r, R * 1.7, 200, D, 200, -8), color: acc(t), align: 'center', ls: -8 });
  const s = secondary(t);
  T(c, s, cx, cy + 150, { fam: M, size: fitSize(c, s, R * 1.7, 30, M, 400), color: SOFT, align: 'center' });
  const gx = PAD, gy = 1250, cw = (W - 2 * PAD) / 2, ch = 96;
  cellsOf(t).forEach(([k, v], i) => {
    const x = gx + (i % 2) * cw, y = gy + Math.floor(i / 2) * ch, val = String(v || '—');
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.strokeRect(x, y, cw, ch);
    T(c, k, x + 28, y + 58, { fam: M, size: 20, color: FAINT, ls: 5 });
    T(c, val, x + cw - 28, y + 60, { fam: M, size: fitSize(c, val, cw - 180, 34, M, 400), align: 'right' });
  });
  if (t.setup) T(c, t.setup, cx, 1620, { fam: D, w: 300, size: fitSize(c, t.setup, W - 2 * PAD, 40, D, 300), color: SOFT, align: 'center' });
  foot(c, t);
}

/* ---------- card 2: the real chart ---------- */
function cardChart(c, t) {
  bg(c, 0.6); head(c, t);
  T(c, [t.symbol, t.side, t.tf].filter(Boolean).join(' · '), PAD, 300, { fam: M, size: 28, color: DIM, ls: 6 });
  const r = primary(t);
  T(c, r, PAD - 6, 440, { fam: D, w: 200, size: fitSize(c, r, W - 2 * PAD, 150, D, 200, -6), color: acc(t), ls: -6 });
  T(c, secondary(t), PAD, 510, { fam: M, size: 32, color: SOFT });
  chartArea(c, t, 60, 600, W - 120, 1040);
  T(c, `OPENED ${timeTxt(t.open)}   ·   CLOSED ${timeTxt(t.close)}`, PAD, 1720, { fam: M, size: 22, color: FAINT, ls: 3 });
  foot(c, t);
}

const DRAW = { a: cardA, b: cardB, c: cardC };
function render(resultCanvas, chartCanvas, trade, opts) {
  last = [resultCanvas, chartCanvas, trade, opts];
  Object.assign(state, opts || {});
  if (!DRAW[state.tpl]) state.tpl = 'a';
  state.candles = (trade.candles || []).map(k => ({ t: k[0] * 1000, o: k[1], h: k[2], l: k[3], c: k[4] }));
  for (const cv of [resultCanvas, chartCanvas]) { cv.width = W; cv.height = H; }
  DRAW[state.tpl](resultCanvas.getContext('2d'), trade);
  cardChart(chartCanvas.getContext('2d'), trade);
}
window.TradeCards = { render, styles: { a: 'Cinematic', b: 'Chart first', c: 'Ticket' },
  // drawing kit for the account report cards (public/report.js)
  kit: { W, H, PAD, D, M, B, INK, SOFT, DIM, FAINT, ORANGE, WIN, LOSS, LINE, MINUS, MON, T, fitSize, bg, brand,
    onLogo: (f) => { if (LOGO.complete && LOGO.width) f(); else logoWait.push(f); } } };
})();
