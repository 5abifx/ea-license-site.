// Side columns on wide PC screens (public/side.js + side.css): the Focus panel (fixes ticked each day, goals, notes),
// market sessions on a globe, a quote, the last session, "Watch out today" (the member's repeat mistakes, from the
// Insights leaks), a 3D garage, and a small "Request a feature" button (Admin > Requests).
// Focus is saved on the account (users.focus, small JSON) so it follows the member to every device.
const express = require('express');
const { analyze } = require('./insights');

const QUOTES = [
  ['The goal is not to trade a lot. It is to trade <em>well</em>, and let the rest go.'],
  ['One red day is a lesson. <em>Two</em> in a row is a pattern. Stop and read it.'],
  ['Your stop is a decision you made with a clear head. <em>Respect</em> that version of you.'],
  ['The market pays patience. It charges <em>hurry</em>.'],
  ['You do not need every move. You need <em>your</em> move.'],
  ['Protect the account first. Profits come to the ones still <em>in the game</em>.'],
  ['A plan you skip is just a <em>wish</em>.'],
  ['Small losses are the cost of business. Big losses are the cost of <em>ego</em>.'],
  ['Sit on your hands until the setup <em>comes to you</em>.'],
  ['Discipline is doing the boring thing, <em>again</em>, on the day you do not feel like it.'],
  ['The best trade today might be <em>no trade</em>.'],
  ['Fix one habit this week. That is how the curve <em>bends</em>.'],
  ['Revenge is not a strategy. <em>Close the chart</em>, take a walk.'],
  ['Trade the market in front of you, not the one you <em>wanted</em>.'],
  ['Your journal remembers what your mind <em>forgets</em>.'],
  ['Win or lose, write it down. <em>Honest notes</em> build real edges.'],
  ['Calm hands, clear rules, <em>small size</em>.'],
  ['Every pro was once a beginner who <em>did not quit</em>.'],
  ['Green days feel good. <em>Following your rules</em> feels better, and lasts longer.'],
  ['Five rivers, one direction. <em>Stay on course</em>.'],
  ['Risk what you can lose without <em>flinching</em>.'],
  ['The open is loud. Let it <em>settle</em> before you speak.'],
  ['Being early is the same as being <em>wrong</em>. Wait for your signal.'],
  ['Consistency is not exciting. That is why it <em>works</em>.'],
  ['A missed trade costs nothing. A forced one costs <em>twice</em>.'],
  ['Know your number for the day. Hit it, <em>walk away</em>.'],
  ['Losses are tuition. Make sure you <em>learn the lesson</em>.'],
  ['The chart does not know your bills. Trade the <em>setup</em>, not the need.'],
  ['Your edge shows up over a hundred trades, not <em>one</em>.'],
  ['Today: fewer trades, <em>better trades</em>.'],
  ['Strong mind, small stop, <em>big patience</em>.'],
  ['Write the plan. Trade the plan. <em>Review</em> the plan.'],
  ['Funded traders are not lucky. They are <em>repeatable</em>.'],
  ['If you would not take it again, do not take it <em>now</em>.'],
  ['Slow is smooth. Smooth is <em>fast</em>.'],
  ['The market will be open tomorrow. Make sure <em>your account is too</em>.'],
  ['You are building a career, not a <em>highlight reel</em>.'],
  ['Mistakes repeated are choices. <em>Choose again</em>.'],
  ['Courage is taking the stop. <em>Wisdom</em> is placing it right.'],
  ['Show up, follow the rules, <em>log it</em>. Repeat.'],
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
let uid = 0;
const newId = () => (Date.now().toString(36) + (uid++).toString(36)).slice(-10);

// keep only what the panel needs: up to 6 fixes (each with the days it was kept), 3 goals, one note
function clean(raw) {
  let o = {};
  try { o = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (e) { o = {}; }
  const cut = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const fixes = (Array.isArray(o.fixes) ? o.fixes : []).slice(0, 6).map((f) => ({
    id: /^[a-z0-9]{1,12}$/.test(f && f.id) ? f.id : newId(),
    text: str(f && f.text, 80),
    days: Object.fromEntries(Object.keys((f && f.days) || {}).filter((d) => DAY.test(d) && d >= cut && f.days[d]).slice(-400).map((d) => [d, 1])),
    done: f && f.done && DAY.test(f.done) ? f.done : undefined,
  })).filter((f) => f.text);
  const goals = (Array.isArray(o.goals) ? o.goals : []).slice(0, 3).map((g) => ({
    id: /^[a-z0-9]{1,12}$/.test(g && g.id) ? g.id : newId(), text: str(g && g.text, 70), pct: Math.max(0, Math.min(100, Math.round(Number(g && g.pct) || 0))),
  })).filter((g) => g.text);
  return { fixes, goals, notes: str(o.notes, 600), saved: DAY.test(o.saved) ? o.saved : '' };
}

module.exports = function setup(app, { db, page, requireUser, requireAdmin, esc }) {
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'focus')) db.exec("ALTER TABLE users ADD COLUMN focus TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS feature_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL,
    page TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL DEFAULT 'new')`);
  const json = express.json({ limit: '24kb' });
  const money = (v, cur) => `${v < 0 ? '−' : '+'}${cur === 'USD' || !cur ? '$' : ''}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur && cur !== 'USD' ? ' ' + cur : ''}`;

  // everything the side columns show, in one call
  app.get('/api/side', requireUser, (req, res) => {
    const u = req.user;
    const out = { focus: clean(u.focus), quote: QUOTES[Math.floor(Math.random() * QUOTES.length)][0], last: null, watch: [] };
    if (req.hasJournal) {
      const live = 'user_id = ? AND account_number IN (SELECT account_number FROM accounts WHERE user_id = ?)';
      const latest = db.prepare(`SELECT close_time, currency FROM journal_trades WHERE ${live} ORDER BY close_time DESC LIMIT 1`).get(u.id, u.id);
      if (latest) {
        const cur = latest.currency || 'USD', day = latest.close_time.slice(0, 10);
        const ts = db.prepare(`SELECT net, r, balance_after FROM journal_trades WHERE ${live} AND substr(close_time, 1, 10) = ? ORDER BY close_time`).all(u.id, u.id, day);
        const net = ts.reduce((s, t) => s + (t.net || 0), 0), rs = ts.map((t) => (Number.isFinite(t.r) ? t.r : null));
        // a red day is shown as the way back, not as a red number: the R needed at 1% risk of the balance
        const bal = [...ts].reverse().find((t) => t.balance_after > 0);
        const startBal = bal ? bal.balance_after - net : 0;
        const backR = net < 0 && startBal > 0 ? Math.ceil((-net / (startBal * 0.01)) * 10) / 10 : null;
        out.last = { day, net, text: money(net, cur), lost: net < 0 ? money(net, cur).replace(/^[+−-]/, '') : '', backR, n: ts.length, wins: ts.filter((t) => t.net > 0).length,
          r: rs.every((r) => r !== null) ? Math.round(rs.reduce((s, r) => s + r, 0) * 100) / 100 : null, trades: ts.slice(-8).map((t) => ({ net: t.net, r: t.r })) };
        const since = new Date(Date.parse(day + 'T00:00:00Z') - 89 * 864e5).toISOString().slice(0, 10);
        const rows = db.prepare(`SELECT id, account_number, symbol, side, lots, entry, exit, sl, tp, open_time, close_time, net, r, risk_pct,
          balance_after, mfe, mae, candles, setup, emotion, mistakes, grade, followed, rating FROM journal_trades WHERE ${live} AND close_time >= ? ORDER BY close_time`).all(u.id, u.id, since);
        try {
          const A = analyze(rows, { money: (v) => money(v, cur), esc });
          if (!A.locked) out.watch = A.items.filter((i) => i.tone === 'bad').slice(0, 4).map((i) => ({ tag: i.tag || '', title: i.title,
            text: String(i.html || '').replace(/<[^>]+>/g, '').slice(0, 220), fix: i.fix || '', cost: i.saved > 0 ? money(-i.saved, cur) : '' }));
          else out.watchNeed = A.need - A.have;
        } catch (e) { /* insights are optional here */ }
      }
    }
    res.json(out);
  });

  // save the Focus panel
  app.post('/api/focus', requireUser, json, (req, res) => {
    const f = clean(req.body);
    db.prepare('UPDATE users SET focus = ? WHERE id = ?').run(JSON.stringify(f), req.user.id);
    res.json(f);
  });

  // "Request a feature"
  app.post('/api/feature', requireUser, json, (req, res) => {
    const text = str(req.body && req.body.text, 1000);
    if (text.length < 3) return res.status(400).json({ error: 'Tell us a little more.' });
    const recent = db.prepare("SELECT COUNT(*) n FROM feature_requests WHERE user_id = ? AND created_at > datetime('now', '-1 day')").get(req.user.id).n;
    if (recent >= 10) return res.status(429).json({ error: 'Thanks! That is plenty for today.' });
    db.prepare('INSERT INTO feature_requests (user_id, text, page) VALUES (?, ?, ?)').run(req.user.id, text, str(req.body.page, 120));
    res.json({ ok: true });
  });

  app.get('/admin/requests', requireAdmin, (req, res) => {
    const rows = db.prepare(`SELECT f.*, u.email, u.name FROM feature_requests f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 500`).all();
    res.send(page(req, 'Feature requests', `<h1>Feature requests</h1>
      <p class="muted">What members asked for from the small + button on wide screens. Newest first.</p>
      ${rows.length ? `<div class="card"><table><thead><tr><th>When</th><th>Member</th><th>Request</th><th>Page</th></tr></thead><tbody>${rows.map((r) => `<tr>
        <td class="muted small">${esc(r.created_at.slice(0, 16))}</td><td><a href="/admin/user/${r.user_id}">${esc(r.name || r.email || '#' + r.user_id)}</a></td>
        <td>${esc(r.text)}</td><td class="muted small">${esc(r.page)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card"><p class="muted">No requests yet.</p></div>'}`));
  });
};
module.exports.clean = clean;
