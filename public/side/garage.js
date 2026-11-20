// The 3D garage in the right side column: drag to turn, scroll to zoom (the car comes out of the card as you zoom in),
// tap the car to rev it, double-tap for a burnout with tyre smoke. Engine and tyre sounds are made in the browser
// (Web Audio), no sound files. Paint is picked in Appearance (look.paint).
// three.js r160 (MIT) is vendored in /vendor/three. The car (car.glb) was made from the "Hyper" background picture.
import * as THREE from '/vendor/three/three.module.min.js';
import { GLTFLoader } from '/vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from '/vendor/three/controls/OrbitControls.js';
import { RoomEnvironment } from '/vendor/three/environments/RoomEnvironment.js';

const PAINTS = { original: '#ffffff', ember: '#ff7a45', chrome: '#d8dde6', teal: '#38d6b4', royal: '#6f8bff', gold: '#f2c14e' };
// the canvas is bigger than the card (this much extra left/above, as a share of the card's size), so a zoomed-in car
// can come out over the page; at normal zoom it sits inside the card exactly as before
const OUT = { l: 0.9, t: 0.45 };   // right and bottom run to the window edge

export default function garage(card) {
  const cv = card.querySelector('canvas'), hint = card.querySelector('.sc-hint');
  // the canvas lives on <body> (fixed) so the card's glass and the column's scrolling can't clip the car
  cv.classList.add('sc-car3d'); document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  cam.position.set(4.4, 1.9, 4.8);
  const pm = new THREE.PMREMGenerator(r);
  sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 6, 2); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); sc.add(key);
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff5a1f';
  const rim = new THREE.DirectionalLight(new THREE.Color(accent()), 1.4); rim.position.set(-4, 2, -3); sc.add(rim);
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

  let car = null, mats = [], rev = 0, revT = 0, burn = 0, burnT = 0, frontX = 1;
  const holder = new THREE.Group(); sc.add(holder);
  new GLTFLoader().load('/side/car.glb', (g) => {
    car = g.scene;
    const b = new THREE.Box3().setFromObject(car), s = new THREE.Vector3(); b.getSize(s);
    car.scale.setScalar(2.5 / Math.max(s.x, s.z));
    const b2 = new THREE.Box3().setFromObject(car), c = new THREE.Vector3(); b2.getCenter(c);
    car.position.x -= c.x; car.position.z -= c.z; car.position.y -= b2.min.y;
    car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; mats.push(o.material); } });
    holder.add(car);
    // headlights sit at the long end of the car
    const B = new THREE.Box3().setFromObject(car), long = (B.max.x - B.min.x) > (B.max.z - B.min.z);
    lights[0].position.set(long ? B.max.x + 0.2 : -0.4, 0.45, long ? -0.4 : B.max.z + 0.2);
    lights[1].position.set(long ? B.max.x + 0.2 : 0.4, 0.45, long ? 0.4 : B.max.z + 0.2);
    frontX = long ? 1 : 0;
    setPaint(paint());
    idleHint();
    requestAnimationFrame(() => { card.classList.add('on'); cv.classList.add('on'); });
  });

  function setPaint(name) {
    const hex = PAINTS[name] || PAINTS.original;
    mats.forEach((m) => {
      if (m.userData.m === undefined) { m.userData.m = m.metalness; m.userData.r = m.roughness; }
      m.color.set(hex); m.metalness = name === 'chrome' ? 1 : m.userData.m; m.roughness = name === 'chrome' ? 0.18 : m.userData.r;
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
  // a V8-style rev: two detuned saws + a sub, through drive and a low-pass that opens with the revs
  function revSound(len = 1.6, peak = 190) {
    const a = audio(); if (!a) return;
    const t = a.currentTime, out = a.createGain(), lp = a.createBiquadFilter(), drive = shaper(a, 3.2);
    lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(2600, t + len * 0.3); lp.frequency.exponentialRampToValueAtTime(420, t + len);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.32, t + 0.06); out.gain.setValueAtTime(0.32, t + len * 0.45); out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    drive.connect(lp); lp.connect(out); out.connect(a.destination);
    [[1, 'sawtooth', 0.5], [1.012, 'sawtooth', 0.4], [0.5, 'square', 0.35]].forEach(([m, type, g]) => {
      const o = a.createOscillator(), og = a.createGain(); o.type = type; og.gain.value = g;
      o.frequency.setValueAtTime(48 * m, t);
      o.frequency.exponentialRampToValueAtTime(peak * m, t + len * 0.28);
      o.frequency.setValueAtTime(peak * 0.92 * m, t + len * 0.36);              // a quick lift at the top
      o.frequency.exponentialRampToValueAtTime(peak * m, t + len * 0.42);
      o.frequency.exponentialRampToValueAtTime(52 * m, t + len);
      o.connect(og); og.connect(drive); o.start(t); o.stop(t + len + 0.05);
    });
    // exhaust crackle as it comes off the revs
    const n = noise(a), bp = a.createBiquadFilter(), ng = a.createGain(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
    ng.gain.setValueAtTime(0, t); ng.gain.setValueAtTime(0, t + len * 0.5);
    for (let i = 0; i < 9; i++) { const k = t + len * 0.5 + i * 0.06 + Math.random() * 0.03; ng.gain.setValueAtTime(0.25 * Math.random(), k); ng.gain.setValueAtTime(0, k + 0.012); }
    n.connect(bp); bp.connect(ng); ng.connect(a.destination); n.start(t); n.stop(t + len + 0.2);
  }
  // tyre squeal: noise through a ringing band-pass that wobbles
  function screech(len = 2.4) {
    const a = audio(); if (!a) return;
    const t = a.currentTime, n = noise(a), bp = a.createBiquadFilter(), bp2 = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 18; bp2.type = 'bandpass'; bp2.frequency.value = 2300; bp2.Q.value = 22;
    lfo.frequency.value = 7; lg.gain.value = 180; lfo.connect(lg); lg.connect(bp.frequency); lg.connect(bp2.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.15); g.gain.setValueAtTime(0.5, t + len * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp); n.connect(bp2); bp.connect(g); bp2.connect(g); g.connect(a.destination);
    n.start(t); lfo.start(t); n.stop(t + len + 0.1); lfo.stop(t + len + 0.1);
  }

  // ---------- tyre smoke ----------
  const sm = document.createElement('canvas'); sm.width = sm.height = 64;
  { const x = sm.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(200,200,206,.75)'); g.addColorStop(1, 'rgba(220,220,225,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
  const smokeTex = new THREE.CanvasTexture(sm), puffs = [];
  function puff() {
    if (!car || puffs.length > 90) return;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.5 }));
    // the rear wheels, in the car's turning frame
    const side = Math.random() < 0.5 ? -0.55 : 0.55, back = -1.0;
    const v = frontX ? new THREE.Vector3(back, 0.15, side) : new THREE.Vector3(side, 0.15, back);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), holder.rotation.y);
    m.position.copy(v); m.scale.setScalar(0.35);
    m.userData = { t: 0, vx: (Math.random() - 0.5) * 0.6, vy: 0.35 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.6 };
    sc.add(m); puffs.push(m);
  }
  function smoke(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i], u = p.userData; u.t += dt;
      p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
      p.scale.setScalar(0.35 + u.t * 1.6); p.material.opacity = Math.max(0, 0.5 - u.t * 0.24);
      if (u.t > 2.2) { sc.remove(p); p.material.dispose(); puffs.splice(i, 1); }
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
  const doRev = () => { rev = 1; revT = performance.now(); revSound(); hint.textContent = 'Vroom'; setTimeout(idleHint, 1600); };
  const doBurn = () => { burn = 1; burnT = performance.now(); rev = 1; revT = burnT; revSound(2.6, 230); screech(2.6); hint.textContent = 'Burnout'; setTimeout(idleHint, 2800); };
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
  let last = performance.now();
  (function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden || !place()) return;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (rev > 0) {
      const k = (t - revT) / (burn ? 2600 : 1200); rev = Math.max(0, 1 - k);
      holder.position.set((Math.random() - 0.5) * 0.03 * rev, Math.abs(Math.sin(t / 30)) * 0.02 * rev, (Math.random() - 0.5) * 0.03 * rev);
      holder.rotation.z = Math.sin(t / 40) * 0.01 * rev;
      lights.forEach((l) => (l.intensity = 6 * rev * (0.6 + 0.4 * Math.sin(t / 25))));
      paintGlow(0.35 + 0.4 * rev);
      if (!rev) { holder.position.set(0, 0, 0); holder.rotation.z = 0; paintGlow(0.35); }
    }
    if (burn > 0) {
      // one full doughnut on the spot, easing in and out, smoke pouring off the rear wheels
      const k = Math.min(1, (performance.now() - burnT) / 2600);
      holder.rotation.y = Math.PI * 2 * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      if (k < 0.85) { puff(); puff(); }
      if (k >= 1) { burn = 0; holder.rotation.y = 0; }
    }
    if (puffs.length) smoke(dt);
    ctl.update(); r.render(sc, cam);
  })(performance.now());
  // the car-theme intro (public/hero.js) parks the car here: give it a rev on arrival
  addEventListener('garage:arrive', () => { rev = 1; revT = performance.now(); });
  return { holder, cam };
}
