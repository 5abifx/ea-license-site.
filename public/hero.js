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
  let closed = false, stopRun = null;
  const close = () => {
    if (closed) return; closed = true;
    ov.classList.add('out');
    setTimeout(() => { ov.remove(); if (stopRun) stopRun(); }, 700);
    count(num, 900);
  };
  ov.addEventListener('click', close);
  requestAnimationFrame(() => ov.classList.add('go'));
  const nEl = ov.querySelector('.plx-n'), sEl = ov.querySelector('.plx-s'), bar = ov.querySelector('.plx-bar i');
  const landed = () => { sEl.textContent = target >= 0 ? 'In profit' : 'Review the leaks'; setTimeout(close, 650); };
  // Night run: the car crosses the screen as the number counts (3D, loaded only for this intro). If it is not ready
  // in time (slow phone or connection, no WebGL) the plain count runs instead and the car is dropped.
  let started = false;
  const plain = () => { if (started) return; started = true; count(nEl, 1500, landed); };
  const wait = setTimeout(plain, 1300);
  import('/nightrun.js').then((m) => m.prepare(ov, nEl)).then((play) => {
    if (started || closed) { const c = ov.querySelector('.plx-cv'); if (c) c.remove(); return; }
    clearTimeout(wait); started = true; ov.classList.add('run');
    stopRun = play((p) => { nEl.textContent = fmt(target * p); bar.style.transform = `scaleX(${p})`; }, landed);
  }).catch(() => { clearTimeout(wait); plain(); });
})();
