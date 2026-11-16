/* Period motion card: an 8-second video of a day, session, week, month or quarter.
   The total counts up, then the breakdown builds one bar at a time (Mon..Fri, Week 1..4, each trade...),
   an equity line runs through the bars and the key numbers fade in. Drawn on a canvas and recorded in the
   browser like public/motion-card.js; a member's own photo or clip is never uploaded.
   Needs public/cards.js (TradeCards.kit). Exposes window.PeriodCard. */
(function () {
const K = window.TradeCards.kit;
const { W, PAD, D, M, INK, SOFT, DIM, FAINT, WIN, LOSS, T, fitSize } = K;
const LEN = 8, FPS = 30, MINUS = '−', CALM = '#e4e8f1', SLATE = '#8792ad';
const THEMES = { ember: ['Ember', '#ff6a2a'], gold: ['Gold', '#f5c451'], teal: ['Teal', '#2fd3a6'], ice: ['Ice', '#8fd3ff'], mono: ['Mono', '#f2f2f4'] };
const KINDS = { day: 'DAILY RECAP', session: 'SESSION RECAP', week: 'WEEKLY RECAP', month: 'MONTHLY RECAP', quarter: 'QUARTER RECAP' };

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = x => 1 - Math.pow(1 - clamp(x), 4);
const expo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const fin = v => typeof v === 'number' && Number.isFinite(v);
const sg = n => (n < 0 ? MINUS : '+');

/* one number in the unit the member picked */
function fmt(v, unit, short) {
  if (!fin(v)) return '—';
  const a = Math.abs(v);
  if (unit === 'pips') return sg(v) + (a >= 1000 ? Math.round(a).toLocaleString('en-US') : a.toFixed(a >= 100 || short ? 0 : 1)) + (short ? 'p' : ' pips');
  if (unit === 'r') return sg(v) + a.toFixed(a >= 10 || short ? 1 : 2) + 'R';
  if (unit === 'pct') return sg(v) + a.toFixed(2) + '%';
  if (short && a >= 10000) return sg(v) + '$' + (a / 1000).toFixed(1) + 'k';
  return sg(v) + '$' + a.toLocaleString('en-US', { minimumFractionDigits: short ? 0 : 2, maximumFractionDigits: short ? 0 : 2 });
}
const pick = (o, unit) => (o ? o[unit === 'money' ? 'money' : unit] : null);

function create(canvas, data, opts) {
  const o = Object.assign({ unit: 'money', theme: 'ember', scene: 'ember', size: 'story', headline: '', dim: 0.55, stats: true, line: true, rm: true }, opts || {});
  let H = o.size === 'post' ? 1350 : 1920;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  let media = null, raf = 0, t0 = 0, frozen = null;
  const glow = document.createElement('canvas'); glow.width = W; glow.height = 1920;
  K.bg(glow.getContext('2d'), 1.25);
  const sparks = Array.from({ length: 60 }, (_, i) => ({ x: (i * 397) % W, y: (i * 911) % 1920, s: 0.4 + ((i * 37) % 10) / 10, r: 1 + (i % 4) }));
  const acc = () => (THEMES[o.theme] || THEMES.ember)[1];

  /* ---------- backgrounds ---------- */
  function sceneEmber(tm) {
    c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
    const z = 1.06 + 0.05 * Math.sin(tm / LEN * Math.PI * 2);
    c.save(); c.translate(W / 2 + 30 * Math.sin(tm * 0.6), H / 2); c.scale(z, z); c.drawImage(glow, -W / 2, -960);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6 + 0.3 * Math.sin(tm * 1.3);
    c.drawImage(glow, -W / 2, -960 + 40 * Math.sin(tm * 0.8)); c.restore();
    c.globalCompositeOperation = 'lighter';
    sparks.forEach(p => {
      const y = (p.y - tm * 90 * p.s + 1920 * 4) % H;
      c.fillStyle = `rgba(255,120,60,${clamp(0.15 + 0.35 * Math.sin(tm * 2 + p.x)).toFixed(2)})`;
      c.beginPath(); c.arc(p.x + 12 * Math.sin(tm + p.y), y, p.r, 0, 7); c.fill();
    });
    c.globalCompositeOperation = 'source-over';
  }
  /* a slow perspective grid in the theme colour, like a trading floor */
  function sceneGrid(tm) {
    c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
    const col = acc(), hz = H * 0.42;
    c.strokeStyle = col; c.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const k = ((i + (tm * 0.9) % 1) / 18), y = hz + Math.pow(k, 2.2) * (H - hz);
      c.globalAlpha = 0.05 + 0.25 * k; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    for (let i = -12; i <= 12; i++) {
      c.globalAlpha = 0.12; c.beginPath(); c.moveTo(W / 2 + i * 14, hz); c.lineTo(W / 2 + i * 260, H); c.stroke();
    }
    c.globalAlpha = 1;
    const g = c.createRadialGradient(W / 2, hz, 10, W / 2, hz, W * 0.8);
    g.addColorStop(0, col + '55'); g.addColorStop(1, 'rgba(5,5,7,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function sceneOwn(tm) {
    c.fillStyle = '#050507'; c.fillRect(0, 0, W, H);
    if (!media) return sceneEmber(tm);
    const mw = media.videoWidth || media.naturalWidth, mh = media.videoHeight || media.naturalHeight;
    if (!mw || !mh) return;
    const s = Math.max(W / mw, H / mh) * (media.tagName === 'VIDEO' ? 1 : 1.04 + 0.08 * tm / LEN);
    c.drawImage(media, (W - mw * s) / 2, (H - mh * s) / 2, mw * s, mh * s);
  }
  const SCENES = { ember: sceneEmber, grid: sceneGrid, own: sceneOwn };
  function shade() {
    const d = o.scene === 'own' ? o.dim : 0.3;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(5,5,7,${(0.55 + d * 0.4).toFixed(2)})`); g.addColorStop(0.4, `rgba(5,5,7,${(d * 0.7).toFixed(2)})`);
    g.addColorStop(1, `rgba(5,5,7,${(0.65 + d * 0.35).toFixed(2)})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  /* ---------- the card ---------- */
  function frame(tm) {
    SCENES[o.scene](tm); shade();
    c.shadowColor = 'rgba(0,0,0,.75)'; c.shadowBlur = o.scene === 'own' ? 14 : 0;
    const post = H < 1920, Y = v => Math.round(v * (post ? 0.70 : 1)), A = acc();
    const total = pick(data.total, o.unit), win = !fin(total) || total >= 0;
    // a losing period gets the same polish, in calm silver instead of alarm red, so it is still worth sharing
    const col = win ? WIN : CALM, neg = win ? LOSS : SLATE;

    // brand + handle
    c.globalAlpha = ease(seg(tm, 0, 0.6));
    K.brand(c, PAD, Y(140));
    const hd = data.handle || '5abifx.com';
    T(c, hd, W - PAD, Y(140) + 13, { fam: M, size: fitSize(c, hd, 420, 26, M, 400, 2), color: SOFT, align: 'right', ls: 2 });

    // kicker + headline
    const a1 = ease(seg(tm, 0.3, 1.0));
    c.globalAlpha = a1;
    const kick = `${KINDS[data.kind] || 'RECAP'}  ·  ${data.title || ''}`;
    T(c, kick, PAD, Y(300), { fam: M, size: fitSize(c, kick, W - 2 * PAD, 28, M, 400, 6), color: A, ls: 6 });
    const head = (o.headline || '').trim();
    if (head) T(c, head, PAD - 4, (post ? 290 : 400) + 20 * (1 - a1), { fam: D, w: 300, size: fitSize(c, head, W - 2 * PAD, post ? 72 : 104, D, 300, -3), ls: -3 });

    // the total counts up
    const p = expo(seg(tm, 0.8, 2.4)), tx = fmt(fin(total) ? total * (p >= 1 ? 1 : p) : null, o.unit);
    const ty = post ? (head ? 450 : 370) : (head ? 600 : 520), size = fitSize(c, fmt(total, o.unit), W - 2 * PAD, post ? 150 : 210, D, 300, -8);
    c.globalAlpha = ease(seg(tm, 0.7, 1.1));
    c.save(); c.shadowColor = col; c.shadowBlur = 40 + 25 * Math.sin(tm * 2.4);
    T(c, tx, PAD - 8, ty, { fam: D, w: 300, size, color: col, ls: -8 }); c.restore();
    T(c, tx, PAD - 8, ty, { fam: D, w: 300, size, color: col, ls: -8 });
    const sw = seg(tm, 6.2, 7.1);
    if (sw > 0 && sw < 1) {
      const sx = -300 + sw * (W + 600), g = c.createLinearGradient(sx - 160, 0, sx + 160, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.font = `300 ${size}px ${D}`; c.textAlign = 'left'; if ('letterSpacing' in c) c.letterSpacing = '-8px';
      c.fillStyle = g; c.fillText(tx, PAD - 8, ty); if ('letterSpacing' in c) c.letterSpacing = '0px';
    }
    // the other units under it
    c.globalAlpha = ease(seg(tm, 2.2, 2.8));
    const others = ['money', 'pips', 'r', 'pct'].filter(u => u !== o.unit && fin(pick(data.total, u))).map(u => fmt(pick(data.total, u), u)).slice(0, 2);
    if (others.length) T(c, others.join('   ·   '), PAD, ty + 70, { fam: M, size: 34, color: INK });
    if (!win && o.rm) { // the win in a red period: the account was protected
      const tag = data.calm || 'RISK RESPECTED', tw = (c.font = `400 22px ${M}`, c.measureText(tag).width + 4 * tag.length + 44), tx2 = W - PAD - tw;
      c.strokeStyle = A; c.lineWidth = 2; c.beginPath(); if (c.roundRect) c.roundRect(tx2, ty + 36, tw, 50, 25); else c.rect(tx2, ty + 36, tw, 50); c.stroke();
      T(c, tag, tx2 + tw / 2, ty + 69, { fam: M, size: 22, color: A, align: 'center', ls: 4 });
    }

    // bars, one at a time
    const items = data.items || [], n = Math.max(items.length, 1);
    const cx0 = PAD, cw = W - 2 * PAD, top = ty + Y(180), bot = Y(1420), ch = bot - top;
    const vals = items.map(it => pick(it, o.unit)), mx = Math.max(1e-9, ...vals.map(v => Math.abs(fin(v) ? v : 0)));
    const hasNeg = vals.some(v => fin(v) && v < 0), zero = hasNeg ? top + ch * 0.58 : bot - 60;
    const up = zero - top - 70, dn = bot - zero - 100;
    c.globalAlpha = ease(seg(tm, 2.2, 2.6));
    c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(cx0, zero, cw, 2);
    const slot = cw / n, bw = Math.min(140, slot * 0.56), start = 2.5, step = Math.min(0.42, 3.0 / n);
    const pts = [];
    let run = 0;
    items.forEach((it, i) => {
      const v = vals[i], g = ease(seg(tm, start + i * step, start + i * step + 0.55));
      const x = cx0 + slot * i + slot / 2;
      const hgt = fin(v) ? (v >= 0 ? up : dn) * Math.abs(v) / mx * g : 0, pos = !fin(v) || v >= 0;
      c.globalAlpha = 1;
      if (g > 0) {
        const bc = !fin(v) || v === 0 ? 'rgba(255,255,255,.25)' : pos ? WIN : neg;
        const yb = pos ? zero - hgt : zero;
        const gr = c.createLinearGradient(0, yb, 0, yb + Math.max(hgt, 1));
        gr.addColorStop(0, pos ? bc : bc + '55'); gr.addColorStop(1, pos ? bc + '33' : bc);
        c.fillStyle = gr; c.beginPath();
        if (c.roundRect) c.roundRect(x - bw / 2, yb, bw, Math.max(hgt, 3), 10); else c.rect(x - bw / 2, yb, bw, Math.max(hgt, 3));
        c.fill();
        c.globalAlpha = ease(seg(tm, start + i * step + 0.35, start + i * step + 0.7));
        const vs = fmt(v, o.unit, true);
        T(c, vs, x, pos ? zero - hgt - 22 : zero + hgt + 46, { fam: M, size: fitSize(c, vs, slot - 6, 30, M, 400), color: INK, align: 'center' });
      }
      c.globalAlpha = ease(seg(tm, 2.2, 2.8));
      T(c, it.label, x, bot + 16, { fam: M, size: fitSize(c, it.label, slot - 6, 24, M, 400, 3), color: DIM, align: 'center', ls: 3 });
      run += fin(v) ? v : 0; pts.push([x, run]);
    });
    // running equity line through the bars
    const lineAt = start + n * step + 0.2;
    if (o.line && pts.length > 1) {
      const lp = ease(seg(tm, lineAt, lineAt + 1.0)), lo = Math.min(0, ...pts.map(q => q[1])), hi = Math.max(0, ...pts.map(q => q[1]));
      const ly = v => top + 10 + (hi - v) / (hi - lo || 1) * (ch * 0.5);
      c.globalAlpha = 0.9; c.strokeStyle = A; c.lineWidth = 5; c.lineJoin = 'round'; c.setLineDash([]);
      c.beginPath();
      const last = Math.max(1, Math.floor(lp * (pts.length - 1) * 100) / 100);
      pts.forEach(([x, v], i) => {
        if (i > last + 1) return;
        let px = x, py = ly(v);
        if (i > last) { const f = last - Math.floor(last), [x0, v0] = pts[i - 1]; px = x0 + (x - x0) * f; py = ly(v0) + (ly(v) - ly(v0)) * f; }
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      });
      if (lp > 0) c.stroke();
      if (lp >= 1) { const [x, v] = pts.at(-1); c.fillStyle = A; c.beginPath(); c.arc(x, ly(v), 10 + 3 * Math.sin(tm * 5), 0, 7); c.fill(); }
    }

    // key numbers
    if (o.stats && data.stats) {
      const a3 = ease(seg(tm, lineAt + 0.4, lineAt + 1.1)), sy = (post ? 1080 : 1600) + 30 * (1 - a3);
      c.globalAlpha = a3;
      const cells = data.stats.slice(0, 4), sw2 = cw / cells.length;
      c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(PAD, sy - 70, cw * a3, 2);
      cells.forEach(([k, v], i) => {
        const x = PAD + sw2 * i + sw2 / 2, s = String(v ?? '—');
        T(c, k, x, sy, { fam: M, size: 20, color: DIM, align: 'center', ls: 5 });
        T(c, s, x, sy + 52, { fam: M, size: fitSize(c, s, sw2 - 16, 38, M, 400), align: 'center' });
      });
    }

    // foot
    c.globalAlpha = ease(seg(tm, lineAt + 0.8, lineAt + 1.4));
    const y = H - PAD;
    if (o.rm) T(c, 'PROTECTED BY KATANA', W / 2, y - 56, { fam: M, size: 24, color: A, align: 'center', ls: 4 });
    T(c, 'JOURNALED ON 5ABIFX.COM', W / 2, y, { fam: M, size: 22, color: FAINT, align: 'center', ls: 5 });
    c.globalAlpha = 1; c.shadowBlur = 0;
  }

  function loop(now) {
    if (!t0) t0 = now;
    frame(frozen ?? ((now - t0) / 1000) % (LEN + 2)); // 2 s hold on the finished card
    raf = requestAnimationFrame(loop);
  }
  function play() { cancelAnimationFrame(raf); t0 = 0; if (media && media.play) { media.currentTime = 0; media.play().catch(() => {}); } raf = requestAnimationFrame(loop); }

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
  function format() {
    const list = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
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
      rec.onstop = () => { stream.getTracks().forEach(tr => tr.stop()); const type = rec.mimeType || mime || 'video/webm'; res({ blob: new Blob(parts, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' }); };
      play(); rec.start(250);
      const st = performance.now();
      const tick = () => { const p = (performance.now() - st) / 1000 / (LEN + 1); if (onProgress) onProgress(clamp(p)); if (p >= 1) { rec.stop(); return; } setTimeout(tick, 100); };
      tick();
    });
  }
  /* the finished frame as a PNG */
  function still() { const keep = frozen; frozen = LEN + 0.9; frame(frozen); return new Promise(r => canvas.toBlob(b => { frozen = keep; r(b); }, 'image/png')); }

  return {
    set(next) { Object.assign(o, next || {}); const h = o.size === 'post' ? 1350 : 1920; if (h !== H) { H = h; canvas.height = H; } },
    data(d) { data = d; }, setBackground, play, record, still, freeze(s) { frozen = s; },
    canRecord: () => format() !== null && !!canvas.captureStream,
  };
}

window.PeriodCard = { create, themes: THEMES, kinds: KINDS, fmt, length: LEN };
})();
