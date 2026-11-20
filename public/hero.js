// Journal hero: a short "profit loading" screen once per visit (the month's P&L counting up), then the
// big number on the page counts up too. Tap to skip. Shown again after the browser tab is closed.
(function () {
  const hero = document.querySelector('.pl-hero');
  if (!hero) return;
  const num = hero.querySelector('.pl-num');
  const target = Number(num && num.dataset.count) || 0;
  const pre = (num && num.dataset.pre) || '';
  const fmt = (v) => (v < 0 ? '−' : '+') + pre + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ease = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  function count(el, ms, done) {
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(target * ease(p));
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    })(t0);
  }
  let seen = false;
  try { seen = sessionStorage.getItem('plx') === '1'; sessionStorage.setItem('plx', '1'); } catch (e) { seen = true; }
  if (seen || !target) { if (target) count(num, 1100); return; }

  // the loading screen
  const unitEl = hero.querySelector('.pl-big .u');
  const ov = document.createElement('div');
  ov.className = 'plx ' + (target >= 0 ? 'pos' : 'neg');
  ov.setAttribute('aria-hidden', 'true');
  ov.innerHTML = `<div class="plx-in"><img src="/logo.png" alt="" width="64" height="40">
    <span class="plx-k">${(hero.dataset.label || '').toUpperCase()} · NET P&amp;L</span>
    <b class="plx-n">${fmt(0)}</b>${unitEl ? `<small>${unitEl.textContent}</small>` : ''}
    <i class="plx-bar"><i></i></i><span class="plx-s">Syncing your trades</span></div>`;
  document.body.appendChild(ov);
  num.textContent = fmt(0);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    ov.classList.add('out');
    setTimeout(() => ov.remove(), 700);
    count(num, 900);
  };
  ov.addEventListener('click', close);
  requestAnimationFrame(() => ov.classList.add('go'));
  // car backgrounds: the car runs along the bottom of the screen, left to right, keeping pace with the count,
  // then floors it off the right edge with tyre smoke behind it (and revs in the 3D garage on the right)
  const look = window.__LOOK || {};
  const carTheme = /^ph-(hyper|gt|chromecar|coupe|nightrun)$/.test(look.bg || '');
  const COUNT = carTheme ? 1900 : 1500;
  if (carTheme) drive();
  count(ov.querySelector('.plx-n'), COUNT, () => {
    ov.querySelector('.plx-s').textContent = target >= 0 ? 'In profit' : 'Review the leaks';
    if (!carTheme) setTimeout(close, 650);
  });

  function drive() {
    const BB = [541, 282, 1572, 724], W = Math.min(520, innerWidth * 0.36), H = W * (BB[3] - BB[1]) / (BB[2] - BB[0]);
    const big = Math.max(screen.width, screen.height) * (devicePixelRatio || 1) > 2200;
    const car = document.createElement('div');
    car.className = 'plx-car';
    car.style.cssText = `width:${W}px;height:${H}px;background-image:url(${big ? '/look/4k/hyper-cut.webp' : '/look/hyper-cut.webp'});`
      + `background-size:${(1600 / (BB[2] - BB[0])) * 100}% auto;background-position:${(BB[0] / (1600 - (BB[2] - BB[0]))) * 100}% ${(BB[1] / (895 - (BB[3] - BB[1]))) * 100}%;`;
    const streaks = document.createElement('div'); streaks.className = 'plx-streaks';
    // tyre smoke is drawn on a canvas under the car
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1);
    cv.className = 'plx-smoke'; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    ov.appendChild(streaks); document.body.appendChild(cv); document.body.appendChild(car);
    const y0 = innerHeight - H - Math.max(24, innerHeight * 0.06);
    car.style.left = '0px'; car.style.top = y0 + 'px';
    // the picture faces left, so it is mirrored to drive left -> right; the rear wheel sits near its left end
    const rear = [W * 0.2, H * 0.86], startX = -W - 40, endX = innerWidth + 60;
    // one straight run across the screen in step with the count: pulls away, builds to full speed, gone as the number lands
    const RUN = COUNT + 350, inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const puffs = [], t0 = performance.now();
    let px = startX, lastT = t0, closed2 = false;
    (function frame(now) {
      const t = now - t0, dt = Math.min(50, now - lastT) / 1000; lastT = now;
      const k = Math.min(1, t / RUN), nx = startX + (endX - startX) * (0.35 * k + 0.65 * inOut(k));
      const moved = nx - px, speed = moved / Math.max(dt, 0.001);
      if (t >= COUNT && !closed2) { closed2 = true; close(); streaks.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 900, fill: 'forwards' }); }
      const fast = Math.min(1, Math.abs(speed) / 2600);
      car.style.transform = `translate(${nx}px, ${((Math.random() - 0.5) * 2.4 * fast).toFixed(2)}px) scaleX(-1) skewX(${(fast * 7).toFixed(2)}deg)`;
      car.style.filter = `drop-shadow(0 26px 26px rgba(0,0,0,.7)) blur(${(fast * 2).toFixed(2)}px)`;
      // smoke off the rear wheel, laid down along the whole path (no gaps on slow frames), thicker as it pulls
      if (k < 1) for (let d = 0; d < moved && puffs.length < 380; d += 12) {
        const sx = px + d + rear[0];
        puffs.push({ x: sx + Math.random() * 6, y: y0 + rear[1] - Math.random() * 8, vx: -(30 + Math.random() * 90), vy: -(14 + Math.random() * 36), r: 10 + Math.random() * 12 + fast * 10, a: 0.28 + fast * 0.3, life: 0 });
      }
      px = nx;
      x.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = puffs.length - 1; i >= 0; i--) {
        const q = puffs[i]; q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy -= 6 * dt; q.r += 46 * dt; q.a -= 0.4 * dt;
        if (q.a <= 0) { puffs.splice(i, 1); continue; }
        const g = x.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
        g.addColorStop(0, `rgba(215,215,220,${q.a})`); g.addColorStop(1, 'rgba(215,215,220,0)');
        x.fillStyle = g; x.beginPath(); x.arc(q.x, q.y, q.r, 0, Math.PI * 2); x.fill();
      }
      if (k < 1 || puffs.length) requestAnimationFrame(frame); else cv.remove();
      if (k >= 1 && car.isConnected) { car.remove(); window.dispatchEvent(new CustomEvent('garage:arrive')); }
    })(t0);
  }
})();
