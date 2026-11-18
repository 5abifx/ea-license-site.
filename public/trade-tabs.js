/* Trade page: three tabs (Chart, Review, Share) instead of one long scroll, and inside Share
   one maker at a time (Picture cards, Video, Overlay). The tab follows the link: #review, #mentor, #share. */
(function () {
  const nav = document.getElementById('ttabs');
  if (!nav) return;
  const parts = [...document.querySelectorAll('[data-tab]')];
  const HASH = { review: 'review', mentor: 'review', share: 'share', chart: 'chart', tv: 'chart' };
  function show(tab, push) {
    parts.forEach((el) => { el.hidden = el.dataset.tab !== tab; });
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.go === tab));
    if (push) { try { history.replaceState(null, '', tab === 'chart' ? location.pathname + location.search : '#' + tab); } catch (e) {} }
    window.dispatchEvent(new CustomEvent('trade-pane', { detail: tab === 'share' ? pane : tab }));
    if (tab === 'chart') window.dispatchEvent(new Event('resize'));   // the chart measures itself again
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    show(b.dataset.go, true);
    nav.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // inside Share: one maker at a time
  const tabs = document.querySelector('.tsh-tabs');
  let pane = 'pic';
  try { const v = localStorage.getItem('tradeSharePane'); if (v && document.getElementById('pane-' + v)) pane = v; } catch (e) {}
  function showPane(p) {
    pane = p;
    document.querySelectorAll('.tsh-pane').forEach((el) => { el.hidden = el.id !== 'pane-' + p; });
    if (tabs) tabs.querySelectorAll('[data-pane]').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.pane === p); b.setAttribute('aria-selected', b.dataset.pane === p); });
    // the $ / % / R and KATANA line choices apply to pictures and video, not the overlay (it has its own)
    const ctl = document.querySelector('.tsh-top > .row'); if (ctl) ctl.hidden = p === 'ov';
    try { localStorage.setItem('tradeSharePane', p); } catch (e) {}
    window.dispatchEvent(new CustomEvent('trade-pane', { detail: p }));
  }
  if (tabs) tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-pane]'); if (b) showPane(b.dataset.pane); });
  showPane(pane);

  const start = () => show(HASH[location.hash.slice(1)] || 'chart', false);
  window.addEventListener('hashchange', start);
  start();
  if (location.hash === '#mentor') { const m = document.getElementById('mentor'); if (m) m.scrollIntoView(); }
})();
