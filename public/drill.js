// Insights > Time: tap a session, a half-hour tile on the clock, the big ranked session or a heatmap square
// to open a panel with those trades (each links to its trade page).
(function () {
  const el = document.getElementById('drill-data');
  if (!el) return;
  const D = JSON.parse(el.textContent);
  // a trade: [id, closeMs, net, r, sym, side, sess, dow, dayKey, openMin]
  const usd = !D.cur || D.cur === 'USD';
  const fmt = (v) => (v < 0 ? '−' : '+') + (usd ? '$' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (usd ? '' : ' ' + D.cur);
  const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hh = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const sIdx = Object.fromEntries(D.sess.map((s, i) => [s[0], i]));

  const pane = document.createElement('aside');
  pane.className = 'drill'; pane.setAttribute('role', 'dialog'); pane.setAttribute('aria-modal', 'false'); pane.hidden = true;
  pane.innerHTML = '<div class="drill-in"><div class="drill-hd"><div><b class="drill-t"></b><span class="drill-s muted small"></span></div><button type="button" class="drill-x" aria-label="Close">✕</button></div><ol class="drill-l"></ol></div>';
  document.body.appendChild(pane);
  const close = () => { pane.classList.remove('on'); setTimeout(() => (pane.hidden = true), 250); };
  pane.querySelector('.drill-x').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pane.hidden) close(); });

  function open(title, list) {
    if (!list.length) return;
    list = list.slice().sort((a, b) => b[1] - a[1]);
    const net = list.reduce((s, t) => s + t[2], 0), win = Math.round((list.filter((t) => t[2] > 0).length / list.length) * 100);
    pane.querySelector('.drill-t').textContent = title;
    pane.querySelector('.drill-s').innerHTML = `${list.length} trade${list.length > 1 ? 's' : ''} · ${win}% win · <b class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</b>`;
    pane.querySelector('.drill-l').innerHTML = list.slice(0, 200).map((t) => {
      const d = new Date(t[1]).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      const inner = `<span class="dr-d">${d}<small>${hh(t[9])}</small></span><span class="dr-s">${D.syms[t[4]] || ''}<small>${t[5] ? 'Sell' : 'Buy'}</small></span><b class="${t[2] >= 0 ? 'pos' : 'neg'}">${fmt(t[2])}<small>${t[3] === null ? '' : (t[3] >= 0 ? '+' : '−') + Math.abs(t[3]).toFixed(1) + 'R'}</small></b>`;
      return `<li>${t[0] ? `<a href="/journal/${t[0]}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
    }).join('');
    pane.hidden = false; requestAnimationFrame(() => pane.classList.add('on'));
    pane.querySelector('.drill-x').focus({ preventScroll: true });
  }
  const bySess = (k) => D.t.filter((t) => t[6] === sIdx[k]);
  const name = (k) => (D.sess[sIdx[k]] || [k, k])[1];

  // a dial item opens only when it was already the one in the middle (the first tap turns the dial)
  let wasCur = false;
  document.addEventListener('click', (e) => { const li = e.target.closest('.dial li'); wasCur = !!li && (li.classList.contains('cur') || !li.closest('.dial.live')); }, true);
  document.addEventListener('click', (e) => {
    const tile = e.target.closest('svg.ck path.ck-t');
    if (tile) { const m = Number(tile.dataset.m); return open(`${hh(m)}–${hh(m + 30)}`, D.t.filter((t) => t[9] >= m && t[9] < m + 30)); }
    const ses = e.target.closest('.ck-l[data-s], svg.ck text[data-s], svg.ck path[data-s]:not(.ck-t)');
    if (ses) return open(name(ses.dataset.s || ses.getAttribute('data-s')), bySess(ses.dataset.s || ses.getAttribute('data-s')));
    const li = e.target.closest('.dial li[data-s]');
    if (li && wasCur) return open(name(li.dataset.s), bySess(li.dataset.s));
    const cell = e.target.closest('.hw i[data-d]');
    if (cell) { const d = Number(cell.dataset.d), h = Number(cell.dataset.h); return open(`${DOW[d]} ${hh(h * 60)}–${hh(h * 60 + 60)}`, D.t.filter((t) => t[7] === d && Math.floor(t[9] / 60) === h)); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target.closest && e.target.closest('.hw i[data-d], .ck-l[data-s]');
    if (t) { e.preventDefault(); t.click(); }
  });
})();
