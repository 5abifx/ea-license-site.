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
  // car backgrounds: after the count, the car drives in, brakes under the number, then parks in the 3D garage
  const look = window.__LOOK || {};
  const carTheme = /^ph-(hyper|gt|chromecar|coupe|nightrun)$/.test(look.bg || '');
  count(ov.querySelector('.plx-n'), 1500, () => {
    ov.querySelector('.plx-s').textContent = target >= 0 ? 'In profit' : 'Review the leaks';
    if (carTheme && !closed) drive(); else setTimeout(close, 650);
  });

  function drive() {
    const BB = [541, 282, 1572, 724], W = Math.min(560, innerWidth * 0.42), H = W * (BB[3] - BB[1]) / (BB[2] - BB[0]);
    const big = Math.max(screen.width, screen.height) * (devicePixelRatio || 1) > 2200;
    const car = document.createElement('div');
    car.className = 'plx-car';
    car.style.cssText = `width:${W}px;height:${H}px;background-image:url(${big ? '/look/4k/hyper-cut.webp' : '/look/hyper-cut.webp'});`
      + `background-size:${(1600 / (BB[2] - BB[0])) * 100}% auto;background-position:${(BB[0] / (1600 - (BB[2] - BB[0]))) * 100}% ${(BB[1] / (895 - (BB[3] - BB[1]))) * 100}%;`;
    const streaks = document.createElement('div'); streaks.className = 'plx-streaks';
    ov.appendChild(streaks); document.body.appendChild(car);
    const cx = innerWidth / 2 - W / 2, cy = innerHeight / 2 + 70;
    car.style.left = cx + 'px'; car.style.top = cy + 'px';
    // in from the right (the car faces left), fast, then a hard stop with the nose dipping
    car.animate([
      { transform: `translateX(${innerWidth}px) skewX(-6deg)`, filter: 'blur(6px)' },
      { transform: 'translateX(-30px) skewX(0) rotate(-1.2deg)', filter: 'blur(0)', offset: 0.78 },
      { transform: 'translateX(6px) rotate(.4deg)', offset: 0.9 },
      { transform: 'none' },
    ], { duration: 1100, easing: 'cubic-bezier(.15,.75,.25,1)', fill: 'forwards' });
    streaks.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1000, fill: 'forwards' });
    setTimeout(() => {
      close();
      const g = document.querySelector('.sc-garage');
      const r = g && g.getBoundingClientRect();
      const on = r && r.width && r.left < innerWidth && getComputedStyle(g.closest('.sc-col')).opacity !== '0';
      const anim = on
        ? car.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${r.left + r.width / 2 - (cx + W / 2)}px, ${r.top + r.height / 2 - (cy + H / 2)}px) scale(${Math.min(1, (r.width * 0.75) / W)})`, opacity: 0.15 }],
          { duration: 900, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' })
        : car.animate([{ transform: 'none' }, { transform: `translateX(${-innerWidth}px) skewX(6deg)`, filter: 'blur(6px)' }], { duration: 700, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards' });
      anim.onfinish = () => { car.remove(); window.dispatchEvent(new CustomEvent('garage:arrive')); };
    }, 1500);
  }
})();
