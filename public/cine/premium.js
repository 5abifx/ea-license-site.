/* 5ABI.FX premium layer: custom cursor, magnetic buttons, word-by-word blur reveals,
   tilt + light sheen on cards, a live 3D chrome logo in the hero, and the five rivers scene.
   Loaded as a module after the page script. Touch screens skip the cursor and tilt. */
const THREE_URL = window.P3_THREE || '/vendor/three-0.160.0.module.min.js';
const doc = document.documentElement;
const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
const phone = matchMedia('(max-width: 760px)').matches;
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- 1. cursor: orange dot + trailing ring that grows on anything clickable ---------- */
if (fine) {
  const c = document.createElement('div');
  c.id = 'p3c';
  c.innerHTML = '<i class="r"><b></b></i><i class="d"></i>';
  document.body.appendChild(c);
  doc.classList.add('p3-cur');
  const r = c.querySelector('.r'), d = c.querySelector('.d'), lab = r.querySelector('b');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, shown = false;
  const HOT = 'a,button,[role=button],label,select,summary,[data-cur]';
  addEventListener('pointermove', e => {
    mx = e.clientX; my = e.clientY;
    if (!shown) { shown = true; rx = mx; ry = my; c.classList.add('on'); }
    d.style.transform = `translate(${mx}px,${my}px)`;
    const t = e.target.closest ? e.target : null;
    const typing = t && t.closest('input,textarea,[contenteditable]');
    const hot = t && t.closest(HOT);
    const view = t && t.closest('canvas,.viz');
    c.classList.toggle('hide', !!typing);
    c.classList.toggle('hot', !!hot);
    c.classList.toggle('view', !hot && !!view);
    const text = hot && hot.dataset.cur || '';
    if (lab.textContent !== text) lab.textContent = text;
    c.classList.toggle('lab', !!text);
  }, { passive: true });
  addEventListener('scroll', () => { if (!shown) return; const el = document.elementFromPoint(mx, my); if (el) el.dispatchEvent(new PointerEvent('pointermove', { clientX: mx, clientY: my, bubbles: true })); }, { passive: true });
  addEventListener('pointerdown', () => c.classList.add('down'));
  addEventListener('pointerup', () => c.classList.remove('down'));
  document.addEventListener('mouseleave', () => c.classList.remove('on'));
  document.addEventListener('mouseenter', () => c.classList.add('on'));
  (function loop() {
    rx = lerp(rx, mx, .18); ry = lerp(ry, my, .18);
    r.style.transform = `translate(${rx}px,${ry}px)`;
    requestAnimationFrame(loop);
  })();

  /* magnetic buttons */
  document.querySelectorAll('nav .go,.hero .pills a,.p3-tile,.close a,.p3-mag').forEach(el => {
    const k = el.classList.contains('p3-tile') ? .08 : .28;
    el.addEventListener('pointermove', e => {
      const b = el.getBoundingClientRect();
      el.style.translate = `${(e.clientX - b.left - b.width / 2) * k}px ${(e.clientY - b.top - b.height / 2) * k}px`;
    });
    el.addEventListener('pointerleave', () => { el.style.translate = ''; });
  });

  /* tilt + light sheen that follows the mouse */
  document.querySelectorAll('.p3-tile .ic,.rvw article,.p3-glass,.p3-tilt').forEach(el => {
    el.classList.add('p3-sheen');
    const max = el.classList.contains('ic') ? 18 : 6;
    el.addEventListener('pointermove', e => {
      const b = el.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      el.style.setProperty('--mx', (x * 100) + '%'); el.style.setProperty('--my', (y * 100) + '%');
      el.style.transform = `perspective(900px) rotateX(${(.5 - y) * max}deg) rotateY(${(x - .5) * max}deg)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

/* ---------- 2. headlines fade in word by word, out of a blur ---------- */
function splitWords(el) {
  let i = 0;
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const parts = n.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        parts.forEach(p => {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          const s = document.createElement('span');
          s.className = 'w'; s.style.setProperty('--i', i++); s.textContent = p;
          frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
  };
  walk(el);
  el.classList.add('p3w');
}
document.querySelectorAll('h1.rv,h2.rv').forEach(splitWords);

/* ---------- 3. the live 3D chrome logo ---------- */
const HORN = [-.7875,.5125,-.8172,.51,-.8469,.5075,-.8756,.5025,-.9043,.4975,-.932,.49,-.9596,.4825,-.9862,.4725,-1.0098,.4552,-1.015,.4266,-1.005,.4,-.985,.3775,-.9604,.3625,-.9338,.3525,-.9072,.3425,-.8806,.3325,-.855,.32,-.8296,.3071,-.8049,.2924,-.781,.276,-.757,.2595,-.7338,.2413,-.7108,.2225,-.6888,.2013,-.6672,.1797,-.6474,.1562,-.6281,.1323,-.6098,.1077,-.5926,.0823,-.5762,.0566,-.5604,.0302,-.5447,.0038,-.5296,-.0234,-.5164,-.0516,-.5041,-.0803,-.4926,-.1093,-.4812,-.1384,-.4659,-.1652,-.4509,-.1922,-.4335,-.2178,-.4133,-.2416,-.3909,-.2629,-.3666,-.2829,-.3429,-.3002,-.3175,-.3159,-.2915,-.3302,-.2648,-.3433,-.2381,-.3549,-.2104,-.3646,-.1823,-.3729,-.1528,-.3756,-.1225,-.3768,-.0925,-.3775,-.0625,-.3775,-.0325,-.3775,-.0025,-.3775,.0275,-.3775,.0575,-.3775,.0875,-.3772,.1179,-.3763,.1474,-.3741,.1767,-.3684,.2047,-.3606,.2324,-.3513,.2595,-.3398,.2861,-.3274,.3126,-.3145,.3384,-.2995,.3631,-.2829,.3879,-.2657,.4118,-.2468,.4345,-.227,.4555,-.2053,.4755,-.1826,.4929,-.1584,.5082,-.1336,.5232,-.1084,.5367,-.0825,.5486,-.0558,.5609,-.0292,.5737,-.0026,.5862,.0242,.5982,.0514,.6106,.0782,.6243,.1046,.6394,.1301,.6567,.1546,.6747,.1784,.6938,.2017,.7146,.2236,.7364,.2441,.7591,.2639,.7832,.2819,.8086,.2985,.8346,.3132,.8613,.3263,.888,.3389,.9146,.3514,.9411,.3635,.9673,.3769,.9926,.3922,1.0108,.4144,1.0128,.4426,.9998,.4686,.9744,.4796,.9469,.4886,.9187,.4951,.8894,.5,.8602,.5045,.8307,.508,.8007,.5107,.7709,.5125,.7409,.5125,.7109,.5125,.6809,.5103,.6511,.5075,.6216,.5031,.5926,.4973,.5639,.49,.5358,.4815,.5081,.4715,.4808,.4602,.4547,.4463,.4291,.4309,.4045,.4147,.3807,.3967,.3577,.3773,.3361,.3567,.3156,.3348,.2958,.3121,.2769,.2888,.2593,.2645,.2422,.2397,.2264,.214,.2094,.189,.1869,.1688,.1645,.1489,.1381,.1347,.1103,.1236,.0819,.1163,.0526,.1121,.0228,.1103,-.0072,.1103,-.0372,.1104,-.0669,.1135,-.0966,.1184,-.1248,.1281,-.1526,.1384,-.1785,.1534,-.2044,.169,-.2258,.1901,-.2468,.2116,-.2647,.2357,-.2822,.2601,-.2994,.2847,-.3168,.3091,-.3363,.3319,-.357,.3536,-.3782,.3748,-.4013,.3939,-.4248,.4126,-.4501,.4286,-.4757,.4443,-.5024,.4579,-.5297,.4703,-.5575,.4812,-.5859,.4909,-.6148,.4987,-.6442,.5047,-.6738,.5091,-.7036,.5121,-.7336,.5125,-.7636,.5125];

function envScene(T) {
  // a dark studio with soft white boxes, one orange strip and a faint teal strip:
  // the chrome reflects these, so the logo picks up the brand colours.
  const s = new T.Scene();
  s.background = new T.Color(0x101014);
  const box = (w, h, color, x, y, z, ry = 0, rx = 0) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color, side: T.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; m.rotation.x = rx; s.add(m);
  };
  box(14, 4, 0xffffff, 0, 6, 0, 0, Math.PI / 2);            // big top softbox
  box(40, 9, 0xe8e8ee, 0, 4.6, 9, Math.PI);                 // bright sky behind the camera: the chrome "horizon"
  box(40, 4, 0x2a2a30, 0, -2.5, 9, Math.PI);                // dark ground behind the camera
  box(3, 9, 0xf2f2f6, -7, 1, 2, Math.PI / 2);               // left strip
  box(1.4, 9, 0xff5a1f, 7, 0, 1, -Math.PI / 2);             // orange strip (right)
  box(10, .35, 0xff7a3d, 0, .15, 8.9, Math.PI);             // thin orange line on the horizon
  box(1, 6, 0x1fb7a0, 3, 0, -8, 0);                         // faint teal
  return s;
}


/* Puffy "pillow" mesh from an outline: a fine grid inside the shape, raised by distance
   from the edge and smoothed, with the outer ring snapped onto the outline so the
   silhouette stays clean. Front and back share the rim, so the metal wraps round. */
function pillow(T, P, R, H, step) {
  const n = P.length;
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  P.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
  x0 -= step * 2; y0 -= step * 2;
  const cols = Math.ceil((x1 - x0) / step) + 3, rows = Math.ceil((y1 - y0) / step) + 3, N = cols * rows;
  const inside = new Uint8Array(N), z = new Float32Array(N), px = new Float32Array(N), py = new Float32Array(N);
  const near = (x, y) => { // nearest point on the outline and its distance
    let bd = 9, bx = 0, by = 0;
    for (let j = 0; j < n; j++) {
      const a = P[j], b = P[(j + 1) % n], ex = b.x - a.x, ey = b.y - a.y;
      const u = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey)));
      const qx = a.x + ex * u, qy = a.y + ey * u, d = Math.hypot(x - qx, y - qy);
      if (d < bd) { bd = d; bx = qx; by = qy; }
    }
    return [bd, bx, by];
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, x = x0 + c * step, y = y0 + r * step;
    let ins = false;
    for (let j = 0, k = n - 1; j < n; k = j++) {
      const a = P[j], b = P[k];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ins = !ins;
    }
    px[i] = x; py[i] = y;
    if (ins) { inside[i] = 1; const t = Math.min(1, near(x, y)[0] / R); z[i] = H * Math.sqrt(1 - (1 - t) * (1 - t)); }
  }
  // outer ring: outside points touching the shape are pulled onto the outline (height 0)
  const ring = new Uint8Array(N);
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    const i = r * cols + c;
    if (inside[i]) continue;
    if (inside[i - 1] || inside[i + 1] || inside[i - cols] || inside[i + cols] || inside[i - cols - 1] || inside[i - cols + 1] || inside[i + cols - 1] || inside[i + cols + 1]) {
      const [, qx, qy] = near(px[i], py[i]); px[i] = qx; py[i] = qy; ring[i] = 1;
    }
  }
  // soften the crease along the middle of each horn
  for (let pass = 0; pass < 4; pass++) {
    const zz = z.slice();
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c; if (!inside[i]) continue;
      zz[i] = (z[i] * 4 + z[i - 1] + z[i + 1] + z[i - cols] + z[i + cols]) / 8;
    }
    z.set(zz);
  }
  const pos = [], idx = [], front = new Int32Array(N).fill(-1), back = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!inside[i] && !ring[i]) continue;
    front[i] = pos.length / 3; pos.push(px[i], py[i], z[i]);
    if (inside[i]) { back[i] = pos.length / 3; pos.push(px[i], py[i], -z[i]); } else back[i] = front[i];
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    for (const [p, q, s] of [[a, b, e], [a, e, d]]) {
      if (front[p] < 0 || front[q] < 0 || front[s] < 0) continue;
      if (!inside[p] && !inside[q] && !inside[s]) continue;
      idx.push(front[p], front[q], front[s], back[p], back[s], back[q]);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

async function heroLogo() {
  const hero = document.querySelector(".hero[data-p3-logo]");
  if (!hero) return;
  const wrap = document.createElement('div');
  wrap.className = 'p3-logo';
  wrap.innerHTML = '<div class="halo"></div><canvas aria-label="5ABI.FX chrome logo" role="img"></canvas>';
  hero.appendChild(wrap);
  hero.classList.add('p3-hero');
  const canvas = wrap.querySelector('canvas');
  let T;
  try { T = await import(THREE_URL); } catch (e) { wrap.classList.add('flat'); return; }
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { wrap.classList.add('flat'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene(T), .035).texture;
  const cam = new T.PerspectiveCamera(28, 1, .1, 50);
  cam.position.set(0, 0, 6.2);

  const chrome = new T.MeshPhysicalMaterial({ color: 0xe4e4ea, metalness: 1, roughness: .1, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.1 });
  const pts = []; for (let i = 0; i < HORN.length; i += 2) pts.push(new T.Vector2(HORN[i] * .96, HORN[i + 1] * .96));
  const geo = pillow(T, pts, .2, .13, phone ? .016 : .011);
  const logo = new T.Group();
  logo.add(new T.Mesh(geo, chrome));
  chrome.side = T.DoubleSide;
  const ball = new T.Mesh(new T.SphereGeometry(.17, 64, 48), chrome);
  ball.position.set(0, -.54, .02); logo.add(ball);
  logo.position.y = .12;
  const rig = new T.Group(); rig.add(logo); scene.add(rig);

  // a warm light that follows the mouse: it slides a highlight over the metal
  const key = new T.PointLight(0xffa070, 5, 10, 1.6); key.position.set(1.5, 1, 2.5); scene.add(key);
  scene.add(new T.AmbientLight(0xffffff, .15));

  // two liquid chrome drops drifting near the logo (PC only)
  const drops = [];
  if (!phone) {
    const dg = new T.SphereGeometry(1, 72, 54);
    [[-1.55, .95, -.8, .2], [1.7, -.9, -.4, .16], [1.25, 1.05, -1.6, .1]].forEach(([x, y, z, s], k) => {
      const g = dg.clone(); const base = g.attributes.position.array.slice();
      const m = new T.Mesh(g, chrome); m.position.set(x, y, z); m.scale.setScalar(s);
      scene.add(m); drops.push({ m, base, k, x, y });
    });
  }

  function size() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    cam.position.z = w / h < .9 ? 7.6 : 6.2;
    cam.updateProjectionMatrix();
  }
  size(); addEventListener('resize', size);

  let tx = 0, ty = 0, ax = 0, ay = 0, seen = true, born = 0;
  addEventListener('pointermove', e => { tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  new IntersectionObserver(es => { seen = es[0].isIntersecting; }).observe(hero);
  const start = () => { if (!born) born = performance.now(); };
  if (doc.classList.contains('ready')) start(); else new MutationObserver((_, o) => { if (doc.classList.contains('ready')) { start(); o.disconnect(); } }).observe(doc, { attributes: true });
  setTimeout(start, 2600);
  wrap.classList.add('live');

  const t0 = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    if (!seen) return;
    const t = (now - t0) / 1000;
    const intro = born ? Math.min(1, (now - born) / 2200) : 0;
    const e = 1 - Math.pow(1 - intro, 4);
    const sp = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight || 1)));
    ax = lerp(ax, tx, .05); ay = lerp(ay, ty, .05);
    rig.rotation.y = (1 - e) * -2.6 + ax * .55 + Math.sin(t * .45) * .12 + sp * 1.4;
    rig.rotation.x = ay * .32 + Math.sin(t * .6) * .04 - sp * .3;
    rig.position.y = Math.sin(t * .9) * .05 + sp * 1.2 - (1 - e) * .4;
    rig.scale.setScalar((.7 + .3 * e) * (1 - sp * .25));
    key.position.set(ax * 3, -ay * 2 + .6, 2.6);
    drops.forEach(o => {
      const p = o.m.geometry.attributes.position, a = p.array, b = o.base;
      for (let i = 0; i < a.length; i += 3) {
        const x = b[i], y = b[i + 1], z = b[i + 2];
        const n = 1 + .16 * Math.sin(x * 3.1 + t * 1.3 + o.k) * Math.sin(y * 2.7 + t * 1.1) + .08 * Math.sin(z * 4 + t * 1.7);
        a[i] = x * n; a[i + 1] = y * n; a[i + 2] = z * n;
      }
      p.needsUpdate = true; o.m.geometry.computeVertexNormals();
      o.m.position.set(o.x - ax * .25 * (o.k + 1), o.y + Math.sin(t * .7 + o.k) * .12 + ay * .2 + sp * (1.6 + o.k), o.m.position.z);
      o.m.rotation.set(t * .2, t * .3 + o.k, 0);
      o.m.visible = e > .3;
    });
    renderer.render(scene, cam);
  })(t0);
}

/* ---------- 4. five rivers scene ---------- */
function rivers() {
  const sec = document.getElementById('rivers');
  if (!sec) return;
  const cv = sec.querySelector('canvas'), g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, on = false;
  const size = () => { dpr = Math.min(devicePixelRatio, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; };
  size(); addEventListener('resize', size);
  new IntersectionObserver(es => { on = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(sec);
  const cols = ['#ff5a1f', '#ffb07a', '#f2f2f4', '#ffb07a', '#1fb7a0'];
  const sparks = Array.from({ length: 140 }, (_, i) => ({ r: i % 5, s: Math.random(), v: .05 + Math.random() * .08 }));
  // a river: from the horizon (all five meet at one point) fanning out to the bottom edge
  const river = (k, s, wob) => {
    const cx = W > 980 ? .64 : .5, hx = W * cx, hy = H * .46;
    const ex = W * (cx + (k - 2) * .3), ey = H * 1.05;
    const y = hy + (ey - hy) * s * s;
    const x = hx + (ex - hx) * s * s + Math.sin(s * 7 + k * 1.7 + wob) * W * .025 * s;
    return [x, y];
  };
  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    if (!on || !W) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    const r = sec.getBoundingClientRect(), sp = 1 - (r.top + r.height) / (innerHeight + r.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#050507'); sky.addColorStop(.42, '#140a06'); sky.addColorStop(.47, '#2a1206'); sky.addColorStop(.55, '#0a0809'); sky.addColorStop(1, '#050507');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sun glow on the horizon
    const sx = W * (W > 980 ? .64 : .5), sun = g.createRadialGradient(sx, H * .46, 0, sx, H * .46, W * .38);
    sun.addColorStop(0, 'rgba(255,120,50,.55)'); sun.addColorStop(.25, 'rgba(255,90,31,.16)'); sun.addColorStop(1, 'rgba(255,90,31,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    // three mountain ridges, moving at different speeds as you scroll
    [[.40, '#0d0b0c', .9, 1], [.43, '#0a090a', 1.4, 2], [.47, '#070607', 2.2, 3]].forEach(([base, col, amp, k]) => {
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 16) {
        const u = x / W + sp * .06 * k;
        const y = H * base - (Math.sin(u * 9 + k) * .5 + Math.sin(u * 23 + k * 2) * .25 + Math.sin(u * 51) * .1 + .6) * H * .05 * amp;
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath(); g.fillStyle = col; g.fill();
    });
    // the five rivers
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
      for (const [w, a] of [[14, .05], [5, .14], [1.4, .7]]) {
        g.beginPath();
        for (let i = 0; i <= 60; i++) { const [x, y] = river(k, i / 60, t * .3); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.strokeStyle = cols[k]; g.globalAlpha = a; g.lineWidth = w; g.stroke();
      }
    }
    sparks.forEach(p => {
      p.s -= p.v * dt; if (p.s < 0) p.s += 1;
      const [x, y] = river(p.r, p.s, t * .3);
      g.globalAlpha = .9 * (1 - p.s * .3); g.fillStyle = cols[p.r];
      g.beginPath(); g.arc(x, y, .8 + p.s * 2.2, 0, 7); g.fill();
    });
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(5,5,7,1)'); fade.addColorStop(.12, 'rgba(5,5,7,0)'); fade.addColorStop(.86, 'rgba(5,5,7,0)'); fade.addColorStop(1, 'rgba(5,5,7,1)');
    g.fillStyle = fade; g.fillRect(0, 0, W, H);
  })(last);
  // the giant glass word drifts slowly as you scroll
  const big = sec.querySelector('.big');
  if (big) addEventListener('scroll', () => { const r = sec.getBoundingClientRect(); big.style.transform = `translate3d(${(r.top / innerHeight) * -60}px,0,0)`; }, { passive: true });
}

const go = () => { heroLogo(); rivers(); };
if (document.readyState === 'complete') go(); else addEventListener('load', go);
