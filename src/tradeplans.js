// Trade plans and "What we found".
// A plan is written before the trade (on the site now; from KATANA in a later update), matched to the MT5 trade by
// pair + direction when it opens within MATCH_AFTER minutes, then shown next to the result with the cost of each slip.
// "What we found" answers questions most traders can't answer about their own trading, each with one Fix line.
const { prep, analyze } = require('./insights');

const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Range'];
const CHECKS = [['bias', 'Bias agrees'], ['news', 'No news in 30 min'], ['aplus', 'A+ setup'], ['session', 'Inside my session']];
const MATCH_BEFORE = 30;     // minutes: a trade opened a little before the plan was saved still counts
const MATCH_AFTER = 240;     // minutes: about 4 hours
const MISSED_AFTER = 7 * 24 * 60;   // a plan with no trade after a week is closed as "no trade taken"
const NY_DEFAULT = 7;
const SESS = [['Asia', 19 * 60, 3 * 60], ['London', 3 * 60, 8 * 60], ['NY AM', 8 * 60, 12 * 60], ['NY PM', 12 * 60, 17 * 60], ['After hours', 17 * 60, 19 * 60]];

const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const ts = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + (String(s).length <= 19 ? 'Z' : '')) : NaN);
const median = (l) => { const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const symKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sameSym = (a, b) => { const x = symKey(a), y = symKey(b); return !!x && !!y && (x.startsWith(y) || y.startsWith(x)); };

function init(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS trade_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number TEXT NOT NULL DEFAULT '',
    symbol TEXT NOT NULL, side TEXT NOT NULL,            -- BUY | SELL
    entry REAL NOT NULL, sl REAL NOT NULL, tp REAL NOT NULL,
    risk_pct REAL, risk_money REAL, lots REAL, balance REAL,
    setup TEXT NOT NULL DEFAULT '', checks TEXT NOT NULL DEFAULT '[]', reason TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'site',                 -- site | katana
    plan_time TEXT NOT NULL,                             -- broker clock, like journal_trades.open_time
    status TEXT NOT NULL DEFAULT 'open',                 -- open | matched | missed
    trade_id INTEGER REFERENCES journal_trades(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_plans_user ON trade_plans(user_id, status)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_trade ON trade_plans(trade_id) WHERE trade_id IS NOT NULL');
}

// the broker clock now: New York time + the trader's offset (same clock as the trades)
function brokerNow(offset = NY_DEFAULT, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) + offset * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
}

// link open plans to the trade they became; close plans that never got a trade
function match(db, u) {
  const open = db.prepare("SELECT * FROM trade_plans WHERE user_id = ? AND status = 'open' ORDER BY plan_time").all(u.id);
  if (!open.length) return;
  const nowMs = ts(brokerNow(u.ny_offset ?? NY_DEFAULT));
  const taken = new Set(db.prepare('SELECT trade_id FROM trade_plans WHERE user_id = ? AND trade_id IS NOT NULL').all(u.id).map((r) => r.trade_id));
  const rows = db.prepare('SELECT id, account_number, symbol, side, open_time FROM journal_trades WHERE user_id = ? AND open_time IS NOT NULL ORDER BY open_time DESC LIMIT 2000').all(u.id);
  const set = db.prepare('UPDATE trade_plans SET status = ?, trade_id = ? WHERE id = ?');
  open.forEach((p) => {
    const at = ts(p.plan_time);
    const hit = rows.filter((t) => {
      const o = ts(t.open_time);
      return !taken.has(t.id) && t.side === p.side && o >= at - MATCH_BEFORE * 60e3 && o <= at + MATCH_AFTER * 60e3
        && sameSym(t.symbol, p.symbol) && (!p.account_number || p.account_number === t.account_number);
    }).sort((a, b) => Math.abs(ts(a.open_time) - at) - Math.abs(ts(b.open_time) - at))[0];
    if (hit) { taken.add(hit.id); set.run('matched', hit.id, p.id); } else if (nowMs - at > MISSED_AFTER * 60e3) set.run('missed', null, p.id);
  });
}

// money per 1.0 price move for this trade's size, from its own result (or its risk)
function moneyPerPoint(t) {
  const gross = fin(t.profit) ? Number(t.profit) : Number(t.net);
  if (fin(t.exit) && fin(t.entry) && Number(t.exit) !== Number(t.entry) && Number.isFinite(gross) && gross) return Math.abs(gross / (t.exit - t.entry));
  if (fin(t.risk_money) && fin(t.sl) && fin(t.entry) && Number(t.sl) !== Number(t.entry)) return Math.abs(t.risk_money / (t.entry - t.sl));
  return null;
}

// plan next to result: one row per part of the plan, with what each slip cost
function compare(p, t) {
  const dir = p.side === 'SELL' ? -1 : 1, k = moneyPerPoint(t);
  const dist = Math.abs(p.entry - p.sl), tol = dist * 0.1;
  const rows = [];
  const cost = (pts) => (k ? pts * k : null);
  const slip = (t.entry - p.entry) * dir;            // > 0: a worse price than planned
  rows.push(slip <= tol
    ? { ok: true, label: 'Entry as planned', detail: `Plan ${p.entry} · got ${t.entry}` }
    : { ok: false, label: 'Entry worse than planned', detail: `Plan ${p.entry} · got ${t.entry}`, cost: cost(slip), kind: 'risk' });
  if (fin(p.risk_pct) && fin(t.risk_pct)) {
    rows.push(t.risk_pct <= p.risk_pct * 1.1
      ? { ok: true, label: 'Risk as planned', detail: `Plan ${(+p.risk_pct).toFixed(1)}% · took ${(+t.risk_pct).toFixed(1)}%` }
      : { ok: false, label: 'Risked more than planned', detail: `Plan ${(+p.risk_pct).toFixed(1)}% · took ${(+t.risk_pct).toFixed(1)}%`,
        cost: fin(t.risk_money) ? t.risk_money * (1 - p.risk_pct / t.risk_pct) : null, kind: 'risk' });
  }
  if (!fin(t.sl)) rows.push({ ok: false, label: 'No stop on the trade', detail: `Plan stop ${p.sl}` });
  else {
    const wider = (p.sl - t.sl) * dir;               // > 0: the stop sat further away than planned
    rows.push(wider > tol
      ? { ok: false, label: 'Stop moved further away', detail: `${p.sl} → ${t.sl}`, cost: cost(wider), kind: 'risk' }
      : { ok: true, label: 'Stop kept', detail: `Plan ${p.sl} · trade ${t.sl}` });
  }
  const reach = (t.exit - p.tp) * dir, lossPlan = cost(dist);
  if (reach >= -tol) rows.push({ ok: true, label: 'Target reached', detail: `Plan ${p.tp} · out at ${t.exit}` });
  else if (t.net > 0) rows.push({ ok: false, label: 'Closed before target', detail: `Plan ${p.tp} · out at ${t.exit}`, cost: cost(-reach), kind: 'left' });
  else if (lossPlan && -t.net > lossPlan * 1.15) rows.push({ ok: false, label: 'Lost more than the plan allowed', detail: `Plan stop ${p.sl} · out at ${t.exit}`, cost: -t.net - lossPlan, kind: 'risk' });
  else rows.push({ ok: true, label: 'Loss kept to the plan', detail: `Plan stop ${p.sl} · out at ${t.exit}` });
  return { rows, followed: rows.filter((r) => r.ok).length, total: rows.length, planPays: cost(Math.abs(p.tp - p.entry)), planLoss: lossPlan, k };
}

// the plan lines (white) and what the trade did (orange) on one small price chart
function chartSvg(p, t, { W = 520, H = 190 } = {}) {
  const ps = [p.entry, p.sl, p.tp, t.entry, t.exit, t.sl].filter(fin).map(Number);
  let lo = Math.min(...ps), hi = Math.max(...ps); const pad = (hi - lo) * 0.14 || 1; lo -= pad; hi += pad;
  const y = (v) => +(H - 14 - ((v - lo) / (hi - lo)) * (H - 28)).toFixed(1);
  const L = 64, R = W - 10, ex = R - 46;
  const line = (v, txt) => `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" class="pv-pl"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="pv-plt">${txt}</text>`;
  const movedStop = fin(t.sl) && Math.abs(t.sl - p.sl) > Math.abs(p.entry - p.sl) * 0.1;
  return `<svg viewBox="0 0 ${W} ${H}" class="pvr-svg" role="img" aria-label="Plan lines in white, what the trade did in orange">
    ${line(p.tp, 'Target')}${line(p.entry, 'Entry')}${line(p.sl, 'Stop')}
    ${movedStop ? `<line x1="${L + 90}" x2="${R}" y1="${y(t.sl)}" y2="${y(t.sl)}" class="pv-ac pv-acd"/><text x="${R}" y="${y(t.sl) - 6}" text-anchor="end" class="pv-act">your stop</text>` : ''}
    <path d="M${L + 24} ${y(t.entry)} C ${L + 140} ${y(t.entry)}, ${ex - 120} ${y(t.exit)}, ${ex} ${y(t.exit)}" class="pv-ac"/>
    <circle cx="${L + 24}" cy="${y(t.entry)}" r="4" class="pv-acc"/><circle cx="${ex}" cy="${y(t.exit)}" r="4.5" class="pv-acc"/>
    <text x="${ex + 9}" y="${y(t.exit) + 4}" class="pv-act">out</text></svg>`;
}

// ---------- What we found ----------
const nyMin = (t, off) => { const d = new Date((Number.isFinite(t.o) ? t.o : t.c) - off * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const sessOf = (m) => (SESS.find(([, a, b]) => (a < b ? m >= a && m < b : m >= a || m < b)) || ['Other'])[0];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (t) => { const d = new Date(t.c); return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

function found(rows, plansByTrade, { money, esc, off = NY_DEFAULT, planHref = '/journal/plan' }) {
  const T = prep(rows);
  if (T.length < 5) return null;
  const sum = (l) => l.reduce((s, t) => s + t.net, 0);
  const amt = (v) => String(money(Math.abs(v))).replace(/^[+−-]/, '');
  const winPct = (l) => (l.length ? Math.round((l.filter((t) => t.net > 0).length / l.length) * 100) : 0);
  const side = (t) => (t.side === 'SELL' ? 'sell' : 'buy');
  const Q = [];
  const losses = T.filter((t) => t.net < 0), avgLoss = losses.length ? -sum(losses) / losses.length : 0;

  // 1 best trade, and where the best trades come from
  const wins = T.filter((t) => t.net > 0).sort((a, b) => b.net - a.net);
  if (wins.length) {
    const best = wins[0], bySess = {};
    wins.slice(0, 5).forEach((t) => { const s = sessOf(nyMin(t, off)); bySess[s] = (bySess[s] || 0) + 1; });
    const [ses, n] = Object.entries(bySess).sort((a, b) => b[1] - a[1])[0];
    Q.push({ q: 'What was your best trade?', a: money(best.net), tone: 'pos',
      sub: `${esc(best.symbol)} ${side(best)} · ${when(best)}${best.r !== null ? ` · ${best.r >= 0 ? '+' : '−'}${Math.abs(best.r).toFixed(1)}R` : ''}`,
      fix: n >= 3 && wins.length >= 5 ? `${n} of your 5 best trades came in ${ses} (New York time). Trade more there.` : 'Open it and write down why it worked, so you can spot the next one.',
      href: `/journal/${best.id}` });
  }
  // 2 biggest loss, against the usual loss
  const worst = [...T].sort((a, b) => a.net - b.net)[0];
  if (worst && worst.net < 0) {
    const x = avgLoss ? -worst.net / avgLoss : 1;
    Q.push({ q: 'What was your biggest loss?', a: money(worst.net), tone: 'neg',
      sub: `${esc(worst.symbol)} ${side(worst)} · ${when(worst)} · ${x.toFixed(1)}× your usual loss`,
      fix: x >= 2 ? `Keep every loss near your usual ${amt(avgLoss)}. Never widen the stop; let KATANA hold it.` : 'It stayed close to your usual loss. That was a controlled loss.',
      href: `/journal/${worst.id}` });
  }
  // 3 real risk per trade
  const rk = T.filter((t) => fin(t.risk_pct)).slice(-60);
  if (rk.length >= 5) {
    const vals = rk.map((t) => Number(t.risk_pct)), mid = median(vals);
    const planned = median(rk.map((t) => plansByTrade[t.id]?.risk_pct).filter(fin));
    const base = planned || mid, over = rk.filter((t) => t.risk_pct > base * 1.3);
    const lost = sum(over.filter((t) => t.net < 0));
    const mx = Math.max(...vals, base * 1.5), w = 300 / rk.length;
    const bars = rk.map((t, i) => { const h = Math.max(2, (t.risk_pct / mx) * 46); return `<rect x="${(i * w + 0.5).toFixed(1)}" y="${(50 - h).toFixed(1)}" width="${Math.max(1, w - 1.5).toFixed(1)}" height="${h.toFixed(1)}"${t.risk_pct > base * 1.3 ? ' class="o"' : ''}/>`; }).join('');
    const by = (50 - (base / mx) * 46).toFixed(1);
    Q.push({ q: 'How much do you really risk per trade?', a: `${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)}%`,
      sub: `${over.length} of your last ${rk.length} trades went over ${base.toFixed(1)}%${lost ? ` · ${amt(lost)} lost on them` : ''}`,
      chart: `<svg viewBox="0 0 300 52" class="fq-bars" preserveAspectRatio="none" aria-hidden="true">${bars}<line x1="0" x2="300" y1="${by}" y2="${by}"/></svg>`,
      fix: over.length ? `Set KATANA to ${base.toFixed(1)}% and keep every trade there.` : `Your risk is steady around ${base.toFixed(1)}%. Keep it there.` });
  }
  // 4 the habit that costs the most (from Insights)
  const A = analyze(rows, { money, esc });
  const leak = !A.locked && [...A.items].filter((i) => i.tone === 'bad').sort((a, b) => (b.saved || 0) - (a.saved || 0))[0];
  if (leak) Q.push({ q: 'Which habit costs you the most?', a: esc(leak.tag), tone: 'acc', sub: leak.saved ? `About ${amt(leak.saved)} in this period` : esc(leak.title), fix: leak.fix, href: '/journal/insights' });
  // 5 left on the table: wins closed before their target (the plan's, else the trade's TP)
  const early = T.filter((t) => t.net > 0 && fin(t.exit)).map((t) => {
    const tp = fin(plansByTrade[t.id]?.tp) ? Number(plansByTrade[t.id].tp) : fin(t.tp) ? Number(t.tp) : null, k = moneyPerPoint(t);
    if (tp === null || !k) return null;
    const left = (tp - t.exit) * t.dir * k;
    return left > Math.abs(t.net) * 0.1 ? left : null;
  }).filter((v) => v !== null);
  if (early.length) Q.push({ q: 'How much did you leave on the table?', a: amt(early.reduce((s, v) => s + v, 0)), tone: 'acc',
    sub: `${early.length} winning trade${early.length > 1 ? 's' : ''} closed before the target`, fix: 'Take half at 1R and let the rest run to the target.' });
  // 6 stops moved (needs plans)
  const pl = T.filter((t) => plansByTrade[t.id]);
  if (pl.length) {
    const moved = pl.filter((t) => { const p = plansByTrade[t.id]; return fin(t.sl) && (p.sl - t.sl) * t.dir > Math.abs(p.entry - p.sl) * 0.1; });
    const bad = moved.filter((t) => t.net < 0);
    Q.push({ q: 'How often do you move your stop?', a: `${moved.length} time${moved.length === 1 ? '' : 's'}`,
      sub: moved.length ? `${bad.length} of them ended as losses${bad.length ? ` (${amt(sum(bad))})` : ''}` : `in ${pl.length} planned trade${pl.length > 1 ? 's' : ''}`,
      fix: moved.length ? 'The stop in the plan is final. If the trade needs more room, it was the wrong trade.' : 'Your stops stayed where you planned them. Keep it that way.' });
  } else Q.push({ q: 'How often do you move your stop?', a: '?', empty: true, sub: 'The journal needs your plan to know where the stop was meant to be.', fix: 'Plan your next trade before you take it.', href: planHref });
  // 7 planned vs not
  const un = T.filter((t) => !plansByTrade[t.id]);
  if (pl.length >= 3 && un.length >= 3) Q.push({ q: 'Do your planned trades do better?', a: `${winPct(pl)}% vs ${winPct(un)}%`,
    sub: `Win rate with a plan (${pl.length}) vs without one (${un.length})`,
    fix: winPct(pl) >= winPct(un) ? 'Your plans work. Plan every trade before you take it.' : 'Your plans are not better yet. Check the plan vs result of each one.' });
  else Q.push({ q: 'Do your planned trades do better?', a: '?', empty: true, sub: `${pl.length} planned trade${pl.length === 1 ? '' : 's'} so far. The answer shows after 3.`, fix: 'Plan your next trade before you take it.', href: planHref });
  return { count: T.length, items: Q };
}

function foundHtml(F) {
  if (!F) return '';
  return `<section class="found">
    <div class="row between"><h2>What we found</h2><span class="muted small">Last 90 days · ${F.count} trades</span></div>
    <div class="fq-grid">${F.items.map((x, i) => `<${x.href ? `a href="${x.href}"` : 'div'} class="fq${x.empty ? ' empty' : ''}">
      <span class="fq-n">${String(i + 1).padStart(2, '0')}</span>
      <span class="fq-q">${x.q}</span>
      <b class="fq-a${x.tone ? ' ' + x.tone : ''}">${x.a}</b>
      <span class="fq-s">${x.sub}</span>${x.chart || ''}
      <span class="fq-fix"><i>Fix</i>${x.fix}</span></${x.href ? 'a' : 'div'}>`).join('')}</div></section>`;
}

module.exports = { init, brokerNow, match, compare, chartSvg, found, foundHtml, moneyPerPoint, sameSym, SETUPS, CHECKS, MATCH_AFTER };
