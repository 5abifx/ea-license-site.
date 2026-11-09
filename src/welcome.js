// Student intro: a short welcome with the student's name once a day after sign-in, and a reveal of the last
// session's result when they open the journal. The reveal follows the day: celebration on green days, the
// process first on red days (no red count-down), an honest note and tomorrow's fix when a rule slipped.
// Students (Student tick, a mentorship plan) and admins. Settings live in the overlay itself.
const { prep } = require('./insights');

const NY_DEFAULT = 7;
const REVENGE_MIN = 15;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUOTES = {
  green: ['Stay humble, stack the days.', 'Same plan tomorrow. That is the edge.', 'Bank it. Then do it again.', 'Calm hands made this.'],
  red: ['Lost the battle, not the war.', 'Small losses are the cost of doing business.', 'You did your job. The market did its own.', 'Rules kept is a good day.'],
  bad: ["One day doesn't judge you. The next one does.", 'Reset. Breathe. Fix one thing.', 'It stayed small. Build from here.'],
  wel: ['Discipline is choosing what you want most over what you want now.', 'Plan the trade. Trade the plan.', 'Protect the account first. Profits follow.', 'Patience is a position.'],
};
const pick = (l, seed) => l[Math.abs(seed) % l.length];

const isStudent = (u) => !!(u && (u.student || u.mentor_plan || u.is_admin));
const median = (l) => { const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const fmtU = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}R`;

// trades of the user's live accounts, tagged with the New York clock and the habits the plan score checks
function tagged(db, u) {
  const off = u.ny_offset ?? NY_DEFAULT;
  const live = db.prepare('SELECT account_number FROM accounts WHERE user_id = ?').all(u.id).map((a) => a.account_number);
  if (!live.length) return [];
  const rows = db.prepare(`SELECT id, account_number, symbol, side, open_time, close_time, net, r, currency FROM journal_trades
    WHERE user_id = ? AND account_number IN (${live.map(() => '?').join(',')}) ORDER BY close_time`).all(u.id, ...live);
  const trades = prep(rows);
  const losses = trades.filter((t) => t.net < 0);
  const avgLoss = losses.length ? -losses.reduce((s, t) => s + t.net, 0) / losses.length : 0;
  const byAcct = {};
  trades.forEach((t) => {
    const d = new Date((Number.isFinite(t.o) ? t.o : t.c) - off * 3600e3);
    t.day = d.toISOString().slice(0, 10); t.min = d.getUTCHours() * 60 + d.getUTCMinutes();
    t.u = t.r !== null ? t.r : avgLoss ? t.net / avgLoss : 0;
    (byAcct[t.account_number] ||= []).push(t);
  });
  Object.values(byAcct).forEach((l) => {
    let lastLoss = null;
    l.sort((a, b) => (a.o || a.c) - (b.o || b.c)).forEach((t) => {
      t.afterLoss = lastLoss !== null && Number.isFinite(t.o) && t.o >= lastLoss ? (t.o - lastLoss) / 60000 : -1;
      if (t.net < 0 && Number.isFinite(t.c)) lastLoss = t.c;
    });
  });
  return trades;
}

function build(db, u, { withReveal }) {
  const first = String(u.name || '').trim().split(/\s+/)[0] || 'Trader';
  const since = Date.parse(String(u.mentor_paid_at || u.created_at || '').replace(' ', 'T') + 'Z');
  const dayN = Number.isFinite(since) ? Math.max(1, Math.floor((Date.now() - since) / 864e5) + 1) : null;
  const trades = tagged(db, u);
  const out = { name: first.slice(0, 16), dayN, streak: 0, quote: pick(QUOTES.wel, new Date().getUTCDate() + u.id), reveal: null, cur: '' };
  if (trades.length < 3) return out;

  // days, red half-hours from the trader's own history, usual trade count
  const days = {};
  trades.forEach((t) => (days[t.day] ||= []).push(t));
  const keys = Object.keys(days).sort();
  const half = {};
  trades.forEach((t) => { const k = Math.floor(t.min / 30); (half[k] ||= { n: 0, u: 0 }); half[k].n++; half[k].u += t.u; });
  const red = new Set(Object.entries(half).filter(([, h]) => h.n >= 2 && h.u < -0.4).map(([k]) => +k));
  const usual = Math.max(2, Math.round(median(keys.map((k) => days[k].length))) + 1);
  const checks = (l) => {
    const dayU = l.reduce((s, t) => s + t.u, 0);
    const c = {
      stop: l.every((t) => t.r !== null),
      revenge: !l.some((t) => t.afterLoss >= 0 && t.afterLoss <= REVENGE_MIN),
      count: l.length <= usual,
      hours: !l.some((t) => red.has(Math.floor(t.min / 30))),
      size: dayU > -2,
    };
    return { c, score: Object.values(c).filter(Boolean).length, broke: !c.revenge || !c.count || !c.hours };
  };
  // rules streak: days in a row (back from the last one) with no revenge trade, no extra trades, no red-hour trade
  for (let i = keys.length - 1; i >= 0 && !checks(days[keys[i]]).broke; i--) out.streak++;

  if (!withReveal) return out;
  const last = keys[keys.length - 1];
  const nyNow = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) + 'T12:00:00Z');
  const ageDays = Math.round((nyNow - new Date(last + 'T12:00:00Z')) / 864e5);
  if (ageDays > 3) return out;
  const l = days[last], k = checks(l);
  const net = l.reduce((s, t) => s + t.net, 0), uSum = l.reduce((s, t) => s + t.u, 0);
  const hasR = l.some((t) => t.r !== null);
  const wins = l.filter((t) => t.net > 0).length;
  const d = new Date(last + 'T12:00:00Z');
  const label = ageDays === 0 ? 'TODAY' : `LAST SESSION · ${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`.toUpperCase();
  const mood = net >= 0 ? 'green' : k.broke ? 'bad' : 'red';
  const R = {
    key: last, label, mood, net: Math.round(net * 100) / 100, u: hasR ? Math.round(uSum * 10) / 10 : null, n: l.length, wins, score: k.score, checks: k.c,
    quote: pick(QUOTES[mood], d.getUTCDate() + u.id),
  };
  const sumDays = (pred) => keys.filter(pred).reduce((s, x) => s + days[x].reduce((a, t) => a + t.u, 0), 0);
  if (mood === 'green') {
    const best = [...l].sort((a, b) => b.net - a.net)[0];
    R.best = { id: best.id, sym: best.symbol, v: best.r !== null ? fmtU(best.r) : null, net: best.net };
    const wk = new Date(d); wk.setUTCDate(wk.getUTCDate() - ((wk.getUTCDay() + 6) % 7));
    R.week = fmtU(sumDays((x) => x >= wk.toISOString().slice(0, 10) && x <= last));
  } else {
    // what usually happens on the day after a red day
    const nexts = keys.slice(0, -1).map((x, i) => [x, keys[i + 1]]).filter(([x]) => days[x].reduce((s, t) => s + t.net, 0) < 0)
      .map(([, y]) => days[y].reduce((s, t) => s + t.u, 0));
    R.after = nexts.length >= 2 ? fmtU(nexts.reduce((s, v) => s + v, 0) / nexts.length) : null;
    R.month = fmtU(sumDays((x) => x.slice(0, 7) === last.slice(0, 7)));
    if (mood === 'bad') {
      const fix = !k.c.revenge ? ['Traded right after a loss', 'Wait 30 min after a loss']
        : !k.c.hours ? ['Traded in a red hour', 'No trades in your red hours']
          : [`${l.length} trades, usual is ${usual - 1}`, `Stop at ${usual - 1} trades`];
      R.slip = fix[0]; R.fix = fix[1];
    }
  }
  out.reveal = R;
  out.cur = l[l.length - 1].currency || '';
  return out;
}

module.exports = function welcome(app, { db, requireUser }) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('intro_welcome')) db.exec('ALTER TABLE users ADD COLUMN intro_welcome INTEGER NOT NULL DEFAULT 1');          // 0 = no welcome after sign-in
  if (!cols.includes('intro_reveal')) db.exec("ALTER TABLE users ADD COLUMN intro_reveal TEXT NOT NULL DEFAULT 'always'");      // always | green | never

  // GET /api/intro?reveal=1  data for the overlay (only fetched when something is due today)
  app.get('/api/intro', requireUser, (req, res) => {
    const u = req.user;
    if (!isStudent(u)) return res.json({ ok: false });
    const want = req.query.reveal === '1' && req.hasJournal && u.intro_reveal !== 'never';
    const d = build(db, u, { withReveal: want });
    if (d.reveal && u.intro_reveal === 'green' && d.reveal.mood !== 'green') d.reveal = null;
    res.json({ ok: true, ...d, welcome: !!u.intro_welcome, pref: u.intro_reveal });
  });

  // POST /api/intro/pref { welcome: 0|1 } or { reveal: always|green|never }
  app.post('/api/intro/pref', requireUser, require('express').json(), (req, res) => {
    const b = req.body || {};
    if ('welcome' in b) db.prepare('UPDATE users SET intro_welcome = ? WHERE id = ?').run(b.welcome ? 1 : 0, req.user.id);
    if (['always', 'green', 'never'].includes(b.reveal)) db.prepare('UPDATE users SET intro_reveal = ? WHERE id = ?').run(b.reveal, req.user.id);
    res.json({ ok: true });
  });

  return { isStudent };
};
module.exports.build = build;
