/* Story overlay (admin preview): a transparent 1080x1920 PNG with a quote,
   the trade's real candles with entry/exit arrows, and the result, for laying
   over a photo in an Instagram story. No prices, SL or TP on purpose.
   Exposes window.StoryOverlay. */
(function () {
const W = 1080, H = 1920, X = 84;
const SERIF = '"DM Serif Display", Georgia, "Times New Roman", serif';
const SANS = 'Montserrat, "Hanken Grotesk", system-ui, sans-serif';
const INK = '#ffffff';

// each mood has several quotes: pick the one that fits the photo underneath
const STYLES = {
  scalper: { label: 'SCALPER', tag: 'SPEED IS AN EDGE', quotes: [
    ['Quick in,', 'quick out.'], ['Strike fast,', 'leave clean.'], ['No hesitation,', 'just execution.'], ['Small window,', 'big intent.'] ] },
  trend: { label: 'TREND', tag: 'STAY WITH THE MOVE', quotes: [
    ['Ride the', 'trend.'], ['Born to be', 'on top.'], ['Climb with', 'the market.'], ['Let winners', 'run.'] ] },
  counter: { label: 'COUNTER TREND', tag: 'STAY ABOVE THE NOISE', quotes: [
    ['Fade the', 'crowd.'], ['Stand where', 'others run.'], ['When they panic,', 'we price it.'], ['Against the', 'current.'] ] },
  swing: { label: 'SWING', tag: 'BUILT TO HOLD', quotes: [
    ['Patience', 'pays.'], ['Slow hands,', 'strong results.'], ['Hold the line,', 'trust the plan.'], ['Seasons, not', 'seconds.'] ] },
};
const LOSS = ['Took the loss,', 'stayed sharp.'];
const UP = '#26a69a', DOWN = '#ef5350', ENTRY = '#3d7bff', EXIT = '#ef5350';

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const sgn = (n) => (n < 0 ? '−' : '+');
function tsOf(s) { if (!s) return null; const v = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z'); return Number.isFinite(v) ? v : null; }
function minutesHeld(t) { const a = tsOf(t.open), b = tsOf(t.close); return a !== null && b !== null && b >= a ? Math.round((b - a) / 60000) : null; }
function held(t) {
  const m = minutesHeld(t); if (m === null) return '';
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}D ${h}H` : h ? `${h}H ${mm}M` : `${mm}M`;
}
// suggested style from how long the trade was held
function suggest(t) {
  const m = minutesHeld(t);
  if (m === null) return 'trend';
  if (m < 30) return 'scalper';
  if (m >= 1440) return 'swing';
  return 'trend';
}
function result(t, show) {
  if (show === 'r' && num(t.r) !== null) { const r = num(t.r); return sgn(r) + Math.abs(r).toFixed(1) + 'R'; }
  if (show === 'pips' && num(t.pips) !== null) { const p = num(t.pips); return sgn(p) + Math.abs(p).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' pips'; }
  const p = num(t.pct); if (p !== null) return sgn(p) + Math.abs(p).toFixed(2) + '%';
  const n = num(t.pnl); return n === null ? '' : sgn(n) + '$' + Math.abs(n).toFixed(2);
}
function partialsOf(t) { return Array.isArray(t.partials) ? t.partials.map((p) => ({ t: tsOf(p.time), price: num(p.price) })).filter((p) => p.t !== null && p.price !== null) : []; }
function isWin(t) { return (num(t.pnl) ?? num(t.r) ?? num(t.pct) ?? 0) >= 0; }

function txt(ctx, s, x, y, size, fam, o = {}) {
  ctx.font = `${o.italic ? 'italic ' : ''}${o.w || 400} ${size}px ${fam}`;
  ctx.fillStyle = o.color || INK; ctx.globalAlpha = o.alpha ?? 1;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = (o.ls || 0) + 'px';
  ctx.fillText(s, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
}
function fitSize(ctx, s, maxW, size, fam, italic) {
  let z = size;
  while (z > 40) { ctx.font = `${italic ? 'italic ' : ''}400 ${z}px ${fam}`; if (ctx.measureText(s).width <= maxW) break; z -= 6; }
  return z;
}
function rule(ctx, x, y, w, alpha) { ctx.globalAlpha = alpha; ctx.fillStyle = INK; ctx.fillRect(x, y, w, 2); ctx.globalAlpha = 1; }

// the trade's real candles (from MT5), no price axis; arrows mark entry and exits
function chart(ctx, t, x0, y0, x1, y1) {
  const k = (t.candles || []).map((c) => ({ t: c[0] * 1000, o: +c[1], h: +c[2], l: +c[3], c: +c[4] })).filter((c) => Number.isFinite(c.h));
  if (k.length < 5) return false;
  // trade prices are part of the range so arrows never leave the chart area
  const marks = [num(t.entry), num(t.exit), ...partialsOf(t).map((p) => p.price)].filter((v) => v !== null);
  const lo = Math.min(...k.map((c) => c.l), ...marks), hi = Math.max(...k.map((c) => c.h), ...marks), span = hi - lo || 1;
  const step = (x1 - x0) / k.length, bw = Math.max(2, step * 0.62);
  const X = (i) => x0 + step * (i + 0.5), Y = (v) => y1 - ((v - lo) / span) * (y1 - y0);
  const at = (ms) => { let best = 0; k.forEach((c, i) => { if (Math.abs(c.t - ms) < Math.abs(k[best].t - ms)) best = i; }); return best; };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
  k.forEach((c, i) => {
    const col = c.c >= c.o ? UP : DOWN; ctx.fillStyle = col;
    ctx.fillRect(X(i) - 1, Y(c.h), 2, Math.max(1, Y(c.l) - Y(c.h)));
    ctx.fillRect(X(i) - bw / 2, Y(Math.max(c.o, c.c)), bw, Math.max(2, Math.abs(Y(c.o) - Y(c.c))));
  });
  ctx.restore();
  const buy = String(t.side).toUpperCase() !== 'SELL';
  const entryT = tsOf(t.open), exitT = tsOf(t.close);
  if (entryT === null) return true;
  const ei = at(entryT), ey = num(t.entry) !== null ? Y(num(t.entry)) : Y(k[ei].o);
  const exits = partialsOf(t).map((p) => ({ i: at(p.t), y: Y(p.price) }));
  if (exitT !== null) exits.push({ i: at(exitT), y: num(t.exit) !== null ? Y(num(t.exit)) : Y(k[at(exitT)].c) });
  // dotted links entry -> each exit
  ctx.save(); ctx.setLineDash([6, 8]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(61,123,255,0.85)';
  exits.forEach((e) => { ctx.beginPath(); ctx.moveTo(X(ei), ey); ctx.lineTo(X(e.i), e.y); ctx.stroke(); });
  ctx.restore();
  const arrow = (x, y, up, col) => {
    const s = 22, dy = up ? s * 1.6 : -s * 1.6, by = y + dy;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
    ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
    if (up) { ctx.moveTo(x, by - s); ctx.lineTo(x + s, by); ctx.lineTo(x + s * 0.4, by); ctx.lineTo(x + s * 0.4, by + s); ctx.lineTo(x - s * 0.4, by + s); ctx.lineTo(x - s * 0.4, by); ctx.lineTo(x - s, by); }
    else { ctx.moveTo(x, by + s); ctx.lineTo(x + s, by); ctx.lineTo(x + s * 0.4, by); ctx.lineTo(x + s * 0.4, by - s); ctx.lineTo(x - s * 0.4, by - s); ctx.lineTo(x - s * 0.4, by); ctx.lineTo(x - s, by); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  };
  // buy: entry arrow points up from below; exits point down from above (mirrored for sells)
  arrow(X(ei), ey, buy, ENTRY);
  exits.forEach((e) => arrow(X(e.i), e.y, !buy, EXIT));
  return true;
}

function render(cv, t, opts) {
  const o = Object.assign({ style: suggest(t), quote: 0, show: 'pct', ad: true, scrim: false, candles: true, photo: null }, opts || {});
  const st = STYLES[o.style] || STYLES.trend, win = isWin(t);
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (o.photo) { // optional photo baked in (cover fit)
    const sc = Math.max(W / o.photo.width, H / o.photo.height), pw = o.photo.width * sc, ph = o.photo.height * sc;
    ctx.drawImage(o.photo, (W - pw) / 2, (H - ph) / 2, pw, ph);
  }

  if (o.scrim) {
    let g = ctx.createLinearGradient(0, 0, 0, 820); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 820);
    g = ctx.createLinearGradient(0, 1380, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g; ctx.fillRect(0, 1380, W, H - 1380);
  }
  // soft shadow keeps white text readable on bright photos
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;

  // top: mindset line + two-line headline + trade line
  txt(ctx, `THE ${st.label} MINDSET`, X, 210, 26, SANS, { w: 600, ls: 11, alpha: 0.8 });
  const q = win ? st.quotes[((o.quote % st.quotes.length) + st.quotes.length) % st.quotes.length] : LOSS;
  const l1 = q[0], l2 = q[1];
  txt(ctx, l1, X, 350, fitSize(ctx, l1, W - 2 * X, 112, SERIF), SERIF);
  txt(ctx, l2, X - 6, 530, fitSize(ctx, l2, W - 2 * X, 196, SERIF, true), SERIF, { italic: true });
  rule(ctx, X, 594, 70, 0.85);
  const line = [t.symbol, t.side, held(t) && `HELD ${held(t)}`].filter(Boolean).join('  ·  ');
  txt(ctx, line, X + 96, 604, 26, SANS, { w: 600, ls: 9, alpha: 0.9 });

  if (o.candles) { ctx.shadowColor = 'transparent'; chart(ctx, t, X, 760, W - X, 1330); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; }

  // bottom right: the result
  const res = result(t, o.show);
  if (res) {
    txt(ctx, win ? 'RESULT' : 'RESULT · RISK CONTROLLED', W - X, 1468, 24, SANS, { w: 600, ls: 10, align: 'right', alpha: 0.75 });
    txt(ctx, res, W - X, 1640, fitSize(ctx, res, W - 2 * X, 190, SERIF, true), SERIF, { italic: true, align: 'right' });
  }

  // footer: handle left, mood line right, quiet ad underneath
  rule(ctx, X, 1724, W - 2 * X, 0.4);
  txt(ctx, t.handle || '@5abi.fx', X, 1786, 28, SANS, { w: 500, ls: 6, alpha: 0.9 });
  txt(ctx, st.tag, W - X, 1786, 22, SANS, { w: 600, ls: 9, align: 'right', alpha: 0.75 });
  if (o.ad) txt(ctx, 'RISK MANAGED BY KATANA  ·  5ABI.FX', W / 2, 1852, 19, SANS, { w: 600, ls: 8, align: 'center', alpha: 0.55 });

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

window.StoryOverlay = { render, suggest, STYLES };
})();
