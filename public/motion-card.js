/* Motion share card: a short 9:16 video of a trade result (big number counting up over moving art).
   Everything is drawn on a canvas in the browser and recorded with MediaRecorder, so nothing is uploaded:
   a member's own background photo or clip stays on their device.
   Needs public/cards.js first (uses TradeCards.kit). Exposes window.MotionCard. */
(function () {
const K = window.TradeCards.kit, F = K.fmt;
const { W, H, PAD, D, M, INK, SOFT, DIM, FAINT, ORANGE, WIN, LOSS, T, fitSize } = K;
const LEN = 7, FPS = 30;
const SIZES = { story: 'Story 9:16', post: 'Post 4:5' };
const SCENES0 = { replay: 'Trade replay', ember: 'Ember glow', candles: 'Trade candles', bars: 'Volume bars', own: 'My background' };
const RLEN = 10;   // the replay plays a little longer than the other cards

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = x => 1 - Math.pow(1 - clamp(x), 4);
const expo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const tsOf = s => { if (!s) return null; const v = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z'); return Number.isFinite(v) ? v : null; };

/* candles around the trade for the replay, on a timeframe that suits how long the trade lasted:
   the biggest of M1, M5, M15, H1, H4, D1 that still gives the trade at least 4 candles
   (a 3-minute scalp plays on M1, a 1-hour trade on M15, a 6-hour trade on H1).
   Each big candle keeps the small candles it was made from, so the forming candle moves the way price really moved. */
const TFS = [[60, 'M1'], [300, 'M5'], [900, 'M15'], [3600, 'H1'], [14400, 'H4'], [86400, 'D1']];
function replayOf(t) {
  const raw = (t.candles || []).map(x => ({ t: x[0] * 1000, o: x[1], h: x[2], l: x[3], c: x[4] }));
  const e = F.num(t.entry), x = F.num(t.exit), op = tsOf(t.open), cl = tsOf(t.close);
  if (raw.length < 3 || e === null || x === null || op === null || cl === null) return null;
  let base = Infinity;   // the saved candles' own timeframe, in seconds
  for (let i = 1; i < raw.length; i++) { const d = (raw[i].t - raw[i - 1].t) / 1000; if (d > 0 && d < base) base = d; }
  const held = Math.max(0, (cl - op) / 1000), usable = TFS.filter(([sec]) => sec >= base);
  const pick = usable.filter(([sec]) => held / sec >= 4).pop() || usable[0] || [base, ''];
  const tf = pick[0] * 1000;
  // build the bigger candles, keeping the small ones inside each
  let ks = [];
  raw.forEach(k => {
    const at = Math.floor(k.t / tf) * tf, last = ks[ks.length - 1];
    if (last && last.t === at) { last.h = Math.max(last.h, k.h); last.l = Math.min(last.l, k.l); last.c = k.c; last.sub.push(k); }
    else ks.push({ t: at, o: k.o, h: k.h, l: k.l, c: k.c, sub: [k] });
  });
  const near = ms => { let b = 0; ks.forEach((k, i) => { if (Math.abs(k.t + tf / 2 - ms) < Math.abs(ks[b].t + tf / 2 - ms)) b = i; }); return b; };
  const io = near(op), ic = Math.max(io, near(cl));
  const a = Math.max(0, io - 14), b = Math.min(ks.length - 1, ic + 5);
  ks = ks.slice(a, b + 1);
  let ia = io - a, ib = ic - a;
  const tfName = pick[1];
  const sl = F.num(t.sl), tp = F.num(t.tp), buy = t.side !== 'SELL';
  const prices = ks.flatMap(k => [k.h, k.l]).concat([e, x, sl, tp].filter(v => v !== null));
  let lo = Math.min(...prices), hi = Math.max(...prices); const pad = ((hi - lo) || 1) * 0.1; lo -= pad; hi += pad;
  return { ks, ia, ib, e, x, sl: sl !== null && (buy ? sl < e : sl > e) ? sl : null, tp, lo, hi, buy, tfName };
}

/* the value shown, as a number we can count up, and its text at any point of the count */
function valueOf(t, mode) {
  const pick = { money: [F.num(t.pnl), F.money], pct: [F.num(t.pct), F.pctTxt], r: [F.num(t.r), F.rTxt] };
  let [v, f] = pick[mode] || pick.money;
  if (v === null) [v, f] = pick.money;
  if (v === null) return { v: 0, f: () => '—' };
  return { v, f };
}
function subLine(t, mode) {
  const all = { money: F.money(F.num(t.pnl)), pct: F.pctTxt(F.num(t.pct)), r: F.rTxt(F.num(t.r)) };
  const shown = all[mode] ? mode : 'money';
  return ['money', 'pct', 'r'].filter(k => k !== shown).map(k => all[k]).filter(Boolean).join('  ·  ');
}
function candlesOf(t) {
  let k = (t.candles || []).map(x => ({ t: x[0] * 1000, o: x[1], h: x[2], l: x[3], c: x[4] }));
  if (k.length > 90) {
    const n = Math.ceil(k.length / 70), m = [];
    for (let i = 0; i < k.length; i += n) { const g = k.slice(i, i + n); m.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map(x => x.h)), l: Math.min(...g.map(x => x.l)), c: g[g.length - 1].c }); }
    k = m;
  }
  return k;
}

function create(canvas, trade, opts) {
  // story 9:16 (1080x1920) or feed post 4:5 (1080x1350)
  let H = opts && opts.size === 'post' ? 1350 : K.H;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const o = Object.assign({ mode: 'money', scene: 'ember', rm: true, dim: 0.55 }, opts || {});
  const kc = candlesOf(trade);
  let media = null, raf = 0, t0 = 0, frozen = null;
  const len = () => (o.scene === 'replay' ? RLEN : LEN);

  /* the static glow is drawn once and then drifted, so each frame stays cheap on phones */
  const glow = document.createElement('canvas'); glow.width = W; glow.height = H;
  K.bg(glow.getContext('2d'), 1.25);
  const sparks = Array.from({ length: 70 }, (_, i) => ({ x: (i * 397) % W, y: (i * 911) % H, s: 0.4 + ((i * 37) % 10) / 10, r: 1 + (i % 4) }));

  function sceneEmber(tm) {
    const z = 1.06 + 0.05 * Math.sin(tm / LEN * Math.PI * 2), dx = 30 * Math.sin(tm * 0.6);
    c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2 + dx, H / 2); c.scale(z, z); c.drawImage(glow, -W / 2, -H / 2);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6 + 0.3 * Math.sin(tm * 1.3); c.translate(0, 40 * Math.sin(tm * 0.8));
    c.drawImage(glow, -W / 2, -H / 2); c.drawImage(glow, -W / 2, -H / 2); c.restore();
    c.globalCompositeOperation = 'lighter';
    sparks.forEach(p => {
      const y = (p.y - tm * 90 * p.s + H * 4) % H, a = 0.15 + 0.35 * Math.sin(tm * 2 + p.x);
      c.fillStyle = `rgba(255,120,60,${clamp(a).toFixed(2)})`; c.beginPath(); c.arc(p.x + 12 * Math.sin(tm + p.y), y, p.r, 0, 7); c.fill();
    });
    c.globalCompositeOperation = 'source-over';
  }
  function sceneCandles(tm) {
    if (kc.length < 5) return sceneEmber(tm);
    c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
    const lo = Math.min(...kc.map(k => k.l)), hi = Math.max(...kc.map(k => k.h)), n = kc.length;
    const top = 260, h = H - 520, cw = (W + 200) / n, pan = -100 + 60 * Math.sin(tm / LEN * Math.PI);
    const y = p => top + (hi - p) / (hi - lo || 1) * h;
    const shown = Math.floor(n * ease(tm / 3.2));
    c.globalAlpha = 0.5;
    for (let i = 0; i < shown; i++) {
      const k = kc[i], x = pan + i * cw + cw / 2, up = k.c >= k.o;
      c.fillStyle = c.strokeStyle = up ? WIN : LOSS; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y(k.h)); c.lineTo(x, y(k.l)); c.stroke();
      const b = Math.max(2, Math.abs(y(k.o) - y(k.c))); c.fillRect(x - cw * 0.32, Math.min(y(k.o), y(k.c)), cw * 0.64, b);
    }
    c.globalAlpha = 1;
    const en = F.num(trade.entry), ex = F.num(trade.exit);
    [[en, ORANGE], [ex, INK]].forEach(([p, col]) => { if (p === null || p < lo || p > hi) return;
      c.strokeStyle = col; c.globalAlpha = 0.35 * seg(tm, 1, 2); c.setLineDash([10, 14]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, y(p)); c.lineTo(W, y(p)); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; });
  }
  function sceneBars(tm) {
    c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.5; c.drawImage(glow, 0, 0); c.globalAlpha = 1;
    const n = 36, bh = H / n, col = F.isWin(trade) ? '47,211,166' : '255,90,100';
    for (let i = 0; i < n; i++) {
      const base = 0.25 + 0.75 * Math.pow(Math.sin(i * 0.37 + 1.3) * 0.5 + 0.5, 2) * (Math.sin(i * 1.7) * 0.25 + 0.75);
      const w = W * 0.95 * base * (0.75 + 0.25 * Math.sin(tm * 2.2 + i * 0.6)) * ease(tm / 1.6 - i * 0.01);
      const g = c.createLinearGradient(W, 0, W - w, 0);
      g.addColorStop(0, `rgba(${col},.42)`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(W - w, i * bh + 3, w, bh - 6);
    }
  }
  function sceneOwn(tm) {
    c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
    if (!media) return sceneEmber(tm);
    const mw = media.videoWidth || media.naturalWidth || media.width, mh = media.videoHeight || media.naturalHeight || media.height;
    if (!mw || !mh) return;
    const z = media.tagName === 'VIDEO' ? 1 : 1.04 + 0.08 * (tm / LEN); // slow zoom on photos
    const s = Math.max(W / mw, H / mh) * z;
    c.drawImage(media, (W - mw * s) / 2, (H - mh * s) / 2, mw * s, mh * s);
  }
  /* ---------- trade replay: the trade plays out candle by candle, from the entry to the exit ---------- */
  const RP = replayOf(trade);
  const tag = (txt, x, y, col, align) => {   // small boxed label
    c.font = `500 22px ${M}`; const tw = c.measureText(txt).width + 26, bx = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
    c.fillStyle = 'rgba(5,5,7,.88)'; c.fillRect(bx, y - 19, tw, 38);
    c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(bx, y - 19, tw, 38);
    T(c, txt, bx + tw / 2, y + 8, { fam: M, size: 22, color: col, align: 'center', w: 500 });
  };
  const dot = (x, y, col, r, glow) => { c.fillStyle = col; c.globalAlpha *= 0.3; c.beginPath(); c.arc(x, y, r * glow, 0, 7); c.fill(); c.globalAlpha /= 0.3; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  function frameReplay(tm) {
    const R = RP, win = F.isWin(trade), col = win ? WIN : LOSS, val = valueOf(trade, o.mode);
    const st = o.rstyle || 'candles', hide = !!o.hide, mini = st === 'minimal', term = st === 'terminal', lineSt = st === 'line' || mini;
    const post = H < 1500, x0 = 60, x1 = W - 60, gut = mini ? 0 : 210;
    const y0 = mini ? Math.round(H * 0.47) : post ? 300 : 340, y1 = mini ? Math.round(H * (post ? 0.64 : 0.62)) : Math.round(H * 0.6);
    const DF = term ? M : D;   // the terminal style uses the mono font for the big number too
    // background: dark with a soft glow, or the member's own photo / clip behind the chart
    c.fillStyle = term ? '#020403' : '#050507'; c.fillRect(0, 0, W, H);
    if (o.rphoto && media) { sceneOwn(tm); c.fillStyle = `rgba(5,5,7,${(0.45 + o.dim * 0.45).toFixed(2)})`; c.fillRect(0, 0, W, H); }
    else if (!term) { c.globalAlpha = 0.35; c.drawImage(glow, 30 * Math.sin(tm * 0.4), 0); c.globalAlpha = 1; }
    if (term) {   // scan lines
      c.fillStyle = 'rgba(47,211,166,.035)'; for (let yy = 0; yy < H; yy += 6) c.fillRect(0, yy, W, 2);
    }
    // top: brand, handle, what was traded
    c.globalAlpha = ease(seg(tm, 0, 0.6));
    K.brand(c, PAD, 140);
    const hd = trade.handle || '5abifx.com';
    T(c, hd, W - PAD, 153, { fam: M, size: fitSize(c, hd, 420, 26, M, 400, 2), color: SOFT, align: 'right', ls: 2 });
    const top = [trade.symbol, trade.side, R && R.tfName, F.dayTxt(trade.close)].filter(Boolean).join('  ·  ');
    const ty = mini ? Math.round(H * (post ? 0.2 : 0.24)) : y0 - 60;
    if (term) {
      c.strokeStyle = 'rgba(47,211,166,.35)'; c.lineWidth = 2; c.strokeRect(PAD - 20, ty - 46, W - 2 * PAD + 40, 64);
      const lots = trade.lots ? `${trade.lots} LOT` : '';
      T(c, ['■ ' + (trade.symbol || ''), trade.side, lots, R && R.tfName].filter(Boolean).join('   '), PAD, ty, { fam: M, size: 28, color: WIN, ls: 3, w: 500 });
    } else T(c, top, mini ? W / 2 : PAD, ty, { fam: M, size: fitSize(c, top, W - 2 * PAD, 30, M, 400, 6), color: SOFT, ls: 6, align: mini ? 'center' : 'left' });
    c.globalAlpha = 1;
    // the replay clock: candles before the entry, the entry, the trade candle by candle, the exit
    const run = seg(tm, 2.0, 7.0), IN = 1.5, OUT = 7.0;
    let price = R ? R.e : F.num(trade.entry) ?? 0;
    if (R) {
      const { ks, ia, ib, e, x, sl, tp, lo, hi } = R, cw = (x1 - gut - x0) / ks.length;
      const X = i => x0 + (i + 0.5) * cw, Y = v => y0 + (hi - v) / (hi - lo) * (y1 - y0);
      if (!mini) {
        c.strokeStyle = term ? 'rgba(47,211,166,.10)' : 'rgba(255,255,255,.05)'; c.lineWidth = 1;
        for (let i = 0; i <= 5; i++) { const gy = y0 + (y1 - y0) * i / 5; c.beginPath(); c.moveTo(x0, gy); c.lineTo(x1, gy); c.stroke(); }
        if (term) for (let i = 0; i <= 8; i++) { const gx = x0 + (x1 - gut - x0) * i / 8; c.beginPath(); c.moveTo(gx, y0); c.lineTo(gx, y1); c.stroke(); }
      }
      const nTrade = ib - ia + 1, pos = run * nTrade, full = Math.floor(pos), part = pos - full;
      const xa = X(ia) - cw / 2, xNow = tm < OUT ? X(ia + Math.min(full, nTrade - 1)) + cw * (part - 0.5) : X(ib) + cw / 2;
      // risk and target zones grow with the trade
      const za = seg(tm, IN, IN + 0.5);
      if (za > 0 && !mini) {
        c.globalAlpha = za;
        if (tp !== null) { c.fillStyle = 'rgba(47,211,166,.10)'; c.fillRect(xa, Math.min(Y(e), Y(tp)), Math.max(0, xNow - xa), Math.abs(Y(tp) - Y(e))); }
        if (sl !== null) { c.fillStyle = 'rgba(255,90,100,.10)'; c.fillRect(xa, Math.min(Y(e), Y(sl)), Math.max(0, xNow - xa), Math.abs(Y(sl) - Y(e))); }
        c.globalAlpha = 1;
      }
      const pts = [], after = [];
      const drawK = (k, i, alpha) => {
        if (lineSt) { (alpha < 0.4 ? after : pts).push([X(i), Y(k.c)]); return; }
        const up = k.c >= k.o, cx = X(i), kc0 = up ? WIN : LOSS;
        c.globalAlpha = alpha; c.strokeStyle = c.fillStyle = kc0; c.lineWidth = Math.max(1.5, Math.min(3, cw * 0.14));
        c.beginPath(); c.moveTo(cx, Y(k.h)); c.lineTo(cx, Y(k.l)); c.stroke();
        const bt = Y(Math.max(k.o, k.c)), bb = Y(Math.min(k.o, k.c));
        c.fillRect(cx - cw * 0.32, bt, cw * 0.64, Math.max(3, bb - bt)); c.globalAlpha = 1;
      };
      // before the entry: they slide in quickly, a little dim
      const pre = Math.floor(ia * ease(seg(tm, 0.2, 1.3)));
      for (let i = 0; i < pre; i++) drawK(ks[i], i, 0.55);
      // the trade
      if (tm >= 2.0) {
        for (let j = 0; j < Math.min(full, nTrade); j++) drawK(ks[ia + j], ia + j, 1);
        if (full < nTrade) {   // the candle that is forming right now
          const k = ks[ia + full], sub = k.sub || [k], m = sub.length * part, j = Math.min(sub.length - 1, Math.floor(m)), done = sub.slice(0, j), now = sub[j];
          const cur = lerp(now.o, now.c, m - j);   // price inside the small candle that is forming
          const hh = Math.max(k.o, cur, ...done.map(q => q.h)), ll = Math.min(k.o, cur, ...done.map(q => q.l));
          drawK({ o: k.o, c: cur, h: hh, l: ll }, ia + full, 1);
          price = cur;
        } else price = ks[ib].c;
        if (full === 0 && part < 0.2) price = lerp(e, price, part / 0.2);
      }
      if (tm >= OUT) price = lerp(price, x, ease(seg(tm, OUT, OUT + 0.3)));
      // after the exit: the market kept going, shown faint
      const post0 = Math.floor((ks.length - 1 - ib) * ease(seg(tm, OUT + 0.4, OUT + 1.4)));
      for (let i = 1; i <= post0; i++) drawK(ks[ib + i], ib + i, 0.3);
      if (lineSt && pts.length) {
        if (tm >= 2.0 && tm < OUT + 0.3) pts.push([xNow, Y(price)]);
        if (tm >= OUT) pts.push([X(ib), Y(x)]);
        const lc = tm >= 2 ? col : INK, g = c.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, (tm >= 2 ? col : '#ffffff') + '33'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
        c.lineTo(pts[pts.length - 1][0], y1); c.lineTo(pts[0][0], y1); c.closePath(); c.fillStyle = g; c.fill();
        c.save(); c.shadowColor = lc; c.shadowBlur = 24; c.strokeStyle = lc; c.lineWidth = mini ? 4 : 5; c.lineJoin = 'round';
        c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); c.restore();
        if (after.length) { c.globalAlpha = 0.3; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(X(ib), Y(x)); after.forEach(([px, py]) => c.lineTo(px, py)); c.stroke(); c.globalAlpha = 1; }
      }
      // stop, target and entry lines from the entry to the right, tags in the gutter
      const pv = v => (hide ? '' : ' ' + v);
      const lines = mini ? [] : [[tp, 'TARGET' + pv(trade.tp), WIN], [sl, 'STOP' + pv(trade.sl), LOSS], [e, 'ENTRY' + pv(trade.entry), INK]].filter(z => z[0] !== null);
      c.globalAlpha = za;
      lines.forEach(([v, , lc]) => { c.setLineDash([6, 8]); c.strokeStyle = lc; c.globalAlpha = 0.55 * za; c.lineWidth = 2;
        c.beginPath(); c.moveTo(xa, Y(v)); c.lineTo(x1 - gut + 10, Y(v)); c.stroke(); c.setLineDash([]); });
      c.globalAlpha = za;
      const tags = lines.map(z => ({ z, y: Y(z[0]) })).sort((p, q) => p.y - q.y);
      for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 44) tags[i].y = tags[i - 1].y + 44;
      tags.forEach(({ z: [, l, lc], y }) => tag(l, x1, y, lc, 'right'));
      c.globalAlpha = 1;
      // the entry: a pulse and what was done
      if (tm >= IN) {
        const pa = seg(tm, IN, IN + 0.6), ex = X(ia), ey = Y(e);
        c.strokeStyle = INK; c.globalAlpha = 1 - pa; c.lineWidth = 3; c.beginPath(); c.arc(ex, ey, 10 + 60 * pa, 0, 7); c.stroke(); c.globalAlpha = 1;
        dot(ex, ey, INK, 8, 2.4);
        c.globalAlpha = ease(seg(tm, IN, IN + 0.4)) * (1 - seg(tm, OUT - 0.4, OUT)) * (mini ? 0 : 1);
        tag(`${trade.side || 'ENTRY'}${pv(trade.entry)}`, Math.max(x0 + 10, ex - 90), ey + (R.buy ? 56 : -56), INK, 'left');
        c.globalAlpha = 1;
      }
      // live price line while the trade runs
      if (tm >= 2.0 && tm < OUT + 0.3 && !mini) {
        const py = Y(price), lc = (R.buy ? price >= e : price <= e) ? WIN : LOSS;
        c.globalAlpha = 0.7; c.strokeStyle = lc; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0, py); c.lineTo(x1 - gut + 10, py); c.stroke(); c.globalAlpha = 1;
        dot(xNow, py, lc, 6, 2.2);
      }
      // the exit: where it was booked
      if (tm >= OUT) {
        const pa = seg(tm, OUT, OUT + 0.7), ex = X(ib), ey = Y(x);
        c.strokeStyle = col; c.globalAlpha = 1 - pa; c.lineWidth = 4; c.beginPath(); c.arc(ex, ey, 12 + 90 * pa, 0, 7); c.stroke(); c.globalAlpha = 1;
        dot(ex, ey, col, 10, 2.6);
        c.globalAlpha = ease(seg(tm, OUT + 0.1, OUT + 0.5));
        if (!mini) tag(`${win ? 'BOOKED' : 'CLOSED'}${pv(trade.exit)}`, Math.min(x1 - gut - 10, Math.max(x0 + 10, ex)), ey + (ey > (y0 + y1) / 2 ? -58 : 58), col, 'center');
        c.globalAlpha = 1;
      }
    } else {
      // no candles saved: a simple line from the entry to the exit
      const p = ease(run), yy = (y0 + y1) / 2, xa = x0 + 40, xb = x1 - gut;
      c.globalAlpha = ease(seg(tm, IN, IN + 0.4)); c.strokeStyle = col; c.lineWidth = 4;
      c.beginPath(); c.moveTo(xa, yy + 120); c.lineTo(lerp(xa, xb, p), yy + 120 - 240 * p); c.stroke();
      dot(xa, yy + 120, INK, 8, 2.4); if (p >= 1) dot(xb, yy - 120, col, 10, 2.6); c.globalAlpha = 1;
      price = null;
    }
    // the number: live P&L while it runs, then the result
    const e0 = R ? R.e : null, x0p = R ? R.x : null;
    let live = val.v * ease(run);
    if (R && price !== null && x0p !== e0) live = val.v * clamp((price - e0) / (x0p - e0), -3, 3);
    if (tm < 2.0) live = 0;
    if (tm >= OUT + 0.3) live = val.v;
    const ny = mini ? Math.round(H * (post ? 0.4 : 0.4)) : Math.round(H * (post ? 0.745 : 0.715)), full = val.f(val.v);
    const size = fitSize(c, full, W - 2 * PAD, mini ? (post ? 210 : 240) : post ? 170 : 200, DF, 300, term ? -2 : -6);
    const ncol = tm >= OUT ? col : live > 0 ? WIN : live < 0 ? LOSS : INK;
    c.globalAlpha = ease(seg(tm, 0.6, 1.2));
    const clockTxt = (() => { const a = tsOf(trade.open), b = tsOf(trade.close); if (a === null || b === null || b < a) return ''; const sec = Math.round((b - a) / 1000 * (tm >= OUT ? 1 : run)); return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(v => String(v).padStart(2, '0')).join(':'); })();
    const lab = tm >= OUT ? (win ? 'RESULT' : 'RESULT · RISK KEPT') : term && clockTxt ? `LIVE P&L  ·  IN TRADE ${clockTxt}` : 'LIVE P&L';
    T(c, lab, W / 2, ny - size * 0.82, { fam: M, size: 22, color: DIM, align: 'center', ls: 6 });
    const txt = val.f(live);
    c.save(); c.shadowColor = ncol; c.shadowBlur = tm >= OUT ? 40 + 30 * Math.sin(tm * 2.4) : 18;
    T(c, txt, W / 2, ny, { fam: DF, w: 300, size, color: ncol, align: 'center', ls: term ? -2 : -6 }); c.restore();
    T(c, txt, W / 2, ny, { fam: DF, w: 300, size, color: ncol, align: 'center', ls: term ? -2 : -6 });
    // after the exit: second line, facts, KATANA line
    const a2 = ease(seg(tm, OUT + 0.5, OUT + 1.2));
    c.globalAlpha = a2;
    const sub = subLine(trade, o.mode);
    if (sub) T(c, sub, W / 2, ny + 74, { fam: M, size: fitSize(c, sub, W - 2 * PAD, 36, M, 400), color: INK, align: 'center' });
    const cells = hide ? [['SIDE', trade.side], ['RESULT', F.rTxt(F.num(trade.r)) || '—'], ['HELD', F.duration(trade)]] : [['ENTRY', trade.entry], ['EXIT', trade.exit], ['HELD', F.duration(trade)]];
    const cw2 = (W - 2 * PAD) / 3, ry = Math.round(H * (post ? 0.86 : 0.83));
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(PAD, ry - 64, (W - 2 * PAD) * a2, 2);
    cells.forEach(([k, v], i) => {
      const x = PAD + cw2 * i + cw2 / 2, s = String(v ?? '—');
      T(c, k, x, ry, { fam: M, size: 20, color: DIM, align: 'center', ls: 5 });
      T(c, s, x, ry + 48, { fam: M, size: fitSize(c, s, cw2 - 20, 36, M, 400), align: 'center' });
    });
    c.globalAlpha = ease(seg(tm, OUT + 0.8, OUT + 1.4));
    const y = H - (post ? 50 : PAD);
    if (o.rm && !post) {
      const rk = F.num(trade.risk), s = rk !== null ? `RISK ${rk.toFixed(2)}% · PROTECTED BY KATANA` : 'PROTECTED BY KATANA';
      T(c, s, W / 2, y - 60, { fam: M, size: 24, color: ORANGE, align: 'center', ls: 4 });
    }
    T(c, 'JOURNALED ON 5ABIFX.COM', W / 2, y, { fam: M, size: 22, color: FAINT, align: 'center', ls: 5 });
    c.globalAlpha = 1;
    if (term && price !== null && !hide) {   // a price ticker running along the top edge
      const dg = String(trade.entry || '').split('.')[1]?.length ?? 2, up = R && (R.buy ? price >= R.e : price <= R.e);
      const item = `${trade.symbol} ${Number(price).toFixed(dg)} ${up ? '▲' : '▼'}      `;
      c.fillStyle = 'rgba(47,211,166,.08)'; c.fillRect(0, 0, W, 44);
      c.font = `500 20px ${M}`; const iw = c.measureText(item).width, off = (tm * 80) % iw;
      for (let xx = -off; xx < W; xx += iw) T(c, item, xx, 30, { fam: M, size: 20, color: up ? WIN : LOSS, w: 500 });
    }
  }

  const SCENES = { ember: sceneEmber, candles: sceneCandles, bars: sceneBars, own: sceneOwn };

  /* darkens the art so the number always reads, more for a member's own background */
  function shade() {
    const d = o.scene === 'own' ? o.dim : 0.25;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(5,5,7,${(0.55 + d * 0.4).toFixed(2)})`); g.addColorStop(0.35, `rgba(5,5,7,${(d * 0.6).toFixed(2)})`);
    g.addColorStop(0.62, `rgba(5,5,7,${(d * 0.7).toFixed(2)})`); g.addColorStop(1, `rgba(5,5,7,${(0.6 + d * 0.4).toFixed(2)})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  function frame(tm) {
    if (o.scene === 'replay') return frameReplay(tm);
    SCENES[o.scene](tm); shade();
    // a soft dark edge keeps small text readable on bright photos
    c.shadowColor = 'rgba(0,0,0,.75)'; c.shadowBlur = o.scene === 'own' ? 14 : 0;
    const win = F.isWin(trade), col = win ? WIN : LOSS;
    // top: brand and handle
    c.globalAlpha = ease(seg(tm, 0, 0.6));
    K.brand(c, PAD, 140);
    const hd = trade.handle || '5abifx.com';
    T(c, hd, W - PAD, 153, { fam: M, size: fitSize(c, hd, 420, 26, M, 400, 2), color: SOFT, align: 'right', ls: 2 });
    // what was traded
    const a1 = ease(seg(tm, 0.2, 0.9)), cy = Math.round(H * 0.484);
    c.globalAlpha = a1;
    const top = o.top || [trade.symbol, trade.side, F.dayTxt(trade.close)].filter(Boolean).join('  ·  ');
    T(c, top, W / 2, cy - 250 + 30 * (1 - a1), { fam: M, size: fitSize(c, top, W - 2 * PAD, 34, M, 400, 6), color: SOFT, align: 'center', ls: 6 });
    // the big number counts up
    const val = valueOf(trade, o.mode), p = expo(seg(tm, 0.5, 2.3));
    const txt = p >= 1 ? val.f(val.v) : val.f(val.v * p);
    const full = val.f(val.v), size = fitSize(c, full, W - 2 * PAD, 230, D, 300, -8);
    c.globalAlpha = ease(seg(tm, 0.4, 0.8));
    c.save(); c.shadowColor = col; c.shadowBlur = 40 + 30 * Math.sin(tm * 2.4);
    T(c, txt, W / 2, cy, { fam: D, w: 300, size, color: col, align: 'center', ls: -8 }); c.restore();
    T(c, txt, W / 2, cy, { fam: D, w: 300, size, color: col, align: 'center', ls: -8 });
    // light sweep across the number once it lands
    const sw = seg(tm, 2.6, 3.6);
    if (sw > 0 && sw < 1) {
      const sx = -300 + sw * (W + 600), g = c.createLinearGradient(sx - 160, 0, sx + 160, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.font = `300 ${size}px ${D}`; c.textAlign = 'center'; if ('letterSpacing' in c) c.letterSpacing = '-8px';
      c.fillStyle = g; c.fillText(txt, W / 2, cy); if ('letterSpacing' in c) c.letterSpacing = '0px';
    }
    // second line and the small facts
    const a2 = ease(seg(tm, 2.1, 2.8));
    c.globalAlpha = a2;
    const sub = subLine(trade, o.mode);
    if (sub) T(c, sub, W / 2, cy + 100, { fam: M, size: fitSize(c, sub, W - 2 * PAD, 40, M, 400), color: INK, align: 'center' });
    const cells = o.cells || [['ENTRY', trade.entry], ['EXIT', trade.exit], ['HELD', F.duration(trade)]];
    const cw = (W - 2 * PAD) / 3, ry = Math.round(H * 0.693) + 40 * (1 - a2);
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(PAD, ry - 80, (W - 2 * PAD) * a2, 2);
    cells.forEach(([k, v], i) => {
      const x = PAD + cw * i + cw / 2, s = String(v ?? '—');
      T(c, k, x, ry, { fam: M, size: 22, color: DIM, align: 'center', ls: 5 });
      T(c, s, x, ry + 54, { fam: M, size: fitSize(c, s, cw - 20, 40, M, 400), align: 'center' });
    });
    // bottom: KATANA line and the site
    c.globalAlpha = ease(seg(tm, 2.8, 3.4));
    const y = H - PAD;
    if (o.rm) {
      const rk = F.num(trade.risk), s = rk !== null ? `RISK ${rk.toFixed(2)}% · PROTECTED BY KATANA` : 'PROTECTED BY KATANA';
      T(c, s, W / 2, y - 60, { fam: M, size: 24, color: ORANGE, align: 'center', ls: 4 });
    }
    T(c, 'JOURNALED ON 5ABIFX.COM', W / 2, y, { fam: M, size: 22, color: FAINT, align: 'center', ls: 5 });
    c.globalAlpha = 1; c.shadowBlur = 0;
  }

  function loop(now) {
    if (!t0) t0 = now;
    const tm = ((now - t0) / 1000) % len();
    frame(frozen ?? tm);
    raf = requestAnimationFrame(loop);
  }
  function play() { cancelAnimationFrame(raf); t0 = 0; if (media && media.play) { media.currentTime = 0; media.play().catch(() => {}); } raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  /* a photo or a short clip from the member's device: read locally, never uploaded */
  function setBackground(file) {
    if (media && media.pause) media.pause();
    if (media && media.src) URL.revokeObjectURL(media.src);
    media = null;
    if (!file) { play(); return Promise.resolve(); }
    const url = URL.createObjectURL(file);
    return new Promise((res, rej) => {
      if (file.type.startsWith('video/')) {
        const v = document.createElement('video');
        Object.assign(v, { muted: true, loop: true, playsInline: true, src: url });
        v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
        v.onloadeddata = () => { media = v; o.scene = 'own'; play(); res(); };
        v.onerror = () => rej(new Error('This video cannot be played in your browser. Try an MP4.'));
      } else {
        const im = new Image();
        im.onload = () => { media = im; o.scene = 'own'; play(); res(); };
        im.onerror = () => rej(new Error('This picture cannot be opened. Try a JPG or PNG.'));
        im.src = url;
      }
    });
  }

  /* records one full play (7 s) to a video file */
  function format() {
    const list = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return window.MediaRecorder ? list.find(m => MediaRecorder.isTypeSupported(m)) || '' : null;
  }
  function record(onProgress) {
    const mime = format();
    if (mime === null || !canvas.captureStream) return Promise.reject(new Error('This browser cannot record video. Try Chrome or Safari.'));
    const stream = canvas.captureStream(FPS);
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
    const parts = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    return new Promise((res) => {
      rec.onstop = () => {
        stream.getTracks().forEach(tr => tr.stop());
        const type = rec.mimeType || mime || 'video/webm';
        res({ blob: new Blob(parts, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' });
      };
      play(); rec.start(250);
      const st = performance.now();
      const tick = () => {
        const p = (performance.now() - st) / 1000 / len();
        if (onProgress) onProgress(clamp(p));
        if (p >= 1) { rec.stop(); return; }
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  return {
    set(next) {
      Object.assign(o, next || {});
      const h = o.size === 'post' ? 1350 : K.H;
      if (h !== H) { H = h; canvas.height = H; }
    },
    setBackground, play, stop, record, canRecord: () => format() !== null && !!canvas.captureStream,
    still(sec) { frozen = sec; }, // for screenshots
  };
}

/* wires the motion card controls on a page: #mv canvas, #mv-scene, #mv-size, #mv-file, #mv-dim, #mv-rec, #mv-st (+ /save-file.js).
   extra() returns the page's own options (mode, KATANA line, period text...). */
function mount(trade, extra, fileTag) {
  const val = (id) => document.getElementById(id), cv = val('mv');
  if (!cv) return null;
  const st = val('mv-st'), rec = val('mv-rec');
  const mc = create(cv, trade, Object.assign({ size: val('mv-size') ? val('mv-size').value : 'story' }, extra()));
  let video = null;
  const remember = (k, id) => { try { const v = localStorage.getItem(k); if (v && v !== 'own' && val(id) && val(id).querySelector(`option[value="${v}"]`)) val(id).value = v; } catch (e) {} };
  remember('motionScene', 'mv-scene'); remember('motionSize', 'mv-size');
  const own = () => { const on = val('mv-scene').value === 'own'; ['mv-filebox', 'mv-dimbox', 'mv-private'].forEach((id) => { if (val(id)) val(id).hidden = !on; }); };
  const sync = () => {
    mc.set(Object.assign({ scene: val('mv-scene').value, size: val('mv-size') ? val('mv-size').value : 'story' }, extra()));
    video = null; if (window.SaveFile) window.SaveFile.clear(st); mc.play();
  };
  val('mv-scene').addEventListener('change', () => {
    own(); sync();
    try { localStorage.setItem('motionScene', val('mv-scene').value); } catch (e) {}
    if (val('mv-scene').value === 'own' && !val('mv-file').files[0]) val('mv-file').click();
  });
  if (val('mv-size')) val('mv-size').addEventListener('change', () => { sync(); try { localStorage.setItem('motionSize', val('mv-size').value); } catch (e) {} });
  if (val('mv-dim')) val('mv-dim').addEventListener('input', (e) => mc.set({ dim: e.target.value / 100 }));
  // the photo or clip is read in the browser only, never sent to the server
  val('mv-file').addEventListener('change', (e) => {
    st.textContent = '';
    mc.setBackground(e.target.files[0] || null).then(() => sync()).catch((err) => { st.textContent = err.message; });
  });
  const SF = window.SaveFile;
  if (!mc.canRecord()) { rec.disabled = true; st.textContent = SF ? SF.noRecord() : 'This browser cannot record video. Try Chrome or Safari.'; }
  const name = (ext) => `5ABIFX-${String(fileTag || 'card').replace(/[^\w-]+/g, '-')}-motion.${ext}`;
  rec.addEventListener('click', () => {
    rec.disabled = true; if (SF) SF.clear(st);
    mc.record((p) => { st.textContent = `Making your video ${Math.round(p * 100)}% (keep this page open)`; }).then((r) => {
      video = r; rec.disabled = false; rec.textContent = 'Make again';
      if (!r.blob.size) { st.textContent = 'The video came out empty. Keep this page open while it records and try again.'; return; }
      // Save link, Share (where the device can share files) and Open, tapped by the member: works on PC, Android and iPhone
      if (SF) { SF.offer({ status: st, blob: r.blob, name: name(r.ext), kind: 'video' }); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob); a.download = name(r.ext); document.body.appendChild(a); a.click(); a.remove();
    }).catch((err) => { st.textContent = err.message; rec.disabled = false; });
  });
  own(); sync();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => mc.play());
  return { sync, card: mc };
}

window.MotionCard = { create, mount, scenes: SCENES0, sizes: SIZES, length: LEN };
})();
