// Journal hero: a short "profit loading" screen once per visit (the month's P&L counting up), then the
// big number on the page counts up too. Tap to skip. Shown again after the browser tab is closed.
(function () {
  const hero = document.querySelector('.pl-hero, .jv-hero');
  const PHONE = matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px)').matches;
  if (!hero) return;
  const num = hero.querySelector('.pl-num');
  const target = Number(num && num.dataset.count) || 0;
  const pre = (num && num.dataset.pre) || '';
  const NF = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });   // made once, not per frame
  const fmt = (v) => (v < 0 ? '−' : '+') + pre + NF.format(Math.abs(v));
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
  ov.className = 'plx lite ' + (target >= 0 ? 'pos' : 'neg');
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
  const nEl = ov.querySelector('.plx-n'), sEl = ov.querySelector('.plx-s');
  const landed = () => { sEl.textContent = target >= 0 ? 'In profit' : 'Review the leaks'; setTimeout(close, 650); };
  // Just the P&L counting up, on every device (owner, Nov 26: the 3D car intro lagged on PC too, so it is gone).
  count(nEl, PHONE ? 1100 : 1400, landed);
})();
