// Members area background ("Appearance", /appearance). Each member picks a background (photo, live drawing,
// any colour, a two-colour mix, or their own photo/clip), a panel tint and an accent colour.
// The background is drawn on a fixed canvas behind the page. After each change we measure how light/busy it is
// and rewrite the site's colour tokens so text, panels and the accent stay readable on top of it.
// Saved per account (users.look, sent in as window.__LOOK); an uploaded photo/clip stays on this device (IndexedDB).
// Nothing happens for members who never chose a background (bg "none" = the classic 5ABI.FX look).
(function () {
  'use strict';
  const root = document.documentElement;
  const DEF = { bg: 'none', motion: true, depth: 40, dim: 0, blur: 0, panel: 'auto', accent: 'm-ember', colour: '#1d3557', g1: '#ff5a1f', g2: '#1a1033' };
  let S = Object.assign({}, DEF, window.__LOOK || {});

  /* ---------- colour maths ---------- */
  const hex2 = (h) => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) || 0); };
  const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (a) => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]);
  const CR = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const rgba = (a, al) => `rgba(${a.map(Math.round).join(',')},${al})`;
  const fit = (c, s, need, toward) => { let k = 0, o = c; while (CR(o, s) < need && k < 1) { k += 0.04; o = mix(c, toward, k); } return o; };
  function rnd(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- accents ---------- */
  const METAL = [['m-ember', 'Ember', '#ff5a1f'], ['m-chrome', 'Chrome', '#c3c7cf'], ['m-gold', 'Gold', '#d4a64a'], ['m-copper', 'Copper', '#c8774a'], ['m-rose', 'Rose gold', '#d99a8a'], ['m-teal', 'Teal', '#26c6a0'],
    ['m-emerald', 'Emerald', '#1f8a5b'], ['m-sapphire', 'Sapphire', '#3b5bdb'], ['m-crimson', 'Crimson', '#b8233a'], ['m-graphite', 'Graphite', '#5a5f6a'], ['m-black', 'Black', '#1a1a1d'], ['m-pearl', 'Pearl', '#f1f1f4']];
  const MATTE = [['f-orange', 'Orange', '#ff5a1f'], ['f-amber', 'Amber', '#f5a524'], ['f-lime', 'Lime', '#8bcf3f'], ['f-teal', 'Teal', '#26c6a0'], ['f-sky', 'Sky', '#3bb4e5'], ['f-blue', 'Blue', '#2f6bff'],
    ['f-violet', 'Violet', '#8b5cf6'], ['f-pink', 'Pink', '#ec4899'], ['f-red', 'Red', '#f0464b'], ['f-slate', 'Slate', '#64748b'], ['f-ink', 'Ink', '#0b0b0e'], ['f-white', 'White', '#ffffff']];
  const metalFill = (h) => { const a = hex2(h); return `linear-gradient(140deg,${toHex(mix(a, [255, 255, 255], 0.45))} 0%,${h} 38%,${toHex(mix(a, [0, 0, 0], 0.32))} 68%,${toHex(mix(a, [255, 255, 255], 0.2))} 100%)`; };
  const accentOf = (id) => {
    id = String(id || '');
    if (/^c-#[0-9a-f]{6}$/i.test(id)) return { hex: id.slice(2), metal: false };
    const m = METAL.find((x) => x[0] === id); if (m) return { hex: m[2], metal: true };
    const f = MATTE.find((x) => x[0] === id); return { hex: f ? f[2] : '#ff5a1f', metal: false };
  };

  /* ---------- backgrounds ---------- */
  const lo = document.createElement('canvas'), lx = lo.getContext('2d');
  function lowres(ctx, w, h, cw, ch, fn) { lo.width = cw; lo.height = ch; fn(lx, cw, ch); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(lo, 0, 0, w, h); }
  function glow(ctx, x, y, r, col, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
  const candles = (() => { const r = rnd(7); let p = 100; const a = []; for (let i = 0; i < 80; i++) { const o = p, c = p + (r() - 0.46) * 6, h = Math.max(o, c) + r() * 3, l = Math.min(o, c) - r() * 3; a.push([o, h, l, c]); p = c; } return a; })();
  const dust = (() => { const r = rnd(3); return Array.from({ length: 140 }, () => [r(), r(), r() * 0.8 + 0.2, r() * 2 + 0.4]); })();

  const LIVE = [
    { id: 'ember', name: 'Ember', tag: 'LIVE', draw(c, w, h, t) { c.fillStyle = '#070609'; c.fillRect(0, 0, w, h); const m = Math.max(w, h);
      glow(c, w * (0.22 + 0.06 * Math.sin(t * 0.3)), h * (0.35 + 0.06 * Math.cos(t * 0.25)), m * 0.55, '255,90,31', 0.5);
      glow(c, w * (0.82 + 0.05 * Math.cos(t * 0.22)), h * (0.75 + 0.05 * Math.sin(t * 0.3)), m * 0.45, '255,140,70', 0.28);
      glow(c, w * (0.6 + 0.08 * Math.sin(t * 0.18 + 2)), h * 0.1, m * 0.4, '150,30,10', 0.4); } },
    { id: 'rivers', name: 'Five rivers', tag: 'LIVE', draw(c, w, h, t) { c.fillStyle = '#04070a'; c.fillRect(0, 0, w, h);
      const cols = ['38,198,160', '255,90,31', '120,200,230', '255,150,80', '38,198,160'];
      for (let i = 0; i < 5; i++) { c.beginPath(); for (let x = 0; x <= w; x += w / 60) { const y = h * (0.2 + i * 0.15) + Math.sin(x / w * 5 + t * 0.5 + i * 1.3) * h * 0.06 + Math.sin(x / w * 11 - t * 0.3 + i) * h * 0.015; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.strokeStyle = `rgba(${cols[i]},.10)`; c.lineWidth = h * 0.07; c.stroke(); c.strokeStyle = `rgba(${cols[i]},.65)`; c.lineWidth = Math.max(1, h * 0.004); c.stroke(); } } },
    { id: 'heat', name: 'Heatmap', tag: 'LIVE', draw(c, w, h, t) { lowres(c, w, h, 64, 36, (x, cw, ch) => { const im = x.createImageData(cw, ch);
        for (let j = 0; j < ch; j++) { const band = Math.pow(Math.max(0, Math.sin(j * 0.9 + 1.3) * Math.sin(j * 0.37)), 2); for (let i = 0; i < cw; i++) { const v = Math.max(0, Math.min(1, band * (0.55 + 0.45 * Math.sin((i + t * 6) * 0.18 + j)) * 1.2));
          const k = (j * cw + i) * 4; const col = v < 0.5 ? mix([6, 8, 20], [20, 90, 110], v * 2) : mix([255, 90, 31], [255, 214, 120], (v - 0.5) * 2); const cc = v < 0.5 ? col : mix([20, 90, 110], col, Math.min(1, (v - 0.5) * 3));
          im.data[k] = cc[0]; im.data[k + 1] = cc[1]; im.data[k + 2] = cc[2]; im.data[k + 3] = 255; } } x.putImageData(im, 0, 0); });
      c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i <= 60; i++) { const x = i / 60 * w, y = h * (0.5 + 0.12 * Math.sin(i * 0.3 + t * 0.4) + 0.04 * Math.sin(i * 1.7)); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); } },
    { id: 'grid', name: 'Horizon grid', tag: '3D', draw(c, w, h, t) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05050a'); g.addColorStop(0.55, '#0d0710'); g.addColorStop(1, '#140904'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      const hz = h * 0.55; glow(c, w / 2, hz, w * 0.45, '255,90,31', 0.45); c.lineWidth = 1;
      for (let i = -14; i <= 14; i++) { c.strokeStyle = 'rgba(255,120,60,.22)'; c.beginPath(); c.moveTo(w / 2 + i * w * 0.012, hz); c.lineTo(w / 2 + i * w * 0.16, h); c.stroke(); }
      for (let i = 0; i < 16; i++) { const z = ((i + t * 0.6) % 16) / 16, y = hz + (h - hz) * z * z; c.strokeStyle = `rgba(255,120,60,${0.35 * z})`; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(w / 2, hz - h * 0.12, h * 0.07, 0, 7); c.fill(); glow(c, w / 2, hz - h * 0.12, h * 0.25, '255,200,160', 0.35); } },
    { id: 'aurora', name: 'Aurora', tag: 'LIVE', draw(c, w, h, t) { c.fillStyle = '#03050a'; c.fillRect(0, 0, w, h); lowres(c, w, h, 120, 68, (x, cw, ch) => { x.fillStyle = '#03050a'; x.fillRect(0, 0, cw, ch);
      [['38,198,160', 0], ['120,90,255', 2], ['38,198,200', 4]].forEach(([col, o]) => { for (let i = 0; i < cw; i++) { const y = ch * (0.38 + 0.12 * Math.sin(i * 0.05 + t * 0.35 + o) + 0.05 * Math.sin(i * 0.17 - t * 0.5)); const g = x.createLinearGradient(0, y - ch * 0.4, 0, y + 3); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},.22)`); x.fillStyle = g; x.fillRect(i, y - ch * 0.4, 1, ch * 0.4 + 3); } }); }); } },
    { id: 'candles', name: 'Candles', tag: 'LIVE', draw(c, w, h, t) { c.fillStyle = '#060608'; c.fillRect(0, 0, w, h); glow(c, w * 0.7, h * 0.3, w * 0.5, '255,90,31', 0.18);
      const cw = w / 26, off = (t * cw * 0.35) % cw, start = Math.floor(t * 0.35) % 40; let mn = 1e9, mx = -1e9; for (let i = 0; i < 30; i++) { const k = candles[(start + i) % 80]; mn = Math.min(mn, k[2]); mx = Math.max(mx, k[1]); }
      const Y = (v) => h * 0.15 + (1 - (v - mn) / (mx - mn)) * h * 0.7; for (let i = 0; i < 30; i++) { const k = candles[(start + i) % 80], x = i * cw - off, up = k[3] >= k[0]; c.fillStyle = up ? 'rgba(38,198,160,.38)' : 'rgba(240,70,75,.32)';
        c.fillRect(x + cw * 0.48, Y(k[1]), Math.max(1, cw * 0.05), Y(k[2]) - Y(k[1])); c.fillRect(x + cw * 0.2, Y(Math.max(k[0], k[3])), cw * 0.6, Math.max(2, Math.abs(Y(k[0]) - Y(k[3])))); } } },
    { id: 'gold', name: 'Gold dust', tag: 'LIVE', draw(c, w, h, t) { c.fillStyle = '#070605'; c.fillRect(0, 0, w, h); glow(c, w * 0.5, h * 1.05, w * 0.6, '212,166,74', 0.4);
      dust.forEach(([x, y, s, r]) => { const yy = ((y - t * 0.02 * s) % 1 + 1) % 1; c.fillStyle = `rgba(240,200,120,${0.15 + 0.6 * s * (1 - yy)})`; c.beginPath(); c.arc(x * w, yy * h, r * (w / 900 + 0.4), 0, 7); c.fill(); }); } },
    { id: 'lagoon', name: 'Lagoon', tag: 'LIVE', draw(c, w, h, t) { c.fillStyle = '#4fa7b4'; c.fillRect(0, 0, w, h); const m = Math.max(w, h);
      glow(c, w * (0.25 + 0.05 * Math.sin(t * 0.2)), h * 0.2, m * 0.5, '235,248,248', 0.75); glow(c, w * 0.85, h * (0.85 + 0.05 * Math.cos(t * 0.3)), m * 0.5, '20,90,110', 0.75); } },
    { id: 'porcelain', name: 'Porcelain', tag: 'STILL', still: true, draw(c, w, h) { c.fillStyle = '#eceef2'; c.fillRect(0, 0, w, h); const s = Math.max(14, w / 70); c.fillStyle = '#c4c8d1';
      for (let y = s / 2; y < h; y += s) for (let x = s / 2; x < w; x += s) { c.beginPath(); c.arc(x, y, Math.max(0.8, w / 1400), 0, 7); c.fill(); } glow(c, w * 0.8, h * 0.1, w * 0.5, '255,255,255', 0.8); } },
  ];
  // cut: the car on its own layer (floats over a clean studio floor when the mouse moves). bb = car box in the 1600px-wide picture.
  const PHOTO = [
    { id: 'ph-hyper', name: 'Hyper', tag: '3D', src: '/look/hyper.jpg', cut: '/look/hyper-cut.webp', bb: [541, 282, 1572, 724], grp: 'car' },
    { id: 'ph-gt', name: 'Grand tourer', tag: '3D', src: '/look/gt.jpg', cut: '/look/gt-cut.webp', bb: [791, 273, 1584, 640], grp: 'car' },
    { id: 'ph-chromecar', name: 'Liquid chrome', tag: '3D', src: '/look/chromecar.jpg', cut: '/look/chromecar-cut.webp', bb: [540, 397, 1568, 658], grp: 'car' },
    { id: 'ph-coupe', name: 'Ember coupe', tag: 'DEPTH', src: '/look/coupe.jpg', grp: 'car' },
    { id: 'ph-nightrun', name: 'Night run', tag: 'DEPTH', src: '/look/nightrun.jpg', grp: 'car' },
    { id: 'ph-katana', name: 'Katana', tag: 'DEPTH', src: '/look/katana.jpg' },
    { id: 'ph-rivers', name: 'Five rivers', tag: 'DEPTH', src: '/look/rivers.jpg' },
    { id: 'ph-ridge', name: 'Ridge', tag: 'DEPTH', src: '/look/ridge.jpg' },
    { id: 'ph-chrome', name: 'Chrome horn', tag: 'DEPTH', src: '/look/chrome.jpg' },
    { id: 'ph-still', name: 'Still water', tag: 'DEPTH', src: '/look/still.jpg' },
  ];
  const VALID = new Set(['none', 'colour', 'grad', 'upload', ...LIVE.map((p) => p.id), ...PHOTO.map((p) => p.id)]);
  if (!VALID.has(S.bg)) S.bg = 'none';

  let upload = null;   // <img> or <video> of the member's own picture/clip (from IndexedDB)
  let PX = 0, PY = 0, TX = 0, TY = 0;
  function loadPhoto(p) {
    if (p.img) return;
    p.img = new Image(); p.img.onload = () => { need = true; resample = true; }; p.img.src = p.src;
    if (p.cut) { p.cimg = new Image(); p.cimg.onload = () => { need = true; resample = true; }; p.cimg.src = p.cut; }
  }
  const hasCut = (p) => p && p.cimg && p.cimg.naturalWidth;
  function cover(ctx, el, w, h) { const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight; if (!iw) return; const s = Math.max(w / iw, h / ih); ctx.drawImage(el, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s); }
  function drawBG(ctx, w, h, t, id) {
    const lv = LIVE.find((p) => p.id === id); if (lv) { lv.draw(ctx, w, h, t); return; }
    const ph = PHOTO.find((p) => p.id === id);
    if (ph) {
      loadPhoto(ph);
      if (hasCut(ph)) {   // clean studio floor + the car as its own layer = real depth when the mouse moves
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fdfdfd'); g.addColorStop(0.62, '#f1f2f4'); g.addColorStop(1, '#e6e7ea'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const d = S.depth / 100, ox = -PX * d * w * 0.07, oy = -PY * d * h * 0.04, iw = ph.cimg.naturalWidth, ih = ph.cimg.naturalHeight, k = iw / 1600, bb = ph.bb.map((v) => v * k);
        const tw = (w > h ? w * 0.36 : w * 0.85) * (1 + d * 0.06), sc = tw / (bb[2] - bb[0]), cxm = (w > h ? w * 0.6 : w * 0.5) + ox, bot = h * (w > h ? 0.86 : 0.9) + oy;
        const cxp = cxm - ((bb[0] + bb[2]) / 2) * sc, cyp = bot - bb[3] * sc;
        ctx.save(); ctx.translate(cxm - ox * 0.5, bot); ctx.scale(1, 0.09); const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, tw * 0.55); sg.addColorStop(0, 'rgba(0,0,0,.42)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, tw * 0.55, 0, 7); ctx.fill(); ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.1; ctx.translate(0, bot * 2); ctx.scale(1, -1); ctx.drawImage(ph.cimg, cxp, cyp, iw * sc, ih * sc); ctx.restore();
        ctx.drawImage(ph.cimg, cxp, cyp, iw * sc, ih * sc); return;
      }
      ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, w, h); if (ph.img.naturalWidth) cover(ctx, ph.img, w, h); return;
    }
    if (id === 'colour') { ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(S.colour) ? S.colour : '#1d3557'; ctx.fillRect(0, 0, w, h); glow(ctx, w * 0.2, 0, Math.max(w, h) * 0.8, '255,255,255', 0.08); return; }
    if (id === 'grad') { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, S.g1); g.addColorStop(1, S.g2); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); return; }
    ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, w, h); if (id === 'upload' && upload) cover(ctx, upload, w, h);
  }
  const moving = () => S.motion && (LIVE.some((p) => p.id === S.bg && !p.still) || (S.bg === 'upload' && upload && upload.tagName === 'VIDEO') || (hasCut(PHOTO.find((p) => p.id === S.bg)) && S.depth > 0));

  /* ---------- own photo / clip: kept on this device only ---------- */
  const idb = (fn) => new Promise((res) => { try { const r = indexedDB.open('look', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => fn(r.result, res); r.onerror = () => res(null); } catch (e) { res(null); } });
  const saveUpload = (file) => idb((db, res) => { const tx = db.transaction('f', 'readwrite'); tx.objectStore('f').put(file, 'bg'); tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
  const readUpload = () => idb((db, res) => { const q = db.transaction('f').objectStore('f').get('bg'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
  function useFile(file) {
    return new Promise((res) => {
      if (!file) return res(false);
      const url = URL.createObjectURL(file);
      if (/^video\//.test(file.type)) { const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.onloadeddata = () => { upload = v; need = resample = true; res(true); }; v.onerror = () => res(false); v.src = url; v.play().catch(() => {}); }
      else { const im = new Image(); im.onload = () => { upload = im; need = resample = true; res(true); }; im.onerror = () => res(false); im.src = url; }
    });
  }

  /* ---------- canvas + loop ---------- */
  let cv, cx, scrim, W = 0, H = 0, need = true, resample = true, t0 = performance.now(), last = 0, lastSample = 0, running = false;
  function mount() {
    if (cv) return;
    const wrap = document.createElement('div'); wrap.id = 'lk-bg'; wrap.setAttribute('aria-hidden', 'true');
    cv = document.createElement('canvas'); scrim = document.createElement('i'); wrap.append(cv, scrim);
    document.body.prepend(wrap); cx = cv.getContext('2d');
    const size = () => { const d = Math.min(1.5, window.devicePixelRatio || 1) * 0.75; W = Math.max(2, Math.round(cv.clientWidth * d)); H = Math.max(2, Math.round(cv.clientHeight * d)); cv.width = W; cv.height = H; need = true; };
    addEventListener('resize', size); size();
    addEventListener('pointermove', (e) => { TX = e.clientX / innerWidth - 0.5; TY = e.clientY / innerHeight - 0.5; }, { passive: true });
  }
  function frame(n) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const d = S.depth / 100, fine = matchMedia('(pointer:fine)').matches;
    if (!fine && S.motion) { TX = Math.sin(n / 4000) * 0.35; TY = Math.cos(n / 5200) * 0.25; }
    PX += (TX - PX) * 0.06; PY += (TY - PY) * 0.06;
    const cut = hasCut(PHOTO.find((p) => p.id === S.bg));
    cv.style.transform = cut || !S.motion ? '' : `perspective(1200px) rotateY(${PX * d * 3}deg) rotateX(${-PY * d * 2}deg) translate(${-PX * d * 40}px,${-PY * d * 28}px) scale(${1 + d * 0.05})`;
    const mv = moving();
    if (!mv && !need) return;
    if (mv && n - last < 33) return;
    last = n; need = false;
    drawBG(cx, W, H, mv ? (n - t0) / 1000 + 3 : 3, S.bg);
    if (resample || (S.bg === 'upload' && n - lastSample > 2000)) { resample = false; lastSample = n; sample(); }
  }

  /* ---------- measure + recolour ---------- */
  const sm = document.createElement('canvas'); sm.width = 24; sm.height = 14; const sx = sm.getContext('2d', { willReadFrequently: true });
  let avg = [5, 5, 7], busy = 0;
  function sample() {
    try {
      sx.drawImage(cv, 0, 0, 24, 14); const d = sx.getImageData(0, 0, 24, 14).data; let r = 0, g = 0, b = 0; const ls = [];
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; ls.push(L([d[i], d[i + 1], d[i + 2]])); }
      const n = d.length / 4; avg = [r / n, g / n, b / n]; const m = ls.reduce((a, v) => a + v, 0) / n;
      busy = Math.min(1, Math.sqrt(ls.reduce((a, v) => a + (v - m) * (v - m), 0) / n) * 3.2);
    } catch (e) { /* tainted canvas: keep the last values */ }
    tokens();
  }
  // Panels stay dark glass (every members page is built light-on-dark); how see-through they are depends on the
  // background, so white text keeps at least 7:1 on them. Text that sits straight on the background flips dark/light.
  const PANELS = { auto: [12, 12, 16], midnight: [14, 18, 32], onyx: [6, 6, 8], graphite: [30, 31, 36] };
  let last_ = {};
  function tokens() {
    const dim = S.dim / 100, bgEff = mix(avg, [0, 0, 0], dim), lb = L(bgEff);
    if (scrim) scrim.style.opacity = dim;
    if (cv) cv.style.filter = S.blur ? `blur(${S.blur}px)` : '';
    const surf = PANELS[S.panel] || PANELS.auto;
    const W_ = [242, 242, 244];
    // Content sheet: every members page has white titles and numbers sitting straight on the page, so on a light or
    // busy background a dark frosted sheet goes behind the page content until white text reaches 7:1 on it.
    // On dark backgrounds it stays almost clear and the picture shows crisp.
    let sa = 0.08 + busy * 0.2, sheetEff = mix(bgEff, [8, 8, 10], sa);
    while (CR(W_, sheetEff) < 7 && sa < 0.9) { sa += 0.03; sheetEff = mix(bgEff, [8, 8, 10], sa); }
    let a = S.panel === 'onyx' ? 0.94 : 0.5 + busy * 0.3; if (S.panel === 'graphite') a += 0.08;
    let eff = mix(sheetEff, surf, a);
    while (CR(W_, eff) < 7.5 && a < 0.97) { a += 0.03; eff = mix(sheetEff, surf, a); }
    const muted = fit(mix(W_, eff, 0.5), eff, 4.8, W_);
    const ac = accentOf(S.accent), A = hex2(ac.hex);
    const accTxt = fit(A, eff, 3.4, [255, 255, 255]);
    const accInk = CR([255, 255, 255], A) >= CR([12, 12, 16], A) ? '#ffffff' : '#0c0c10';
    const headDark = CR([12, 12, 16], bgEff) > CR(W_, bgEff);
    const set = (k, v) => root.style.setProperty(k, v);
    const surfA = rgba(surf, a), surf2 = rgba(mix(surf, [255, 255, 255], 0.04), a);
    set('--card', surfA); set('--card-2', 'rgba(255,255,255,.055)'); set('--bg', 'rgba(0,0,0,.28)');
    set('--q-tile', surfA); set('--q-tile-2', surf2); set('--q-edge', 'rgba(255,255,255,.08)');
    set('--lk-side', rgba(surf, Math.min(0.97, a + 0.08))); set('--lk-surf', surfA); set('--lk-eff', toHex(eff));
    set('--muted', toHex(muted)); set('--q-label', toHex(muted));
    set('--accent', ac.hex); set('--accent-text', accInk); set('--accent-2', toHex(accTxt)); set('--accent-ink', toHex(accTxt)); set('--accent-hover', toHex(mix(A, [255, 255, 255], 0.15)));
    set('--accent-soft', rgba(A, 0.14)); set('--lk-acc-fill', ac.metal ? metalFill(ac.hex) : ac.hex);
    set('--lk-head', headDark ? '#0c0c10' : '#f4f4f6'); set('--lk-head-2', headDark ? 'rgba(12,12,16,.68)' : 'rgba(244,244,246,.72)');
    set('--lk-head-shadow', busy > 0.25 ? (headDark ? '0 1px 12px rgba(255,255,255,.75)' : '0 2px 16px rgba(0,0,0,.7)') : 'none');
    set('--lk-blur', Math.round(14 + busy * 18) + 'px'); set('--lk-sheet', `rgba(8,8,10,${sa.toFixed(2)})`); set('--lk-sheet-blur', Math.round(sa * 6) + 'px');   // a little frost only: the car and scene stay sharp behind the page
    root.classList.toggle('lk-lightbg', headDark);
    last_ = { contrast: CR(W_, eff), muted: CR(muted, eff), headDark, shifted: CR(A, eff) < 3.4, lb, sheet: sa };
    document.dispatchEvent(new CustomEvent('look:measured', { detail: last_ }));
  }
  const CLEAR = ['--card', '--card-2', '--bg', '--q-tile', '--q-tile-2', '--q-edge', '--lk-side', '--lk-surf', '--lk-eff', '--muted', '--q-label', '--accent', '--accent-text', '--accent-2', '--accent-ink', '--accent-hover', '--accent-soft', '--lk-acc-fill', '--lk-head', '--lk-head-2', '--lk-head-shadow', '--lk-blur', '--lk-sheet', '--lk-sheet-blur'];

  /* ---------- apply ---------- */
  async function apply(next) {
    if (next) S = Object.assign({}, DEF, S, next);
    if (!VALID.has(S.bg)) S.bg = 'none';
    if (S.bg === 'none') {   // classic look: remove everything we added
      running = false; root.classList.remove('lk', 'lk-lightbg'); CLEAR.forEach((k) => root.style.removeProperty(k));
      const w = document.getElementById('lk-bg'); if (w) w.style.display = 'none';
      return;
    }
    root.classList.add('lk');
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => apply(), { once: true }); return; }
    mount(); document.getElementById('lk-bg').style.display = '';
    if (S.bg === 'upload' && !upload) { const f = await readUpload(); if (!f || !(await useFile(f))) { S.bg = 'ember'; } }
    const ph = PHOTO.find((p) => p.id === S.bg); if (ph) loadPhoto(ph);
    need = resample = true;
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  root.classList.toggle('lk', S.bg !== 'none');   // before first paint: drop the solid page colour at once
  apply();

  window.LOOK = { get state() { return Object.assign({}, S); }, apply, LIVE, PHOTO, METAL, MATTE, metalFill, accentOf, drawBG, saveUpload, useFile, readUpload, hex2, CR, get measured() { return last_; } };
})();
