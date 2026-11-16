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
  trade: { title: 'Symbol and side', date: 'Date', line: 'Price line', quote: 'Quote', alt: 'Second unit', entry: 'Entry', exit: 'Exit', size: 'Size', held: 'Time held', risk: 'Risk %', handle: 'My handle', katana: 'KATANA line', site: '5abifx.com' },
  period: { title: 'Period name', quote: 'Quote', alt: 'Second unit', bars: 'Day-by-day bars', trades: 'Trades', winrate: 'Win rate', green: 'Green days', best: 'Best day / trade', handle: 'My handle', katana: 'KATANA line', site: '5abifx.com' },
};
const DEFAULTS = {
  trade: { title: true, date: true, line: true, quote: false, alt: false, entry: false, exit: false, size: false, held: false, risk: false, handle: true, katana: false, site: true },
  period: { title: true, quote: false, alt: false, bars: true, trades: false, winrate: false, green: false, best: false, handle: true, katana: false, site: true },
};

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
  if (short && a >= 10000) return sg(v) + '$' + (a / 1000).toFixed(1) + 'k';
  return sg(v) + '$' + a.toLocaleString('en-US', { minimumFractionDigits: short ? 0 : 2, maximumFractionDigits: short ? 0 : 2 });
}
const val = (o, u) => (o ? o[u] : null);

function text(c, s, x, y, o) {
  c.font = `${o.w || 500} ${o.size}px ${o.fam || TXT}`;
  c.fillStyle = o.color || '#fff'; c.textAlign = o.align || 'center'; c.textBaseline = 'alphabetic';
  if ('letterSpacing' in c) c.letterSpacing = (o.ls || 0) + 'px';
  c.fillText(String(s), x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
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
  const o = Object.assign({ kind: data.kind === 'trade' ? 'trade' : 'period', unit: 'money', size: 'story', art: 'smoke', grade: 'bw', quote: '', color: false, layout: 'center', dim: 0.45 }, opts || {});
  o.show = Object.assign({}, DEFAULTS[o.kind], (opts || {}).show);
  let W = 1080, H = 1920, media = null, raf = 0, t0 = 0, frozen = null;
  const c = canvas.getContext('2d');
  const art = document.createElement('canvas'), ac = art.getContext('2d');
  const glow = document.createElement('canvas'); glow.width = 1080; glow.height = 1920; K.bg(glow.getContext('2d'), 1.3);
  const grain = document.createElement('canvas'); grain.width = grain.height = 256;
  { const g = grain.getContext('2d'), im = g.createImageData(256, 256); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 22; } g.putImageData(im, 0, 0); }
  function size() { [W, H] = SIZES[o.size] || SIZES.story; canvas.width = W; canvas.height = H; art.width = W; art.height = H; }
  size();

  /* ---------- art (drawn on its own layer, then colour graded) ---------- */
  function drawArt(tm) {
    const a = ac; a.globalCompositeOperation = 'source-over'; a.filter = 'none';
    a.fillStyle = '#0a0a0c'; a.fillRect(0, 0, W, H);
    if (o.art === 'own' && media) {
      const mw = media.videoWidth || media.naturalWidth, mh = media.videoHeight || media.naturalHeight;
      if (mw && mh) { const s = Math.max(W / mw, H / mh) * (media.tagName === 'VIDEO' ? 1 : 1.04 + 0.06 * tm / LEN); a.drawImage(media, (W - mw * s) / 2, (H - mh * s) / 2, mw * s, mh * s); }
    } else if (o.art === 'ember') {
      const z = 1.08 + 0.05 * Math.sin(tm / LEN * 6.28), s = Math.max(W / 1080, H / 1920) * z;
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
    c.drawImage(art, 0, 0);
    // readability: darken, more at the edges; film grain on top
    const d = o.art === 'own' ? o.dim : 0.25, v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, `rgba(0,0,0,${(d * 0.6).toFixed(2)})`); v.addColorStop(1, `rgba(0,0,0,${(0.5 + d * 0.4).toFixed(2)})`);
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    c.save(); c.globalAlpha = 0.6; c.fillStyle = c.createPattern(grain, 'repeat'); c.translate((tm * 997) % 256, (tm * 613) % 256); c.fillRect(-256, -256, W + 512, H + 512); c.restore();
  }

  /* ---------- content ---------- */
  function frame(tm) {
    drawArt(tm);
    const S = o.show, wide = W > H, post = !wide && H < 1900, cx = W / 2, A = (tm2, a, b) => ease(seg(tm2, a, b));
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 18;
    const unit = o.unit, total = o.kind === 'trade' ? val(data, unit) ?? val(data, 'money') : val(data.total, unit);
    const win = !fin(total) || total >= 0;
    const numCol = o.color ? (win ? K.WIN : '#e4e8f1') : '#f4f4f6';
    // top: what this is
    let top = wide ? 150 : post ? 170 : 250;
    c.globalAlpha = A(tm, 0.1, 0.7);
    if (S.title) {
      if (o.kind === 'trade') {
        const sub = [data.side, S.date ? data.dateTxt : ''].filter(Boolean).join(' · ').toUpperCase();
        c.font = `700 64px ${BIG}`; const w1 = c.measureText(data.symbol || '').width; c.font = `600 30px ${TXT}`; const w2 = sub ? c.measureText(sub).width + 26 : 0;
        const x0 = cx - (w1 + w2) / 2;
        text(c, data.symbol || '', x0, top, { fam: BIG, w: 700, size: 64, align: 'left' });
        if (sub) text(c, sub, x0 + w1 + 26, top - 4, { size: 30, w: 600, color: 'rgba(255,255,255,.62)', align: 'left', ls: 2 });
      } else {
        text(c, data.kindTxt || '', cx, top - 62, { size: 28, w: 700, color: 'rgba(255,255,255,.6)', ls: 6 });
        text(c, data.title || '', cx, top + 10, { fam: BIG, w: 700, size: fit(c, data.title || '', W - 200, 66, BIG, 700), });
      }
    }
    // price line with entry / exit tags (trade) or day bars (period)
    const chartTop = top + 80, chartH = wide ? 300 : post ? 330 : 520, chartW = Math.min(W - 160, wide ? 1200 : 900), x0 = cx - chartW / 2;
    if (o.kind === 'trade' && S.line && data.closes && data.closes.length > 3) {
      const k = data.closes, lo = Math.min(...k), hi = Math.max(...k), n = k.length, pr = ease(seg(tm, 0.3, 2.6));
      const X = i => x0 + i / (n - 1) * chartW, Y = v => chartTop + (hi - v) / (hi - lo || 1) * chartH;
      c.globalAlpha = 0.95; c.strokeStyle = '#fff'; c.lineWidth = 4; c.lineJoin = 'round'; c.beginPath();
      const upto = Math.max(1, Math.floor(pr * (n - 1)));
      for (let i = 0; i <= upto; i++) i ? c.lineTo(X(i), Y(k[i])) : c.moveTo(X(i), Y(k[i]));
      c.stroke();
      const tag = (i, s) => { if (i <= upto && i >= 0) { c.globalAlpha = A(tm, 0.3 + i / n * 2.3, 0.6 + i / n * 2.3); pill(c, s, X(i), Y(k[i]) - 34, false); c.fillStyle = '#fff'; c.beginPath(); c.arc(X(i), Y(k[i]), 7, 0, 7); c.fill(); } };
      tag(data.iEntry, 'Entry'); tag(data.iExit, 'Exit');
    } else if (o.kind === 'period' && S.bars && data.items && data.items.length) {
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
    const hasChart = (o.kind === 'trade' && S.line && data.closes && data.closes.length > 3) || (o.kind === 'period' && S.bars && data.items && data.items.length);
    // quote
    let y = hasChart ? chartTop + chartH + (o.kind === 'period' ? 130 : 90) : (wide ? H * 0.42 : H * 0.44);
    if (S.quote && o.quote) {
      c.globalAlpha = A(tm, 1.2, 1.9);
      const q = o.quote.toUpperCase();
      text(c, q, cx, y, { size: fit(c, q, W - 220, 26, TXT, 700, 5), w: 700, color: 'rgba(255,255,255,.75)', ls: 5 });
      y += 40;
    }
    // the result, big and white, counts up
    const p = expo(seg(tm, 0.6, 2.4)), full = fmt(total, unit), tx = fmt(fin(total) ? total * (p >= 1 ? 1 : p) : null, unit);
    const ns = fit(c, full, W - (wide ? 400 : 140), wide ? 190 : post ? 170 : 200, BIG, 700, -6);
    y += ns * 0.92;
    c.globalAlpha = A(tm, 0.5, 0.9);
    c.save(); c.shadowColor = 'rgba(255,255,255,.35)'; c.shadowBlur = 40; text(c, tx, cx, y, { fam: BIG, w: 700, size: ns, color: numCol, ls: -6 }); c.restore();
    const sw = seg(tm, 3.0, 3.9);
    if (sw > 0 && sw < 1) { const sx = -300 + sw * (W + 600), g = c.createLinearGradient(sx - 140, 0, sx + 140, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.shadowBlur = 0; text(c, tx, cx, y, { fam: BIG, w: 700, size: ns, color: g, ls: -6 }); c.restore(); }
    // second unit
    if (S.alt) {
      const alt = ['money', 'pips', 'r', 'pct'].filter(u => u !== unit).map(u => (o.kind === 'trade' ? val(data, u) : val(data.total, u))).find(fin);
      const u2 = ['money', 'pips', 'r', 'pct'].filter(u => u !== unit).find(u => fin(o.kind === 'trade' ? val(data, u) : val(data.total, u)));
      if (fin(alt)) { c.globalAlpha = A(tm, 2.2, 2.8); text(c, fmt(alt, u2), cx, y + 62, { size: 36, w: 600, color: 'rgba(255,255,255,.8)' }); y += 50; }
    }
    // detail rows: label left, value right, centred block (like a receipt)
    const rows = o.kind === 'trade'
      ? [['entry', 'Entry', data.entry], ['exit', 'Exit', data.exit], ['size', 'Size', data.sizeTxt], ['held', 'Held', data.heldTxt], ['risk', 'Risk', data.riskTxt]]
      : [['trades', 'Trades', data.trades], ['winrate', 'Win rate', data.winRate], ['green', 'Green days', data.green], ['best', o.kind === 'period' && data.bestLabel ? data.bestLabel : 'Best', data.best]];
    const on = rows.filter(r => S[r[0]] && r[2] !== undefined && r[2] !== null && r[2] !== '');
    if (on.length) {
      let ry = y + (wide ? 70 : 90);
      const lw = wide ? 300 : 360;
      on.forEach(([, l, v], i) => {
        c.globalAlpha = A(tm, 2.4 + i * 0.15, 2.9 + i * 0.15);
        text(c, l, cx - lw / 2 - 20, ry, { size: wide ? 32 : 38, w: 500, color: 'rgba(255,255,255,.6)', align: 'left' });
        text(c, v, cx + 20, ry, { size: wide ? 32 : 38, w: 700, align: 'left' });
        ry += wide ? 50 : 62;
      });
    }
    // footer: 5ABI.FX × handle, site, KATANA
    c.globalAlpha = A(tm, 2.8, 3.4);
    const fy = H - (wide ? 110 : 170), lw2 = 64;
    const brand = '5ABI.FX', hd = S.handle && data.handle ? data.handle : '';
    c.font = `700 40px ${BIG}`; const bwid = c.measureText(brand).width;
    c.font = `700 36px ${TXT}`; const hw = hd ? c.measureText(hd).width + 70 : 0;
    const total2 = lw2 + 14 + bwid + hw, fx = cx - total2 / 2;
    drawLogo(fx, fy - 30, lw2);
    text(c, brand, fx + lw2 + 14, fy, { fam: BIG, w: 700, size: 40, align: 'left' });
    if (hd) { text(c, '×', fx + lw2 + 14 + bwid + 26, fy - 2, { size: 30, w: 500, color: 'rgba(255,255,255,.6)', align: 'center' }); text(c, hd, fx + lw2 + 14 + bwid + 56, fy, { size: 36, w: 700, align: 'left' }); }
    let fy2 = fy + 52;
    if (S.site) { text(c, '5abifx.com', cx, fy2, { size: 28, w: 500, color: 'rgba(255,255,255,.6)' }); fy2 += 44; }
    if (S.katana) text(c, 'PROTECTED BY KATANA', cx, fy2, { size: 22, w: 700, color: K.ORANGE, ls: 5 });
    c.globalAlpha = 1; c.shadowBlur = 0;
  }
  const logo = new Image(); logo.src = (window.CineCardLogo || '/logo.png');
  function drawLogo(x, y, w) { if (logo.complete && logo.width) c.drawImage(logo, x, y, w, w * logo.height / logo.width); }

  function loop(now) { if (!t0) t0 = now; frame(frozen ?? ((now - t0) / 1000) % (LEN + 2)); raf = requestAnimationFrame(loop); }
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
  function format() { const l = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']; return window.MediaRecorder ? l.find(m => MediaRecorder.isTypeSupported(m)) || '' : null; }
  function record(onProgress) {
    const mime = format();
    if (mime === null || !canvas.captureStream) return Promise.reject(new Error('This browser cannot record video. Try Chrome or Safari.'));
    const stream = canvas.captureStream(FPS), rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined), parts = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    return new Promise((res) => {
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); const type = rec.mimeType || mime || 'video/webm'; res({ blob: new Blob(parts, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' }); };
      play(); rec.start(250);
      const st = performance.now(), tick = () => { const p = (performance.now() - st) / 1000 / (LEN + 1); if (onProgress) onProgress(clamp(p)); if (p >= 1) return rec.stop(); setTimeout(tick, 100); };
      tick();
    });
  }
  function still() { const keep = frozen; frozen = LEN + 0.5; frame(frozen); return new Promise(r => canvas.toBlob(b => { frozen = keep; r(b); }, 'image/png')); }
  return {
    set(next) { const s0 = o.size; Object.assign(o, next || {}, next && next.show ? { show: Object.assign(o.show, next.show) } : {}); if (o.size !== s0) size(); },
    data(d, kind) { data = d; if (kind && kind !== o.kind) { o.kind = kind; o.show = Object.assign({}, DEFAULTS[kind]); } },
    get: () => o, setBackground, play, record, still, freeze(s) { frozen = s; }, canRecord: () => format() !== null && !!canvas.captureStream,
  };
}

window.CineCard = { create, sizes: SIZES, grades: GRADES, arts: ARTS, fields: FIELDS, defaults: DEFAULTS, fmt, length: LEN };
})();
