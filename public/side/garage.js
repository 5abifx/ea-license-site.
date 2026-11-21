// The 3D garage in the right side column: drag to turn, scroll to zoom (the car comes out of the card as you zoom in),
// tap the car to rev it, double-tap for a burnout with tyre smoke. Engine and tyre sounds are made in the browser
// (Web Audio), no sound files. Paint is picked in Appearance (look.paint).
// three.js r160 (MIT) is vendored in /vendor/three. The car (car.glb) was made from the "Hyper" background picture.
import * as THREE from '/vendor/three/three.module.min.js';
import { GLTFLoader } from '/vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from '/vendor/three/controls/OrbitControls.js';

// paint: [colour over the model's texture, finish]. 'original' keeps the photo texture; the rest use a grey copy of it
// (keeps windows, lights and wheels, drops the photo's baked orange glare) under real car paint: a clear coat over the
// colour, or a satin finish for matte black.
const PAINTS = {
  original: ['#ffffff', 'gloss'], obsidian: ['#2b2b30', 'gloss'], matte: ['#3a3a3f', 'matte'], ember: ['#ff6a2c', 'gloss'],
  chrome: ['#e6e9ef', 'chrome'], teal: ['#2fc9a8', 'gloss'], royal: ['#5f7dff', 'gloss'], gold: ['#f0b83e', 'gloss'],
};
// the canvas is bigger than the card (this much extra left/above, as a share of the card's size), so a zoomed-in car
// can come out over the page; at normal zoom it sits inside the card exactly as before
const OUT = { l: 0.9, t: 0.45 };   // right and bottom run to the window edge
// The cars (picked in Appearance, look.car). Each model is one scanned mesh; the wheels are cut out of it by position:
// axles [centre x, centre y, radius, rear?] in the model's own units (+x is the rear, -x the nose), zCut = how far out a
// point must be to count as wheel, zMid = the wheel's centre plane, zFace = its outer face (for the speed blur disc).
// No badges or logos on any model.
const CARS = {
  hyper: { glb: '/side/car.glb', len: 2.5, axles: [[0.627, -0.08, 0.162, true], [-0.563, -0.09, 0.152, false]], zCut: 0.26, zMid: 0.36, zFace: 0.452, engine: 'hyper' },
  gwagon: { glb: '/side/gwagon.glb', len: 2.35, axles: [[0.565, -0.219, 0.19, true], [-0.652, -0.231, 0.182, false]], zCut: 0.29, zMid: 0.36, zFace: 0.428, engine: 'g63' },
};
// Engine voices. res = exhaust resonances [Hz, bandwidth Hz, gain]; beat = firing strength pattern; fire = firings per
// crank turn; pops = overrun bangs [rev, burnout]; turbo = whistle under boost + a blow-off hiss when lifting.
const ENGINES = {
  // flat-out mid-engine V8: bright, rev-happy
  v8: { idle: 950, max: [6400, 7100], rate: [5.5, 3.2], fc: [2600, 1300], drive: 1.4, fire: 4, pops: [5, 7],
    res: [[78, 26, 1.0], [156, 40, 0.75], [262, 60, 0.42], [430, 90, 0.22], [1150, 300, 0.07]], beat: [1, 0.72, 0.9, 0.66, 0.97, 0.7, 0.93, 0.76] },
  // hypercar: flat-plane V8 that revs to 9,000. Even firing gives a hard, raspy scream instead of a burble; it
  // snaps up fast, with a few sharp cracks on lift-off
  hyper: { idle: 1150, max: [8000, 8900], rate: [8.5, 4.6], fc: [4200, 2000], drive: 1.25, fire: 4, pops: [3, 5],
    res: [[104, 32, 0.85], [208, 50, 0.9], [352, 70, 0.6], [620, 130, 0.36], [1500, 400, 0.14], [2900, 700, 0.05]], beat: [1, 0.94, 0.99, 0.92] },
  // tuned twin-turbo 4.0 V8 in a heavy SUV with a big-bore exhaust: deep, slower to rev, loud crackle on lift-off
  g63: { idle: 720, max: [5600, 6200], rate: [4.0, 2.5], fc: [1900, 950], drive: 1.8, fire: 4, pops: [11, 15], turbo: true,
    res: [[58, 20, 1.0], [116, 30, 0.9], [196, 46, 0.55], [350, 80, 0.26], [900, 260, 0.08]], beat: [1, 0.64, 0.93, 0.6, 0.99, 0.66, 0.9, 0.7] },
};

export default function garage(card) {
  const cv = card.querySelector('canvas'), hint = card.querySelector('.sc-hint');
  // the canvas lives on <body> (fixed) so the card's glass and the column's scrolling can't clip the car
  cv.classList.add('sc-car3d'); document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));   // 1.5x is sharp on a small card and far cheaper than 2x
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  cam.position.set(4.4, 1.9, 4.8);
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff5a1f';
  const pm = new THREE.PMREMGenerator(r);
  // studio reflections: a soft grey sky with long light strips above, like a car photo studio (much better on gloss
  // and chrome than a plain room)
  const sky = document.createElement('canvas'); sky.width = 1024; sky.height = 512;
  { const x = sky.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#d4d6dc'); g.addColorStop(0.4, '#7a7c84'); g.addColorStop(0.5, '#34353a'); g.addColorStop(0.62, '#141416'); g.addColorStop(1, '#070708');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    x.filter = 'blur(6px)'; x.fillStyle = '#ffffff';
    [[60, 70, 260, 26], [420, 54, 300, 22], [780, 80, 200, 30], [200, 150, 520, 10]].forEach(([l, t, w, h]) => x.fillRect(l, t, w, h));
    x.fillStyle = accent(); x.globalAlpha = 0.5; x.fillRect(0, 225, 1024, 6); }
  const skyTex = new THREE.CanvasTexture(sky); skyTex.mapping = THREE.EquirectangularReflectionMapping; skyTex.colorSpace = THREE.SRGBColorSpace;
  sc.environment = pm.fromEquirectangular(skyTex).texture; sc.environmentIntensity = 1.15; r.toneMappingExposure = 1.15;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 6, 2); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); sc.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(accent()), 0.8); rim.position.set(-4, 2, -3); sc.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  // soft glow on the floor in the theme colour
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const glowTex = new THREE.CanvasTexture(gc);
  const paintGlow = (a) => { const gx = gc.getContext('2d'), g = gx.createRadialGradient(128, 128, 0, 128, 128, 128), c = new THREE.Color(accent());
    gx.clearRect(0, 0, 256, 256); g.addColorStop(0, `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); gx.fillStyle = g; gx.fillRect(0, 0, 256, 256); glowTex.needsUpdate = true; };
  paintGlow(0.35);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.002; sc.add(glow);
  // headlights for the rev
  const lights = [new THREE.PointLight(0xffffff, 0, 3), new THREE.PointLight(0xffffff, 0, 3)];
  lights.forEach((l) => sc.add(l));

  // drag/zoom on the card itself (the canvas lets clicks through to the page)
  const ctl = new OrbitControls(cam, card);
  Object.assign(ctl, { enableDamping: true, autoRotate: true, autoRotateSpeed: 0.8, enablePan: false, minPolarAngle: 0.6, maxPolarAngle: 1.45, minDistance: 2.2, maxDistance: 9 });
  ctl.target.set(0, 0.45, 0);
  card.style.touchAction = 'none'; card.style.cursor = 'grab';

  let car = null, mats = [], rev = 0, revT = 0, burn = 0, burnT = 0, emit = 0;
  // the scan is one mesh: cut each wheel disc out of it (by position) so it can spin and steer.
  // [centre x, centre y, radius] in the model's own units; +x is the rear (big wheels, wing), -x the nose
  const CAR = CARS[(window.__LOOK && window.__LOOK.car) || 'hyper'] || CARS.hyper, AXLES = CAR.axles;
  const wheels = [], pivot = new THREE.Vector3(), nose = new THREE.Vector3();
  let blurT = null;
  const blurTex = () => blurT || (blurT = (() => { const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), m = S / 2;
    const g = x.createRadialGradient(m, m, 0, m, m, m);
    [[0, '#0d0d0f'], [0.12, '#26272b'], [0.18, '#121214'], [0.3, '#4a4b51'], [0.42, '#2c2d32'], [0.52, '#5a5b62'], [0.6, '#303136'], [0.7, '#1a1a1d'], [0.74, '#0a0a0b'], [0.95, '#141416'], [1, '#050506']].forEach(([k, col]) => g.addColorStop(k, col));
    x.fillStyle = g; x.beginPath(); x.arc(m, m, m, 0, 7); x.fill(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) { const r0 = m * (0.2 + Math.random() * 0.5), a0 = Math.random() * 6.283; x.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); x.arc(m, m, r0, a0, a0 + 0.6 + Math.random() * 1.6); x.stroke(); }
    x.strokeStyle = 'rgba(255,90,31,.10)'; x.lineWidth = m * 0.08; x.beginPath(); x.arc(m, m, m * 0.62, 0, 7); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })());
  function splitWheels(o) {
    const g = o.geometry, pos = g.attributes.position, idx = g.index; if (!idx) return;
    const parts = []; AXLES.forEach(([x, y, rad, rear]) => [1, -1].forEach((sd) => parts.push({ x, y, rad, rear, sd, tri: [] })));
    const keep = [];
    for (let t = 0; t < idx.count; t += 3) {
      const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const hit = parts.find((p) => v.every((k) => pos.getZ(k) * p.sd > CAR.zCut && Math.hypot(pos.getX(k) - p.x, pos.getY(k) - p.y) < p.rad));
      (hit ? hit.tri : keep).push(v[0], v[1], v[2]);
    }
    g.setIndex(keep);
    parts.forEach((p) => {
      if (!p.tri.length) return;
      const wg = new THREE.BufferGeometry(); for (const k in g.attributes) wg.setAttribute(k, g.attributes[k]); wg.setIndex(p.tri);
      const steer = new THREE.Group(), spin = new THREE.Group(), m = new THREE.Mesh(wg, o.material), cz = CAR.zMid * p.sd;
      steer.position.set(p.x, p.y, cz); m.position.set(-p.x, -p.y, -cz); m.castShadow = true;
      spin.add(m); steer.add(spin); o.add(steer);
      // motion-blur disc over the outer face, faded in with wheel speed (fast spokes otherwise look frozen or backwards)
      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.rad * 0.97, 64), new THREE.MeshStandardMaterial({ map: blurTex(), metalness: 0.7, roughness: 0.42, transparent: true, opacity: 0, depthWrite: false }));
      disc.position.z = (CAR.zFace - CAR.zMid) * p.sd; if (p.sd < 0) disc.rotation.y = Math.PI; spin.add(disc);
      wheels.push({ steer, spin, rear: p.rear, disc });
    });
  }
  const holder = new THREE.Group(); sc.add(holder);
  new GLTFLoader().load(CAR.glb, (g) => {
    car = g.scene;
    const b = new THREE.Box3().setFromObject(car), s = new THREE.Vector3(); b.getSize(s);
    car.scale.setScalar(CAR.len / Math.max(s.x, s.z));
    const b2 = new THREE.Box3().setFromObject(car), c = new THREE.Vector3(); b2.getCenter(c);
    car.position.x -= c.x; car.position.z -= c.z; car.position.y -= b2.min.y;
    // (collect the meshes first: cutting out the wheels adds new meshes to the car)
    const meshes = []; car.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.forEach((o) => {
      o.castShadow = true; o.receiveShadow = true;
      // swap the plain scanned material for car paint (clear coat over the colour)
      // the scan's normal map and hard normals make it look faceted / plastic: use smooth normals instead
      smoothNormals(o.geometry);
      const old = o.material, m = new THREE.MeshPhysicalMaterial({ map: old.map, side: old.side });
      if (m.map) m.map.anisotropy = r.capabilities.getMaxAnisotropy();
      m.userData.photo = old.map; m.userData.grey = greyMap(old.map);
      old.dispose(); o.material = m; mats.push(m);
      splitWheels(o);
    });
    holder.add(car);
    // headlights at the nose (-x); the doughnut turns around a point just behind the front axle (keeps it in the card)
    car.updateMatrixWorld(true);
    const B = new THREE.Box3().setFromObject(car);
    lights[0].position.set(B.min.x - 0.2, 0.45, -0.4); lights[1].position.set(B.min.x - 0.2, 0.45, 0.4);
    car.traverse((o) => { if (o.isMesh && !pivot.lengthSq() && o.geometry.index) { pivot.copy(o.localToWorld(new THREE.Vector3(AXLES[1][0] * 0.6, 0, 0))); pivot.y = 0; } });
    setPaint(paint());
    idleHint();
    // compile the shaders before the first frame (off the main thread where the browser can): the first render used to
    // freeze the page for up to a second right after it loaded
    const show = () => { ready = true; requestAnimationFrame(() => { card.classList.add('on'); cv.classList.add('on'); }); };
    (r.compileAsync ? r.compileAsync(sc, cam) : Promise.resolve(r.compile(sc, cam))).then(show, show);
  });

  // smooth normals shared by every copy of a point (the scan splits points at texture seams, which shows as facets)
  function smoothNormals(geo) {
    const pos = geo.attributes.position, n = pos.count, idx = geo.index, key = new Array(n), acc = new Map();
    const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3();
    for (let i = 0; i < n; i++) { p.fromBufferAttribute(pos, i); key[i] = `${Math.round(p.x * 2e3)},${Math.round(p.y * 2e3)},${Math.round(p.z * 2e3)}`; }
    const tri = idx ? idx.count / 3 : n / 3, at = (k) => (idx ? idx.getX(k) : k);
    for (let t = 0; t < tri; t++) {
      const i0 = at(t * 3), i1 = at(t * 3 + 1), i2 = at(t * 3 + 2);
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      f.subVectors(c, b).cross(a.clone().sub(b));             // area-weighted face normal
      [i0, i1, i2].forEach((i) => { const v = acc.get(key[i]); if (v) v.add(f); else acc.set(key[i], f.clone()); });
    }
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = acc.get(key[i]); if (v) { p.copy(v).normalize(); out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z; } }
    geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  }
  // a grey copy of the photo texture, with a little extra contrast
  function greyMap(tex) {
    if (!tex || !tex.image) return tex;
    try {
      const im = tex.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.filter = 'grayscale(1) contrast(1.25) brightness(1.15)'; x.drawImage(im, 0, 0);
      const t = new THREE.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
      t.anisotropy = r.capabilities.getMaxAnisotropy(); return t;
    } catch (e) { return tex; }
  }
  function setPaint(name) {
    const [hex, fin] = PAINTS[name] || PAINTS.original;
    mats.forEach((m) => {
      m.map = name === 'original' ? m.userData.photo : m.userData.grey;
      m.color.set(hex);
      if (fin === 'chrome') Object.assign(m, { metalness: 1, roughness: 0.08, clearcoat: 0, envMapIntensity: 1.8 });
      else if (fin === 'matte') Object.assign(m, { metalness: 0.35, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.9 });
      else Object.assign(m, { metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25 });
      m.needsUpdate = true;
    });
  }
  const paint = () => (window.__LOOK && window.__LOOK.paint) || 'original';
  const idleHint = () => { hint.textContent = 'Tap to rev · double-tap for a burnout'; };

  // ---------- sound (made in the browser, no files) ----------
  let ac = null, muted = false;
  try { muted = localStorage.getItem('garageMute') === '1'; } catch (e) {}
  const mute = document.createElement('button');
  mute.type = 'button'; mute.className = 'sc-mute';
  const muteIcon = () => { mute.textContent = muted ? '🔇' : '🔊'; mute.setAttribute('aria-label', muted ? 'Turn car sound on' : 'Turn car sound off'); };
  muteIcon(); card.appendChild(mute);
  mute.addEventListener('pointerdown', (e) => e.stopPropagation());
  mute.addEventListener('click', (e) => { e.stopPropagation(); muted = !muted; muteIcon(); try { localStorage.setItem('garageMute', muted ? '1' : '0'); } catch (er) {} });
  function audio() {
    if (muted) return null;
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  let noiseBuf = null;
  const noise = (a) => {
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const n = a.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n;
  };
  const shaper = (a, k) => { const s = a.createWaveShaper(), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; c[i] = Math.tanh(k * x); } s.curve = c; return s; };
  // Engine note built like a real one: every cylinder firing is a pressure pulse that rings the exhaust pipes
  // (a few resonances), with the uneven beat of a cross-plane V8. The rpm follows a simple throttle model, the rev
  // limiter bounces on a long burnout, and lifting off gives overrun pops and bangs. Rendered once per kind, then replayed.
  const engineBufs = {};
  function engineBuffer(a, kind) {
    if (engineBufs[kind]) return engineBufs[kind];
    const burnK = kind === 'burn', len = burnK ? 3.6 : 1.9, sr = a.sampleRate, N = Math.floor(sr * len);
    const buf = a.createBuffer(2, N, sr), L = buf.getChannelData(0), Rc = buf.getChannelData(1);
    const E = ENGINES[CAR.engine] || ENGINES.v8, k = burnK ? 1 : 0;
    const onT = 0.06, offT = burnK ? 2.9 : 0.5, IDLE = E.idle, MAX = E.max[k];
    const RES = E.res.map(([f, bw, g]) => {
      const r = Math.exp(-Math.PI * bw / sr); return { c1: 2 * r * Math.cos(2 * Math.PI * f / sr), c2: -r * r, g: g * (1 - r) * 2, y1: 0, y2: 0 };
    });
    const POP = [[120, 30, 1], [1600, 900, 0.35]].map(([f, bw, g]) => { const r = Math.exp(-Math.PI * bw / sr); return { c1: 2 * r * Math.cos(2 * Math.PI * f / sr), c2: -r * r, g: g * (1 - r) * 2, y1: 0, y2: 0 }; });
    const BEAT = E.beat, NB = BEAT.length;
    let rpm = IDLE, ph = 0, cyl = 0, burst = 0, burstA = 0, cut = 0, lp = 0, hp = 0, hpx = 0, popBurst = 0, popA = 0, peak = 0;
    const pops = [];
    const DRIVE = E.drive;
    { let t = offT + 0.08; const n = E.pops[k]; for (let i = 0; i < n; i++) { t += 0.04 + Math.random() * (E.turbo ? 0.1 : 0.13); pops.push([Math.floor(t * sr), 0.5 + Math.random() * 0.9]); } }
    let boost = 0, tw = 0, bov = 0;
    let pi = 0;
    for (let n = 0; n < N; n++) {
      const t = n / sr;
      let thr = t > onT && t < offT ? 1 : 0;
      if (thr && rpm > MAX) cut = Math.floor(sr * 0.035);                 // rev limiter
      if (cut > 0) { cut--; thr = 0; }
      rpm += (thr ? (MAX * 1.08 - rpm) * E.rate[k] : -(rpm - IDLE) * 1.9) / sr;
      ph += (rpm / 60) * E.fire / sr;
      let x = 0;
      if (ph >= 1) {
        ph -= 1; const amp = BEAT[cyl++ % NB] * (0.9 + Math.random() * 0.2) * (0.28 + 0.72 * (thr ? 1 : 0.18 + 0.25 * (rpm / MAX)));
        x += amp; burst = Math.floor(sr * 0.0012); burstA = amp * 0.18;
      }
      if (burst > 0) { burst--; x += (Math.random() * 2 - 1) * burstA; burstA *= 0.997; }
      let y = 0;
      for (const q of RES) { const v = x + q.c1 * q.y1 + q.c2 * q.y2; q.y2 = q.y1; q.y1 = v; y += v * q.g; }
      // overrun pops: a sharp bang that rings low, with a crack on top
      let px = 0;
      if (pi < pops.length && n >= pops[pi][0]) { px = pops[pi][1] * 3; popBurst = Math.floor(sr * 0.006); popA = pops[pi][1] * 1.4; pi++; }
      if (popBurst > 0) { popBurst--; px += (Math.random() * 2 - 1) * popA; popA *= 0.995; }
      for (const q of POP) { const v = px + q.c1 * q.y1 + q.c2 * q.y2; q.y2 = q.y1; q.y1 = v; y += v * q.g * 0.6; }
      // air and mechanical hiss grows with revs
      y += (Math.random() * 2 - 1) * 0.04 * (rpm / MAX) * (thr ? 1 : 0.4);
      if (E.turbo) {
        // boost builds with revs under throttle; the turbos whistle, and lifting off dumps it with a hiss
        const was = boost; boost += ((thr ? Math.max(0, rpm / MAX - 0.35) / 0.65 : 0) - boost) * (thr ? 2.2 : 9) / sr;
        if (!thr && was > 0.4 && !bov) bov = Math.floor(sr * 0.32);
        tw += (3200 + 5200 * boost) / sr; y += Math.sin(tw * 6.283) * 0.012 * boost * boost;
        if (bov > 0) { bov--; y += (Math.random() * 2 - 1) * 0.07 * (bov / (sr * 0.32)); }
      }
      // brighter with throttle, then a soft clip like a loud exhaust
      const fc = (thr ? 2600 : 1300) + rpm * 0.25, al = 1 - Math.exp(-2 * Math.PI * fc / sr);
      lp += (y - lp) * al;
      const hpOut = lp - hpx + 0.995 * hp; hpx = lp; hp = hpOut;    // DC blocker
      const o = Math.tanh(hpOut * DRIVE);
      L[n] = o; if (Math.abs(o) > peak) peak = Math.abs(o);
    }
    // fade in/out, normalise, a touch of width
    const fade = Math.floor(sr * 0.02), d = Math.floor(sr * 0.0004);
    for (let n = 0; n < N; n++) { let g = 0.9 / (peak || 1); if (n < fade) g *= n / fade; if (n > N - fade * 4) g *= (N - n) / (fade * 4); L[n] *= g; }
    for (let n = 0; n < N; n++) Rc[n] = L[Math.max(0, n - d)];
    return (engineBufs[kind] = buf);
  }
  function revSound(kind = 'blip') {
    const a = audio(); if (!a) return;
    const src = a.createBufferSource(), g = a.createGain(); src.buffer = engineBuffer(a, kind); g.gain.value = 0.55;
    src.connect(g); g.connect(a.destination); src.start();
  }
  // tyre squeal: noise through a ringing band-pass that wobbles
  function screech(len = 2.4) {
    const a = audio(); if (!a) return;
    const t = a.currentTime, n = noise(a), bp = a.createBiquadFilter(), bp2 = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 18; bp2.type = 'bandpass'; bp2.frequency.value = 2300; bp2.Q.value = 22;
    lfo.frequency.value = 7; lg.gain.value = 180; lfo.connect(lg); lg.connect(bp.frequency); lg.connect(bp2.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.25); g.gain.setValueAtTime(0.22, t + len * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp); n.connect(bp2); bp.connect(g); bp2.connect(g); g.connect(a.destination);
    n.start(t); lfo.start(t); n.stop(t + len + 0.1); lfo.stop(t + len + 0.1);
  }

  // ---------- tyre smoke ----------
  // soft cloud sprites (several overlapping blobs, all inside the texture so no square edges), born small at the rear
  // tyres, fading in, then growing, slowing and thinning out
  const cloudTex = [0, 1, 2].map(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const an = Math.random() * 6.283, dd = Math.random() * 20, px = 64 + Math.cos(an) * dd, py = 64 + Math.sin(an) * dd, rr = 20 + Math.random() * 20;
      const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, 'rgba(236,236,240,.2)'); g.addColorStop(0.6, 'rgba(236,236,240,.08)'); g.addColorStop(1, 'rgba(236,236,240,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(c);
  });
  const puffs = [], tmpV = new THREE.Vector3(), ctr = new THREE.Vector3();
  function puff(w) {
    if (!car || puffs.length > 170) return;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex[(Math.random() * 3) | 0], color: 0xd9d9de, transparent: true, depthWrite: false, opacity: 0, rotation: Math.random() * 6.28 }));
    w.steer.getWorldPosition(tmpV); holder.getWorldPosition(ctr);
    const out = tmpV.clone().sub(ctr); out.y = 0; out.normalize();
    m.position.set(tmpV.x + out.x * 0.12 + (Math.random() - 0.5) * 0.1, 0.18, tmpV.z + out.z * 0.12 + (Math.random() - 0.5) * 0.1);
    const sp = 0.5 + Math.random() * 0.5;
    m.userData = { t: 0, life: 1.9 + Math.random() * 0.8, s1: 0.8 + Math.random() * 0.45, vx: out.x * sp + (Math.random() - 0.5) * 0.25, vy: 0.1 + Math.random() * 0.14, vz: out.z * sp + (Math.random() - 0.5) * 0.25, rs: (Math.random() - 0.5) * 0.6 };
    m.scale.setScalar(0.35); sc.add(m); puffs.push(m);
  }
  function smoke(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i], u = p.userData; u.t += dt; const k = u.t / u.life, drag = Math.max(0, 1 - dt * 1.4);
      u.vx *= drag; u.vz *= drag;
      p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
      p.scale.setScalar(0.35 + (u.s1 - 0.35) * (1 - Math.pow(1 - Math.min(1, k), 2)));
      p.material.rotation += u.rs * dt;
      p.material.opacity = 0.42 * (u.t < 0.25 ? u.t / 0.25 : Math.pow(Math.max(0, 1 - (u.t - 0.25) / (u.life - 0.25)), 1.6));
      if (k >= 1) { sc.remove(p); p.material.dispose(); puffs.splice(i, 1); }
    }
  }

  // ---------- tap = rev, double-tap = burnout ----------
  const ray = new THREE.Raycaster(); let down = null, lastTap = 0, tapTimer = 0;
  const onCar = (e) => {
    const bb = cv.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - bb.left) / bb.width) * 2 - 1, -((e.clientY - bb.top) / bb.height) * 2 + 1), cam);
    // the car's box is enough for a tap (the compressed model's own triangles don't ray-test reliably)
    return !!car && ray.ray.intersectsBox(new THREE.Box3().setFromObject(car));
  };
  const doRev = () => { rev = 1; revT = performance.now(); revSound('blip'); hint.textContent = 'Vroom'; setTimeout(idleHint, 1600); };
  const doBurn = () => { if (burn) return; burn = 1; burnT = performance.now(); rev = 1; revT = burnT; revSound('burn'); setTimeout(() => screech(2.9), 380); hint.textContent = 'Burnout'; setTimeout(idleHint, 2800); };
  card.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; card.style.cursor = 'grabbing'; });
  card.addEventListener('pointerup', (e) => {
    card.style.cursor = 'grab';
    if (!down || !car || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !onCar(e)) return;
    const now = performance.now();
    if (now - lastTap < 320) { clearTimeout(tapTimer); lastTap = 0; doBurn(); return; }
    lastTap = now; tapTimer = setTimeout(doRev, 260);
  });

  // ---------- size: canvas = card + room around it ----------
  const col = card.closest('.sc-col'), root = document.documentElement;
  let cw = 0, ch = 0, box = '';
  function place() {
    const shown = col && (root.classList.contains('sc-wide') || col.classList.contains('open'));
    const b = card.getBoundingClientRect();
    if (!shown || !b.width || !b.height || b.bottom < 0 || b.top > innerHeight) { cv.style.display = 'none'; return false; }
    cv.style.display = 'block';
    const L = b.width * OUT.l, R = Math.max(0, innerWidth - b.right), T = b.height * OUT.t, Bm = Math.max(0, innerHeight - b.bottom);
    const W = Math.round(b.width + L + R), H = Math.round(b.height + T + Bm);
    const k = `${b.left},${b.top},${W},${H}`;
    if (k === box) return true;
    box = k;
    Object.assign(cv.style, { left: (b.left - L) + 'px', top: (b.top - T) + 'px', width: W + 'px', height: H + 'px' });
    r.setSize(W, H, false);
    // the camera frames the card exactly as before; the extra canvas around it just shows what comes out
    cam.aspect = b.width / b.height;
    cam.setViewOffset(b.width, b.height, -L, -T, W, H);
    if (cw !== Math.round(b.width) || ch !== Math.round(b.height)) {
      cw = Math.round(b.width); ch = Math.round(b.height);
      const fit = Math.max(1, 0.8 / cam.aspect), dir = cam.position.clone().sub(ctl.target).normalize();
      ctl.minDistance = 2.2 * fit; ctl.maxDistance = 9 * fit;
      cam.position.copy(ctl.target).addScaledVector(dir, 6.8 * fit);
    }
    cam.updateProjectionMatrix();
    return true;
  }
  let last = performance.now(), lastR = 0, ready = false, busyCtl = false;
  ctl.addEventListener('start', () => (busyCtl = true)); ctl.addEventListener('end', () => (busyCtl = false));
  (function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden || !place()) return;
    // just turning slowly on its own: 30 frames a second is enough and halves the work; full rate while you drag,
    // zoom, rev or burn out
    const active = busyCtl || rev > 0 || burn > 0 || puffs.length;
    if (!ready || (!active && t - lastR < 32)) return;
    lastR = t;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    // burnout: spin the rear tyres on the spot, then a full doughnut around the front axle with the tail sliding out,
    // body leaning, front wheels on opposite lock and smoke pouring off the rear tyres
    const Y = THREE.Object3D.DEFAULT_UP;
    let ang = 0, roll = 0, steerA = 0, rearW = 0, frontW = 0;
    if (burn > 0) {
      const ms = performance.now() - burnT, BT = 3300, k = Math.min(1, ms / BT);
      const s0 = 450 / BT, s1 = 2900 / BT, u = Math.min(1, Math.max(0, (k - s0) / (s1 - s0)));
      ang = Math.PI * 2 * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      const live = k < s1 ? 1 : Math.max(0, 1 - (k - s1) / (1 - s1));
      const turn = Math.sin(Math.PI * u);
      roll = 0.05 * turn; steerA = -0.42 * Math.min(1, u * 6) * live; rearW = 34 * Math.min(1, ms / 250) * live; frontW = 7 * turn;
      // smoke by time, not by frame, so slow devices get the same plume: about 26 puffs a second per rear tyre
      if (k < 0.9) { emit += dt * 26 * Math.min(1, ms / 300); while (emit >= 1) { emit--; wheels.forEach((w) => { if (w.rear) puff(w); }); } }
      if (k >= 1) { burn = 0; steerA = 0; rearW = 0; }
    }
    wheels.forEach((w) => { const om = w.rear ? rearW : frontW;
      w.spin.rotation.z += Math.min(om * dt, 0.3);                                      // spokes never strobe
      w.disc.material.opacity = Math.min(0.94, Math.max(0, (om - 6) / 18));
      if (!w.rear) w.steer.rotation.y = steerA; });
    if (rev > 0) {
      const k = (t - revT) / (burn ? 3300 : 1300); rev = Math.max(0, 1 - k);
      lights.forEach((l) => (l.intensity = 6 * rev * (0.75 + 0.25 * Math.sin(t / 60))));
      paintGlow(0.35 + 0.3 * rev);
      if (!rev) paintGlow(0.35);
    }
    const shake = rev * (burn ? 0.012 : 0.02);
    holder.rotation.y = ang;
    holder.position.copy(pivot).sub(tmpV.copy(pivot).applyAxisAngle(Y, ang));
    holder.position.x += (Math.random() - 0.5) * shake; holder.position.y = Math.abs(Math.sin(t / 30)) * shake * 0.6; holder.position.z += (Math.random() - 0.5) * shake;
    if (car) car.rotation.x = roll;
    if (puffs.length) smoke(dt);
    ctl.update(dt); r.render(sc, cam);
  })(performance.now());
  // the car-theme intro (public/hero.js) parks the car here: give it a rev on arrival
  addEventListener('garage:arrive', () => { rev = 1; revT = performance.now(); });
  addEventListener('garage:burnout', () => { if (car) doBurn(); });
  return { holder, cam };
}
