/* Public /studio page: two live CineCards on SAMPLE numbers (no download here; exports live in the member's journal). */
(function () {
  if (!window.CineCard) return;
  const $ = (id) => document.getElementById(id);
  // a gently falling sample price line (sell trade)
  const closes = []; let p = 2412.4;
  for (let i = 0; i < 70; i++) { p += Math.sin(i * 0.7) * 0.9 + (i > 22 ? -0.55 : 0.12) + Math.cos(i * 1.9) * 0.6; closes.push(Math.round(p * 100) / 100); }
  const SAMPLE = {
    trade: { kind: 'trade', symbol: 'XAUUSD', side: 'Sell', dateTxt: 'Nov 13', money: 1306, pips: 412.5, r: 3.1, pct: 1.31, entry: '2412.40', exit: '2371.15', sizeTxt: '0.32 lots', heldTxt: '1h 12m', riskTxt: '0.42%', closes, iEntry: 22, iExit: 66, synced: true, handle: 'your name' },
    day: { kind: 'period', kindTxt: 'DAILY', title: 'Fri, Nov 13', total: { money: 569, pips: 182, r: 2.4, pct: 0.57 }, trades: '3', winRate: '67%', green: '', best: '+$612.00 XAUUSD', bestLabel: 'Best trade', synced: true, handle: 'your name',
      items: [['09:41', 612], ['10:15', -98], ['11:02', 55]].map(([label, money]) => ({ label, money, pips: money / 3.1, r: money / 250, pct: money / 1000 })) },
    week: { kind: 'period', kindTxt: 'WEEKLY', title: 'Nov 9 – 13', total: { money: 2140.5, pips: 690, r: 8.6, pct: 2.14 }, trades: '11', winRate: '64%', green: '4 of 5', best: '+$1,306.00', bestLabel: 'Best day', synced: true, handle: 'your name',
      items: [['MON', 420], ['TUE', -180], ['WED', 310], ['THU', 1306], ['FRI', 284.5]].map(([label, money]) => ({ label, money, pips: money / 3.1, r: money / 250, pct: money / 1000, n: 2 })) },
    milestone: { kind: 'milestone', kicker: 'MILESTONE', heading: 'Target Reached', big: 25000, bigUnit: 'money', line: 'passed the prop firm evaluation on a', synced: true, handle: 'your name',
      stats: [['Passed', '13 November 2026'], ['Profit', '+$2,040.00'], ['Of target', '102%']] },
  };
  const NAMES = { trade: 'A trade', day: 'A day', week: 'A week', milestone: 'Milestone' };
  const QUOTES = { trade: 'Patience pays the patient', day: '', week: 'Same rules every day', milestone: '' };
  const mk = (cv, k, extra) => window.CineCard.create(cv, SAMPLE[k], Object.assign({ kind: SAMPLE[k].kind, tag: 'your name', quote: QUOTES[k], show: k === 'trade' ? { entry: true, exit: true, size: true } : k === 'week' ? { trades: true, winrate: true } : {} }, extra));

  // ---------- hero: cycles through the four cards ----------
  const hero = $('hero'), tabs = $('heroTabs'), order = ['trade', 'week', 'milestone', 'day'];
  const looks = { trade: ['smoke', 'bw'], week: ['ember', 'natural'], milestone: ['floor', 'bw'], day: ['smoke', 'teal'] };
  let hi = 0, timer = 0;
  const hc = mk(hero, order[0], { art: looks.trade[0], grade: looks.trade[1] });
  function heroShow(i) {
    hi = i; const k = order[i];
    hc.data(SAMPLE[k], SAMPLE[k].kind);
    hc.set({ art: looks[k][0], grade: looks[k][1], quote: QUOTES[k], show: k === 'trade' ? { entry: true, exit: true, size: true } : k === 'week' ? { trades: true, winrate: true } : {} });
    hc.play();
    tabs.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-selected', j === i));
    clearTimeout(timer); timer = setTimeout(() => heroShow((hi + 1) % order.length), 8000);
  }
  tabs.innerHTML = order.map((k, i) => `<button type="button" role="tab" data-i="${i}">${NAMES[k]}</button>`).join('');
  tabs.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) heroShow(+b.dataset.i); };
  heroShow(0);

  // ---------- try it ----------
  const T = { card: 'trade', art: 'smoke', grade: 'bw', size: 'story' };
  const tc = mk($('try-cv'), 'trade', { art: 'smoke', grade: 'bw' });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const chip = (v, l, on, extra) => `<button type="button" class="ss-chip" data-v="${esc(v)}" aria-pressed="${!!on}">${extra || ''}<span>${esc(l)}</span></button>`;
  const SW = { natural: 'linear-gradient(135deg,#6a8,#c84)', bw: 'linear-gradient(135deg,#fff,#222)', ember: '#ff6a2a', blood: '#c3141d', teal: '#13a88a', gold: '#d9a441' };
  const OPT = {
    card: Object.entries(NAMES),
    art: [['smoke', 'Smoke'], ['ember', 'Ember glow'], ['floor', 'Trading floor'], ['own', 'My photo or clip']],
    grade: Object.entries(window.CineCard.grades),
    size: [['story', 'Story 9:16'], ['post', 'Post 4:5'], ['wide', 'Wide 16:9']],
  };
  function paint() {
    document.querySelectorAll('.sp-try [data-key]').forEach((box) => {
      const k = box.dataset.key;
      box.innerHTML = OPT[k].map(([v, l]) => chip(v, l, T[k] === v, k === 'grade' ? `<i class="ss-sw" style="background:${SW[v] || '#888'}"></i>` : '')).join('');
    });
  }
  document.querySelector('.sp-try').addEventListener('click', (e) => {
    const b = e.target.closest('.ss-chip'); if (!b) return;
    const k = b.parentElement.dataset.key, v = b.dataset.v;
    if (k === 'art' && v === 'own') { $('own').click(); return; }
    T[k] = v; paint();
    document.querySelector('.sp-try').classList.toggle('is-wide', T.size === 'wide');
    if (k === 'card') { tc.data(SAMPLE[v], SAMPLE[v].kind); tc.set({ quote: QUOTES[v], show: v === 'trade' ? { entry: true, exit: true, size: true } : v === 'week' ? { trades: true, winrate: true } : {} }); }
    else tc.set({ [k]: v, layout: k === 'size' && v === 'wide' && T.card === 'trade' ? 'split' : 'center' });
    tc.play();
  });
  $('own').onchange = (e) => { const f = e.target.files[0]; if (f) tc.setBackground(f).then(() => { T.art = 'own'; tc.set({ art: 'own', dim: 0.5 }); paint(); tc.play(); }).catch(() => {}); };
  paint();
  // pause the canvases that are off screen (phones)
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) (x.target === hero ? hc : tc).play(); }), { threshold: 0.2 });
    io.observe(hero); io.observe($('try-cv'));
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { hc.play(); tc.play(); });
})();
