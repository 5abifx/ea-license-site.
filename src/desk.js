// Journal "desk" numbers: recap, time of day (sessions in New York time), habits and the prop firm desk.
// Plain rules over the trader's own closed trades (rows already passed through insights.prep()).
// MT5 server time -> New York time: most prop/forex servers run New York close = 00:00, i.e. NY + 7 hours.
// The trader can change the offset (users.ny_offset).

const NY_DEFAULT = 7;
const SESS = [   // New York time, minutes from midnight; Asia wraps over midnight
  { key: 'asia', name: 'Asia', from: 19 * 60, to: 3 * 60 },
  { key: 'london', name: 'London', from: 3 * 60, to: 8 * 60 },
  { key: 'nyam', name: 'NY AM', from: 8 * 60, to: 12 * 60 },
  { key: 'nypm', name: 'NY PM', from: 12 * 60, to: 17 * 60 },
  { key: 'off', name: 'After hours', from: 17 * 60, to: 19 * 60 },
];
const inSess = (s, m) => (s.from < s.to ? m >= s.from && m < s.to : m >= s.from || m < s.to);
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const sum = (l) => l.reduce((s, t) => s + t.net, 0);
const winPct = (l) => (l.length ? Math.round((l.filter((t) => t.net > 0).length / l.length) * 100) : 0);
const avgR = (l) => { const r = l.filter((t) => t.r !== null); return r.length ? r.reduce((s, t) => s + t.r, 0) / r.length : null; };
const group = (l) => ({ n: l.length, net: sum(l), win: winPct(l), avgR: avgR(l) });

// open time of a trade, moved to the clock the trader picked (offset hours behind MT5 time)
function clock(t, offset) {
  const ms = (Number.isFinite(t.o) ? t.o : t.c) - offset * 3600e3;
  const d = new Date(ms);
  return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: (d.getUTCDay() + 6) % 7 };   // dow: 0 = Monday
}

// ---------- time ----------
function timeStats(trades, offset) {
  const half = Array.from({ length: 48 }, () => []);
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
  const sess = SESS.map((s) => ({ ...s, list: [] }));
  trades.forEach((t) => {
    const k = clock(t, offset);
    half[Math.floor(k.min / 30)].push(t);
    grid[k.dow][Math.floor(k.min / 60)].push(t);
    sess.find((s) => inSess(s, k.min)).list.push(t);
  });
  const halves = half.map((l, i) => ({ from: i * 30, ...group(l) }));
  const used = halves.filter((h) => h.n);
  const best = used.length ? used.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const worst = used.length ? used.reduce((a, b) => (b.net < a.net ? b : a)) : null;
  const ranked = sess.filter((s) => s.list.length).map((s) => {
    let eq = 0;
    return { key: s.key, name: s.name, range: `${hhmm(s.from)}–${hhmm(s.to)}`, ...group(s.list), spark: s.list.map((t) => (eq += t.net)) };
  }).sort((a, b) => b.net - a.net);
  const rows = grid.map((hrs, d) => ({ dow: d, cells: hrs.map((l) => ({ n: l.length, net: sum(l) })), total: sum(hrs.flat()), n: hrs.flat().length }));
  return { offset, halves, best, worst, ranked, rows, sessions: SESS };
}

// ---------- habits ----------
function habits(trades) {
  const byAcct = {};
  trades.forEach((t) => (byAcct[t.account_number] ||= []).push(t));
  const openOf = (t) => (Number.isFinite(t.o) ? t.o : t.c);
  Object.values(byAcct).forEach((l) => l.sort((a, b) => openOf(a) - openOf(b)));

  // trade number of the day
  const nth = [[], [], [], []];
  // after a win / after a loss (the next trade of the same account)
  const afterWin = [], afterLoss = [], quickAfterLoss = [];
  Object.values(byAcct).forEach((l) => {
    const perDay = {};
    l.forEach((t, i) => {
      const d = t.close_time.slice(0, 10), k = (perDay[d] = (perDay[d] || 0) + 1);
      nth[Math.min(4, k) - 1].push(t);
      const p = l[i - 1];
      if (!p) return;
      if (p.net > 0) afterWin.push(t);
      else if (p.net < 0) { afterLoss.push(t); if (Number.isFinite(t.o) && t.o - p.c <= 15 * 60e3 && t.o >= p.c) quickAfterLoss.push(t); }
    });
  });

  // how long trades are held
  const HOLD = [['Under 5 min', 0, 5], ['5–15 min', 5, 15], ['15–60 min', 15, 60], ['1–4 hours', 60, 240], ['Over 4 hours', 240, Infinity]];
  const timed = trades.filter((t) => Number.isFinite(t.o) && t.c >= t.o);
  const hold = HOLD.map(([label, a, b]) => ({ label, ...group(timed.filter((t) => { const m = (t.c - t.o) / 60e3; return m >= a && m < b; })) }));
  const med = (l) => { const s = l.map((t) => (t.c - t.o) / 60e3).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const holdWin = med(timed.filter((t) => t.net > 0)), holdLoss = med(timed.filter((t) => t.net < 0));

  // how many trades in a day vs the day's result
  const days = {};
  trades.forEach((t) => { const d = t.account_number + '|' + t.close_time.slice(0, 10); (days[d] ||= []).push(t); });
  const dayCount = [1, 2, 3, 4].map((k) => {
    const ds = Object.values(days).filter((l) => (k === 4 ? l.length >= 4 : l.length === k));
    return { label: k === 4 ? '4+ trades' : `${k} trade${k > 1 ? 's' : ''}`, days: ds.length, avg: ds.length ? ds.reduce((s, l) => s + sum(l), 0) / ds.length : 0,
      green: ds.length ? Math.round((ds.filter((l) => sum(l) > 0).length / ds.length) * 100) : 0 };
  });

  // long vs short
  const side = [['Buys', trades.filter((t) => t.side !== 'SELL')], ['Sells', trades.filter((t) => t.side === 'SELL')]].map(([label, l]) => ({ label, ...group(l) }));

  // size: bigger than the trader's usual size on that symbol
  const lotsBy = {};
  trades.forEach((t) => { if (Number(t.lots) > 0) (lotsBy[t.symbol] ||= []).push(Number(t.lots)); });
  const usual = {};
  Object.entries(lotsBy).forEach(([s, l]) => { const x = [...l].sort((a, b) => a - b); usual[s] = x[x.length >> 1]; });
  const sized = trades.filter((t) => Number(t.lots) > 0 && usual[t.symbol]);
  const big = sized.filter((t) => Number(t.lots) >= usual[t.symbol] * 1.5), normal = sized.filter((t) => Number(t.lots) < usual[t.symbol] * 1.5);
  const size = [{ label: 'Usual size', ...group(normal) }, { label: 'Bigger (1.5×+)', ...group(big) }];

  return {
    nth: ['1st', '2nd', '3rd', '4th+'].map((label, i) => ({ label, ...group(nth[i]) })),
    after: [{ label: 'After a win', ...group(afterWin) }, { label: 'After a loss', ...group(afterLoss) }, { label: 'Within 15 min of a loss', ...group(quickAfterLoss) }],
    hold, holdWin, holdLoss, dayCount, side, size,
  };
}

// ---------- recap ----------
function recap(trades) {
  if (!trades.length) return null;
  const last = trades[trades.length - 1], lastDay = last.close_time.slice(0, 10);
  const t0 = Date.parse(lastDay + 'T00:00:00Z'), mon = t0 - ((new Date(t0).getUTCDay() + 6) % 7) * 864e5;
  const monIso = new Date(mon).toISOString().slice(0, 10), sunIso = new Date(mon + 6 * 864e5).toISOString().slice(0, 10);
  const week = trades.filter((t) => t.close_time.slice(0, 10) >= monIso && t.close_time.slice(0, 10) <= sunIso);
  const wdays = [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = new Date(mon + i * 864e5).toISOString().slice(0, 10); const l = week.filter((t) => t.close_time.slice(0, 10) === d); return { d, n: l.length, net: sum(l) }; });
  const day = trades.filter((t) => t.close_time.slice(0, 10) === lastDay);
  return {
    week: { from: monIso, to: sunIso, ...group(week), wins: week.filter((t) => t.net > 0).length, losses: week.filter((t) => t.net < 0).length, days: wdays },
    session: { d: lastDay, ...group(day), wins: day.filter((t) => t.net > 0).length, losses: day.filter((t) => t.net < 0).length,
      best: day.reduce((a, b) => (b.net > a.net ? b : a)), worst: day.reduce((a, b) => (b.net < a.net ? b : a)) },
    recent: trades.slice(-6).reverse(),
  };
}

// ---------- prop firm desk (one account, all its trades) ----------
// limits: daily / max / target / consistency in % ; start balance (else from the first trade)
const FIRMS = {
  fundednext: { name: 'FundedNext (Stellar 2-Step)', daily: 5, max: 10, target: 8 },
  ftmo: { name: 'FTMO (2-Step)', daily: 5, max: 10, target: 10 },
  fundingpips: { name: 'FundingPips (2-Step)', daily: 5, max: 10, target: 8 },
  the5ers: { name: 'The5ers (High Stakes)', daily: 5, max: 10, target: 10 },
};
function desk(trades, limits, today) {
  if (!trades.length || !limits || !(limits.daily || limits.max || limits.target)) return null;
  const first = trades[0];
  const start = limits.start > 0 ? limits.start : Number.isFinite(Number(first.balance_after)) && first.balance_after !== null ? first.balance_after - first.net : null;
  if (!start || start <= 0) return { error: 'Type the start balance of this account to see the desk.' };
  let bal = start, minBal = start;
  const byDay = {};
  trades.forEach((t) => { (byDay[t.close_time.slice(0, 10)] ||= []).push(t); });
  let todayOpen = null, todayLow = null;
  Object.keys(byDay).sort().forEach((d) => {
    const open = bal; let low = bal;
    byDay[d].forEach((t) => { bal += t.net; low = Math.min(low, bal); });
    minBal = Math.min(minBal, bal);
    if (d === today) { todayOpen = open; todayLow = low; }
  });
  const out = { start, balance: bal, gain: bal - start, gainPct: ((bal - start) / start) * 100, days: Object.keys(byDay).length, firm: FIRMS[limits.firm]?.name || '' };
  if (limits.daily) {
    const allow = (limits.daily / 100) * start, used = todayOpen === null ? 0 : Math.max(0, todayOpen - Math.min(todayLow, bal));
    out.daily = { allow, used, left: allow - used, pct: limits.daily };
  }
  if (limits.max) {
    const floor = start * (1 - limits.max / 100);
    out.max = { floor, left: bal - floor, allow: start - floor, pct: limits.max, breached: minBal <= floor };
  }
  if (limits.target) {
    const goal = (limits.target / 100) * start;
    out.target = { goal, done: Math.max(0, Math.min(1, (bal - start) / goal)), left: Math.max(0, goal - (bal - start)), pct: limits.target };
  }
  if (limits.consistency) {
    const profits = Object.values(byDay).map(sum), total = profits.filter((p) => p > 0).reduce((a, b) => a + b, 0);
    const bestDay = Math.max(0, ...profits);
    out.consistency = { pct: limits.consistency, share: total > 0 ? (bestDay / total) * 100 : 0, bestDay };
    out.consistency.ok = out.consistency.share <= limits.consistency;
  }
  out.status = out.max && out.max.breached ? 'breached' : out.target && out.target.done >= 1 ? (out.consistency && !out.consistency.ok ? 'consistency' : 'passed') : 'active';
  return out;
}

// "today" on the MT5 server clock (New York time + offset hours)
function serverToday(offset = NY_DEFAULT, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour) + offset * 3600e3).toISOString().slice(0, 10);
}

module.exports = { timeStats, habits, recap, desk, FIRMS, NY_DEFAULT, serverToday, hhmm };
module.exports.prepRows = (rows) => require('./insights').prep(rows);
