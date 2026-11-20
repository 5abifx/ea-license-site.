// Milestone certificates for Share Studio, built only from the member's own journal:
// prop target reached (from the prop firm guard settings), profit milestones, win streaks, green-day streaks, best month.
// Every number is computed here from saved trades; nothing is typed in by the member.
const desk = require('./desk');

const STEPS = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const dayTxt = (d) => new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDay = (d) => new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthTxt = (ym) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const firmShort = (k) => String(desk.FIRMS[k]?.name || '').replace(/\s*\(.*\)\s*$/, '');

// trades: oldest first, { close_time, net, symbol, manual, account_number, balance_after }
// accounts: [{ account_number, limits }]; money(v) formats in the account currency
function milestones(trades, accounts, money) {
  const out = [];
  const synced = (l) => l.length > 0 && l.every((t) => !t.manual);
  const winRate = (l) => (l.length ? Math.round(l.filter((t) => t.net > 0).length / l.length * 100) + '%' : '');

  // 1. prop target reached, one per account that has a target set
  accounts.forEach((a) => {
    const L = a.limits; if (!L || !L.target) return;
    const l = trades.filter((t) => t.account_number === a.account_number);
    const D = l.length ? desk.desk(l, L, '') : null;
    if (!D || D.error || !D.target || D.target.done < 1) return;
    let bal = D.start, when = '';
    for (const t of l) { bal += t.net; if (!when && bal - D.start >= D.target.goal) when = t.close_time; }
    const firm = firmShort(L.firm), upto = l.filter((t) => t.close_time <= when);
    out.push({
      k: 'target-' + a.account_number, l: `Target reached · ${firm || 'Account ••' + String(a.account_number).slice(-2)} · ${shortDay(when)}`, at: when,
      d: {
        kind: 'milestone', kicker: 'MILESTONE', heading: 'Target Reached', big: Math.round(D.start * 100) / 100, bigUnit: 'money',
        line: `passed the ${firm ? firm + ' ' : ''}evaluation on a`, synced: synced(upto),
        stats: [['Passed', dayTxt(when)], ['Profit', money(upto.reduce((s, t) => s + t.net, 0))], ['Of target', Math.round((upto.reduce((s, t) => s + t.net, 0)) / D.target.goal * 100) + '%']],
      },
    });
  });

  // 2. profit milestone: the highest round number the running total has crossed
  let run = 0, best = null;
  trades.forEach((t, i) => { run += t.net; STEPS.forEach((s) => { if (run >= s && (!best || s > best.s)) best = { s, i }; }); });
  if (best) {
    const upto = trades.slice(0, best.i + 1);
    out.push({
      k: 'profit-' + best.s, l: `Profit milestone · ${money(best.s).replace(/\.00$/, '')} · ${shortDay(upto[upto.length - 1].close_time)}`, at: upto[upto.length - 1].close_time,
      d: {
        kind: 'milestone', kicker: 'MILESTONE', heading: 'Profit Milestone', big: best.s, bigUnit: 'money', line: 'crossed in total journal profit',
        synced: synced(upto), stats: [['Reached', dayTxt(upto[upto.length - 1].close_time)], ['Trades', String(upto.length)], ['Win rate', winRate(upto)]],
      },
    });
  }

  // 3. longest run of winning trades (3 or more)
  let cur = [], top = [];
  trades.forEach((t) => { if (t.net > 0) { cur.push(t); if (cur.length > top.length) top = cur.slice(); } else cur = []; });
  if (top.length >= 3) {
    const a = top[0].close_time, b = top[top.length - 1].close_time;
    out.push({
      k: 'streak', l: `Win streak · ${top.length} in a row · ${shortDay(b)}`, at: b,
      d: {
        kind: 'milestone', kicker: 'STREAK', heading: 'Win Streak', big: top.length, bigUnit: 'count', bigSuffix: ' wins', line: 'closed winning trades in a row',
        synced: synced(top), stats: [['From', shortDay(a)], ['To', shortDay(b)], ['Made', money(top.reduce((s, t) => s + t.net, 0))]],
      },
    });
  }

  // 4. longest run of green trading days (3 or more)
  const days = new Map(); trades.forEach((t) => { const d = t.close_time.slice(0, 10); if (!days.has(d)) days.set(d, []); days.get(d).push(t); });
  let dc = [], dt = [];
  [...days.keys()].sort().forEach((d) => { const net = days.get(d).reduce((s, t) => s + t.net, 0); if (net > 0) { dc.push(d); if (dc.length > dt.length) dt = dc.slice(); } else dc = []; });
  if (dt.length >= 3) {
    const l = dt.flatMap((d) => days.get(d));
    out.push({
      k: 'green', l: `Green days · ${dt.length} in a row · ${shortDay(dt[dt.length - 1])}`, at: dt[dt.length - 1],
      d: {
        kind: 'milestone', kicker: 'STREAK', heading: 'Green Day Streak', big: dt.length, bigUnit: 'count', bigSuffix: ' days', line: 'finished green, day after day',
        synced: synced(l), stats: [['From', shortDay(dt[0])], ['To', shortDay(dt[dt.length - 1])], ['Made', money(l.reduce((s, t) => s + t.net, 0))]],
      },
    });
  }

  // 5. best month
  const months = new Map(); trades.forEach((t) => { const m = t.close_time.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(t); });
  let bm = null; months.forEach((l, m) => { const net = l.reduce((s, t) => s + t.net, 0); if (net > 0 && (!bm || net > bm.net)) bm = { m, l, net }; });
  if (bm && months.size >= 2) {
    out.push({
      k: 'month-' + bm.m, l: `Best month · ${monthTxt(bm.m)} · ${money(bm.net)}`, at: bm.m,
      d: {
        kind: 'milestone', kicker: 'RECORD', heading: 'Best Month', big: Math.round(bm.net * 100) / 100, bigUnit: 'money', bigPlus: true, line: `made in ${monthTxt(bm.m)}, a personal record`,
        synced: synced(bm.l), stats: [['Trades', String(bm.l.length)], ['Win rate', winRate(bm.l)], ['Green days', `${[...new Set(bm.l.map((t) => t.close_time.slice(0, 10)))].filter((d) => bm.l.filter((t) => t.close_time.startsWith(d)).reduce((s, t) => s + t.net, 0) > 0).length}`]],
      },
    });
  }
  return out;
}

module.exports = { milestones };
