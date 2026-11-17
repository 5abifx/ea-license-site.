/* Motion share card: a short 9:16 video of a trade result (big number counting up over moving art).
   Everything is drawn on a canvas in the browser and recorded with MediaRecorder, so nothing is uploaded:
   a member's own background photo or clip stays on their device.
   Needs public/cards.js first (uses TradeCards.kit). Exposes window.MotionCard. */
(function () {
const K = window.TradeCards.kit, F = K.fmt;
const { W, H, PAD, D, M, INK, SOFT, DIM, FAINT, ORANGE, WIN, LOSS, T, fitSize } = K;
const LEN = 7, FPS = 30;
const SIZES = { story: 'Story 9:16', post: 'Post 4:5' };
const SCENES0 = { ember: 'Ember glow', candles: 'Trade candles', bars: 'Volume bars', own: 'My background' };

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = x => 1 - Math.pow(1 - clamp(x), 4);
const expo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
const seg = (t, a, b) => clamp((t - a) / (b - a));

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
    const tm = ((now - t0) / 1000) % LEN;
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
        const p = (performance.now() - st) / 1000 / LEN;
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
