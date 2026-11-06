// Journal Insights: plain-rule pattern finding over a trader's own closed trades (no AI, no external calls).
// Input rows: open_time, close_time (broker time "YYYY-MM-DDTHH:MM:SS"), account_number, symbol, side, net, r,
// and when present: lots, entry, exit, sl, tp, risk_pct, balance_after, mfe, mae (price distance), candles (JSON),
// setup, emotion, mistakes.
// analyze() returns everything the Insights page shows: score, numbers, leaks with a Fix line, the weekly focus,
// and chart data. Every "would have made" figure replays the trader's own trades without the leak.
// Item fields: html and fix are HTML (already escaped); title and rule are plain text (escape when shown).

const MIN_TRADES = 10;
const REVENGE_MIN = 15;              // a trade opened this soon after a loss closed counts as a revenge trade
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SESSIONS = [                   // broker hours
  { name: 'Asia session', short: 'Asia', from: 0, to: 7 }, { name: 'London session', short: 'London', from: 8, to: 12 },
  { name: 'New York session', short: 'New York', from: 13, to: 16 }, { name: 'late session', short: 'Late', from: 17, to: 23 },
];

const ts = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + (String(s).length <= 19 ? 'Z' : '')) : NaN);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const pad = (h) => String(h).padStart(2, '0') + ':00';
const mins = (m) => (m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const median = (l) => { const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const hourOf = (t) => Number((t.open_time || t.close_time).slice(11, 13));
const sessionOf = (t) => SESSIONS.find((s) => hourOf(t) >= s.from && hourOf(t) <= s.to);
const rx = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}R`;
const ORD = ['1st', '2nd', '3rd'];

function prep(rows) {
  return rows.filter((t) => t.close_time).map((t) => {
    const x = { ...t, net: Number(t.net) || 0, o: ts(t.open_time), c: ts(t.close_time) };
    x.r = fin(t.r) ? Number(t.r) : null;
    // risk distance in price: only when R is known, so the stop is the real first stop (not break-even)
    x.risk = x.r !== null && fin(t.sl) && fin(t.entry) && Number(t.sl) !== Number(t.entry) ? Math.abs(t.entry - t.sl) : null;
    x.dir = t.side === 'SELL' ? -1 : 1;
    return x;
  }).sort((a, b) => a.c - b.c);
}

// ---------- core numbers + score ----------
function numbers(trades) {
  const sum = (l) => l.reduce((s, t) => s + t.net, 0);
  const wins = trades.filter((t) => t.net > 0), losses = trades.filter((t) => t.net < 0);
  const gw = sum(wins), gl = -sum(losses);
  const net = gw - gl;
  const avgW = wins.length ? gw / wins.length : 0, avgL = losses.length ? gl / losses.length : 0;
  const ratio = avgL && avgW ? avgW / avgL : null;
  const pf = gl ? gw / gl : (gw > 0 ? Infinity : null);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const rTrades = trades.filter((t) => t.r !== null);
  const expR = rTrades.length >= 5 ? rTrades.reduce((s, t) => s + t.r, 0) / rTrades.length : null;

  // equity: start balance per account from its first trade (balance after - net), else unknown
  const starts = {};
  trades.forEach((t) => { if (!(t.account_number in starts)) starts[t.account_number] = fin(t.balance_after) ? t.balance_after - t.net : null; });
  const startVals = Object.values(starts);
  const start = startVals.length && startVals.every((v) => v > 0) ? startVals.reduce((a, b) => a + b, 0) : null;
  let eq = 0, peak = 0, maxDD = 0, ddAtPeak = 0;
  const equity = trades.map((t) => {
    eq += t.net; if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) { maxDD = dd; ddAtPeak = peak; }
    return { t: t.close_time, eq, dd };
  });
  const maxDDPct = start ? (maxDD / (start + ddAtPeak)) * 100 : null;
  const recovery = maxDD ? net / maxDD : (net > 0 ? Infinity : 0);

  const days = {};
  trades.forEach((t) => { const d = t.close_time.slice(0, 10); days[d] = (days[d] || 0) + t.net; });
  const dayNets = Object.values(days);
  const greenDays = dayNets.filter((v) => v > 0).length;
  const bestDay = dayNets.length ? Math.max(...dayNets) : 0;
  const bestShare = net > 0 && bestDay > 0 ? (bestDay / net) * 100 : null;

  return { n: trades.length, net, gw, gl, wins: wins.length, losses: losses.length, avgW, avgL, ratio, pf, winRate,
    expMoney: trades.length ? net / trades.length : 0, expR, start, maxDD, maxDDPct, recovery, equity,
    days: dayNets.length, greenDays, bestDay, bestShare, breakEvenWin: ratio ? 1 / (1 + ratio) : null };
}

function score(N) {
  const parts = [
    { key: 'pf', name: 'Profit factor', w: 25, v: N.pf === null ? 0 : clamp(((Math.min(N.pf, 5) - 0.8) / (2.5 - 0.8)) * 100),
      tip: 'Your losses eat most of your wins. Cut your worst setup and your worst hours first.' },
    { key: 'ratio', name: 'Win / loss size', w: 20, v: N.ratio === null ? (N.avgW ? 100 : 0) : clamp(((N.ratio - 0.5) / (2.5 - 0.5)) * 100),
      tip: 'Your winners are too small for your losers. Let winners run to a fixed target and never widen a stop.' },
    { key: 'win', name: 'Win rate', w: 15, v: clamp((N.winRate * 100 / 60) * 100),
      tip: 'Too many trades lose. Wait for your best setup and skip the rest.' },
    { key: 'dd', name: 'Drawdown', w: 20, v: N.maxDDPct === null ? (N.gw ? clamp(100 - (N.maxDD / N.gw) * 100) : 0) : clamp(100 - N.maxDDPct * 6),
      tip: 'Your account drops too deep before it recovers. Lower the risk per trade and use a daily loss limit.' },
    { key: 'rec', name: 'Recovery', w: 10, v: N.net <= 0 ? 0 : clamp((Math.min(N.recovery, 10) / 3.5) * 100),
      tip: 'Your profit is small next to your worst drawdown. Protect the account before pushing for more.' },
    { key: 'cons', name: 'Consistency', w: 10, v: N.net <= 0 || !N.days ? 0
      : clamp((N.greenDays / N.days) * 125) * (N.bestShare !== null && N.bestShare > 40 ? 0.7 : 1),
      tip: 'Most of your profit comes from one or two big days. Same size, same rules, every day.' },
  ].map((p) => ({ ...p, v: Math.round(p.v) }));
  const total = Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / 100);
  const weakest = [...parts].sort((a, b) => a.v - b.v)[0];
  const label = total >= 80 ? 'strong edge' : total >= 65 ? 'solid' : total >= 50 ? 'getting there' : total >= 35 ? 'leaking' : 'needs work';
  return { total, parts, weakest, label };
}

// ---------- leaks ----------
function leaks(trades, { money, esc }) {
  const sum = (l) => l.reduce((s, t) => s + t.net, 0);
  const winPct = (l) => pct(l.filter((t) => t.net > 0).length, l.length);
  const items = [];
  const add = (it) => items.push({ saved: 0, ...it });
  const overallWin = winPct(trades);
  const amt = (v) => String(money(Math.abs(v))).replace(/^[+−-]/, '');   // a size without + / −: "lost 3,885.43 USD"
  const avgLoss = (() => { const l = trades.filter((t) => t.net < 0); return l.length ? -sum(l) / l.length : 0; })();

  // per account, in open order (for streaks and trade numbers)
  const byAcct = {};
  trades.forEach((t) => (byAcct[t.account_number] ||= []).push(t));
  Object.values(byAcct).forEach((l) => l.sort((a, b) => (Number.isFinite(a.o) ? a.o : a.c) - (Number.isFinite(b.o) ? b.o : b.c)));

  // L1 overtrading: profit by trade number of the day
  const nth = [[], [], [], []];
  Object.values(byAcct).forEach((l) => {
    const perDay = {};
    l.forEach((t) => { const d = (t.open_time || t.close_time).slice(0, 10); perDay[d] = (perDay[d] || 0) + 1; t.nth = perDay[d]; nth[Math.min(perDay[d], 4) - 1].push(t); });
  });
  const byNum = nth.map((l, i) => ({ label: ['1st', '2nd', '3rd', '4th+'][i], n: l.length, net: sum(l), win: winPct(l) }));
  for (const cap of [1, 2, 3]) {
    const later = trades.filter((t) => t.nth > cap);
    if (later.length >= 4 && sum(later) < 0 && sum(trades.filter((t) => t.nth === cap)) > sum(later)) {
      add({ code: 'L1', kind: 'overtrade', tag: 'Overtrading', tone: 'bad', saved: -sum(later), chart: 'byNum',
        title: `Trades after your ${ORD[cap - 1]} of the day lose money.`,
        html: `Trades after your ${ORD[cap - 1]} of the day: <b>${money(sum(later))}</b> over ${later.length} trades, win rate <b>${winPct(later)}%</b>.`,
        fix: `Max ${cap} trade${cap > 1 ? 's' : ''} a day for the next 2 weeks. After a green first trade, close the platform.`,
        rule: `Max ${cap} trade${cap > 1 ? 's' : ''} a day for the next 2 weeks.` });
      break;
    }
  }

  // L2 revenge trades: opened within REVENGE_MIN minutes after a losing trade closed on the same account
  const rev = trades.filter((t) => Number.isFinite(t.o) && trades.some((p) => p !== t && p.account_number === t.account_number && p.net < 0
    && Number.isFinite(p.c) && p.c <= t.o && t.o - p.c <= REVENGE_MIN * 60000));
  // shown when they lose money, or when they win less often than your other trades
  const revWin = winPct(rev);
  if (rev.length >= 2 && (sum(rev) < 0 || revWin < overallWin)) {
    const rn = sum(rev);
    add({ code: 'L2', kind: 'revenge', tag: 'Revenge trades', tone: rn < 0 ? 'bad' : 'info', saved: Math.max(0, -rn),
      title: rn < 0 ? `Revenge trades cost you ${amt(rn)}.` : 'Trades right after a loss win less often.',
      html: `<b>${rev.length} revenge trades</b>, opened within ${REVENGE_MIN} min of a loss. ${rn < 0
        ? `Together they lost <b>${amt(rn)}</b>.`
        : `They still made <b>${amt(rn)}</b>, but they win <b>${revWin}%</b> of the time, against <b>${overallWin}%</b> for your other trades.`}`,
      fix: 'After a loss, stand up and wait 30 minutes before the next trade.', rule: 'After a loss, wait 30 minutes before the next trade.' });
  }

  // L3 tilt: trades taken after 2+ losses in a row on the same account
  const tilt = [];
  Object.values(byAcct).forEach((l) => {
    l.forEach((t) => {
      const at = Number.isFinite(t.o) ? t.o : t.c;
      const before = l.filter((p) => p !== t && Number.isFinite(p.c) && p.c <= at).sort((a, b) => b.c - a.c);
      let k = 0; while (k < before.length && before[k].net < 0) k++;
      if (k >= 2) tilt.push(t);
    });
  });
  if (tilt.length >= 3 && (sum(tilt) < 0 || winPct(tilt) < overallWin - 10)) {
    add({ code: 'L3', kind: 'tilt', tag: 'Tilt', tone: 'bad', saved: Math.max(0, -sum(tilt)),
      title: 'After two losses in a row, you keep losing.',
      html: `After <b>2 losses in a row</b> your next trades win only <b>${winPct(tilt)}%</b> (${tilt.length} trades, <b>${money(sum(tilt))}</b>). Normally you win ${overallWin}%.`,
      fix: 'Two red trades in a row ends the day. No exceptions.', rule: 'Two losses in a row ends the day.' });
  }

  // L4 risk creep: trades sized well above the usual risk
  const withRisk = trades.filter((t) => fin(t.risk_pct) && t.risk_pct > 0);
  let big = [], usual = null, scale = () => 1;
  if (withRisk.length >= trades.length * 0.5 && withRisk.length >= 6) {
    usual = median(withRisk.map((t) => t.risk_pct));
    big = withRisk.filter((t) => t.risk_pct > usual * 1.5);
    scale = (t) => usual / t.risk_pct;
  } else {
    const med = {}, bySym = {};
    trades.filter((t) => fin(t.lots) && t.lots > 0).forEach((t) => (bySym[t.symbol] ||= []).push(Number(t.lots)));
    Object.entries(bySym).forEach(([s, l]) => { if (l.length >= 4) med[s] = median(l); });
    big = trades.filter((t) => med[t.symbol] && t.lots > med[t.symbol] * 1.5);
    scale = (t) => med[t.symbol] / t.lots;
  }
  if (big.length >= 3 && sum(big) < 0) {
    const afterLoss = big.filter((t) => { const l = byAcct[t.account_number]; const i = l.indexOf(t); return i > 0 && l[i - 1].net < 0; }).length;
    const whatIf = big.reduce((s, t) => s + t.net * scale(t), 0);
    add({ code: 'L4', kind: 'risk', tag: 'Risk creep', tone: 'bad', saved: Math.max(0, whatIf - sum(big)),
      title: 'Your bigger positions are your losing ones.',
      html: `Trades sized above your usual ${usual !== null ? `<b>${usual.toFixed(2)}%</b> risk` : 'lot size'} lost <b>${amt(sum(big))}</b> over ${big.length} trades.${afterLoss ? ` ${afterLoss} of them came right after a loss.` : ''}`,
      fix: `Same risk on every trade${usual !== null ? ` (${usual.toFixed(2)}%)` : ''}. Never size up to win a loss back. KATANA can cap the lot size for you.`,
      rule: `Same risk on every trade${usual !== null ? `: ${usual.toFixed(2)}%` : ''}.` });
  }

  // L5 gave back winners: reached +1R in profit, closed red
  const gave = trades.filter((t) => t.risk && fin(t.mfe) && t.mfe >= t.risk && t.net < 0);
  if (gave.length >= 2) {
    add({ code: 'L5', kind: 'gaveback', tag: 'Gave back winners', tone: 'bad', saved: -sum(gave),
      title: 'Winning trades are turning into losses.',
      html: `<b>${gave.length} trades</b> were +1R in profit and still closed red. Together they lost <b>${amt(sum(gave))}</b>.`,
      fix: 'At +1R, move the stop to break-even or take half off.', rule: 'At +1R, stop to break-even or take a partial.' });
  }

  // L6 exit efficiency: how much of the best price the winners kept
  const effW = trades.filter((t) => t.net > 0 && fin(t.mfe) && t.mfe > 0 && fin(t.exit) && fin(t.entry));
  if (effW.length >= 5) {
    const eff = effW.reduce((s, t) => s + clamp(((t.exit - t.entry) * t.dir) / t.mfe, 0, 1), 0) / effW.length;
    const rw = effW.filter((t) => t.risk);
    const best = rw.length >= 3 ? rw.reduce((s, t) => s + t.mfe / t.risk, 0) / rw.length : null;
    const took = rw.length >= 3 ? rw.reduce((s, t) => s + t.r, 0) / rw.length : null;
    if (eff < 0.6) add({ code: 'L6', kind: 'efficiency', tag: 'Exit efficiency', tone: 'info',
      html: `Your winners keep <b>${Math.round(eff * 100)}%</b> of the best price they reached.${best !== null ? ` Average best move <b>${best.toFixed(1)}R</b>, you took <b>${took.toFixed(1)}R</b>.` : ''}`,
      fix: best !== null && best >= 1.8 ? `Test a fixed ${Math.max(1.5, Math.floor(best * 0.8 * 2) / 2)}R target on your best setup for 20 trades.` : 'Use a fixed target instead of closing by feel, and trail only after +1R.' });
    else add({ code: 'L6', kind: 'efficiency', tag: 'Exit efficiency', tone: 'good',
      html: `Good exits: your winners keep <b>${Math.round(eff * 100)}%</b> of the best price they reached.`, fix: 'Keep your exit rules as they are.' });
  }

  // L7 stopped, then right: the stop was hit and price reached the target within 20 candles after the exit
  const stopped = trades.filter((t) => t.net < 0 && t.risk && fin(t.exit) && fin(t.sl) && Math.abs(t.exit - t.sl) <= t.risk * 0.25);
  const right = stopped.filter((t) => {
    let c; try { c = JSON.parse(t.candles || '[]'); } catch { return false; }
    if (!Array.isArray(c)) return false;
    const target = fin(t.tp) && Number(t.tp) ? Number(t.tp) : t.entry + t.dir * 2 * t.risk;
    const after = c.filter((k) => k[0] * 1000 > t.c).slice(0, 20);
    return after.some((k) => (t.dir > 0 ? k[2] >= target : k[3] <= target));
  });
  if (right.length >= 2) {
    add({ code: 'L7', kind: 'stopped', tag: 'Stopped, then right', tone: 'bad',
      title: 'Your stops get hit, then price goes your way.',
      html: `<b>${right.length} of ${stopped.length}</b> stopped-out trades reached your target within 20 candles after the stop. Together they lost <b>${amt(sum(right))}</b>.`,
      fix: 'Your stops sit too close. Put them beyond the swing high or low, and use smaller lots so the risk stays the same.',
      rule: 'Stop beyond the swing, smaller lots, same risk.' });
  }

  // L8 no stop, or lost more than the stop
  const noSL = trades.filter((t) => !fin(t.sl) || !Number(t.sl));
  const overStop = trades.filter((t) => t.r !== null && t.r < -1.2);
  const noSLbad = noSL.length >= 2 && sum(noSL) < 0 && -sum(noSL) >= avgLoss * 0.5;   // ignore a few cents
  if (noSLbad || overStop.length >= 2) {
    const p = [];
    if (noSLbad) p.push(`<b>${noSL.length} trades</b> had no stop-loss and lost <b>${amt(sum(noSL))}</b>.`);
    if (overStop.length >= 2) p.push(`<b>${overStop.length} trades</b> lost more than 1.2R, so the stop was moved or skipped. Together they lost <b>${amt(sum(overStop))}</b>.`);
    const extra = overStop.reduce((s, t) => s + t.net + t.net / t.r, 0);   // the part lost beyond −1R
    add({ code: 'L8', kind: 'nostop', tag: 'Stop discipline', tone: 'bad', saved: Math.max(0, -extra),
      title: 'Some trades lose more than the stop allows.', html: p.join('<br>'),
      fix: 'Every trade gets a stop before entry. Never move it further away.', rule: 'Stop set before entry, never widened.' });
  }

  // L9 holding losers longer than winners
  const dur = (l) => { const d = l.filter((t) => Number.isFinite(t.o) && Number.isFinite(t.c) && t.c >= t.o).map((t) => (t.c - t.o) / 60000); return d.length >= 3 ? d.reduce((a, b) => a + b, 0) / d.length : null; };
  const dw = dur(trades.filter((t) => t.net > 0)), dl = dur(trades.filter((t) => t.net < 0));
  if (dw && dl && dl > dw * 1.5) add({ code: 'L9', kind: 'hold', tag: 'Holding losers', tone: 'bad',
    title: 'You hold losing trades too long.',
    html: `You hold losers <b>${(dl / dw).toFixed(1)}×</b> longer than winners (${mins(dl)} vs ${mins(dw)}).`,
    fix: `Time stop: if a trade is not working after ${mins(Math.max(5, dw * 1.5))}, close it.`, rule: `Close trades that are not working after ${mins(Math.max(5, dw * 1.5))}.` });

  // L10 session (by open hour)
  const bySes = SESSIONS.map((s) => { const l = trades.filter((t) => sessionOf(t) === s); return { ...s, l, net: sum(l) }; }).filter((s) => s.l.length >= 5);
  const worstS = [...bySes].sort((a, b) => a.net - b.net)[0];
  const bestS = [...bySes].sort((a, b) => b.net - a.net)[0];
  if (worstS && worstS.net < 0) add({ code: 'L10', kind: 'time', tag: 'Time of day', tone: 'bad', saved: -worstS.net,
    title: `The ${worstS.name} is costing you money.`,
    html: `You lose <b>${100 - winPct(worstS.l)}%</b> of trades opened in the ${worstS.name} (${pad(worstS.from)}–${pad(worstS.to).replace(':00', ':59')}). Net <b>${money(worstS.net)}</b>.`,
    fix: `Skip the ${worstS.name} for 2 weeks, or trade it at half size until it turns green.`, rule: `No trades in the ${worstS.name} for 2 weeks.` });
  if (bestS && bestS.net > 0 && bestS !== worstS) add({ code: 'L10', kind: 'besttime', tag: 'Best hours', tone: 'good',
    html: `Your best session is the ${bestS.name}: <b>${winPct(bestS.l)}%</b> wins, <b>${money(bestS.net)}</b> from ${bestS.l.length} trades.`,
    fix: `Save your full focus for the ${bestS.name}.` });

  // L11 weekday
  const byDay = {};
  trades.forEach((t) => { const d = new Date(t.c).getUTCDay(); (byDay[d] ||= []).push(t); });
  const wd = Object.entries(byDay).filter(([, l]) => l.length >= 3).map(([d, l]) => ({ d: Number(d), net: sum(l), n: l.length })).sort((a, b) => a.net - b.net);
  if (wd[0] && wd[0].net < 0 && wd.length > 1) add({ code: 'L11', kind: 'weekday', tag: 'Day of week', tone: 'bad', saved: -wd[0].net,
    title: `${DOW[wd[0].d]}s are your worst day.`,
    html: `<b>${DOW[wd[0].d]}s</b> are your worst day: <b>${money(wd[0].net)}</b> over ${wd[0].n} trades.`,
    fix: `Take ${DOW[wd[0].d]}s off for 2 weeks, or trade them at half size.`, rule: `No trading on ${DOW[wd[0].d]}s for 2 weeks.` });

  // L12 edge and leak: by Setup tag when most trades are tagged, else symbol + side
  const tagged = trades.filter((t) => t.setup && String(t.setup).trim());
  const useSetup = tagged.length >= Math.max(6, trades.length * 0.5);
  const groups = {};
  (useSetup ? tagged : trades).forEach((t) => { const k = useSetup ? String(t.setup).trim() : `${t.symbol} ${t.side === 'SELL' ? 'sells' : 'buys'}`; (groups[k] ||= []).push(t); });
  const useR = trades.filter((t) => t.r !== null).length >= trades.length * 0.6;
  const val = (l) => (useR ? l.reduce((s, t) => s + (t.r ?? 0), 0) : sum(l));
  const fmtV = (v) => (useR ? rx(v) : money(v));
  const g = Object.entries(groups).filter(([, l]) => l.length >= 3).map(([k, l]) => ({ k, l, v: val(l) })).sort((a, b) => b.v - a.v);
  if (g[0] && g[0].v > 0) add({ code: 'L12', kind: 'edge', tag: 'Edge', tone: 'good',
    html: `Strongest ${useSetup ? 'setup' : 'market'}: <b>${esc(g[0].k)}</b>, <b>${fmtV(g[0].v)}</b> over ${g[0].l.length} trades, ${winPct(g[0].l)}% wins.`,
    fix: 'Size this one normally, and trade less of everything else.' });
  const worstG = g[g.length - 1];
  if (worstG && worstG.v < 0 && worstG !== g[0]) add({ code: 'L12', kind: 'leak', tag: 'Leak', tone: 'bad', saved: Math.max(0, -sum(worstG.l)),
    title: `${worstG.k} keeps losing.`,
    html: `<b>${esc(worstG.k)}</b> keeps losing: <b>${fmtV(worstG.v)}</b> over ${worstG.l.length} trades.`,
    fix: `Stop trading ${esc(worstG.k)} until you can write down why it fails.`, rule: `No ${worstG.k} for 2 weeks.` });

  // L13 mistake and emotion cost (from the trader's own notes)
  const mist = {};
  trades.forEach((t) => String(t.mistakes || '').split(/[,;]+/).map((m) => m.trim().toLowerCase()).filter(Boolean)
    .forEach((m) => (mist[m] ||= []).push(t)));
  const mw = Object.entries(mist).filter(([, l]) => l.length >= 2 && sum(l) < 0).sort((a, b) => sum(a[1]) - sum(b[1]));
  const emo = {};
  trades.filter((t) => t.emotion).forEach((t) => (emo[t.emotion] ||= []).push(t));
  const ew = Object.entries(emo).filter(([, l]) => l.length >= 3).map(([k, l]) => ({ k, l, w: winPct(l) })).sort((a, b) => a.w - b.w);
  const badEmo = ew[0] && ew[0].w < overallWin - 10 ? ew[0] : null;
  if (mw.length || badEmo) {
    const p = [];
    if (mw.length) p.push(`Trades tagged <b>“${esc(mw[0][0])}”</b> lost <b>${amt(sum(mw[0][1]))}</b> over ${mw[0][1].length} trades.`);
    if (mw[1]) p.push(`Next: <b>“${esc(mw[1][0])}”</b> ${money(sum(mw[1][1]))}.`);
    if (badEmo) p.push(`Trades marked <b>${esc(badEmo.k)}</b> win only <b>${badEmo.w}%</b>.`);
    add({ code: 'L13', kind: 'mistakes', tag: 'Mistake cost', tone: 'bad', saved: mw.length ? -sum(mw[0][1]) : 0,
      title: mw.length ? `“${mw[0][0]}” is your most expensive habit.` : `${badEmo.k} trades are losing trades.`,
      html: p.join(' '),
      fix: mw.length ? `Your most expensive habit is “${esc(mw[0][0])}”. Write it on a sticky note on your screen.` : `When you feel ${esc(badEmo.k.toLowerCase())}, don't trade.`,
      rule: mw.length ? `No more “${mw[0][0]}”.` : `No trades when ${badEmo.k.toLowerCase()}.` });
  }

  // L14 after a big win day: does the next trading day give it back?
  const dayNet = {};
  trades.forEach((t) => { const d = t.close_time.slice(0, 10); dayNet[d] = (dayNet[d] || 0) + t.net; });
  const dKeys = Object.keys(dayNet).sort();
  const green = dKeys.map((d) => dayNet[d]).filter((v) => v > 0);
  const avgGreen = green.length ? green.reduce((a, b) => a + b, 0) / green.length : 0;
  const nextDays = dKeys.map((d, i) => (avgGreen > 0 && dayNet[d] >= avgGreen * 2 && dKeys[i + 1] ? dKeys[i + 1] : null)).filter(Boolean);
  if (nextDays.length >= 2) {
    const nn = nextDays.reduce((s, d) => s + dayNet[d], 0);
    const red = nextDays.filter((d) => dayNet[d] < 0).length;
    if (nn < 0 || red / nextDays.length >= 0.6) add({ code: 'L14', kind: 'bigwin', tag: 'After a big win', tone: 'bad', saved: Math.max(0, -nn),
      title: 'After a big day, you give some back.',
      html: `The day after a big win ended red <b>${red} of ${nextDays.length}</b> times, net <b>${money(nn)}</b>.`,
      fix: 'After a big day, trade half size and take max 2 trades the next day.', rule: 'Half size the day after a big win.' });
  }

  // best winning streak
  let best = 0, run = 0, bestEnd = null;
  trades.forEach((t) => { run = t.net > 0 ? run + 1 : 0; if (run > best) { best = run; bestEnd = t; } });
  if (best >= 4) add({ code: 'S', kind: 'streak', tag: 'Streak', tone: 'good',
    html: `Best run: <b>${best} winners in a row</b>, ending ${esc(bestEnd.close_time.slice(0, 10))}.`, fix: 'Write down what you did that week and repeat it.' });

  return { items, byNum };
}

// ---------- prop firm guard (one account, all its trades) ----------
// limits: { daily, max, target } in % of the start balance; start: start balance (optional, else from the first trade)
function propGuard(rows, limits, { money }) {
  const trades = prep(rows);
  if (!trades.length || !limits || !(limits.daily || limits.max || limits.target)) return null;
  const first = trades[0];
  const start = limits.start > 0 ? limits.start : fin(first.balance_after) ? first.balance_after - first.net : null;
  if (!start || start <= 0) return { error: 'Type the start balance of this account to see the prop firm guard.' };
  const days = {};
  trades.forEach((t) => { const d = t.close_time.slice(0, 10); (days[d] ||= []).push(t); });
  let bal = start, minBal = start;
  const dayLoss = [];
  Object.keys(days).sort().forEach((d) => {
    const open = bal; let low = bal;
    days[d].forEach((t) => { bal += t.net; low = Math.min(low, bal); });
    dayLoss.push({ d, pct: ((open - low) / start) * 100 });
    minBal = Math.min(minBal, bal);
  });
  const worst = [...dayLoss].sort((a, b) => b.pct - a.pct)[0];
  const ddPct = ((start - minBal) / start) * 100;
  const gainPct = ((bal - start) / start) * 100;
  const nDays = dayLoss.length;
  const rows2 = [];
  if (limits.daily) rows2.push({ name: 'Daily loss', used: worst.pct / limits.daily,
    html: worst.pct > 0 ? `Worst day <b>−${worst.pct.toFixed(1)}%</b> (${worst.d}) against your <b>${limits.daily}%</b> daily limit.` : `No losing day yet. Daily limit <b>${limits.daily}%</b>.` });
  if (limits.max) rows2.push({ name: 'Max loss', used: ddPct / limits.max,
    html: ddPct > 0 ? `Lowest balance was <b>${ddPct.toFixed(1)}%</b> below the start. Limit <b>${limits.max}%</b>.` : `Never below the start balance. Limit <b>${limits.max}%</b>.` });
  if (limits.target) {
    const per = gainPct / nDays, left = limits.target - gainPct;
    rows2.push({ name: 'Profit target', used: clamp(gainPct / limits.target, 0, 1), good: true,
      html: left <= 0 ? `Target of <b>${limits.target}%</b> reached: <b>+${gainPct.toFixed(1)}%</b>.`
        : `<b>${gainPct >= 0 ? '+' : '−'}${Math.abs(gainPct).toFixed(1)}%</b> of the <b>${limits.target}%</b> target.${per > 0 ? ` At your pace (${per.toFixed(2)}% a day) about <b>${Math.ceil(left / per)} trading days</b> to go.` : ''}` });
  }
  const danger = rows2.some((o) => !o.good && o.used >= 0.7);
  const fix = limits.daily ? `Set KATANA's daily loss limit to ${Math.max(0.5, Math.round(limits.daily * 0.6 * 2) / 2)}%, so it stops you well before the firm's ${limits.daily}%.`
    : 'Use a daily loss limit well below the firm\'s rule.';
  return { start, balance: bal, rows: rows2, danger, fix, gain: money(bal - start) };
}

// ---------- chart data ----------
function charts(trades, N) {
  const heat = SESSIONS.map((s) => ({ name: s.short, cells: [1, 2, 3, 4, 5].map((d) => {
    const l = trades.filter((t) => sessionOf(t) === s && new Date(Number.isFinite(t.o) ? t.o : t.c).getUTCDay() === d);
    return { n: l.length, net: l.reduce((a, t) => a + t.net, 0) };
  }) }));
  const rs = trades.filter((t) => t.r !== null).map((t) => t.r);
  const edges = [-Infinity, -1.25, -0.75, 0, 0.75, 1.25, 1.75, 2.5, Infinity];
  const labels = ['≤−1.5', '−1', '−0.5', '+0.5', '+1', '+1.5', '+2', '+3'];
  const hist = rs.length >= 5 ? labels.map((label, i) => ({ label, n: rs.filter((r) => r > edges[i] && r <= edges[i + 1]).length, pos: i >= 3 })) : null;
  return { equity: N.equity, heat, hist, edge: N.ratio !== null ? { win: N.winRate, ratio: N.ratio } : null };
}

function analyze(rows, { money, esc }) {
  const trades = prep(rows);
  if (trades.length < MIN_TRADES) return { locked: true, need: MIN_TRADES, have: trades.length };
  const N = numbers(trades);
  const S = score(N);
  const { items, byNum } = leaks(trades, { money, esc });
  const order = { bad: 0, info: 1, good: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone] || (b.saved || 0) - (a.saved || 0));
  const focus = items.filter((i) => i.tone === 'bad' && i.rule).sort((a, b) => (b.saved || 0) - (a.saved || 0))[0] || null;
  return { locked: false, count: trades.length, numbers: N, score: S, items, focus, byNum, charts: charts(trades, N) };
}

// short list (journal page)
function insights(rows, opts) {
  const a = analyze(rows, opts);
  if (a.locked) return { locked: true, need: a.need, have: a.have, items: [] };
  return { locked: false, count: a.count, items: a.items.slice(0, 6), analysis: a };
}

module.exports = { insights, analyze, propGuard, prep, numbers, score, MIN_TRADES, REVENGE_MIN };
