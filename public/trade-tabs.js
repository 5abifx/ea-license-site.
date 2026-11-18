/* Trade page: three tabs (Chart, Review, Share) instead of one long scroll, in the Share Studio look.
   The tab follows the link: #review, #mentor, #share. Tells the page which tab is open ('trade-pane' event),
   so the video only plays while Share is open. */
(function () {
  const nav = document.getElementById('ttabs');
  if (!nav) return;
  const parts = [...document.querySelectorAll('[data-tab]')];
  const HASH = { review: 'review', mentor: 'review', share: 'share', chart: 'chart', tv: 'chart' };
  function show(tab, push) {
    parts.forEach((el) => { el.hidden = el.dataset.tab !== tab; });
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.go === tab));
    if (push) { try { history.replaceState(null, '', tab === 'chart' ? location.pathname + location.search : '#' + tab); } catch (e) {} }
    window.dispatchEvent(new CustomEvent('trade-pane', { detail: tab }));
    if (tab === 'chart') window.dispatchEvent(new Event('resize'));   // the chart measures itself again
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    show(b.dataset.go, true);
  });
  const start = () => show(HASH[location.hash.slice(1)] || 'chart', false);
  window.addEventListener('hashchange', start);
  start();
  if (location.hash === '#mentor') { const m = document.getElementById('mentor'); if (m) m.scrollIntoView(); }
})();
