// Insights > Time: live "now" hand on the session clock, hover to light a session, and the ranked-sessions dial.
(function () {
  const svg = document.querySelector('svg.ck');
  if (svg) {
    const hand = svg.querySelector('.ck-hand');
    const sess = JSON.parse(svg.dataset.sessions || '[]');
    const shift = Number(hand && hand.dataset.shift) || 0;
    const tEl = svg.querySelector('#ck-time'), sEl = svg.querySelector('#ck-sess');
    const tick = () => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date()).map((x) => [x.type, x.value]));
      const min = (((+p.hour + shift) * 60 + +p.minute) % 1440 + 1440) % 1440;
      if (hand) hand.setAttribute('transform', `rotate(${(min / 1440) * 360} 200 200)`);
      if (tEl) tEl.textContent = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      const s = sess.find((x) => (x.f < x.t ? min >= x.f && min < x.t : min >= x.f || min < x.t));
      if (sEl) sEl.textContent = s ? s.n : '';
    };
    tick(); setInterval(tick, 30000);
    const light = (k) => { if (k) svg.dataset.hl = k; else delete svg.dataset.hl;
      document.querySelectorAll('.ck-l').forEach((l) => l.classList.toggle('hl', l.dataset.s === k)); };
    document.querySelectorAll('.ck-l, svg.ck path[data-s], svg.ck text[data-s]').forEach((el) => {
      el.addEventListener('mouseenter', () => light(el.dataset.s || el.getAttribute('data-s')));
      el.addEventListener('mouseleave', () => light(''));
      el.addEventListener('focus', () => light(el.dataset.s));
      el.addEventListener('blur', () => light(''));
    });
  }

  // the dial: one session big in the middle, the others faded along a curve
  const dial = document.querySelector('.dial');
  if (!dial) return;
  const items = [...dial.querySelectorAll('li')];
  if (items.length < 2) return;
  dial.classList.add('live');
  let cur = 0;
  const lay = () => items.forEach((li, i) => {
    const d = i - cur, a = Math.abs(d);
    li.style.transform = `translate(${Math.min(a, 2) * 30}px, calc(-50% + ${Math.sign(d) * (a ? 118 + (a - 1) * 70 : 0)}px)) scale(${1 - Math.min(a, 2) * 0.16})`;
    li.style.opacity = a > 2 ? 0 : a ? (a === 1 ? 0.42 : 0.16) : 1;
    li.classList.toggle('cur', !d);
    li.style.pointerEvents = a > 2 ? 'none' : '';
  });
  const go = (n) => { cur = Math.max(0, Math.min(items.length - 1, n)); lay(); };
  items.forEach((li, i) => li.addEventListener('click', () => go(i)));
  dial.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => go(cur + Number(b.dataset.d))));
  let lock = 0;
  dial.addEventListener('wheel', (e) => { e.preventDefault(); const now = Date.now(); if (now - lock < 260) return; lock = now; go(cur + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  dial.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); go(cur + 1); } if (e.key === 'ArrowUp') { e.preventDefault(); go(cur - 1); } });
  lay();
})();
