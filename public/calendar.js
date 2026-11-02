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
