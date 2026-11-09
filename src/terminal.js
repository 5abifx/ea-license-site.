// The Desk: one screen that joins the trader's past mistakes, today and the next trade.
// Plain rules over the trader's own closed trades (rows already passed through insights.prep()). No outside data.
// Times are New York time: MT5 server time minus the trader's offset (users.ny_offset, default 7 hours).

const REVENGE_MIN = 15;     // same window as Insights
const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SESS = [              // New York time, minutes from midnight
  { key: 'asia', name: 'Asia', from: 19 * 60, to: 3 * 60 },
  { key: 'london', name: 'London', from: 3 * 60, to: 8 * 60 },
  { key: 'nyam', name: 'NY AM', from: 8 * 60, to: 12 * 60 },
  { key: 'nypm', name: 'NY PM', from: 12 * 60, to: 17 * 60 },
];
const sum = (l) => l.reduce((s, t) => s + t.net, 0);
const sumR = (l) => l.reduce((s, t) => s + (t.r || 0), 0);
const winPct = (l) => (l.length ? Math.round((l.filter((t) => t.net > 0).length / l.length) * 100) : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (l) => { const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// New York clock of a trade's open: minute of the day, weekday (0 = Monday) and the day key
function nyClock(t, offset) {
  const ms = (Number.isFinite(t.o) ? t.o : t.c) - offset * 3600e3;
  const d = new Date(ms);
  return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: (d.getUTCDay() + 6) % 7, day: d.toISOString().slice(0, 10) };
}

// R when the trade has it, else the trade's money as a share of the average loss (so every trade counts)
function unitsOf(trades) {
  const losses = trades.filter((t) => t.net < 0);
  const avgLoss = losses.length ? -sum(losses) / losses.length : 0;
  return (t) => (t.r !== null ? t.r : avgLoss ? t.net / avgLoss : 0);
}

function build(trades, { offset, todayNy, nowMin, nowBroker, prop, leaks, money }) {
  if (trades.length < 10) return { locked: true, have: trades.length, need: 10 };
  const u = unitsOf(trades);
  const fmtU = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}R`;

  // tag every trade: NY clock, trade number of its day, minutes since the last losing trade on the same account
  const byAcct = {};
  trades.forEach((t) => { Object.assign(t, nyClock(t, offset)); t.u = u(t); (byAcct[t.account_number] ||= []).push(t); });
  Object.values(byAcct).forEach((l) => {
    l.sort((a, b) => (Number.isFinite(a.o) ? a.o : a.c) - (Number.isFinite(b.o) ? b.o : b.c));
    const perDay = {};
    let lastLoss = null;
    l.forEach((t) => {
      perDay[t.day] = (perDay[t.day] || 0) + 1; t.nth = perDay[t.day];
      t.afterLoss = lastLoss !== null && Number.isFinite(t.o) && t.o >= lastLoss ? Math.round((t.o - lastLoss) / 60000) : -1;
      if (t.net < 0 && Number.isFinite(t.c)) lastLoss = t.c;
    });
  });

  // ---------- days ----------
  const dayMap = {};
  trades.forEach((t) => (dayMap[t.day] ||= []).push(t));
  const days = Object.keys(dayMap).sort().map((d) => ({ day: d, list: dayMap[d], net: sum(dayMap[d]), u: dayMap[d].reduce((s, t) => s + t.u, 0), n: dayMap[d].length }));
  const past = days.filter((d) => d.day < todayNy);
  const today = days.find((d) => d.day === todayNy) || { day: todayNy, list: [], net: 0, u: 0, n: 0 };
  const usualTrades = median(past.map((d) => d.n)) || 1;

  // ---------- forecast: what usually goes wrong on a day like today ----------
  const drivers = [];
  const add = (tone, w, title, text) => drivers.push({ tone, w, title, text });
  const last = past[past.length - 1];
  if (last && past.length >= 6) {
    const after = (pred) => past.slice(1).filter((d, i) => pred(past[i]));
    const afterRed = after((d) => d.net < 0), afterGreen = after((d) => d.net >= 0);
    const avg = (l, k) => (l.length ? l.reduce((s, d) => s + d[k], 0) / l.length : 0);
    if (last.net < 0 && afterRed.length >= 3) {
      const dn = avg(afterRed, 'n') / (avg(afterGreen, 'n') || 1), du = avg(afterRed, 'u') - avg(afterGreen, 'u');
      if (du < 0 || dn > 1.2) add('bad', clamp(Math.round(10 + Math.max(0, -du) * 8 + Math.max(0, dn - 1) * 10), 8, 30), `Your last day was red (${fmtU(last.u)}).`,
        `On days after a red day you take ${dn.toFixed(1)}× the trades${du < 0 ? ` and make ${fmtU(du).replace('+', '')} less on average` : ''}.`);
      else add('good', -6, `Your last day was red (${fmtU(last.u)}).`, 'You usually bounce back well after a red day. Keep the same plan.');
    } else if (last.net > 0 && afterGreen.length >= 3) {
      const du = avg(afterGreen, 'u') - avg(afterRed, 'u');
      if (du < -0.3) add('warn', clamp(Math.round(8 + -du * 6), 6, 18), `Your last day was green (${fmtU(last.u)}).`, `Days after a green day go ${fmtU(du).replace('+', '')} worse for you on average. Size stays the same today.`);
    }
  }
  const dowToday = new Date(todayNy + 'T12:00:00Z').getUTCDay();
  const dIdx = (dowToday + 6) % 7;
  const wd = trades.filter((t) => t.dow === dIdx);
  if (wd.length >= 5) {
    const wu = wd.reduce((s, t) => s + t.u, 0);
    if (wu < 0) add('warn', clamp(Math.round(6 + -wu), 6, 16), `${DOW[dIdx]}.`, `Your weakest kind of day: ${wd.length} trades, ${winPct(wd)}% win rate, ${fmtU(wu)} in total.`);
    else add('good', -6, `${DOW[dIdx]}.`, `A good day for you: ${winPct(wd)}% win rate, ${fmtU(wu)} in total.`);
  }
  const rev = trades.filter((t) => t.afterLoss >= 0 && t.afterLoss <= REVENGE_MIN);
  if (rev.length >= 3 && rev.reduce((s, t) => s + t.u, 0) < 0) {
    const lostToday = today.list.some((t) => t.net < 0);
    add(lostToday ? 'bad' : 'warn', lostToday ? 18 : 8, lostToday ? 'You already have a loss today.' : 'If you take a loss today…',
      `Trades you opened within ${REVENGE_MIN} min of a loss: ${rev.length}, ${winPct(rev)}% win rate, ${fmtU(rev.reduce((s, t) => s + t.u, 0))}.`);
  }
  if (today.n >= Math.max(2, Math.round(usualTrades) + 1)) add('bad', 14, `${today.n} trades already today.`, `You usually take ${Math.round(usualTrades)}. Extra trades rarely help you: see Today's rules.`);
  if (prop && prop.daily && prop.daily.allow > 0) {
    const used = prop.daily.used / prop.daily.allow;
    if (used >= 0.5) add(used >= 0.8 ? 'bad' : 'warn', used >= 0.8 ? 22 : 12, `Daily loss ${Math.round(used * 100)}% used.`, `${money(prop.daily.left).replace(/^[+−]/, '')} left before the firm's daily limit.`);
  }
  if (prop && prop.consistency && prop.consistency.pct) {
    const s = prop.consistency.share, p = prop.consistency.pct;
    if (s >= p * 0.85) add('warn', 12, `Consistency rule ${Math.round(s)}% of ${p}%.`, 'One big win today could push your best day over the line and delay the payout.');
  }
  const score = clamp(25 + drivers.reduce((s, d) => s + d.w, 0), 3, 97);
  drivers.sort((a, b) => b.w - a.w);

  // ---------- today's rules: the leaks Insights found, as rules ----------
  const rules = (leaks || []).filter((l) => l.tone === 'bad' && l.rule).sort((a, b) => (b.saved || 0) - (a.saved || 0)).slice(0, 4)
    .map((l) => ({ code: l.code, tag: l.tag, rule: l.rule, saved: l.saved || 0 }));
  const capRule = rules.find((r) => r.code === 'L1');
  const cap = capRule ? Number((capRule.rule.match(/Max (\d)/) || [])[1]) || null : null;

  // ---------- day map: 48 half-hours of your history, your windows, today's trades ----------
  const half = Array.from({ length: 48 }, () => []);
  trades.forEach((t) => half[Math.floor(t.min / 30)].push(t));
  const halves = half.map((l, i) => ({ from: i * 30, n: l.length, u: l.reduce((s, t) => s + t.u, 0), win: winPct(l) }));
  const maxAbs = Math.max(0.5, ...halves.map((h) => Math.abs(h.u)));
  const avoid = halves.filter((h) => h.n >= 2 && h.u < -0.4).map((h) => h.from);
  let best = null;   // best run of 2 to 4 half-hours
  for (let len = 2; len <= 4; len++) for (let i = 0; i < 48; i++) {
    const run = Array.from({ length: len }, (_, k) => halves[(i + k) % 48]);
    const v = run.reduce((s, h) => s + h.u, 0), n = run.reduce((s, h) => s + h.n, 0);
    if (n >= 3 && v > 0 && (!best || v > best.u)) best = { from: i * 30, to: ((i + len) * 30) % 1440, u: v, n };
  }
  const todayTrades = today.list.map((t) => ({ min: t.min, u: Math.round(t.u * 10) / 10, sym: t.symbol, net: t.net }));

  // ---------- next trade check: compact rows for the browser ----------
  const syms = [...new Set(trades.map((t) => t.symbol))];
  const symCount = syms.map((s) => trades.filter((t) => t.symbol === s).length);
  const order = syms.map((s, i) => i).sort((a, b) => symCount[b] - symCount[a]);
  const risks = trades.map((t) => Number(t.risk_pct)).filter((v) => Number.isFinite(v) && v > 0);
  const lastBal = [...trades].reverse().find((t) => Number.isFinite(Number(t.balance_after)) && t.balance_after !== null);
  const lastLossToday = today.list.filter((t) => t.net < 0).map((t) => t.c).sort((a, b) => b - a)[0];
  const check = {
    syms: order.map((i) => syms[i]).slice(0, 8),
    rows: trades.map((t) => [syms.indexOf(t.symbol), t.side === 'SELL' ? 1 : 0, t.min, Math.round(t.u * 100) / 100, t.afterLoss, t.nth, t.net > 0 ? 1 : 0]),
    allSyms: syms,
    usualRisk: risks.length ? Math.round(median(risks) * 100) / 100 : null,
    balance: prop && prop.balance ? prop.balance : lastBal ? Number(lastBal.balance_after) : null,
    roomToday: prop && prop.daily ? Math.max(0, prop.daily.left) : null,
    avoid, best: best && { from: best.from, to: best.to }, cap, todayN: today.n,
    minsSinceLoss: Number.isFinite(lastLossToday) && nowBroker ? Math.max(0, Math.round((nowBroker - lastLossToday) / 60000)) : null,
  };

  // ---------- you vs your rules: last 30 trading days, trades that broke your rules taken out ----------
  const recent = days.slice(-30).flatMap((d) => d.list).sort((a, b) => a.c - b.c);
  const broke = (t) => (t.afterLoss >= 0 && t.afterLoss <= REVENGE_MIN) || (cap && t.nth > cap) || avoid.includes(Math.floor(t.min / 30) * 30);
  let a = 0, b = 0, kept = 0, brokeN = 0, brokeU = 0;
  const curve = recent.map((t) => {
    a += t.u;
    if (broke(t)) { brokeN++; brokeU += t.u; } else { b += t.u; kept++; }
    return [Math.round(a * 100) / 100, Math.round(b * 100) / 100, broke(t) ? 1 : 0];
  });
  const brokenTypes = [
    ['Right after a loss', recent.filter((t) => t.afterLoss >= 0 && t.afterLoss <= REVENGE_MIN)],
    [cap ? `Trade ${cap + 1}+ of the day` : '', cap ? recent.filter((t) => t.nth > cap) : []],
    ['In your red hours', recent.filter((t) => avoid.includes(Math.floor(t.min / 30) * 30))],
  ].filter(([n, l]) => n && l.length).map(([n, l]) => ({ name: n, n: l.length, u: l.reduce((s, t) => s + t.u, 0) })).sort((x, y) => x.u - y.u);

  const sessNow = SESS.find((s) => (s.from < s.to ? nowMin >= s.from && nowMin < s.to : nowMin >= s.from || nowMin < s.to));
  return {
    locked: false, score, level: score >= 65 ? 'High' : score >= 40 ? 'Medium' : 'Low', drivers,
    rules, halves, maxAbs, avoid, best, todayTrades, sessions: SESS, sessNow: sessNow ? sessNow.name : 'Market quiet',
    today: { n: today.n, u: today.u, net: today.net }, usualTrades,
    check, ghost: { curve, actual: a, rules: b, gap: b - a, kept, broke: brokeN, brokeU, types: brokenTypes, days: Math.min(30, days.length) },
    hhmm, fmtU,
  };
}

module.exports = { build, nyClock, REVENGE_MIN };
