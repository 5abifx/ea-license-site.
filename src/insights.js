// Journal Insights: plain-rule pattern finding over a trader's own closed trades (no AI, no external calls).
// Input: trades with open_time, close_time (broker time "YYYY-MM-DDTHH:MM:SS"), account_number, symbol, side, net, r.
// Output: up to 6 findings, worst leaks first, each { kind, tag, tone: 'bad'|'good'|'info', html }.

const MIN_TRADES = 10;
const REVENGE_MIN = 15;              // a trade opened this soon after a loss closed counts as a revenge trade
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SESSIONS = [                   // broker hours
  { name: 'Asia', from: 0, to: 7 }, { name: 'London', from: 8, to: 12 },
  { name: 'New York', from: 13, to: 16 }, { name: 'late session', from: 17, to: 23 },
];

const ts = (s) => (s ? Date.parse(s.replace(' ', 'T') + (s.length <= 19 ? 'Z' : '')) : NaN);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const pad = (h) => String(h).padStart(2, '0') + ':00';
const mins = (m) => (m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);

function insights(rows, { money, esc }) {
  const trades = rows.filter((t) => t.close_time).map((t) => ({ ...t, net: t.net || 0, o: ts(t.open_time), c: ts(t.close_time) }))
    .sort((a, b) => a.c - b.c);
  if (trades.length < MIN_TRADES) return { locked: true, need: MIN_TRADES, have: trades.length, items: [] };
  const sum = (l) => l.reduce((s, t) => s + t.net, 0);
  const items = [];

  // 1. time of day (by open hour)
  const bySes = SESSIONS.map((s) => {
    const l = trades.filter((t) => { const h = Number((t.open_time || t.close_time).slice(11, 13)); return h >= s.from && h <= s.to; });
    return { ...s, l, net: sum(l), losses: l.filter((t) => t.net < 0).length };
  }).filter((s) => s.l.length >= 5);
  const worstS = [...bySes].sort((a, b) => a.net - b.net)[0];
  const bestS = [...bySes].sort((a, b) => b.net - a.net)[0];
  if (worstS && worstS.net < 0) items.push({ kind: 'time', tag: 'Time of day', tone: 'bad', score: -worstS.net,
    html: `You lose <b>${pct(worstS.losses, worstS.l.length)}%</b> of trades opened in the ${worstS.name} (${pad(worstS.from)}–${pad(worstS.to).replace(':00', ':59')}). Net <b>${money(worstS.net)}</b>.` });
  if (bestS && bestS.net > 0 && bestS !== worstS) items.push({ kind: 'time', tag: 'Best hours', tone: 'good', score: bestS.net / 2,
    html: `Your best session is ${bestS.name}: <b>${pct(bestS.l.length - bestS.losses, bestS.l.length)}%</b> wins, <b>${money(bestS.net)}</b> from ${bestS.l.length} trades.` });

  // 2. revenge trades: opened within REVENGE_MIN minutes after a losing trade closed on the same account
  const rev = [];
  trades.forEach((t) => {
    if (!Number.isFinite(t.o)) return;
    const prior = trades.filter((p) => p !== t && p.account_number === t.account_number && p.net < 0 && Number.isFinite(p.c) && p.c <= t.o && t.o - p.c <= REVENGE_MIN * 60000);
    if (prior.length) rev.push(t);
  });
  if (rev.length >= 2) {
    const rn = sum(rev);
    items.push({ kind: 'revenge', tag: 'Behavior', tone: rn < 0 ? 'bad' : 'info', score: Math.abs(Math.min(rn, 0)) + rev.length,
      html: `<b>${rev.length} revenge trades</b>, opened within ${REVENGE_MIN} min of a loss. ${rn < 0 ? `They cost you <b>${money(rn)}</b>.` : `Net ${money(rn)}, but they win only ${pct(rev.filter((t) => t.net > 0).length, rev.length)}% of the time.`}` });
  }

  // 3. edge: best symbol + side
  const groups = {};
  trades.forEach((t) => { const k = `${t.symbol} ${t.side === 'SELL' ? 'sells' : 'buys'}`; (groups[k] ||= []).push(t); });
  const useR = trades.filter((t) => Number.isFinite(t.r)).length >= trades.length * 0.6;
  const val = (l) => (useR ? l.reduce((s, t) => s + (Number.isFinite(t.r) ? t.r : 0), 0) : sum(l));
  const g = Object.entries(groups).filter(([, l]) => l.length >= 3).map(([k, l]) => ({ k, l, v: val(l) })).sort((a, b) => b.v - a.v);
  if (g[0] && g[0].v > 0) items.push({ kind: 'edge', tag: 'Edge', tone: 'good', score: useR ? g[0].v * 20 : g[0].v,
    html: `Strongest setup: <b>${esc(g[0].k)}</b>, ${useR ? `<b>+${g[0].v.toFixed(1)}R</b>` : `<b>${money(g[0].v)}</b>`} over ${g[0].l.length} trades.` });
  const worstG = g[g.length - 1];
  if (worstG && worstG.v < 0 && worstG !== g[0]) items.push({ kind: 'leak', tag: 'Leak', tone: 'bad', score: useR ? -worstG.v * 20 : -worstG.v,
    html: `<b>${esc(worstG.k)}</b> keep losing: ${useR ? `<b>−${Math.abs(worstG.v).toFixed(1)}R</b>` : `<b>${money(worstG.v)}</b>`} over ${worstG.l.length} trades.` });

  // 4. weekday
  const byDay = {};
  trades.forEach((t) => { const d = new Date(t.c).getUTCDay(); (byDay[d] ||= []).push(t); });
  const wd = Object.entries(byDay).filter(([, l]) => l.length >= 3).map(([d, l]) => ({ d: Number(d), net: sum(l), n: l.length })).sort((a, b) => a.net - b.net);
  if (wd[0] && wd[0].net < 0 && wd.length > 1) items.push({ kind: 'weekday', tag: 'Day of week', tone: 'bad', score: -wd[0].net * 0.8,
    html: `<b>${DOW[wd[0].d]}s</b> are your worst day: <b>${money(wd[0].net)}</b> over ${wd[0].n} trades.` });

  // 5. overtrading: days with 5+ trades
  const days = {};
  trades.forEach((t) => { (days[t.close_time.slice(0, 10)] ||= []).push(t); });
  const busy = Object.values(days).filter((l) => l.length >= 5);
  if (busy.length >= 2) {
    const red = busy.filter((l) => sum(l) < 0).length;
    if (red / busy.length >= 0.5) items.push({ kind: 'overtrade', tag: 'Discipline', tone: 'bad', score: -sum(busy.flat()) + red * 10,
      html: `Days with <b>5+ trades</b> end red <b>${pct(red, busy.length)}%</b> of the time (${red} of ${busy.length}).` });
  }

  // 6. holding losers longer than winners
  const dur = (l) => { const d = l.filter((t) => Number.isFinite(t.o) && Number.isFinite(t.c) && t.c >= t.o).map((t) => (t.c - t.o) / 60000); return d.length >= 3 ? d.reduce((a, b) => a + b, 0) / d.length : null; };
  const dw = dur(trades.filter((t) => t.net > 0)), dl = dur(trades.filter((t) => t.net < 0));
  if (dw && dl && dl > dw * 1.5) items.push({ kind: 'hold', tag: 'Exits', tone: 'bad', score: 25 * (dl / dw),
    html: `You hold losers <b>${(dl / dw).toFixed(1)}×</b> longer than winners (${mins(dl)} vs ${mins(dw)}).` });

  // 7. streak
  let best = 0, run = 0, bestEnd = null;
  trades.forEach((t) => { run = t.net > 0 ? run + 1 : 0; if (run > best) { best = run; bestEnd = t; } });
  if (best >= 4) items.push({ kind: 'streak', tag: 'Streak', tone: 'good', score: best * 3,
    html: `Best run: <b>${best} winners in a row</b>, ending ${esc(bestEnd.close_time.slice(0, 10))}.` });

  // leaks first, then strengths; keep it short
  const order = { bad: 0, good: 1, info: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone] || b.score - a.score);
  return { locked: false, count: trades.length, items: items.slice(0, 6) };
}

module.exports = { insights, MIN_TRADES, REVENGE_MIN };
