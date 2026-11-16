// Insights > Time: the candle clock. 1H / 4H switch, live "now" hand in MT5 server time (New York time + the
// trader's offset), and hover a part of the candle to light it up.
(function () {
  const card = document.querySelector('.cc-card');
  if (!card) return;
  const off = Number(card.dataset.off) || 0;
  const svgs = [...card.querySelectorAll('svg.cc')];
  const sides = [...card.querySelectorAll('.cc-side')];
  const now = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return (((+p.hour + off) * 60 + +p.minute) % 1440 + 1440) % 1440;   // MT5 server minute of the day
  };
  const show = (svg, p) => {
    const q = (k) => svg.querySelector(`[data-c="${k}"]`);
    q('z').textContent = p ? p.n.toUpperCase() : '';
    q('net').textContent = p ? p.net : '-';
    q('net').classList.toggle('neg', !!(p && !p.pos));
    q('sub').textContent = p ? p.sub : '';
  };
  const tick = () => {
    const day = now();
    svgs.forEach((svg) => {
      const tf = +svg.dataset.tf, m = day % tf, parts = JSON.parse(svg.dataset.parts || '[]');
      svg.querySelector('.ck-hand').setAttribute('transform', `rotate(${(m / tf) * 360} 200 200)`);
      svg.querySelector('[data-c="now"]').textContent = `NOW ${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
      if (!svg.dataset.hl) show(svg, parts.find((p) => m >= p.f && m < p.t));
    });
  };
  tick(); setInterval(tick, 30000);
  const light = (svg, side, k) => {
    if (k) svg.dataset.hl = k; else delete svg.dataset.hl;
    svg.querySelectorAll('[data-z]').forEach((el) => el.classList.toggle('lit', el.getAttribute('data-z') === k));
    side.querySelectorAll('.ck-l').forEach((l) => l.classList.toggle('hl', l.dataset.z === k));
    if (k) show(svg, JSON.parse(svg.dataset.parts || '[]').find((p) => p.k === k)); else tick();
  };
  svgs.forEach((svg, i) => {
    const side = sides[i];
    [...svg.querySelectorAll('[data-z]'), ...side.querySelectorAll('.ck-l')].forEach((el) => {
      const k = el.getAttribute('data-z');
      el.addEventListener('mouseenter', () => light(svg, side, k));
      el.addEventListener('mouseleave', () => light(svg, side, ''));
      el.addEventListener('focus', () => light(svg, side, k));
      el.addEventListener('blur', () => light(svg, side, ''));
      el.addEventListener('click', () => light(svg, side, svg.dataset.hl === k ? '' : k));
    });
  });
  card.querySelectorAll('.cc-tf a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    card.querySelectorAll('.cc-tf a').forEach((x) => x.classList.toggle('on', x === a));
    [...svgs, ...sides].forEach((el) => el.toggleAttribute('hidden', el.dataset.tf !== a.dataset.tf));   // SVG has no .hidden property
  }));
})();
