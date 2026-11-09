// The Desk: live "now" line on the day map, and the next trade check (all in the browser, from the trader's own trades).
(function () {
  const nyMin = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return (+p.hour * 60 + +p.minute) % 1440;
  };
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const fmtU = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}R`;

  // now line
  const now = document.querySelector('.tm-now');
  const place = () => {
    if (!now) return;
    const x0 = +now.dataset.x0, x1 = +now.dataset.x1, x = x0 + ((x1 - x0) * nyMin()) / 1440;
    now.querySelector('line').setAttribute('x1', x); now.querySelector('line').setAttribute('x2', x);
    const t = now.querySelector('text'); t.setAttribute('x', x); t.textContent = 'now ' + hhmm(nyMin());
  };
  place(); setInterval(place, 30000);

  // next trade check
  const box = document.getElementById('tm-ck'), el = document.getElementById('tm-data');
  if (!box || !el) return;
  const D = JSON.parse(el.textContent);
  const st = { sym: D.syms[0], side: 0, when: 'now', at: 600, risk: D.usualRisk || 0.5, state: D.minsSinceLoss !== null && D.minsSinceLoss <= 30 ? 'loss' : 'fresh' };
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(st[k]) === String(v)}">${l}</button>`).join('')}</div>`;
  const hours = Array.from({ length: 48 }, (_, i) => i * 30);
  box.innerHTML = `<div class="tm-form">
      <div class="fl"><span>Symbol</span>${seg('sym', D.syms.map((s) => [s, s]))}</div>
      <div class="fl"><span>Direction</span>${seg('side', [[0, 'Buy'], [1, 'Sell']])}</div>
      <div class="fl"><span>When</span>${seg('when', [['now', 'Now'], ['at', 'At']])}<select id="tm-at" aria-label="Time, New York" hidden>${hours.map((m) => `<option value="${m}"${m === 600 ? ' selected' : ''}>${hhmm(m)} NY</option>`).join('')}</select></div>
      <div class="fl"><span>Risk <b id="tm-rv"></b>${D.usualRisk ? ` <small class="muted">· your usual ${D.usualRisk}%</small>` : ''}</span><input id="tm-risk" type="range" min="0.1" max="3" step="0.05" value="${st.risk}"></div>
      <div class="fl"><span>Your state</span>${seg('state', [['fresh', 'Fresh'], ['loss', 'Just lost']])}</div>
    </div>
    <div class="tm-vd" aria-live="polite"></div>`;
  const vd = box.querySelector('.tm-vd');

  function similar(sym, side, at, afterLoss) {
    const si = D.allSyms.indexOf(sym);
    const near = (m) => { const d = Math.abs(m - at); return Math.min(d, 1440 - d) <= 60; };
    const tries = [
      [(r) => r[0] === si && r[1] === side && near(r[2]), 'same symbol, side and hour'],
      [(r) => r[0] === si && r[1] === side, 'same symbol and side'],
      [(r) => r[0] === si, 'same symbol'],
    ];
    for (const [f, label] of tries) {
      let l = D.rows.filter(f);
      if (afterLoss) { const l2 = l.filter((r) => r[4] >= 0 && r[4] <= 30); if (l2.length >= 3) { l = l2; label += ', right after a loss'; } }
      if (l.length >= 3) return { l, label };
    }
    return { l: [], label: '' };
  }

  function run() {
    const at = st.when === 'now' ? nyMin() : st.at;
    const { l, label } = similar(st.sym, +st.side, at, st.state === 'loss');
    const n = l.length, win = n ? Math.round((l.filter((r) => r[6]).length / n) * 100) : 0, avg = n ? l.reduce((s, r) => s + r[3], 0) / n : 0;
    const warns = []; let bad = 0;
    const slot = Math.floor(at / 30) * 30;
    if (D.avoid.includes(slot)) { bad += 2; warns.push(['l', `${hhmm(slot)} is one of your red hours. Your trades here lose money.`]); }
    if (D.best && ((D.best.from < D.best.to && at >= D.best.from && at < D.best.to) || (D.best.from > D.best.to && (at >= D.best.from || at < D.best.to)))) warns.push(['g', `Inside your window (${hhmm(D.best.from)} to ${hhmm(D.best.to)}).`]);
    if (st.state === 'loss') { bad += 1; warns.push(['w', D.minsSinceLoss !== null && D.minsSinceLoss <= 30 ? `Your last loss was ${D.minsSinceLoss} min ago. Wait until ${30 - D.minsSinceLoss} more minutes pass.` : 'Right after a loss: wait 30 minutes.']); }
    if (D.cap && D.todayN >= D.cap) { bad += 2; warns.push(['l', `You already took ${D.todayN} trades today. Your rule is max ${D.cap}.`]); }
    if (D.usualRisk && st.risk > D.usualRisk * 1.5) { bad += st.risk > D.usualRisk * 2.5 ? 2 : 1; warns.push(['w', `Risk is ${(st.risk / D.usualRisk).toFixed(1)}× your usual.`]); }
    const riskMoney = D.balance ? (D.balance * st.risk) / 100 : null;
    if (riskMoney !== null && D.roomToday !== null && riskMoney > D.roomToday) { bad += 3; warns.push(['l', 'A full stop-out would break today\'s prop firm limit.']); }
    if (n >= 3 && avg < 0) bad += avg < -0.4 ? 2 : 1;
    if (n >= 3 && avg > 0.3 && win >= 50 && !warns.some((w) => w[0] === 'g')) warns.push(['g', 'Your record on trades like this is good.']);
    if (n < 3) warns.push(['w', 'Not enough similar trades yet to judge this one.']);
    const g = bad >= 5 ? 'X' : bad >= 3 ? 'C' : bad >= 1 ? 'B' : 'A';
    const txt = { A: ['Good trade to take', 'Your history and your rules agree.'], B: ['Okay, with care', 'Allowed, but your history shows a weak spot.'],
      C: ['Poor odds for you', 'Your record in these conditions says wait.'], X: ['Do not take this trade', 'This breaks your own rules.'] }[g];
    const money = (v) => (D.cur === 'USD' ? '$' : '') + Math.round(v).toLocaleString('en-US') + (D.cur && D.cur !== 'USD' ? ' ' + D.cur : '');
    document.getElementById('tm-rv').textContent = st.risk.toFixed(2) + '%';
    vd.innerHTML = `<div class="tm-vh"><div class="tm-grade g${g}">${g}</div><div><h3>${txt[0]}</h3><p class="muted small">${txt[1]}</p></div></div>
      <div class="tm-facts">
        <div><span>Your similar trades</span><b>${n}</b><small>${label || 'none yet'}</small></div>
        <div><span>Their win rate</span><b class="${n ? (win >= 50 ? 'pos' : 'neg') : ''}">${n ? win + '%' : '-'}</b><small>${n ? 'avg ' + fmtU(avg) : ''}</small></div>
        <div><span>Risk in money</span><b>${riskMoney !== null ? money(riskMoney) : '-'}</b><small>${D.balance ? 'of ' + money(D.balance) : 'balance unknown'}</small></div>
        <div><span>Prop room if stopped out</span><b class="${D.roomToday !== null && riskMoney !== null && D.roomToday - riskMoney < 0 ? 'neg' : ''}">${D.roomToday !== null && riskMoney !== null ? money(D.roomToday - riskMoney) : '-'}</b><small>${D.roomToday !== null ? 'of ' + money(D.roomToday) + ' today' : 'add firm rules in Insights › Prop'}</small></div>
      </div>
      <div class="tm-warns">${warns.map(([c, t]) => `<div class="${c}"><i></i><span>${t}</span></div>`).join('')}</div>`;
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const s = b.parentElement; s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    st[s.dataset.k] = b.dataset.v;
    document.getElementById('tm-at').hidden = st.when !== 'at';
    run();
  });
  document.getElementById('tm-at').addEventListener('change', (e) => { st.at = +e.target.value; run(); });
  document.getElementById('tm-risk').addEventListener('input', (e) => { st.risk = +e.target.value; run(); });
  run();
})();
