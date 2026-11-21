// "Night run" journal intro (owner's pick, Nov 20): on a dark road the car spins its rear tyres at the left edge,
// launches and leaves on the right with red tail-light streaks while the P&L counts up with it; the headlights wash
// over the number as they pass. Loaded by hero.js only for the once-per-visit intro. Same car model as the garage.
// three.js r160 (MIT) is vendored in /vendor/three.
import * as THREE from '/vendor/three/three.module.min.js';
import { GLTFLoader } from '/vendor/three/loaders/GLTFLoader.js';

const T0 = 0.55, T1 = 2.05;                       // burnout until T0, then flat out until it leaves at T1 (seconds)
import { pickCar } from '/side/cars.js';
const CAR = pickCar(), AXLES = CAR.axles;   // the car picked in Appearance (wheel centres etc. in side/cars.js)

// smooth normals shared by every copy of a point (the scan splits points at texture seams, which shows as facets)
function smoothNormals(geo) {
  const pos = geo.attributes.position, n = pos.count, key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  geo.computeVertexNormals(); const nrm = geo.attributes.normal, acc = new Map();
  for (let i = 0; i < n; i++) { const k = key(i), a = acc.get(k) || [0, 0, 0]; a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i); acc.set(k, a); }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l; }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3)); if (geo.attributes.tangent) geo.deleteAttribute('tangent');
}

// Prepares everything (model, wheels, shaders) and resolves with play(), or rejects so hero.js can fall back.
export async function prepare(box, num) {
  const cv = document.createElement('canvas'); cv.className = 'plx-cv'; box.prepend(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(1.5, devicePixelRatio || 1, Math.sqrt(3.7e6 / (innerWidth * innerHeight))));   // a dark, moving scene: ~4 megapixels is plenty r.setSize(innerWidth, innerHeight, false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x050507);
  const sc = new THREE.Scene(); sc.fog = new THREE.Fog(0x050507, 8, 16);
  const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 100);
  // phones (tall screens): pull back so the whole car fits the width
  const half = Math.tan(14 * Math.PI / 180), CAMD = Math.max(8.2, 2.7 / (2 * half * cam.aspect));
  cam.position.set(0, 1.0, CAMD); cam.lookAt(0, 0.9 * Math.min(1, 8.2 / CAMD) + (CAMD > 8.2 ? 0.25 : 0), 0);
  const HW = half * CAMD * cam.aspect, XS = -HW + 0.5, XE = HW + 2.2;

  // dim studio reflections, a bluish light that rides along beside the car, an orange rim
  const pm = new THREE.PMREMGenerator(r), sky = document.createElement('canvas'); sky.width = 512; sky.height = 256;
  { const x = sky.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#3a3b40'); g.addColorStop(0.4, '#1a1b1e'); g.addColorStop(0.55, '#141416'); g.addColorStop(1, '#070708');
    x.fillStyle = g; x.fillRect(0, 0, 512, 256); x.fillStyle = '#fff'; [[30, 35, 130, 13], [210, 27, 150, 11], [390, 40, 100, 15]].forEach(([l, t, w, h]) => x.fillRect(l, t, w, h));
    x.fillStyle = '#ff5a1f'; x.globalAlpha = 0.6; x.fillRect(0, 114, 512, 3); }
  const skyTex = new THREE.CanvasTexture(sky); skyTex.mapping = THREE.EquirectangularReflectionMapping; skyTex.colorSpace = THREE.SRGBColorSpace;
  sc.environment = pm.fromEquirectangular(skyTex).texture; sc.environmentIntensity = 0.35;
  const key = new THREE.DirectionalLight(0xffffff, 0.25); key.position.set(2, 6, 4); sc.add(key);
  const rim = new THREE.DirectionalLight(0xff5a1f, 0.6); rim.position.set(-4, 2, -3); sc.add(rim);
  const ride = new THREE.PointLight(0xc8d0ff, 7, 2.4, 1.4); sc.add(ride);

  // road
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 40), new THREE.MeshLambertMaterial({ color: 0x0b0b0d }));
  floor.rotation.x = -Math.PI / 2; sc.add(floor);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x3a3a40 }), dashGeo = new THREE.PlaneGeometry(1.1, 0.05);
  for (let i = -30; i <= 30; i++) { const d = new THREE.Mesh(dashGeo, dashMat); d.rotation.x = -Math.PI / 2; d.position.set(i * 2.2, 0.002, 1.25); sc.add(d); }
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(200, 0.03), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.55 }));
  edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.003, -1.3); sc.add(edge);

  // a fast wheel as the eye sees it: tyre ring, rim smeared into rings, faint brake glow
  const blurTex = (() => { const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), m = S / 2, g = x.createRadialGradient(m, m, 0, m, m, m);
    [[0, '#0d0d0f'], [0.12, '#26272b'], [0.18, '#121214'], [0.3, '#4a4b51'], [0.42, '#2c2d32'], [0.52, '#5a5b62'], [0.6, '#303136'], [0.7, '#1a1a1d'], [0.74, '#0a0a0b'], [0.95, '#141416'], [1, '#050506']].forEach(([k, col]) => g.addColorStop(k, col));
    x.fillStyle = g; x.beginPath(); x.arc(m, m, m, 0, 7); x.fill(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) { const r0 = m * (0.2 + Math.random() * 0.5), a0 = Math.random() * 6.283; x.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); x.arc(m, m, r0, a0, a0 + 0.6 + Math.random() * 1.6); x.stroke(); }
    x.strokeStyle = 'rgba(255,90,31,.10)'; x.lineWidth = m * 0.08; x.beginPath(); x.arc(m, m, m * 0.62, 0, 7); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

  // car: wheels cut out of the one-piece scan so they can spin
  const gltf = await new Promise((res, rej) => new GLTFLoader().load(CAR.glb, res, undefined, rej));
  const car = gltf.scene, wheels = []; let mesh = null;
  { const b = new THREE.Box3().setFromObject(car), s = new THREE.Vector3(); b.getSize(s); car.scale.setScalar(2.15 * CAR.len / 2.5 / Math.max(s.x, s.z));
    const b2 = new THREE.Box3().setFromObject(car), c = new THREE.Vector3(); b2.getCenter(c); car.position.x -= c.x; car.position.z -= c.z; car.position.y -= b2.min.y; }
  const meshes = []; car.traverse((o) => { if (o.isMesh) meshes.push(o); });
  meshes.forEach((o) => {
    smoothNormals(o.geometry);
    const m = new THREE.MeshPhysicalMaterial({ map: o.material.map, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 }); o.material.dispose(); o.material = m; mesh = o;
    const g = o.geometry, pos = g.attributes.position, idx = g.index; if (!idx) return;
    const parts = []; AXLES.forEach(([x, y, rad, rear]) => [1, -1].forEach((sd) => parts.push({ x, y, rad, rear, sd, tri: [] })));
    const keep = [];
    for (let t = 0; t < idx.count; t += 3) { const v0 = idx.getX(t), v1 = idx.getX(t + 1), v2 = idx.getX(t + 2);
      const hit = parts.find((p) => [v0, v1, v2].every((k) => pos.getZ(k) * p.sd > CAR.zCut && Math.hypot(pos.getX(k) - p.x, pos.getY(k) - p.y) < p.rad));
      (hit ? hit.tri : keep).push(v0, v1, v2); }
    g.setIndex(keep);
    parts.forEach((p) => { const wg = new THREE.BufferGeometry(); for (const k in g.attributes) wg.setAttribute(k, g.attributes[k]); wg.setIndex(p.tri);
      const spin = new THREE.Group(), steer = new THREE.Group(), wm = new THREE.Mesh(wg, m), cz = CAR.zMid * p.sd;
      steer.position.set(p.x, p.y, cz); wm.position.set(-p.x, -p.y, -cz); spin.add(wm); steer.add(spin); o.add(steer);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.rad * 0.97, 48), new THREE.MeshStandardMaterial({ map: blurTex, metalness: 0.7, roughness: 0.42, transparent: true, opacity: 0, depthWrite: false }));
      disc.position.z = (CAR.zFace - CAR.zMid) * p.sd; if (p.sd < 0) disc.rotation.y = Math.PI; spin.add(disc);
      wheels.push({ spin, steer, rear: p.rear, disc }); });
  });
  car.rotation.y = Math.PI;                    // nose (-x in the model) points +x: drives left to right
  const holder = new THREE.Group(); holder.add(car); sc.add(holder);

  // lamps, headlight beams on the road, tail-light streaks
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const lamp = (col, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.scale.setScalar(s); sc.add(m); return m; };
  const lamp2 = ([x, y, z]) => [new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, -z)], HEAD = lamp2(CAR.head), TAIL = lamp2(CAR.tail);
  const headSpr = HEAD.map(() => lamp(0xfff4e6, 0.42)), tailSpr = TAIL.map(() => lamp(0xff2a1a, 0.55));
  const beams = HEAD.map(() => { const l = new THREE.SpotLight(0xfff2e0, 60, 14, 0.42, 0.6, 1.6), tg = new THREE.Object3D(); sc.add(tg); l.target = tg; sc.add(l); return [l, tg]; });
  const TR = 90, trails = TAIL.map(() => { const geo = new THREE.BufferGeometry(), idx = [];
    for (let i = 0; i < TR - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TR * 6), 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TR * 2), 1)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying float va; void main(){ gl_FragColor = vec4(1.0, .2, .1, va); }' }));
    m.frustumCulled = false; sc.add(m); return { geo, hist: [] }; });

  // compile every shader before the first frame (off the main thread where the browser can), so the run starts smooth
  holder.position.set(XS, 0, 0);
  if (r.compileAsync) await r.compileAsync(sc, cam); else r.compile(sc, cam);
  r.render(sc, cam);

  const tmp = new THREE.Vector3(), proj = new THREE.Vector3(), W = (p) => mesh.localToWorld(tmp.copy(p)).clone();
  const onResize = () => { r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  addEventListener('resize', onResize);

  // play(progress, done): progress(p 0..1) follows the car's run; done() fires as it leaves
  return function play(progress, done) {
    let start = 0, last = 0, prevX = XS, finished = false, raf = 0;
    const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(u, 1.7));   // still accelerating as it leaves
    function frame(now) {
      if (!start) start = last = now;
      const t = (now - start) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      const u = (t - T0) / (T1 - T0), p = ease(u), x = XS + (XE - XS) * p, v = (x - prevX) / (dt || 1 / 60); prevX = x;
      const burning = t < T0 + 0.1;
      holder.position.set(x + (burning ? (Math.random() - 0.5) * 0.012 : 0), 0.004 * Math.sin(t * 60) * Math.min(1, v / 8), 0);
      ride.position.set(x + 0.2, 0.75, 1.35);
      // spokes turn at most 0.3 rad a frame (faster reads as frozen or backwards); the blur disc takes over above that
      const om = Math.max(burning ? 45 : 0, v / 0.19);
      wheels.forEach((w) => { const o = w.rear ? om : v / 0.19; w.spin.rotation.z += Math.min(o * dt, 0.3); w.disc.material.opacity = Math.min(0.94, Math.max(0, (o - 6) / 18)); });
      car.updateMatrixWorld(true);
      headSpr.forEach((s, i) => s.position.copy(W(HEAD[i])));
      tailSpr.forEach((s, i) => { s.position.copy(W(TAIL[i])); s.material.opacity = 0.7 + 0.3 * Math.min(1, v / 6); });
      beams.forEach(([l, tg], i) => { const w = W(HEAD[i]); l.position.copy(w); tg.position.set(w.x + 6, 0, w.z * 1.4); });
      const fade = Math.max(0, 1 - Math.max(0, t - T1 - 0.2) / 0.8);
      trails.forEach((tr, i) => { const w = W(TAIL[i]); tr.hist.unshift([w.x, w.y, w.z]); if (tr.hist.length > TR) tr.hist.pop();
        const P = tr.geo.attributes.position.array, A = tr.geo.attributes.alpha.array;
        for (let k = 0; k < TR; k++) { const h = tr.hist[Math.min(k, tr.hist.length - 1)], th = 0.025 * (1 - k / TR); P.set([h[0], h[1] + th, h[2], h[0], h[1] - th, h[2]], k * 6);
          const a = k < tr.hist.length ? 0.85 * Math.pow(1 - k / TR, 1.4) * fade : 0; A[k * 2] = a; A[k * 2 + 1] = a; }
        tr.geo.attributes.position.needsUpdate = true; tr.geo.attributes.alpha.needsUpdate = true; });
      progress(Math.min(1, Math.max(0, p)));
      // the headlights wash over the number as they pass
      proj.set(x, 0.5, 0).project(cam); const near = Math.max(0, 1 - Math.abs((proj.x + 1) / 2 - 0.5) * 3.2);
      num.style.filter = near ? `brightness(${1 + near * 0.35}) drop-shadow(0 0 ${Math.round(near * 30)}px rgba(255,255,255,${(near * 0.35).toFixed(2)}))` : '';
      r.render(sc, cam);
      if (t >= T1 && !finished) { finished = true; done(); }
      if (t < T1 + 1.2 && box.isConnected) raf = requestAnimationFrame(frame); else stop();
    }
    function stop() { cancelAnimationFrame(raf); removeEventListener('resize', onResize); r.dispose(); r.forceContextLoss(); }
    raf = requestAnimationFrame(frame);
    return stop;
  };
}
