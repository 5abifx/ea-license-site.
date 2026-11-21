// Desk overview ("graphite" look): total balance, account cards, month P&L chart, R by weekday,
// recent trades, sessions -> results flow and a days-traded calendar. Built from the trader's own closed trades.
// Everything is drawn on the server as HTML / inline SVG; public/overview.js only moves the chart point.
const { esc } = require('./views');

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const sum = (l) => l.reduce((s, t) => s + t.net, 0);
const rSum = (l) => l.reduce((s, t) => s + (t.r || 0), 0);
const day = (t) => t.close_time.slice(0, 10);
const sg = (v) => (v < 0 ? '−' : '+');
const rx = (v) => `${sg(v)}${Math.abs(v).toFixed(1)}R`;
const isoAdd = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dowOf = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;

// smooth line through points (Catmull-Rom as cubic Bezier)
function smooth(P) {
  if (!P.length) return '';
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c = (a, b, k) => +(a + (b / 6) * k).toFixed(1);
    d += ` C${c(p1[0], p2[0] - p0[0], 1)},${c(p1[1], p2[1] - p0[1], 1)} ${c(p2[0], p3[0] - p1[0], -1)},${c(p2[1], p3[1] - p1[1], -1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 9v8H9"/></svg>',
};

/**
 * trades: prepped rows (insights.prep) of the accounts in view, oldest first
 * accounts: [{ account_number, broker, cur, label (html), manual, balance, href }]
 * opts: { today (YYYY-MM-DD, server clock), cur, money(v) signed, plain(v) unsigned, sessionOf(t), mask(n) }
 */
function html(trades, accounts, opts) {
  const { today, cur, money, plain, sessionOf } = opts;
  const month = today.slice(0, 7);
  const lastMonth = isoAdd(month + '-01', -1).slice(0, 7);
  const mTrades = trades.filter((t) => day(t).startsWith(month));
  const lmTrades = trades.filter((t) => day(t).startsWith(lastMonth));
  const monthNet = sum(mTrades);

  // ---------- hero ----------
  const withBal = accounts.filter((a) => Number.isFinite(a.balance));
  const total = withBal.reduce((s, a) => s + a.balance, 0);
  const startBal = total - withBal.reduce((s, a) => s + sum(mTrades.filter((t) => t.account_number === a.account_number)), 0);
  const pct = withBal.length && startBal > 0 ? (monthNet / startBal) * 100 : null;
  const todayList = trades.filter((t) => day(t) === today);
  const monIso = isoAdd(today, -dowOf(today));
  const week = trades.filter((t) => day(t) >= monIso && day(t) <= today);
  const weekR = week.some((t) => t.r !== null) ? rSum(week) : null;
  const chip = (v) => (v === null ? '' : `<span class="ov-chip${v < 0 ? ' dn' : ''}"><i>${v < 0 ? '↓' : '↑'}</i>${sg(v)}${Math.abs(v).toFixed(1)}%</span>`);
  // hero stats for the month + the month's equity line drawn faintly behind the big number
  const wins = mTrades.filter((t) => t.net > 0), losses = mTrades.filter((t) => t.net < 0);
  const gw = sum(wins), gl = -sum(losses);
  const hDay = {}; mTrades.forEach((t) => { hDay[day(t)] = (hDay[day(t)] || 0) + t.net; });
  const dayNets = Object.keys(hDay).sort().map((k) => hDay[k]);
  let streak = 0; for (let i = dayNets.length - 1; i >= 0 && dayNets[i] > 0; i--) streak++;
  const withR = mTrades.filter((t) => t.r !== null && t.r !== undefined);
  const stats = mTrades.length ? [
    ['Win rate', `${Math.round((wins.length / mTrades.length) * 100)}%`],
    ['Profit factor', gl > 0 ? (gw / gl).toFixed(2) : gw > 0 ? '∞' : '–'],
    ['Best day', dayNets.length ? money(Math.max(...dayNets)) : '–'],
    ['Avg R', withR.length ? rx(rSum(withR) / withR.length) : '–'],
    ['Green streak', streak ? `${streak} day${streak === 1 ? '' : 's'}` : '–'],
    ['Trades', String(mTrades.length)],
  ] : [];
  let run = 0; const eq = [0, ...mTrades.map((t) => (run += t.net))];
  const eMin = Math.min(...eq), eMax = Math.max(...eq), eSp = eMax - eMin || 1;
  const eqPts = eq.length > 2 ? eq.map((v, i) => [+((i * 1000) / (eq.length - 1)).toFixed(1), +(10 + (1 - (v - eMin) / eSp) * 150).toFixed(1)]) : [];
  const heroLine = eqPts.length ? `<svg class="ov-hline${monthNet < 0 ? ' dn' : ''}" viewBox="0 0 1000 170" preserveAspectRatio="none" aria-hidden="true"><path d="${smooth(eqPts)}"/></svg>` : '';
  const hero = `<section class="ov-hero">${heroLine}
    <div class="ov-lbl">${withBal.length ? 'Total balance' : `${MON[+month.slice(5) - 1]} P&amp;L`}</div>
    <div class="ov-big"><span class="ov-num">${withBal.length ? plain(total) : money(monthNet)}</span>${chip(pct)}</div>
    <div class="ov-subl"><span>Today <b class="${todayList.length ? (sum(todayList) >= 0 ? '' : 'neg') : ''}">${todayList.length ? money(sum(todayList)) : 'no trades'}</b></span>
      ${weekR !== null ? `<span>This week <b>${rx(weekR)}</b></span>` : ''}
      <span>This month <b>${mTrades.length} trade${mTrades.length === 1 ? '' : 's'}</b></span></div>
    ${stats.length ? `<dl class="ov-hstats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
    <div class="ov-btns">
      <a class="ov-btn o" href="/journal/log">${ICON.plus}Log trade</a>
      <a class="ov-btn" href="/journal/studio">${ICON.share}Share</a>
      <a class="ov-btn" href="/journal/plan">${ICON.plan}Plan a trade</a>
    </div>
  </section>`;

  // ---------- account cards ----------
  const spark = (vals, neg) => {
    if (vals.length < 2) return '';
    const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
    const P = vals.map((v, i) => [+((i * 90) / (vals.length - 1)).toFixed(1), +(31 - ((v - mn) / sp) * 26).toFixed(1)]);
    return `<svg class="ov-spark" viewBox="0 0 90 34" preserveAspectRatio="none" aria-hidden="true"><path d="${smooth(P)}" class="${neg ? 'dn' : 'up'}"/></svg>`;
  };
  const cards = accounts.slice(0, 3).map((a) => {
    const own = mTrades.filter((t) => t.account_number === a.account_number);
    const net = sum(own);
    let run = 0; const line = own.map((t) => (run += t.net));
    const short = a.manual ? '✎' : esc(String(a.broker || 'MT').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'MT');
    let main, sub;
    if (a.manual) {
      const r = own.some((t) => t.r !== null) ? rSum(own) : null;
      main = r !== null ? rx(r) : money(net);
      sub = `${own.length} trade${own.length === 1 ? '' : 's'} this month`;
    } else {
      const base = Number.isFinite(a.balance) ? a.balance - net : null;
      const p = base > 0 && own.length ? (net / base) * 100 : null;
      main = Number.isFinite(a.balance) ? plain(a.balance) : money(net);
      sub = p === null ? `${own.length} trades this month` : `<i class="${p < 0 ? 'dn' : ''}">${p < 0 ? '↘' : '↗'} ${sg(p)}${Math.abs(p).toFixed(1)}%</i>this month`;
    }
    return `<a class="ov-pn ov-acc" href="${a.href}"><div class="ov-nm"><i>${short}</i><span>${a.label}</span></div>
      <div class="ov-row"><div><div class="ov-n">${main}</div><div class="ov-s">${sub}</div></div>${spark([0, ...line], net < 0)}</div></a>`;
  }).join('');
  const accRow = `<div class="ov-accs">${cards}<a class="ov-add" href="/dashboard"><span class="ov-plus">+</span><span>Add another <b>MT5 account</b> or a prop challenge to your journal.</span></a></div>`;

  // ---------- month P&L chart: this month (white) vs last month (red), by day of month ----------
  const dim = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).getUTCDate();
  const todayN = +today.slice(8);
  const cum = (list, ym, upto) => { const by = {}; list.forEach((t) => { const d = +day(t).slice(8); by[d] = (by[d] || 0) + t.net; });
    let r = 0; return Array.from({ length: upto + 1 }, (_, i) => (i ? (r += by[i] || 0) : 0)); };
  const curL = cum(mTrades, month, todayN);
  const lastL = cum(lmTrades, lastMonth, dim(lastMonth));
  const N = dim(month), W = 640, H = 230;
  const all = [...curL, ...lastL], lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
  const X = (i) => +((i * W) / N).toFixed(1), Y = (v) => +(H - 12 - ((v - lo) / span) * (H - 40)).toFixed(1);
  const dayNet = {}; const dayR = {};
  mTrades.forEach((t) => { const d = +day(t).slice(8); dayNet[d] = (dayNet[d] || 0) + t.net; if (t.r !== null) dayR[d] = (dayR[d] || 0) + t.r; });
  const lastTraded = Math.max(0, ...Object.keys(dayNet).map(Number));
  const pick = lastTraded || todayN;
  let grid = '';
  for (let i = 0; i <= 20; i++) grid += `<line x1="${(i * W) / 20}" x2="${(i * W) / 20}" y1="0" y2="${H}"/>`;
  for (let j = 0; j <= 7; j++) grid += `<line x1="0" x2="${W}" y1="${(j * H) / 7}" y2="${(j * H) / 7}"/>`;
  const pts = curL.map((v, i) => [X(i), Y(v)]);
  const lpts = lastL.slice(0, N + 1).map((v, i) => [X(i), Y(v)]);
  const tip = (d) => ({ d, x: X(d), y: Y(curL[d] ?? curL[curL.length - 1]), date: `${MON[+month.slice(5) - 1].slice(0, 3)} ${d}`,
    v: money(curL[d] ?? 0), dn: dayNet[d] !== undefined ? 'That day ' + money(dayNet[d]) : 'No trades that day', r: dayR[d] !== undefined ? rx(dayR[d]) : '' });
  const tipData = JSON.stringify(Array.from({ length: todayN + 1 }, (_, d) => tip(d))).replace(/</g, '\\u003c');
  const p0 = tip(pick);
  const chart = `<section class="ov-pn ov-eq" data-ov-chart>
    <div class="ov-ph"><span class="ov-t">P&amp;L this month</span><span class="ov-r"><span class="ov-leg"><i class="w"></i>${MON[+month.slice(5) - 1]}</span><span class="ov-leg"><i class="r"></i>${MON[+lastMonth.slice(5) - 1]}</span></span></div>
    <div class="ov-v ${monthNet < 0 ? 'neg' : ''}">${money(monthNet)}${lmTrades.length ? ` <span class="ov-cmp">${money(monthNet - sum(lmTrades.filter((t) => +day(t).slice(8) <= todayN)))} vs same day last month</span>` : ''}</div>
    <div class="ov-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="P&amp;L this month, day by day">
      <defs><filter id="ovb" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
      <radialGradient id="ovdot"><stop offset="0" stop-color="#ff5a1f" stop-opacity=".6"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient></defs>
      <g class="ov-grid">${grid}</g>
      <line class="ov-zero" x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>
      ${lpts.length > 1 ? `<path class="ov-l2 glow" d="${smooth(lpts)}" filter="url(#ovb)"/><path class="ov-l2" d="${smooth(lpts)}"/>` : ''}
      ${pts.length > 1 ? `<path class="ov-l1 glow" d="${smooth(pts)}" filter="url(#ovb)"/><path class="ov-l1" d="${smooth(pts)}"/>` : ''}
      <line class="ov-drop" data-drop x1="${p0.x}" x2="${p0.x}" y1="${p0.y}" y2="${H}"/>
      <circle data-halo cx="${p0.x}" cy="${p0.y}" r="22" fill="url(#ovdot)"/><circle class="ov-dot" data-dot cx="${p0.x}" cy="${p0.y}" r="5.5"/>
    </svg>
    <div class="ov-tip" data-tip style="left:${((p0.x / W) * 100).toFixed(2)}%;top:${((p0.y / H) * 100).toFixed(2)}%"><small>${p0.date}</small><b>${p0.v}</b><small>${p0.dn}${p0.r ? ' · ' + p0.r : ''}</small></div></div>
    <div class="ov-days" role="group" aria-label="Pick a day">${Array.from({ length: N }, (_, i) => i + 1).map((d) => `<button type="button" data-d="${d}"${d > todayN ? ' disabled' : ''}${d === pick ? ' class="on"' : ''}>${d}</button>`).join('')}</div>
    <script type="application/json" data-ov-tips>${tipData}</script>
  </section>`;

  // ---------- R (or money) by weekday, last 30 days ----------
  const since = isoAdd(today, -29);
  const last30 = trades.filter((t) => day(t) >= since);
  const useR = last30.some((t) => t.r !== null);
  const val = (l) => (useR ? rSum(l) : sum(l));
  const fmt = (v) => (useR ? rx(v) : money(v));
  const wd = [0, 1, 2, 3, 4].map((i) => { const l = last30.filter((t) => dowOf(day(t)) === i); return { i, n: l.length, v: val(l) }; });
  const wmax = Math.max(1e-9, ...wd.map((w) => Math.abs(w.v)));
  const worst = wd.filter((w) => w.v < 0).sort((a, b) => a.v - b.v)[0];
  const best = wd.filter((w) => w.v > 0).sort((a, b) => b.v - a.v)[0];
  const bars = `<section class="ov-pn ov-wd">
    <div class="ov-ph"><span class="ov-t">${useR ? 'R' : 'P&amp;L'} by weekday</span><span class="ov-r"><a class="ov-sel" href="/journal/insights?tab=time">See all</a></span></div>
    <div class="ov-v ${val(last30) < 0 ? 'neg' : ''}">${last30.length ? fmt(val(last30)) : '–'} <small>last 30 days</small></div>
    <div class="ov-bars">${wd.map((w) => `<div class="ov-bar" title="${DOW[w.i]}: ${w.n} trades, ${fmt(w.v)}"><div class="ov-tr"><div class="ov-fl${worst && w === worst ? ' hi' : best && w === best ? ' top' : ''}" style="height:${w.n ? Math.max(6, Math.round((Math.abs(w.v) / wmax) * 100)) : 0}%"></div></div><small${worst && w === worst ? ' class="on"' : ''}>${DOW[w.i]}</small></div>`).join('')}</div>
    <p class="ov-note">${worst ? `${DOW[worst.i]} is your weakest day: <b class="neg">${fmt(worst.v)}</b> from ${worst.n} trade${worst.n === 1 ? '' : 's'}.` : last30.length ? 'No losing weekday in the last 30 days.' : 'No trades in the last 30 days.'}</p>
  </section>`;

  // ---------- recent trades ----------
  const recent = trades.slice(-4).reverse();
  const when = (t) => (day(t) === today ? 'Today ' + t.close_time.slice(11, 16) : `${DOW[dowOf(day(t))]} ${+day(t).slice(8)}`);
  const acctName = (n) => (accounts.find((a) => a.account_number === n) || {}).short || '';
  const rec = `<section class="ov-pn ov-rec">
    <div class="ov-ph"><span class="ov-t">Recent trades</span><span class="ov-r"><a class="ov-sel" href="/journal">See all</a></span></div>
    <div class="ov-tl">${recent.length ? recent.map((t) => `<a class="ov-it" href="/journal/${t.id}"><span class="ov-ico">${t.side === 'SELL' ? ICON.dn : ICON.up}</span>
      <div><b>${esc(t.symbol)} ${t.side === 'SELL' ? 'sell' : 'buy'}</b><span>${acctName(t.account_number)}${acctName(t.account_number) ? ' · ' : ''}${when(t)}</span></div>
      <div class="ov-amt ${t.net < 0 ? 'neg' : ''}">${money(t.net)}<span>${t.r !== null ? rx(t.r) : ''}</span></div></a>`).join('') : '<p class="ov-note">Your trades show up here once the Journal EA sends them.</p>'}</div>
  </section>`;

  // ---------- sessions -> wins / break-even / losses (last 30 days) ----------
  const sess = {};
  last30.forEach((t) => { const s = sessionOf(t); (sess[s] ||= []).push(t); });
  const L = Object.entries(sess).sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  const BE = (t) => (t.r !== null ? Math.abs(t.r) < 0.1 : Math.abs(t.net) < 0.01);
  const kind = (t) => (BE(t) ? 1 : t.net > 0 ? 0 : 2);
  const R = [['Wins', 0], ['Break-even', 1], ['Losses', 2]].map(([n, k]) => { const l = last30.filter((t) => kind(t) === k); return { n, k, list: l, v: val(l) }; });
  let flow = '<p class="ov-note">Trade a few sessions and this shows where your results come from.</p>';
  if (last30.length >= 3) {
    const FH = 200, gap = 10, tot = last30.length;
    const scale = (FH - gap * 3) / tot;
    const nx = 86, rx0 = 320;
    let ly = 4; const lp = L.map(([name, l]) => { const h = Math.max(22, l.length * scale); const o = { name, l, y: ly, h, o: 0 }; ly += h + gap; return o; });
    let ry = 4; const rp = R.map((r) => { const h = Math.max(22, r.list.length * scale); const o = { ...r, y: ry, h, o: 0 }; ry += h + gap; return o; });
    const VH = Math.max(ly, ry);
    let g = '<defs><linearGradient id="ovrn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3a2f"/><stop offset="1" stop-color="#5a1612"/></linearGradient></defs>';
    lp.forEach((s) => rp.forEach((r) => {
      const n = s.l.filter((t) => kind(t) === r.k).length; if (!n) return;
      const w1 = (n / s.l.length) * s.h, w2 = (n / Math.max(1, r.list.length)) * r.h;
      const y1 = s.y + s.o + w1 / 2, y2 = r.y + r.o + w2 / 2; s.o += w1; r.o += w2;
      g += `<path class="ov-f k${r.k}" d="M${nx},${y1.toFixed(1)} C${(nx + rx0) / 2},${y1.toFixed(1)} ${(nx + rx0) / 2},${y2.toFixed(1)} ${rx0},${y2.toFixed(1)}" stroke-width="${Math.max(1.5, Math.min(w1, w2)).toFixed(1)}"/>`;
    }));
    lp.forEach((s) => { g += `<rect class="ov-node" x="0" y="${s.y.toFixed(1)}" width="${nx}" height="${s.h.toFixed(1)}" rx="8"/><text x="9" y="${(s.y + 15).toFixed(1)}" class="ov-tx">${esc(s.name)}</text>${s.h > 34 ? `<text x="9" y="${(s.y + s.h - 7).toFixed(1)}" class="ov-tx2">${fmt(val(s.l))}</text>` : ''}`; });
    rp.forEach((r) => { const red = r.k === 2; g += `<rect class="ov-node" x="${rx0}" y="${r.y.toFixed(1)}" width="100" height="${r.h.toFixed(1)}" rx="8"${red ? ' fill="url(#ovrn)"' : ''}/><text x="${rx0 + 9}" y="${(r.y + 15).toFixed(1)}" class="ov-tx${red ? ' w' : ''}">${r.n} · ${r.list.length}</text>${r.h > 34 ? `<text x="${rx0 + 9}" y="${(r.y + r.h - 7).toFixed(1)}" class="ov-tx2${red ? ' w' : ''}">${fmt(r.v)}</text>` : ''}`; });
    flow = `<svg class="ov-flow" viewBox="0 0 420 ${Math.ceil(VH)}" aria-label="Sessions into wins, break-even and losses">${g}</svg>`;
  }
  const flowPn = `<section class="ov-pn ov-sk">
    <div class="ov-ph"><span class="ov-t">Where your ${useR ? 'R' : 'P&amp;L'} came from</span><span class="ov-r"><span class="ov-sel ro">Last 30 days</span></span></div>
    <div class="ov-v ${val(last30) < 0 ? 'neg' : ''}">${last30.length ? fmt(val(last30)) : '–'}</div>${flow}
  </section>`;

  // ---------- days traded: this month as a calendar ----------
  const byDay = {};
  mTrades.forEach((t) => { (byDay[day(t)] ||= []).push(t); });
  const nets = Object.values(byDay).map((l) => Math.abs(sum(l)));
  const avgAbs = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0;
  const first = month + '-01';
  let cells = DOW.map((d) => `<b>${d[0]}</b>`).join('') + '<i></i>'.repeat(dowOf(first));
  let market = 0;
  for (let d = 1; d <= N; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    if (iso <= today && dowOf(iso) < 5) market++;
    const l = byDay[iso];
    let c = '';
    if (l) { const n = sum(l); c = n < 0 && Math.abs(n) >= avgAbs * 0.15 ? 'r' : Math.abs(n) < avgAbs * 0.15 ? 'b' : 'c'; }
    const tt = l ? `${l.length} trade${l.length === 1 ? '' : 's'} · ${money(sum(l))}` : iso > today ? '' : 'No trades';
    cells += `<a class="${c}${iso === today ? ' t' : ''}" href="/journal?month=${month}#d-${iso}"${tt ? ` title="${tt}"` : ''}>${d}</a>`;
  }
  const traded = Object.keys(byDay).length;
  const cal = `<section class="ov-pn ov-cal">
    <div class="ov-ph"><span class="ov-t">Days traded</span><span class="ov-r"><a class="ov-sel" href="/journal?month=${month}">${MON[+month.slice(5) - 1]}</a></span></div>
    <div class="ov-v">${traded} <small>of ${market} market day${market === 1 ? '' : 's'}</small></div>
    <div class="ov-heat">${cells}</div>
    <div class="ov-key"><span style="--c:#f2f2f2">Green day</span><span style="--c:#5b5b5e">Small</span><span style="--c:#ef3b36">Red day</span></div>
  </section>`;

  return `<div class="ov" data-ov>
    ${hero}
    ${accRow}
    <div class="ov-g2">${chart}${bars}</div>
    <div class="ov-g3">${rec}${flowPn}${cal}</div>
  </div>
  <script src="/overview.js" defer></script>`;
}

module.exports = { html, smooth };
