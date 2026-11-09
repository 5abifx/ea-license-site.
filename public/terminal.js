// The Desk: live clock parts (now line, session, countdowns), the news catalysts panel and the next trade check.
// Everything runs in the browser from the trader's own trades and the stored economic calendar.
(function () {
  const $ = (id) => document.getElementById(id);
  const nyMin = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return (+p.hour % 24) * 60 + +p.minute;
  };
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const fmtU = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}R`;
  const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- live: now line, session, countdowns ----------
  const SESS = [['Asia', 19 * 60, 27 * 60], ['London', 3 * 60, 8 * 60], ['NY AM', 8 * 60, 12 * 60], ['NY PM', 12 * 60, 17 * 60]];
  const now = document.querySelector('.tm-now');
  function tick() {
    const m = nyMin();
    if (now) {
      const x0 = +now.dataset.x0, x1 = +now.dataset.x1, x = x0 + ((x1 - x0) * m) / 1440;
      now.querySelector('line').setAttribute('x1', x); now.querySelector('line').setAttribute('x2', x);
      const t = now.querySelector('text'); t.setAttribute('x', x); t.textContent = 'now ' + hhmm(m);
    }
    const s = SESS.find(([, a, b]) => (m >= a && m < b) || (m + 1440 >= a && m + 1440 < b));
    const mm = s && m < s[1] ? m + 1440 : m;
    if ($('tm-sess')) {
      $('tm-sess').textContent = s ? s[0] : 'Market quiet';
      $('tm-sessbar').style.width = s ? `${Math.round(((mm - s[1]) / (s[2] - s[1])) * 100)}%` : '0%';
      const nx = SESS.map(([n, a]) => [n, ((a % 1440) - m + 1440) % 1440]).filter(([, d]) => d > 0).sort((p, q) => p[1] - q[1])[0];
      $('tm-sessnext').textContent = nx ? `${nx[0]} in ${dur(nx[1] * 60000)}` : '';
    }
    document.querySelectorAll('[data-cd]').forEach((el) => {
      const d = +el.dataset.cd - Date.now();
      el.textContent = d > 0 ? 'in ' + dur(d) : d > -15 * 60000 ? 'live' : 'done';
      el.classList.toggle('soon', d > 0 && d < 30 * 60000);
    });
  }
  tick(); setInterval(tick, 20000);

  // ---------- news catalysts ----------
  const nb = $('tm-news'), nd = $('tm-ndata');
  if (nb && nd) {
    const N = JSON.parse(nd.textContent);
    let day = 0, sel = null;
    const num = (v, u) => {
      if (v === null || v === undefined) return '--';
      const a = Math.abs(v), s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : (+v.toFixed(2)).toString();
      return s.replace('-', '−') + (u || '');
    };
    const imp = (i) => `<span class="tm-ib i${i}"><i></i><i></i><i></i></span>`;
    const maxMove = Math.max(1, ...N.events.map((e) => e.move || 0));
    const beatCls = (e) => (e.actual === null || e.forecast === null ? '' : e.actual > e.forecast ? 'beat' : e.actual < e.forecast ? 'miss' : 'inl');
    function hist(h, u) {
      if (!h.length) return '<div class="tm-nh-empty">No numbers to compare: words move this one.</div>';
      const vals = h.flat().filter((v) => v !== null).concat(0);
      const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.15 || 1;
      const W = 400, y0 = 8, y1 = 108, yy = (v) => y1 - ((y1 - y0) * (v - (lo - pad))) / (hi + pad - (lo - pad));
      const bw = W / h.length;
      let s = `<svg class="tm-nh" viewBox="0 0 ${W} 126" role="img" aria-label="Last releases: actual against forecast"><line x1="0" x2="${W}" y1="${yy(0)}" y2="${yy(0)}" class="tm-zero"/>`;
      h.forEach(([a, f], i) => {
        const cx = i * bw + bw / 2, top = Math.min(yy(a), yy(0)), hg = Math.max(2, Math.abs(yy(a) - yy(0)));
        const c = f === null ? 'inl' : a > f ? 'beat' : a < f ? 'miss' : 'inl';
        s += `<rect x="${cx - bw * 0.28}" y="${top}" width="${bw * 0.56}" height="${hg}" rx="3" class="b ${c}"><title>${num(a, u)} vs ${num(f, u)}</title></rect>`;
        if (f !== null) s += `<line x1="${cx - bw * 0.4}" x2="${cx + bw * 0.4}" y1="${yy(f)}" y2="${yy(f)}" class="f"/>`;
        s += `<text x="${cx}" y="122" text-anchor="middle" class="tm-tick">${i === h.length - 1 ? 'last' : '−' + (h.length - 1 - i)}</text>`;
      });
      return s + '</svg>';
    }
    function detail(e) {
      const when = e.released ? `<span class="tm-pill ${beatCls(e)}">${{ beat: 'Beat', miss: 'Missed', inl: 'In line', '': 'Done' }[beatCls(e)]}</span>` : `<span class="tm-pill soon" data-cd="${e.t}">--</span>`;
      const y = e.you;
      return `<div class="tm-nd-h"><div><span class="tp-l">${esc(e.cur)} · ${hhmm(e.nyMin)} NY</span><h3>${esc(e.name)}</h3></div>${when}</div>
        <div class="tm-afp">
          <div class="${e.released ? beatCls(e) : ''}"><span>Actual</span><b>${num(e.actual, e.unit)}</b></div>
          <div><span>Forecast</span><b>${num(e.forecast, e.unit)}</b></div>
          <div><span>Previous</span><b>${num(e.previous, e.unit)}</b></div></div>
        <div class="tm-nh-w"><span class="tp-l">Last ${e.hist.length || ''} releases <i class="lg beat"></i>beat <i class="lg miss"></i>miss <i class="lg f"></i>forecast</span>${hist(e.hist, e.unit)}</div>
        <div class="tm-facts">
          <div><span>Gold in 15 min</span><b>${e.move !== null ? '±$' + e.move.toFixed(1) : '--'}</b><small>${e.bigMove !== null ? 'max ±$' + e.bigMove.toFixed(1) : 'no data yet'}</small></div>
          <div><span>When it beat</span><b>${e.beatN ? (e.beatUp >= e.beatN / 2 ? `<span class="pos">▲</span> ${e.beatUp}/${e.beatN}` : `<span class="neg">▼</span> ${e.beatN - e.beatUp}/${e.beatN}`) : '--'}</b><small>${e.beatN ? (e.beatUp >= e.beatN / 2 ? 'gold rose' : 'gold fell') : 'not enough yet'}</small></div>
          <div><span>Your trades near it</span><b class="${y ? (y.net >= 0 ? 'pos' : 'neg') : ''}">${y ? y.n : 0}</b><small>${y ? (y.hasR ? fmtU(y.r) : '') + ' within 15 min' : 'none within 15 min'}</small></div>
        </div>`;
    }
    function render() {
      if (!N.has) {
        nb.innerHTML = `<div class="tm-nempty"><div class="tm-ghostrows">${'<i></i>'.repeat(4)}</div>
          <div><b>News switches on with Trade Journal EA 1.30</b><p class="muted small">It reads MT5's own economic calendar: actual, forecast, previous and how gold reacted. Update the EA once and the Desk fills in.</p></div></div>`;
        return;
      }
      const list = N.events.filter((e) => e.day === day);
      if (!list.length) { nb.innerHTML = `<div class="tm-empty"><i class="ok"></i>No medium or high impact news for ${esc(N.curs.join(', '))} on this day.</div>`; return; }
      if (!sel || !list.some((e) => e.id === sel)) sel = (list.find((e) => !e.released && e.imp === 3) || list.find((e) => !e.released) || list[list.length - 1]).id;
      const e = list.find((x) => x.id === sel);
      nb.innerHTML = `<div class="tm-nwrap"><div class="tm-nl" role="listbox" aria-label="News">${list.map((x) => `
        <button type="button" role="option" class="tm-nr ${x.released ? 'past' : ''}" data-id="${esc(x.id)}" aria-selected="${x.id === sel}">
          <span class="t">${hhmm(x.nyMin)}</span><span class="c">${esc(x.cur)}</span>${imp(x.imp)}<span class="n">${esc(x.name)}</span>
          <span class="v ${x.released ? beatCls(x) : ''}">${x.released ? num(x.actual, x.unit) : `<em data-cd="${x.t}">--</em>`}</span>
          <span class="f">${num(x.forecast, x.unit)}</span>
          <span class="m" title="Gold, 15 minutes after, on average"><i style="width:${x.move ? Math.round((x.move / maxMove) * 100) : 0}%"></i></span>
          <span class="y">${x.you ? `<b class="${x.you.net >= 0 ? 'pos' : 'neg'}">${x.you.n}</b>` : ''}</span></button>`).join('')}
        <div class="tm-nl-h"><span>NY</span><span></span><span></span><span></span><span>actual</span><span>fcst</span><span>gold move</span><span>you</span></div></div>
        <div class="tm-nd">${detail(e)}</div></div>`;
      tick();
    }
    nb.addEventListener('click', (ev) => { const r = ev.target.closest('.tm-nr'); if (r) { sel = r.dataset.id; render(); } });
    const days = $('tm-days');
    if (days) days.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      day = +b.dataset.d; days.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); render();
    });
    render();
  }

  // ---------- next trade check ----------
  const box = $('tm-ck'), el = $('tm-data');
  if (!box || !el) return;
  const D = JSON.parse(el.textContent);
  const st = { sym: D.syms[0], side: 0, when: 'now', at: 600, risk: D.usualRisk || 0.5, state: D.minsSinceLoss !== null && D.minsSinceLoss <= 30 ? 'loss' : 'fresh' };
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(st[k]) === String(v)}">${l}</button>`).join('')}</div>`;
  const hours = Array.from({ length: 48 }, (_, i) => i * 30);
  box.innerHTML = `<div class="tm-form">
      <div class="fl"><span>Symbol</span>${seg('sym', D.syms.map((s) => [s, s]))}</div>
      <div class="fl two"><div><span>Direction</span>${seg('side', [[0, 'Buy'], [1, 'Sell']])}</div><div><span>State</span>${seg('state', [['fresh', 'Fresh'], ['loss', 'Just lost']])}</div></div>
      <div class="fl"><span>When</span><div class="row-at">${seg('when', [['now', 'Now'], ['at', 'At']])}<select id="tm-at" aria-label="Time, New York" hidden>${hours.map((m) => `<option value="${m}"${m === 600 ? ' selected' : ''}>${hhmm(m)} NY</option>`).join('')}</select></div></div>
      <div class="fl"><span>Risk <b id="tm-rv"></b>${D.usualRisk ? ` <small class="muted">usual ${D.usualRisk}%</small>` : ''}</span><input id="tm-risk" type="range" min="0.1" max="3" step="0.05" value="${st.risk}" aria-label="Risk percent"></div>
    </div>
    <div class="tm-vd" aria-live="polite"></div>`;
  const vd = box.querySelector('.tm-vd');

  function similar(sym, side, at, afterLoss) {
    const si = D.allSyms.indexOf(sym);
    const near = (m) => { const d = Math.abs(m - at); return Math.min(d, 1440 - d) <= 60; };
    const tries = [
      [(r) => r[0] === si && r[1] === side && near(r[2]), 'same symbol, side, hour'],
      [(r) => r[0] === si && r[1] === side, 'same symbol and side'],
      [(r) => r[0] === si, 'same symbol'],
    ];
    for (const [f, label] of tries) {
      let l = D.rows.filter(f), lab = label;
      if (afterLoss) { const l2 = l.filter((r) => r[4] >= 0 && r[4] <= 30); if (l2.length >= 3) { l = l2; lab += ', after a loss'; } }
      if (l.length >= 3) return { l, label: lab };
    }
    return { l: [], label: '' };
  }

  function run() {
    const at = st.when === 'now' ? nyMin() : st.at;
    const { l, label } = similar(st.sym, +st.side, at, st.state === 'loss');
    const n = l.length, win = n ? Math.round((l.filter((r) => r[6]).length / n) * 100) : 0, avg = n ? l.reduce((s, r) => s + r[3], 0) / n : 0;
    const slot = Math.floor(at / 30) * 30;
    const inWin = D.best && ((D.best.from < D.best.to && at >= D.best.from && at < D.best.to) || (D.best.from > D.best.to && (at >= D.best.from || at < D.best.to)));
    const riskMoney = D.balance ? (D.balance * st.risk) / 100 : null;
    const nearNews = (D.news || []).filter(([m, i]) => i === 3 && Math.min(Math.abs(m - at), 1440 - Math.abs(m - at)) <= 15);
    // each check: [label, state ok|warn|bad|na, points, why]
    const C = [];
    C.push(['Time', D.avoid.includes(slot) ? 'bad' : inWin ? 'ok' : 'ok', D.avoid.includes(slot) ? 2 : 0,
      D.avoid.includes(slot) ? `${hhmm(slot)} is a red hour for you` : inWin ? 'Inside your window' : 'Not a red hour']);
    C.push(['State', st.state === 'loss' ? 'warn' : 'ok', st.state === 'loss' ? 1 : 0,
      st.state === 'loss' ? (D.minsSinceLoss !== null && D.minsSinceLoss <= 30 ? `Last loss ${D.minsSinceLoss} min ago: wait ${30 - D.minsSinceLoss} min` : 'Right after a loss: wait 30 min') : 'Fresh']);
    C.push(['Count', D.cap ? (D.todayN >= D.cap ? 'bad' : 'ok') : 'na', D.cap && D.todayN >= D.cap ? 2 : 0,
      D.cap ? `${D.todayN} of max ${D.cap} today` : `${D.todayN} today, no cap found`]);
    const rx = D.usualRisk ? st.risk / D.usualRisk : 1;
    C.push(['Size', rx > 1.5 ? (rx > 2.5 ? 'bad' : 'warn') : 'ok', rx > 1.5 ? (rx > 2.5 ? 2 : 1) : 0, D.usualRisk ? `${rx.toFixed(1)}× your usual risk` : 'No usual risk yet']);
    const over = riskMoney !== null && D.roomToday !== null && riskMoney > D.roomToday;
    C.push(['Prop', D.roomToday === null ? 'na' : over ? 'bad' : 'ok', over ? 3 : 0, D.roomToday === null ? 'No firm rules' : over ? "A stop-out breaks today's limit" : 'Stop-out stays inside the limit']);
    C.push(['News', nearNews.length ? 'bad' : 'ok', nearNews.length ? 2 : 0, nearNews.length ? `${nearNews[0][2]} at ${hhmm(nearNews[0][0])}` : 'No high impact news ±15 min']);
    C.push(['History', n < 3 ? 'na' : avg < 0 ? (avg < -0.4 ? 'bad' : 'warn') : 'ok', n >= 3 && avg < 0 ? (avg < -0.4 ? 2 : 1) : 0, n < 3 ? 'Not enough similar trades' : `${win}% win, avg ${fmtU(avg)}`]);
    const bad = C.reduce((s, c) => s + c[2], 0);
    const g = bad >= 5 ? 'X' : bad >= 3 ? 'C' : bad >= 1 ? 'B' : 'A';
    const txt = { A: 'Good trade to take', B: 'Okay, with care', C: 'Poor odds for you', X: 'Do not take this trade' }[g];
    const money = (v) => (D.cur === 'USD' ? '$' : '') + Math.round(v).toLocaleString('en-US') + (D.cur && D.cur !== 'USD' ? ' ' + D.cur : '');
    $('tm-rv').textContent = st.risk.toFixed(2) + '%';
    const ring = (p) => `<svg viewBox="0 0 36 36" class="tm-ring" aria-hidden="true"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg ${p >= 50 ? 'ok' : 'bad'}" stroke-dasharray="${(94.2 * p) / 100} 95"/></svg>`;
    vd.innerHTML = `<div class="tm-vh"><div class="tm-grade g${g}">${g}</div><div><h3>${txt}</h3>
        <div class="tm-chk">${C.map(([lb, s, , why]) => `<span class="${s}" title="${esc(why)}"><i></i>${lb}</span>`).join('')}</div></div></div>
      <div class="tm-facts">
        <div class="ringf">${n ? ring(win) : ''}<div><span>Similar trades</span><b>${n}${n ? ` <small class="${win >= 50 ? 'pos' : 'neg'}">${win}%</small>` : ''}</b><small>${label || 'none yet'}</small></div></div>
        <div><span>Risk</span><b>${riskMoney !== null ? money(riskMoney) : '--'}</b><small>${D.roomToday !== null && riskMoney !== null ? `room after: ${money(D.roomToday - riskMoney)}` : D.balance ? 'of ' + money(D.balance) : 'balance unknown'}</small></div>
      </div>
      <div class="tm-warns">${C.filter((c) => c[1] === 'bad' || c[1] === 'warn').slice(0, 3).map(([, s, , why]) => `<div class="${s}"><i></i><span>${esc(why)}</span></div>`).join('')}</div>`;
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const s = b.parentElement; s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    st[s.dataset.k] = b.dataset.v;
    $('tm-at').hidden = st.when !== 'at';
    run();
  });
  $('tm-at').addEventListener('change', (e) => { st.at = +e.target.value; run(); });
  $('tm-risk').addEventListener('input', (e) => { st.risk = +e.target.value; run(); });
  run();
})();
