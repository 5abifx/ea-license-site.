// Journal calendar: tapping a day shows that day's trades in the side panel.
(function () {
  const days = document.querySelectorAll('[data-day].day, [data-day].arow');
  const panels = document.querySelectorAll('.dayp');
  days.forEach((b) => b.addEventListener('click', () => {
    const d = b.dataset.day;
    days.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.day === d)));
    panels.forEach((p) => { p.hidden = p.dataset.day !== d; });
    // on phones the panel sits under the calendar: bring it into view
    if (window.matchMedia('(max-width: 860px)').matches) document.querySelector('.day-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
})();

// "What we found": one row of cards, ‹ › scroll it
(function () {
  const g = document.querySelector('.fq-grid');
  if (!g) return;
  const btns = document.querySelectorAll('.fq-btn');
  const sync = () => {
    btns.forEach((b) => { b.disabled = b.dataset.d < 0 ? g.scrollLeft < 4 : g.scrollLeft + g.clientWidth >= g.scrollWidth - 4; });
  };
  btns.forEach((b) => b.addEventListener('click', () => g.scrollBy({ left: Number(b.dataset.d) * g.clientWidth * 0.9, behavior: 'smooth' })));
  g.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
})();
