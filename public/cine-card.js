/* Cinema share card: one engine for a trade or a period (day, session, week, month, quarter).
   Full-bleed art (built-in or the member's own photo/clip, never uploaded) with a colour grade,
   a big white result that counts up, and ONLY the lines the member switches on.
   Story 9:16, post 4:5 or wide 16:9. Records MP4/WebM in the browser or saves a PNG.
   Needs public/cards.js (TradeCards.kit). Exposes window.CineCard. */
(function () {
const K = window.TradeCards.kit;
const LEN = 7, FPS = 30, MINUS = '−';
const BIG = 'Sora, Manrope, system-ui, sans-serif', TXT = 'Manrope, system-ui, sans-serif';
const SIZES = { story: [1080, 1920, 'Story 9:16'], post: [1080, 1350, 'Post 4:5'], wide: [1920, 1080, 'Wide 16:9'] };
const GRADES = { natural: 'Natural', bw: 'Black & white', ember: 'Ember', blood: 'Red', teal: 'Teal', gold: 'Gold' };
const GRADE_COL = { ember: '#ff6a2a', blood: '#c3141d', teal: '#13a88a', gold: '#d9a441' };
const ARTS = { smoke: 'Smoke', ember: 'Ember glow', floor: 'Trading floor' };
/* every line on the card is optional; members pick what they are happy to show */
const FIELDS = {
  trade: { title: 'Symbol and side', date: 'Date', line: 'Price line', quote: 'Quote', alt: 'Second unit', entry: 'Entry', exit: 'Exit', size: 'Size', held: 'Time held', risk: 'Risk %', handle: 'Name tag', synced: 'MT5 synced tick' },
  period: { title: 'Period name', quote: 'Quote', alt: 'Second unit', bars: 'Day-by-day bars', trades: 'Trades', winrate: 'Win rate', green: 'Green days', best: 'Best day / trade', handle: 'Name tag', synced: 'MT5 synced tick' },
  milestone: { heading: 'Heading', handle: 'Your name', line: 'What it was', stats: 'Three numbers', quote: 'Quote', synced: 'MT5 synced tick' },
};
const DEFAULTS = {
  trade: { title: true, date: true, line: true, quote: true, alt: false, entry: false, exit: false, size: false, held: false, risk: false, handle: true, synced: true },
  period: { title: true, quote: true, alt: false, bars: true, trades: false, winrate: false, green: false, best: false, handle: true, synced: true },
  milestone: { heading: true, handle: true, line: true, stats: true, quote: true, synced: true },
};
const kindOf = d => (d && (d.kind === 'trade' || d.kind === 'milestone') ? d.kind : 'period');

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = x => 1 - Math.pow(1 - clamp(x), 4);
const expo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const fin = v => typeof v === 'number' && Number.isFinite(v);
const sg = n => (n < 0 ? MINUS : '+');
function fmt(v, unit, short) {
  if (!fin(v)) return '—';
  const a = Math.abs(v);
  if (unit === 'pips') return sg(v) + (a >= 1000 ? Math.round(a).toLocaleString('en-US') : a.toFixed(a >= 100 || short ? 0 : 1)) + (short ? 'p' : ' pips');
  if (unit === 'r') return sg(v) + a.toFixed(a >= 10 || short ? 1 : 2) + 'R';
  if (unit === 'pct') return sg(v) + a.toFixed(2) + '%';
  const cs = (typeof window !== 'undefined' && window.CineCardCur) || '$';
  if (short && a >= 10000) return sg(v) + cs + (a / 1000).toFixed(1) + 'k';
  return sg(v) + cs + a.toLocaleString('en-US', { minimumFractionDigits: short ? 0 : 2, maximumFractionDigits: short ? 0 : 2 });
}
const val = (o, u) => (o ? o[u] : null);

function text(c, s, x, y, o) {
  c.font = `${o.w || 500} ${o.size}px ${o.fam || TXT}`;
  c.fillStyle = o.color || '#fff'; c.textAlign = o.align || 'center'; c.textBaseline = 'alphabetic';
  if ('letterSpacing' in c) c.letterSpacing = (o.ls || 0) + 'px';
  c.fillText(String(s), x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}
// instrument badge: glass circle in the card's style with a simple mark per market
const CUR = { EUR: '€', GBP: '£', USD: '$', JPY: '¥', AUD: 'A$', NZD: 'N$', CAD: 'C$', CHF: 'Fr' };
function instrument(sym) {
  const s = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(BTC|XBT)/.test(s)) return { t: 'glyph', g: '₿', col: '#f7931a' };
  if (/^ETH/.test(s)) return { t: 'glyph', g: 'Ξ', col: '#9aa6ff' };
  if (/^(XAU|GOLD|GC)/.test(s)) return { t: 'bar', a: '#fff1c2', b: '#d9a93a', d: '#8a6416' };
  if (/^(XAG|SILVER|SI\b)/.test(s)) return { t: 'bar', a: '#ffffff', b: '#c3cad6', d: '#6d7684' };
  if (/^(WTI|USOIL|UKOIL|XTI|XBR|BRENT|CL\d*$|OIL)/.test(s)) return { t: 'drop', col: '#e9eef6' };
  const idx = [[/^(NQ|MNQ|NAS|US100|USTEC|NDX)/, 'NQ'], [/^(ES|MES|SPX|US500|SP500)/, 'ES'], [/^(YM|MYM|US30|DJ|DOW)/, 'YM'], [/^(DAX|GER|DE40)/, 'DAX'], [/^(RTY|M2K|US2000)/, 'RTY']];
  for (const [r, l] of idx) if (r.test(s)) return { t: 'label', g: l };
  if (s.length >= 6 && CUR[s.slice(0, 3)]) return { t: 'glyph', g: CUR[s.slice(0, 3)], col: '#f4f4f6' };
  return null;
}
function drawBadge(c, ins, x, y, r) {
  c.save();
  const ring = c.createLinearGradient(x - r, y - r, x + r, y + r); ring.addColorStop(0, 'rgba(255,255,255,.55)'); ring.addColorStop(1, 'rgba(255,255,255,.08)');
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = 'rgba(14,15,19,.72)'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = ring; c.stroke();
  if (ins.t === 'glyph' || ins.t === 'label') {
    const sz = ins.t === 'label' ? (ins.g.length > 2 ? r * 0.62 : r * 0.78) : r * (ins.g.length > 1 ? 0.8 : 1.15);
    c.shadowColor = ins.col || 'rgba(255,255,255,.4)'; c.shadowBlur = 14;
    c.font = `700 ${sz}px ${BIG}`; c.fillStyle = ins.col || '#f4f4f6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ins.g, x, y + 2);
  } else if (ins.t === 'bar') {
    const w = r * 1.25, h = r * 0.62, tw = w * 0.62, by = y + h / 2;
    const g = c.createLinearGradient(0, by - h, 0, by); g.addColorStop(0, ins.a); g.addColorStop(0.55, ins.b); g.addColorStop(1, ins.d);
    c.beginPath(); c.moveTo(x - w / 2, by); c.lineTo(x + w / 2, by); c.lineTo(x + tw / 2, by - h); c.lineTo(x - tw / 2, by - h); c.closePath();
    c.shadowColor = ins.b; c.shadowBlur = 16; c.fillStyle = g; c.fill();
    c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x - tw / 2 + 4, by - h + 3, tw - 8, 3);
  } else if (ins.t === 'drop') {
    const h = r * 1.05; c.beginPath(); c.moveTo(x, y - h / 2);
    c.bezierCurveTo(x + r * 0.5, y, x + r * 0.42, y + h / 2, x, y + h / 2); c.bezierCurveTo(x - r * 0.42, y + h / 2, x - r * 0.5, y, x, y - h / 2);
    c.fillStyle = ins.col; c.shadowColor = 'rgba(255,255,255,.35)'; c.shadowBlur = 12; c.fill();
  }
  c.restore();
}
function fit(c, s, max, size, fam, w, ls = 0) {
  c.font = `${w} ${size}px ${fam}`; if ('letterSpacing' in c) c.letterSpacing = ls + 'px';
  const m = c.measureText(String(s)).width; if ('letterSpacing' in c) c.letterSpacing = '0px';
  return m > max ? Math.floor(size * max / m) : size;
}
function pill(c, s, x, y, dark) {
  c.font = `700 22px ${TXT}`; const w = c.measureText(s).width + 28;
  c.fillStyle = dark ? '#0b0b0e' : '#f2f2f4'; c.beginPath();
  if (c.roundRect) c.roundRect(x - w / 2, y - 19, w, 38, 19); else c.rect(x - w / 2, y - 19, w, 38);
  c.fill(); text(c, s, x, y + 8, { size: 22, w: 700, color: dark ? '#fff' : '#0b0b0e' });
}

function create(canvas, data, opts) {
  // len: video seconds (8, 12 or 15; the card is built by about 4 s, the rest is the hold over moving art)
  // poster: the first 3 frames show the finished card, so the preview in Instagram / WhatsApp shows the result
  const o = Object.assign({ kind: kindOf(data), unit: 'money', size: 'story', art: 'smoke', grade: 'bw', quote: '', color: false, layout: 'center', dim: 0.45, len: 8, poster: true }, opts || {});
  o.show = Object.assign({}, DEFAULTS[o.kind], (opts || {}).show);
  let W = 1080, H = 1920, SC = 1, media = null, avatar = null, raf = 0, t0 = 0, frozen = null;
  const len = () => Math.max(6, Number(o.len) || 8);
  const c = canvas.getContext('2d');
  const art = document.createElement('canvas'), ac = art.getContext('2d');
  const glow = document.createElement('canvas'); glow.width = 1080; glow.height = 1920; K.bg(glow.getContext('2d'), 1.3);
  const grain = document.createElement('canvas'); grain.width = grain.height = 256;
  { const g = grain.getContext('2d'), im = g.createImageData(256, 256); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 22; } g.putImageData(im, 0, 0); }
  function size() { [W, H] = SIZES[o.size] || SIZES.story; canvas.width = W * SC; canvas.height = H * SC; art.width = W * SC; art.height = H * SC; }
  size();

  /* ---------- art (drawn on its own layer, then colour graded) ---------- */
  function drawArt(tm) {
    const a = ac; a.globalCompositeOperation = 'source-over'; a.filter = 'none';
    a.fillStyle = '#0a0a0c'; a.fillRect(0, 0, W, H);
    if (o.art === 'own' && media) {
      const mw = media.videoWidth || media.naturalWidth, mh = media.videoHeight || media.naturalHeight;
      if (mw && mh) { const s = Math.max(W / mw, H / mh) * (media.tagName === 'VIDEO' ? 1 : 1.04 + 0.06 * tm / len()); a.drawImage(media, (W - mw * s) / 2, (H - mh * s) / 2, mw * s, mh * s); }
    } else if (o.art === 'ember') {
      const z = 1.08 + 0.05 * Math.sin(tm / len() * 6.28), s = Math.max(W / 1080, H / 1920) * z;
      a.save(); a.translate(W / 2 + 30 * Math.sin(tm * 0.6), H / 2); a.scale(s, s); a.drawImage(glow, -540, -960);
      a.globalCompositeOperation = 'lighter'; a.globalAlpha = 0.7; a.drawImage(glow, -540, -960 + 40 * Math.sin(tm)); a.restore(); a.globalAlpha = 1;
    } else if (o.art === 'floor') {
      const hz = H * 0.45; a.strokeStyle = '#d8d8de'; a.lineWidth = 2;
      for (let i = 0; i < 20; i++) { const k = (i + (tm * 0.8) % 1) / 20, y = hz + Math.pow(k, 2.2) * (H - hz); a.globalAlpha = 0.05 + 0.3 * k; a.beginPath(); a.moveTo(0, y); a.lineTo(W, y); a.stroke(); }
      for (let i = -14; i <= 14; i++) { a.globalAlpha = 0.14; a.beginPath(); a.moveTo(W / 2 + i * 16, hz); a.lineTo(W / 2 + i * W * 0.25, H); a.stroke(); }
      a.globalAlpha = 1; const g = a.createRadialGradient(W / 2, hz, 10, W / 2, hz, Math.max(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = g; a.fillRect(0, 0, W, H);
    } else { // smoke: soft moving light and haze, like a film still
      for (let i = 0; i < 7; i++) {
        const x = W * (0.2 + 0.6 * ((Math.sin(tm * 0.25 + i * 1.7) + 1) / 2)), y = H * (0.15 + 0.7 * ((Math.cos(tm * 0.2 + i * 2.3) + 1) / 2)), r = Math.max(W, H) * (0.25 + 0.06 * i);
        const g = a.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(210,210,220,${(0.16 - i * 0.012).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        a.fillStyle = g; a.fillRect(0, 0, W, H);
      }
      const bx = W * (0.62 + 0.05 * Math.sin(tm * 0.4)), beam = a.createLinearGradient(bx - 260, 0, bx + 260, H);
      beam.addColorStop(0, 'rgba(255,255,255,0)'); beam.addColorStop(0.5, 'rgba(255,255,255,.10)'); beam.addColorStop(1, 'rgba(255,255,255,0)');
      a.save(); a.translate(bx, 0); a.rotate(0.18); a.translate(-bx, 0); a.fillStyle = beam; a.fillRect(bx - 260, -200, 520, H + 400); a.restore();
    }
    // colour grade: black & white, or a single-colour duotone over it
    if (o.grade !== 'natural') {
      a.globalCompositeOperation = 'saturation'; a.fillStyle = '#000'; a.fillRect(0, 0, W, H);
      if (GRADE_COL[o.grade]) { a.globalCompositeOperation = 'color'; a.fillStyle = GRADE_COL[o.grade]; a.globalAlpha = 0.85; a.fillRect(0, 0, W, H); a.globalAlpha = 1; }
      a.globalCompositeOperation = 'source-over';
    }
    c.drawImage(art, 0, 0, W, H);
    // readability: darken, more at the edges; film grain on top
    const d = o.art === 'own' ? o.dim : 0.25, v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, `rgba(0,0,0,${(d * 0.6).toFixed(2)})`); v.addColorStop(1, `rgba(0,0,0,${(0.5 + d * 0.4).toFixed(2)})`);
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    c.save(); c.globalAlpha = 0.6; c.fillStyle = c.createPattern(grain, 'repeat'); c.translate((tm * 997) % 256, (tm * 613) % 256); c.fillRect(-256, -256, W + 512, H + 512); c.restore();
  }

  /* ---------- content ---------- */
  const A = (tm, a, b) => ease(seg(tm, a, b));
  const unitVal = (u) => (o.kind === 'trade' ? val(data, u) : val(data.total, u));
  function detailRows() {
    const rows = o.kind === 'trade'
      ? [['entry', 'Entry', data.entry], ['exit', 'Exit', data.exit], ['size', 'Size', data.sizeTxt], ['held', 'Held', data.heldTxt], ['risk', 'Risk', data.riskTxt]]
      : [['trades', 'Trades', data.trades], ['winrate', 'Win rate', data.winRate], ['green', 'Green days', data.green], ['best', data.bestLabel || 'Best', data.best]];
    return rows.filter(r => o.show[r[0]] && r[2] !== undefined && r[2] !== null && r[2] !== '');
  }
  function altLine() {
    if (!o.show.alt) return null;
    const u2 = ['money', 'pips', 'r', 'pct'].filter(u => u !== o.unit).find(u => fin(unitVal(u)));
    return u2 ? fmt(unitVal(u2), u2) : null;
  }
  // symbol + side (trade) or period name; align 'center' around x, or 'left' starting at x
  function drawTitle(top, x, align) {
    const S = o.show; if (!S.title) return;
    if (o.kind === 'trade') {
      const sub = [data.side, S.date ? data.dateTxt : ''].filter(Boolean).join(' · ').toUpperCase();
      c.font = `700 64px ${BIG}`; const w1 = c.measureText(data.symbol || '').width; c.font = `600 30px ${TXT}`; const w2 = sub ? c.measureText(sub).width + 26 : 0;
      const ins = instrument(data.symbol), br = 46, bw = ins ? br * 2 + 22 : 0;
      const x0 = (align === 'left' ? x : x - (bw + w1 + w2) / 2) + bw;
      if (ins) drawBadge(c, ins, x0 - 22 - br, top - 23, br);
      text(c, data.symbol || '', x0, top, { fam: BIG, w: 700, size: 64, align: 'left' });
      if (sub) text(c, sub, x0 + w1 + 26, top - 4, { size: 30, w: 600, color: 'rgba(255,255,255,.62)', align: 'left', ls: 2 });
    } else {
      text(c, data.kindTxt || '', x, top - 62, { size: 28, w: 700, color: 'rgba(255,255,255,.6)', ls: 6, align });
      text(c, data.title || '', x, top + 10, { fam: BIG, w: 700, size: fit(c, data.title || '', align === 'left' ? 820 : W - 200, 66, BIG, 700), align });
    }
  }
  const hasChart = () => (o.kind === 'trade' && o.show.line && data.closes && data.closes.length > 3) || (o.kind === 'period' && o.show.bars && data.items && data.items.length);
  // price line with entry / exit tags (trade) or bars (period) inside the box x0, top, w, h
  function drawChart(tm, x0, chartTop, chartW, chartH) {
    const unit = o.unit;
    if (o.kind === 'trade') {
      const k = data.closes, lo = Math.min(...k), hi = Math.max(...k), n = k.length, pr = ease(seg(tm, 0.3, 2.6));
      const X = i => x0 + i / (n - 1) * chartW, Y = v => chartTop + (hi - v) / (hi - lo || 1) * chartH;
      c.globalAlpha = 0.95; c.strokeStyle = '#fff'; c.lineWidth = 4; c.lineJoin = 'round'; c.beginPath();
      const upto = Math.max(1, Math.floor(pr * (n - 1)));
      for (let i = 0; i <= upto; i++) i ? c.lineTo(X(i), Y(k[i])) : c.moveTo(X(i), Y(k[i]));
      c.stroke();
      const tag = (i, s) => { if (i <= upto && i >= 0) { c.globalAlpha = A(tm, 0.3 + i / n * 2.3, 0.6 + i / n * 2.3); pill(c, s, X(i), Y(k[i]) - 34, false); c.fillStyle = '#fff'; c.beginPath(); c.arc(X(i), Y(k[i]), 7, 0, 7); c.fill(); } };
      tag(data.iEntry, 'Entry'); tag(data.iExit, 'Exit');
      return;
    }
    const it = data.items, vs = it.map(x => val(x, unit)), mx = Math.max(1e-9, ...vs.map(v => Math.abs(fin(v) ? v : 0)));
    const hasNeg = vs.some(v => fin(v) && v < 0), zero = chartTop + (hasNeg ? chartH * 0.62 : chartH - 40), up = zero - chartTop - 50, dn = chartTop + chartH - zero - 30;
    const slot = chartW / it.length, bw = Math.min(110, slot * 0.5), step = Math.min(0.4, 2.6 / it.length);
    c.globalAlpha = A(tm, 0.4, 0.8); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x0, zero, chartW, 2);
    it.forEach((x, i) => {
      const v = vs[i], g = ease(seg(tm, 0.6 + i * step, 1.1 + i * step)), px = x0 + slot * i + slot / 2, pos = !fin(v) || v >= 0;
      const h = fin(v) ? (pos ? up : dn) * Math.abs(v) / mx * g : 0;
      c.globalAlpha = 1; c.fillStyle = pos ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.32)';
      c.beginPath(); if (c.roundRect) c.roundRect(px - bw / 2, pos ? zero - h : zero, bw, Math.max(h, 3), 8); else c.rect(px - bw / 2, pos ? zero - h : zero, bw, Math.max(h, 3)); c.fill();
      c.globalAlpha = A(tm, 0.9 + i * step, 1.3 + i * step);
      const vt = fmt(v, unit, true); text(c, vt, px, pos ? zero - h - 18 : zero + h + 40, { size: fit(c, vt, slot - 8, 28, TXT, 700), w: 700 });
      c.globalAlpha = A(tm, 0.4, 0.8); text(c, x.label, px, chartTop + chartH + 44, { size: fit(c, x.label, slot - 8, 24, TXT, 600, 3), w: 600, color: 'rgba(255,255,255,.55)', ls: 3 });
    });
  }
  // the result: big, white, counts up, one light sweep
  function drawNumber(tm, x, y, ns, align) {
    const total = o.kind === 'trade' ? unitVal(o.unit) ?? val(data, 'money') : unitVal(o.unit);
    const win = !fin(total) || total >= 0, col = o.color ? (win ? K.WIN : '#e4e8f1') : '#f4f4f6';
    const p = expo(seg(tm, 0.6, 2.4)), tx = fmt(fin(total) ? total * (p >= 1 ? 1 : p) : null, o.unit);
    c.globalAlpha = A(tm, 0.5, 0.9);
    c.save(); c.shadowColor = 'rgba(255,255,255,.35)'; c.shadowBlur = 40; text(c, tx, x, y, { fam: BIG, w: 700, size: ns, color: col, ls: -6, align }); c.restore();
    const sw = seg(tm, 3.0, 3.9);
    if (sw > 0 && sw < 1) { const sx = -300 + sw * (W + 600), g = c.createLinearGradient(sx - 140, 0, sx + 140, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.shadowBlur = 0; text(c, tx, x, y, { fam: BIG, w: 700, size: ns, color: g, ls: -6, align }); c.restore(); }
  }
  // the corner mark: always on, small and faint, cannot be hidden
  function corner() { text(c, '5ABIFX', W > H ? 56 : 60, W > H ? 64 : 76, { fam: BIG, size: 24, w: 700, ls: 6, color: 'rgba(255,255,255,.4)', align: 'left' }); }
  // footer: logo, KATANA, × name, optional photo and the MT5 synced tick (only when every trade came from the EA)
  function footer(tm, x, fy, align, noName) {
    c.globalAlpha = A(tm, 0.1, 0.6); // brand shows at first glance
    const lw2 = 60, brand = o.brand || 'KATANA', S = o.show;
    const hd = !noName && S.handle ? String(o.tag || data.handle || '').trim() : '';
    const av = hd && avatar && S.avatar !== false ? 52 : 0, tick = hd && S.synced && data.synced ? 40 : 0;
    const wOf = (s) => { c.font = `700 38px ${BIG}`; if ('letterSpacing' in c) c.letterSpacing = '4px'; const m = c.measureText(s).width; if ('letterSpacing' in c) c.letterSpacing = '0px'; return m; };
    const bwid = wOf(brand), hw = hd ? wOf(hd) + 64 + (av ? av + 14 : 0) : 0;
    const total = lw2 + 14 + bwid + hw + tick;
    const fx = align === 'left' ? x : x - total / 2;
    drawLogo(fx, fy - 30, lw2);
    text(c, brand, fx + lw2 + 14, fy, { fam: BIG, w: 700, size: 38, align: 'left', ls: 4 });
    let nx = fx + lw2 + 14 + bwid;
    if (hd) {
      text(c, '×', nx + 30, fy - 2, { size: 34, w: 500, color: 'rgba(255,255,255,.6)' }); nx += 60;
      if (av) {
        const r = av / 2, ay = fy - 13;
        c.save(); c.shadowBlur = 0; c.beginPath(); c.arc(nx + r, ay, r, 0, 7); c.clip();
        const aw = avatar.naturalWidth, ah = avatar.naturalHeight, s = Math.max(av / aw, av / ah);
        c.drawImage(avatar, nx + r - aw * s / 2, ay - ah * s / 2, aw * s, ah * s); c.restore();
        c.save(); c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; c.beginPath(); c.arc(nx + r, ay, r, 0, 7); c.stroke(); c.restore();
        nx += av + 14;
      }
      text(c, hd, nx, fy, { fam: BIG, size: 38, w: 700, align: 'left', ls: 4 }); nx += wOf(hd);
    }
    if (tick) syncedTick(nx + 26, fy - 13, 15);
    c.globalAlpha = 1; c.shadowBlur = 0;
  }
  // teal seal with a check: "these trades came straight from MT5, not typed in"
  function syncedTick(x, y, r) {
    c.save(); c.shadowBlur = 0;
    c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * 0.86 : r * 1.06; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath();
    c.fillStyle = K.WIN || '#26c6a0'; c.fill();
    c.strokeStyle = '#06110e'; c.lineWidth = r * 0.24; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x - r * 0.42, y + r * 0.02); c.lineTo(x - r * 0.1, y + r * 0.34); c.lineTo(x + r * 0.46, y - r * 0.3); c.stroke();
    c.restore();
  }

  function frame(tm) {
    if (SC !== 1) { c.setTransform(SC, 0, 0, SC, 0, 0); ac.setTransform(SC, 0, 0, SC, 0, 0); }
    drawArt(tm);
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 18;
    c.globalAlpha = A(tm, 0.1, 0.7); corner();
    if (o.kind === 'milestone') frameMilestone(tm);
    else if (W > H && o.layout === 'split') frameSplit(tm);
    else frameCenter(tm);
    c.globalAlpha = 1; c.shadowBlur = 0;
    if (SC !== 1) { c.setTransform(1, 0, 0, 1, 0, 0); ac.setTransform(1, 0, 0, 1, 0, 0); }
  }

  /* everything centred (story, post, wide) */
  function frameCenter(tm) {
    const S = o.show, wide = W > H, post = !wide && H < 1900, cx = W / 2;
    const top = wide ? 150 : post ? 170 : 250;
    c.globalAlpha = A(tm, 0.1, 0.7); drawTitle(top, cx, 'center');
    const chart = hasChart(), on = detailRows();
    // story keeps the receipt list; post and wide show the stats as an even grid of columns
    const grid = wide || post, perRow = !grid ? 1 : on.length <= (wide ? 5 : 4) ? on.length : Math.ceil(on.length / 2);
    const gridRows = grid && on.length ? Math.ceil(on.length / perRow) : 0, ROWH = 112;
    const statsH = !on.length ? 0 : grid ? (wide ? 50 : 60) + gridRows * ROWH : 90 + (on.length - 1) * 62 + 14;
    // footer position, and the lowest line content may reach without touching it
    const fy = H - (wide ? 110 : 170), limit = fy - 30 - (wide ? 40 : 50);
    // the result size; it shrinks only if nothing else is left to give
    const full = fmt(o.kind === 'trade' ? unitVal(o.unit) ?? val(data, 'money') : unitVal(o.unit), o.unit);
    let ns = fit(c, full, W - (wide ? 400 : 140), wide ? 190 : post ? 170 : 200, BIG, 700, -6);
    const quoteH = S.quote && o.quote ? 40 : 0, alt = altLine();
    const altH = alt ? 50 : 0, gapAfter = o.kind === 'period' ? (grid ? 110 : 130) : 90;
    const tail = () => quoteH + ns * 0.92 + altH + statsH + (alt ? 30 : 0);
    const chartTop = top + 80, chartDef = wide ? 300 : post ? 330 : 520;
    let chartH = chartDef;
    if (chart) {
      chartH = Math.max(150, Math.min(chartDef, limit - chartTop - gapAfter - tail()));
      const over = chartTop + chartH + gapAfter + tail() - limit;
      if (over > 0) ns = Math.max(90, ns - over / 0.92);
    } else {
      const over = top + 120 + tail() - limit;
      if (over > 0) ns = Math.max(90, ns - over / 0.92);
    }
    const chartW = Math.min(W - 160, wide ? 1200 : 900);
    if (chart) drawChart(tm, cx - chartW / 2, chartTop, chartW, chartH);
    let y = chart ? chartTop + chartH + gapAfter : Math.max(top + 120, Math.min(wide ? H * 0.42 : H * 0.44, limit - tail()));
    if (S.quote && o.quote) {
      c.globalAlpha = A(tm, 1.2, 1.9);
      const q = o.quote.toUpperCase();
      text(c, q, cx, y, { size: fit(c, q, W - 220, 26, TXT, 700, 5), w: 700, color: 'rgba(255,255,255,.75)', ls: 5 });
      y += 40;
    }
    y += ns * 0.92;
    drawNumber(tm, cx, y, ns, 'center');
    if (alt) { c.globalAlpha = A(tm, 2.2, 2.8); text(c, alt, cx, y + 62, { size: 36, w: 600, color: 'rgba(255,255,255,.8)' }); y += 50; }
    if (on.length && !grid) {
      let ry = y + 90; const lw = 360;
      on.forEach(([, l, v], i) => {
        c.globalAlpha = A(tm, 2.4 + i * 0.15, 2.9 + i * 0.15);
        text(c, l, cx - lw / 2 - 20, ry, { size: 38, w: 500, color: 'rgba(255,255,255,.6)', align: 'left' });
        text(c, v, cx + 20, ry, { size: 38, w: 700, align: 'left' });
        ry += 62;
      });
    } else if (on.length) {
      const colW = Math.min(wide ? 300 : 250, (W - 160) / perRow), top0 = y + (wide ? 50 : 60);
      on.forEach(([, l, v], i) => {
        const r = Math.floor(i / perRow), inRow = Math.min(perRow, on.length - r * perRow), k = i - r * perRow;
        const left = cx - inRow * colW / 2, px = left + colW * (k + 0.5), ty = top0 + r * ROWH;
        c.globalAlpha = A(tm, 2.4 + i * 0.15, 2.9 + i * 0.15);
        text(c, v, px, ty + 46, { size: fit(c, v, colW - 28, wide ? 42 : 40, TXT, 700), w: 700 });
        const lab = String(l).toUpperCase();
        text(c, lab, px, ty + 84, { size: fit(c, lab, colW - 28, 22, TXT, 600, 3), w: 600, color: 'rgba(255,255,255,.55)', ls: 3 });
        if (k > 0) { c.save(); c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(left + colW * k - 1, ty + 12, 2, 80); c.restore(); }
      });
    }
    footer(tm, cx, fy, 'center');
  }

  /* wide, split: words on the left, chart on the right, signature bottom-left */
  function frameSplit(tm) {
    const S = o.show, L = 110, top = 160, chart = hasChart(), on = detailRows();
    const colW = chart ? 860 : W - 2 * L;
    c.globalAlpha = A(tm, 0.1, 0.7); drawTitle(o.kind === 'trade' ? top : top + 40, L, 'left');
    let y = o.kind === 'trade' ? top + 90 : top + 130;
    if (S.quote && o.quote) {
      c.globalAlpha = A(tm, 1.2, 1.9); const q = o.quote.toUpperCase();
      text(c, q, L, y + 20, { size: fit(c, q, colW, 26, TXT, 700, 5), w: 700, color: 'rgba(255,255,255,.75)', ls: 5, align: 'left' }); y += 50;
    }
    const full = fmt(o.kind === 'trade' ? unitVal(o.unit) ?? val(data, 'money') : unitVal(o.unit), o.unit);
    const alt = altLine(), fy = H - 100, room = fy - 70 - y - (alt ? 54 : 0) - (on.length ? 40 + on.length * 56 : 0);
    const ns = Math.max(90, Math.min(fit(c, full, colW, 200, BIG, 700, -6), room / 0.92));
    y += ns * 0.92; drawNumber(tm, L - 6, y, ns, 'left');
    if (alt) { c.globalAlpha = A(tm, 2.2, 2.8); text(c, alt, L, y + 58, { size: 36, w: 600, color: 'rgba(255,255,255,.8)', align: 'left' }); y += 54; }
    let ry = y + 74;
    on.forEach(([, l, v], i) => {
      c.globalAlpha = A(tm, 2.4 + i * 0.15, 2.9 + i * 0.15);
      text(c, l, L, ry, { size: 34, w: 500, color: 'rgba(255,255,255,.6)', align: 'left' });
      text(c, v, L + 220, ry, { size: 34, w: 700, align: 'left' }); ry += 56;
    });
    if (chart) drawChart(tm, 1060, o.kind === 'trade' ? 210 : 230, 760, o.kind === 'trade' ? 560 : 520);
    footer(tm, L, fy, 'left');
  }

  /* milestone: a certificate plate built from the member's own record */
  function frameMilestone(tm) {
    const S = o.show, wide = W > H, post = !wide && H < 1900, cx = W / 2, m = data;
    const name = S.handle ? String(o.tag || m.handle || '').trim() : '';
    const pw = Math.min(W - (wide ? 360 : 110), 1100), statsOn = S.stats && m.stats && m.stats.length;
    const rows = [64, 92, S.heading ? 112 : 0, name ? 64 + 100 : 0, S.line && m.line ? 56 : 0, 190, statsOn ? 150 : 0, 92];
    const ph = rows.reduce((a, b) => a + b, 0), sc = Math.min(1, (H - (wide ? 290 : 420)) / ph);
    const fy = H - (wide ? 100 : post ? 120 : 170);
    const pTop = Math.max(wide ? 120 : 170, (fy - 60 - ph * sc) / 2 + (wide ? 20 : 30));
    const rise = 1 - A(tm, 0.15, 1.0);
    c.save(); c.translate(cx, pTop + 40 * rise); c.scale(sc, sc); c.translate(-cx, 0);
    const x0 = cx - pw / 2;
    // the plate: dark glass, hairline frame, orange top edge, gold stitch band
    c.globalAlpha = A(tm, 0.1, 0.8); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 60;
    c.beginPath(); if (c.roundRect) c.roundRect(x0, 0, pw, ph, 28); else c.rect(x0, 0, pw, ph);
    const gl = c.createLinearGradient(0, 0, 0, ph); gl.addColorStop(0, 'rgba(24,25,30,.80)'); gl.addColorStop(1, 'rgba(10,10,13,.86)');
    c.fillStyle = gl; c.fill(); c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 2; c.stroke();
    c.beginPath(); if (c.roundRect) c.roundRect(x0 + 16, 16, pw - 32, ph - 32, 18); else c.rect(x0 + 16, 16, pw - 32, ph - 32);
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.stroke();
    const or = c.createLinearGradient(x0, 0, x0 + pw, 0); or.addColorStop(0, 'rgba(255,90,31,0)'); or.addColorStop(0.5, '#ff5a1f'); or.addColorStop(1, 'rgba(255,90,31,0)');
    c.fillStyle = or; c.fillRect(x0 + 60, 0, (pw - 120) * A(tm, 0.4, 1.4), 3);
    stitch(x0 + 70, 64, pw - 140, tm);
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 14;
    let y = 64 + 70;
    c.globalAlpha = A(tm, 0.3, 0.9);
    const kick = '5ABI.FX JOURNAL · ' + (m.kicker || 'MILESTONE');
    c.font = `700 22px ${TXT}`; if ('letterSpacing' in c) c.letterSpacing = '6px'; const kw = c.measureText(kick).width; if ('letterSpacing' in c) c.letterSpacing = '0px';
    drawLogo(cx - (kw + 54) / 2, y - 32, 40);
    text(c, kick, cx - (kw + 54) / 2 + 54, y - 6, { size: 22, w: 700, ls: 6, color: 'rgba(255,255,255,.62)', align: 'left' });
    y += 22;
    if (S.heading) { c.globalAlpha = A(tm, 0.45, 1.05); y += 90; text(c, m.heading || '', cx, y, { fam: BIG, size: fit(c, m.heading || '', pw - 120, 76, BIG, 600, -1), w: 600, ls: -1 }); }
    if (name) {
      c.globalAlpha = A(tm, 0.6, 1.2); y += 64; text(c, 'THIS RECORD SHOWS THAT', cx, y, { size: 20, w: 700, ls: 6, color: 'rgba(255,255,255,.45)' });
      y += 92; text(c, name, cx, y, { fam: BIG, size: fit(c, name, pw - 160, 76, BIG, 700), w: 700 });
    }
    if (S.line && m.line) { c.globalAlpha = A(tm, 0.8, 1.4); y += 56; text(c, m.line.toUpperCase(), cx, y, { size: fit(c, m.line.toUpperCase(), pw - 120, 22, TXT, 700, 5), w: 700, ls: 5, color: 'rgba(255,255,255,.55)' }); }
    // the big number, chrome silver, counts up
    y += 170;
    const p = expo(seg(tm, 0.7, 2.5)), v = fin(m.big) ? m.big * (p >= 1 ? 1 : p) : null;
    const bt = m.bigUnit === 'count' ? String(Math.round(v || 0)) + (m.bigSuffix || '') : fmt(v, 'money').replace(/^\+/, m.bigPlus ? '+' : '');
    const bfull = m.bigUnit === 'count' ? String(m.big) + (m.bigSuffix || '') : fmt(m.big, 'money');
    const bs = fit(c, bfull, pw - 140, 170, BIG, 700, -4);
    const silver = c.createLinearGradient(0, y - bs * 0.8, 0, y); silver.addColorStop(0, '#ffffff'); silver.addColorStop(0.5, '#c9ced8'); silver.addColorStop(0.62, '#8e95a3'); silver.addColorStop(1, '#eef1f6');
    c.globalAlpha = A(tm, 0.6, 1.0); c.save(); c.shadowColor = 'rgba(255,255,255,.25)'; c.shadowBlur = 30; text(c, bt, cx, y, { fam: BIG, size: bs, w: 700, ls: -4, color: silver }); c.restore();
    const sw = seg(tm, 3.0, 3.9);
    if (sw > 0 && sw < 1) { const sx = x0 + sw * pw, g = c.createLinearGradient(sx - 120, 0, sx + 120, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.shadowBlur = 0; text(c, bt, cx, y, { fam: BIG, size: bs, w: 700, ls: -4, color: g }); c.restore(); }
    // three numbers with thin dividers
    if (statsOn) {
      const st = m.stats.slice(0, 3), cw = (pw - 120) / st.length, sy = y + 70;
      st.forEach(([l, val2], i) => {
        const px = x0 + 60 + cw * (i + 0.5);
        c.globalAlpha = A(tm, 2.2 + i * 0.15, 2.7 + i * 0.15);
        text(c, String(l).toUpperCase(), px, sy, { size: fit(c, String(l).toUpperCase(), cw - 30, 20, TXT, 700, 4), w: 700, ls: 4, color: 'rgba(255,255,255,.45)' });
        text(c, val2, px, sy + 50, { size: fit(c, String(val2), cw - 30, 36, TXT, 700), w: 700 });
        if (i) { c.save(); c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x0 + 60 + cw * i - 1, sy - 26, 2, 90); c.restore(); }
      });
      y += 150;
    }
    // how it was recorded
    c.globalAlpha = A(tm, 2.6, 3.2);
    const how = m.synced && S.synced ? 'SYNCED FROM MT5 BY THE JOURNAL EA' : 'RECORDED IN THE 5ABI.FX JOURNAL';
    c.font = `700 19px ${TXT}`; if ('letterSpacing' in c) c.letterSpacing = '5px'; const hw2 = c.measureText(how).width; if ('letterSpacing' in c) c.letterSpacing = '0px';
    const tickW = m.synced && S.synced ? 40 : 0, hx = cx - (hw2 + tickW) / 2;
    if (tickW) syncedTick(hx + 12, y + 40, 13);
    text(c, how, hx + tickW, y + 47, { size: 19, w: 700, ls: 5, color: 'rgba(255,255,255,.5)', align: 'left' });
    c.restore();
    if (S.quote && o.quote) {
      c.globalAlpha = A(tm, 1.2, 1.9); const q = o.quote.toUpperCase();
      text(c, q, cx, Math.min(fy - 90, pTop + ph * sc + 80), { size: fit(c, q, W - 220, 26, TXT, 700, 5), w: 700, color: 'rgba(255,255,255,.75)', ls: 5 });
    }
    footer(tm, cx, fy, 'center', true);
  }
  // a row of small gold diamonds, stitched in one by one (our Phulkari thread)
  function stitch(x, y, w, tm) {
    const n = Math.floor(w / 34), g = A(tm, 0.5, 1.8);
    c.save(); c.shadowBlur = 0;
    for (let i = 0; i < n; i++) {
      const k = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2); if (1 - k > g * 1.05) continue;
      const px = x + (i + 0.5) * w / n, s = i % 3 === 1 ? 7 : 4.5;
      c.globalAlpha = (0.25 + 0.55 * (1 - k)) * Math.min(1, g * 2); c.fillStyle = i % 3 === 1 ? '#e8b65a' : '#b88a3a';
      c.beginPath(); c.moveTo(px, y - s); c.lineTo(px + s, y); c.lineTo(px, y + s); c.lineTo(px - s, y); c.closePath(); c.fill();
    }
    c.restore();
  }
  const logo = new Image(); logo.src = (window.CineCardLogo || '/logo.png');
  function drawLogo(x, y, w) { if (logo.complete && logo.width) c.drawImage(logo, x, y, w, w * logo.height / logo.width); }

  function loop(now) { if (!t0) t0 = now; frame(frozen ?? ((now - t0) / 1000) % (Math.min(len(), 9) + 1)); raf = requestAnimationFrame(loop); }
  function play() { cancelAnimationFrame(raf); t0 = 0; if (media && media.play) { media.currentTime = 0; media.play().catch(() => {}); } raf = requestAnimationFrame(loop); }
  function setBackground(file) {
    if (media && media.pause) media.pause();
    if (media && media.src) URL.revokeObjectURL(media.src);
    media = null;
    if (!file) { play(); return Promise.resolve(); }
    const url = URL.createObjectURL(file);
    return new Promise((res, rej) => {
      if (file.type.startsWith('video/')) {
        const v = document.createElement('video'); Object.assign(v, { muted: true, loop: true, playsInline: true, src: url }); v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
        v.onloadeddata = () => { media = v; o.art = 'own'; play(); res(); }; v.onerror = () => rej(new Error('This video cannot be played in your browser. Try an MP4.'));
      } else {
        const im = new Image(); im.onload = () => { media = im; o.art = 'own'; play(); res(); }; im.onerror = () => rej(new Error('This picture cannot be opened. Try a JPG or PNG.')); im.src = url;
      }
    });
  }
  // a clip from a link (the Shuffle stock clips): straight from the source, or through `fallback` (same site) if the
  // source does not allow drawing it into a video
  function setBackgroundUrl(url, fallback) {
    if (media && media.pause) media.pause();
    if (media && media.src && media.src.startsWith('blob:')) URL.revokeObjectURL(media.src);
    media = null;
    const tryLoad = (src, cors) => new Promise((res, rej) => {
      const v = document.createElement('video'); Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto' }); v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      if (cors) v.crossOrigin = 'anonymous';
      v.onloadeddata = () => res(v); v.onerror = () => rej(new Error('This clip could not be loaded. Try Shuffle again.')); v.src = src;
    });
    return tryLoad(url, true).catch((e) => (fallback ? tryLoad(fallback, false) : Promise.reject(e)))
      .then((v) => { media = v; o.art = 'own'; play(); });
  }
  function format() { const l = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']; return window.MediaRecorder ? l.find(m => MediaRecorder.isTypeSupported(m)) || '' : null; }
  /* frame by frame through VideoOut (exact start, no lag, sharp MP4); the live recorder only where that is missing */
  function record(onProgress) {
    if (!(window.VideoOut && VideoOut.supported())) return recordLive(onProgress);
    cancelAnimationFrame(raf); raf = 0;
    if (media && media.pause) media.pause();
    const done = 5.5, posterT = o.poster ? 0.1 : 0;
    return VideoOut.render({ canvas, seconds: len(), fps: FPS, onProgress, draw: (t) => VideoOut.seek(media, t).then(() => frame(t < posterT ? done : t - posterT)) })
      .catch(() => null)
      .then((r) => { play(); return r || recordLive(onProgress); });
  }
  function recordLive(onProgress) {
    const mime = format();
    if (mime === null || !canvas.captureStream) return Promise.reject(new Error('This browser cannot record video. Try Chrome or Safari.'));
    const stream = canvas.captureStream(FPS), rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined), parts = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    return new Promise((res) => {
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); const type = rec.mimeType || mime || 'video/webm'; res({ blob: new Blob(parts, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' }); };
      play(); rec.start(250);
      const st = performance.now(), tick = () => { const p = (performance.now() - st) / 1000 / len(); if (onProgress) onProgress(clamp(p)); if (p >= 1) return rec.stop(); setTimeout(tick, 100); };
      tick();
    });
  }
  // hd: twice the size (2160 x 3840 for a story) so it stays sharp after Instagram / X shrink it
  function still(hd) {
    const keep = frozen; frozen = 5.5;
    if (hd) { SC = 2; size(); }
    frame(frozen);
    return new Promise(r => canvas.toBlob(b => { frozen = keep; if (SC !== 1) { SC = 1; size(); frame(frozen ?? 5.5); } r(b); }, 'image/png'));
  }
  function setAvatar(file) {
    if (avatar && avatar.src) URL.revokeObjectURL(avatar.src);
    avatar = null; if (!file) return Promise.resolve();
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => { avatar = im; res(); }; im.onerror = () => rej(new Error('This picture cannot be opened. Try a JPG or PNG.')); im.src = URL.createObjectURL(file); });
  }
  return {
    set(next) { const s0 = o.size; Object.assign(o, next || {}, next && next.show ? { show: Object.assign(o.show, next.show) } : {}); if (o.size !== s0) size(); },
    data(d, kind) { data = d; if (kind && kind !== o.kind) { o.kind = kind; o.show = Object.assign({}, DEFAULTS[kind]); } },
    get: () => o, setBackground, setBackgroundUrl, setAvatar, hasAvatar: () => !!avatar, play, record, still, freeze(s) { frozen = s; }, canRecord: () => format() !== null && !!canvas.captureStream,
  };
}

window.CineCard = { create, sizes: SIZES, grades: GRADES, arts: ARTS, fields: FIELDS, defaults: DEFAULTS, fmt, length: LEN };
})();
