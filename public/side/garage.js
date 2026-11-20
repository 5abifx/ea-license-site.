// The 3D garage in the right side column: drag to turn, scroll to zoom, tap the car to rev it, pick a paint.
// three.js r160 (MIT) is vendored in /vendor/three. The car (car.glb) was made from the "Hyper" background picture.
import * as THREE from '/vendor/three/three.module.min.js';
import { GLTFLoader } from '/vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from '/vendor/three/controls/OrbitControls.js';
import { RoomEnvironment } from '/vendor/three/environments/RoomEnvironment.js';

const PAINTS = { original: '#ffffff', ember: '#ff7a45', chrome: '#d8dde6', teal: '#38d6b4', royal: '#6f8bff', gold: '#f2c14e' };   // picked in Appearance (look.paint)

export default function garage(card) {
  const cv = card.querySelector('canvas'), hint = card.querySelector('.sc-hint');
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
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  // soft glow on the floor in the theme colour
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const glowTex = new THREE.CanvasTexture(gc);
  const paintGlow = (a) => { const gx = gc.getContext('2d'), g = gx.createRadialGradient(128, 128, 0, 128, 128, 128), c = new THREE.Color(accent());
    gx.clearRect(0, 0, 256, 256); g.addColorStop(0, `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); gx.fillStyle = g; gx.fillRect(0, 0, 256, 256); glowTex.needsUpdate = true; };
  paintGlow(0.35);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.002; sc.add(glow);
  // headlights for the rev
  const lights = [new THREE.PointLight(0xffffff, 0, 3), new THREE.PointLight(0xffffff, 0, 3)];
  lights.forEach((l) => sc.add(l));

  const ctl = new OrbitControls(cam, cv);
  Object.assign(ctl, { enableDamping: true, autoRotate: true, autoRotateSpeed: 0.8, enablePan: false, minPolarAngle: 0.6, maxPolarAngle: 1.45, minDistance: 3.2, maxDistance: 9 });
  ctl.target.set(0, 0.45, 0);

  let car = null, mats = [], rev = 0, revT = 0;
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
    setPaint(paint());
    hint.textContent = 'Tap the car to rev';
  });

  function setPaint(name) {
    const hex = PAINTS[name] || PAINTS.original;
    mats.forEach((m) => {
      if (m.userData.m === undefined) { m.userData.m = m.metalness; m.userData.r = m.roughness; }
      m.color.set(hex); m.metalness = name === 'chrome' ? 1 : m.userData.m; m.roughness = name === 'chrome' ? 0.18 : m.userData.r;
    });
  }
  const paint = () => (window.__LOOK && window.__LOOK.paint) || 'original';

  // tap the car (not a drag) to rev: it rocks, the lights flash and the floor glows
  const ray = new THREE.Raycaster(); let down = null;
  cv.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || !car || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const bb = cv.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - bb.left) / bb.width) * 2 - 1, -((e.clientY - bb.top) / bb.height) * 2 + 1), cam);
    if (ray.intersectObject(car, true).length) { rev = 1; revT = performance.now(); hint.textContent = 'Vroom'; setTimeout(() => (hint.textContent = 'Tap the car to rev'), 1400); }
  });

  // a tall card needs the camera further back so the whole car fits across
  function size() {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const fit = Math.max(1, 0.8 / cam.aspect), dir = cam.position.clone().sub(ctl.target).normalize();
    ctl.minDistance = 3.2 * fit; ctl.maxDistance = 9 * fit;
    cam.position.copy(ctl.target).addScaledVector(dir, 6.8 * fit);
  }
  new ResizeObserver(size).observe(cv); size();
  let vis = true;
  new IntersectionObserver((es) => { vis = es[0].isIntersecting; }).observe(cv);
  (function loop(t) {
    requestAnimationFrame(loop);
    if (!vis || document.hidden) return;
    if (rev > 0) {
      const k = (t - revT) / 1200; rev = Math.max(0, 1 - k);
      holder.position.set((Math.random() - 0.5) * 0.03 * rev, Math.abs(Math.sin(t / 30)) * 0.02 * rev, (Math.random() - 0.5) * 0.03 * rev);
      holder.rotation.z = Math.sin(t / 40) * 0.01 * rev;
      lights.forEach((l) => (l.intensity = 6 * rev * (0.6 + 0.4 * Math.sin(t / 25))));
      paintGlow(0.35 + 0.4 * rev);
      if (!rev) { holder.position.set(0, 0, 0); holder.rotation.z = 0; paintGlow(0.35); }
    }
    ctl.update(); r.render(sc, cam);
  })(0);
  // the car-theme intro (public/hero.js) parks the car here: give it a rev on arrival
  addEventListener('garage:arrive', () => { rev = 1; revT = performance.now(); });
  return { holder, cam };
}
