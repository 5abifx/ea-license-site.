/* Story overlay (admin preview): a transparent 1080x1920 PNG with the trade's
   flex text, for laying over a photo or chart in an Instagram story.
   No entry, SL or TP on purpose. Exposes window.StoryOverlay. */
(function () {
const W = 1080, H = 1920, X = 84;
const SERIF = '"DM Serif Display", Georgia, "Times New Roman", serif';
const SANS = 'Montserrat, "Hanken Grotesk", system-ui, sans-serif';
const INK = '#ffffff';

const STYLES = {
  scalper: { label: 'SCALPER', l1: 'Quick in,', l2: 'quick out.', tag: 'SPEED IS AN EDGE' },
  trend:   { label: 'TREND', l1: 'Ride the', l2: 'trend.', tag: 'STAY WITH THE MOVE' },
  counter: { label: 'COUNTER TREND', l1: 'Fade the', l2: 'crowd.', tag: 'STAY ABOVE THE NOISE' },
  swing:   { label: 'SWING', l1: 'Patience', l2: 'pays.', tag: 'BUILT TO HOLD' },
};
const LOSS = { l1: 'Took the loss,', l2: 'stayed sharp.' };

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

function render(cv, t, opts) {
  const o = Object.assign({ style: suggest(t), show: 'pct', ad: true, scrim: false }, opts || {});
  const st = STYLES[o.style] || STYLES.trend, win = isWin(t);
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);

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
  const l1 = win ? st.l1 : LOSS.l1, l2 = win ? st.l2 : LOSS.l2;
  txt(ctx, l1, X, 350, fitSize(ctx, l1, W - 2 * X, 112, SERIF), SERIF);
  txt(ctx, l2, X - 6, 530, fitSize(ctx, l2, W - 2 * X, 196, SERIF, true), SERIF, { italic: true });
  rule(ctx, X, 594, 70, 0.85);
  const line = [t.symbol, t.side, held(t) && `HELD ${held(t)}`].filter(Boolean).join('  ·  ');
  txt(ctx, line, X + 96, 604, 26, SANS, { w: 600, ls: 9, alpha: 0.9 });

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
