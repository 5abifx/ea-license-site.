// Mentor Mode: a mentorship student shares their Trade Journal with the mentor (the site owner / admins).
// The student asks for a review on a trade; the mentor opens it, sees the chart and the student's notes,
// and leaves a note. Each side sees a count of new notes in the side menu.
//  - Student: /journal/mentor (switch sharing on/off, see every trade with notes)
//             a "Mentor review" box on each trade page (ask a question = asks for a review)
//  - Mentor:  /mentor (students who share, with 30-day numbers), /mentor/:uid (their trades),
//             /mentor/trade/:id (the trade, chart cards, the student's notes, the note thread)
// Account numbers are masked for the mentor (Account ••NN).
const { esc, fmtDate } = require('./views');

module.exports = function registerMentor(app, { db, page, flash, requireUser, requireAdmin }) {
  const uCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!uCols.includes('mentor_share')) db.exec('ALTER TABLE users ADD COLUMN mentor_share INTEGER NOT NULL DEFAULT 0');   // 1 = the student shares their journal
  const jCols = db.prepare('PRAGMA table_info(journal_trades)').all().map((c) => c.name);
  if (!jCols.includes('review_req')) db.exec('ALTER TABLE journal_trades ADD COLUMN review_req INTEGER NOT NULL DEFAULT 0');   // 1 = student asked for a review
  db.exec(`CREATE TABLE IF NOT EXISTS trade_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id   INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    author_id  INTEGER NOT NULL,
    by_mentor  INTEGER NOT NULL DEFAULT 0,
    body       TEXT NOT NULL,
    seen       INTEGER NOT NULL DEFAULT 0,          -- 1 = the other side has read it
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_trade_notes_trade ON trade_notes(trade_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_trade_notes_student ON trade_notes(student_id, by_mentor, seen)');

  // mentorship students (paid or ticked as Student); admins can try it on their own journal
  const eligible = (u) => !!u && !!(u.student || u.mentor_plan || u.is_admin);
  const money = (v, cur = '') => (v === null || v === undefined ? '-' : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}${cur ? ' ' + esc(cur) : ''}`);
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const mask = (n) => `Account ••${esc(String(n).slice(-2))}`;
  const ago = (s) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(String(s).replace(' ', 'T') + 'Z')) / 60000));
    return m < 60 ? `${m || 1}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
  };
  const clean = (v) => String(v || '').replace(/\r/g, '').trim().slice(0, 2000);

  // side menu counts: reviews waiting for the mentor, new mentor notes for the student
  app.use((req, res, next) => {
    const u = req.user;
    if (u && u.is_admin) {
      req.mentorWaiting = db.prepare(`SELECT COUNT(*) AS n FROM journal_trades t JOIN users s ON s.id = t.user_id
        WHERE t.review_req = 1 AND s.mentor_share = 1`).get().n;
    }
    if (u && eligible(u)) {
      req.mentorEligible = true;
      req.mentorNew = db.prepare('SELECT COUNT(*) AS n FROM trade_notes WHERE student_id = ? AND by_mentor = 1 AND seen = 0').get(u.id).n;
    }
    next();
  });

  const thread = (notes, meLabel) => notes.length ? `<ol class="notes">${notes.map((n) => `<li class="${n.by_mentor ? 'mentor' : 'student'}">
      <div class="note-head"><b>${n.by_mentor ? 'Mentor' : esc(meLabel)}</b><span>${esc(ago(n.created_at))}</span></div>
      <p>${esc(n.body).replace(/\n/g, '<br>')}</p></li>`).join('')}</ol>` : '';
  const notesOf = (tradeId) => db.prepare('SELECT * FROM trade_notes WHERE trade_id = ? ORDER BY id').all(tradeId);

  // ---------- student ----------
  // the box on the student's own trade page (src/journal.js calls this)
  function studentBox(req, t) {
    const u = req.user;
    if (!eligible(u)) return '';
    const notes = notesOf(t.id);
    db.prepare('UPDATE trade_notes SET seen = 1 WHERE trade_id = ? AND student_id = ? AND by_mentor = 1 AND seen = 0').run(t.id, u.id);
    if (!u.mentor_share) {
      return `<section class="card mentor-box priv-hide">
        <h2>Mentor review</h2>
        <p class="muted">Share your journal with your mentor to ask about this trade. Your mentor sees your trades, charts and notes, never your account number.</p>
        <form method="post" action="/journal/mentor/share"><input type="hidden" name="share" value="1"><input type="hidden" name="back" value="/journal/${t.id}">
          <button class="small">Share my journal with my mentor</button></form>
      </section>`;
    }
    return `<section class="card mentor-box priv-hide" id="mentor">
      <div class="row between"><h2>Mentor review</h2>${t.review_req ? '<span class="tag warn">Waiting for your mentor</span>' : notes.some((n) => n.by_mentor) ? '<span class="tag ok">Reviewed</span>' : ''}</div>
      ${thread(notes, 'You') || '<p class="muted">Ask your mentor about this trade: what you saw, why you took it, what you are unsure about.</p>'}
      <form method="post" action="/journal/${t.id}/note" class="note-form">
        <textarea name="body" rows="3" maxlength="2000" required placeholder="${notes.length ? 'Reply to your mentor' : 'e.g. I entered here because… Was my stop in the right place?'}"></textarea>
        <button class="small">${notes.length ? 'Send reply' : 'Ask for a review'}</button>
      </form>
    </section>`;
  }

  app.post('/journal/mentor/share', requireUser, (req, res) => {
    const u = req.user;
    if (!eligible(u)) return res.status(404).send('Not found');
    const on = req.body.share === '1' ? 1 : 0;
    db.prepare('UPDATE users SET mentor_share = ? WHERE id = ?').run(on, u.id);
    if (!on) db.prepare('UPDATE journal_trades SET review_req = 0 WHERE user_id = ?').run(u.id);
    flash(req, 'ok', on ? 'Your journal is shared with your mentor.' : 'Your journal is no longer shared. Your mentor cannot see it now.');
    res.redirect(/^\/journal\/\d+$/.test(req.body.back || '') ? req.body.back : '/journal/mentor');
  });

  app.post('/journal/:id/note', requireUser, (req, res) => {
    const u = req.user;
    const t = db.prepare('SELECT id FROM journal_trades WHERE id = ? AND user_id = ?').get(req.params.id, u.id);
    const body = clean(req.body.body);
    if (!t || !eligible(u) || !u.mentor_share) return res.status(404).send('Not found');
    if (body) {
      db.prepare('INSERT INTO trade_notes (trade_id, student_id, author_id, by_mentor, body) VALUES (?, ?, ?, 0, ?)').run(t.id, u.id, u.id, body);
      db.prepare('UPDATE journal_trades SET review_req = 1 WHERE id = ?').run(t.id);
      flash(req, 'ok', 'Sent to your mentor. You will see the reply here and in the side menu.');
    }
    res.redirect(`/journal/${t.id}#mentor`);
  });

  app.get('/journal/mentor', requireUser, (req, res) => {
    const u = req.user;
    if (!eligible(u)) return res.redirect('/mentorship');
    const rows = db.prepare(`SELECT t.id, t.symbol, t.side, t.net, t.r, t.close_time, t.currency, t.review_req,
        COUNT(n.id) AS notes, SUM(n.by_mentor = 1 AND n.seen = 0) AS fresh, MAX(n.created_at) AS last
      FROM journal_trades t JOIN trade_notes n ON n.trade_id = t.id
      WHERE t.user_id = ? GROUP BY t.id ORDER BY last DESC LIMIT 100`).all(u.id);
    page(req, res, 'Mentor review', `
    <div class="row between page-head"><h1>Mentor review</h1></div>
    <section class="card mentor-share">
      <div class="row between">
        <div><h2>${u.mentor_share ? 'Your journal is shared with your mentor' : 'Your journal is private'}</h2>
        <p class="muted">${u.mentor_share
          ? 'Your mentor can see your trades, charts and notes, and reply on any trade. Account numbers stay hidden.'
          : 'Share it so your mentor can look at your trades and answer your questions. You can stop sharing at any time.'}</p></div>
        <form method="post" action="/journal/mentor/share"><input type="hidden" name="share" value="${u.mentor_share ? '0' : '1'}">
          <button class="small${u.mentor_share ? ' secondary' : ''}">${u.mentor_share ? 'Stop sharing' : 'Share my journal'}</button></form>
      </div>
    </section>
    <section class="card">
      <h2>Trades with notes</h2>
      ${rows.length ? `<table class="mentor-list"><thead><tr><th>Trade</th><th>Result</th><th>Status</th><th>Last note</th><th></th></tr></thead><tbody>
        ${rows.map((t) => `<tr${t.fresh ? ' class="fresh"' : ''}>
          <td><strong>${esc(t.symbol)}</strong> ${esc(t.side)}<br><span class="muted small">${fmtDate(t.close_time)}</span></td>
          <td class="${cls(t.net)}">${money(t.net, t.currency)}${t.r !== null ? `<br><span class="muted small">${t.r >= 0 ? '+' : '−'}${Math.abs(t.r).toFixed(2)}R</span>` : ''}</td>
          <td>${t.fresh ? `<span class="tag ok">${t.fresh} new from mentor</span>` : t.review_req ? '<span class="tag warn">Waiting</span>' : '<span class="tag">Reviewed</span>'}</td>
          <td class="muted small">${esc(ago(t.last))}</td>
          <td class="right"><a class="small" href="/journal/${t.id}#mentor">Open ›</a></td></tr>`).join('')}
      </tbody></table>` : `<p class="muted">No notes yet. Open any trade in your <a href="/journal">journal</a> and use <strong>Ask for a review</strong> at the bottom.</p>`}
    </section>`);
  });

  // ---------- mentor ----------
  const student = (id) => db.prepare('SELECT * FROM users WHERE id = ? AND mentor_share = 1').get(id);

  app.get('/mentor', requireAdmin, (req, res) => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
    const rows = db.prepare(`SELECT u.id, u.name, u.email, u.mentor_plan, u.student,
        (SELECT COUNT(*) FROM journal_trades WHERE user_id = u.id AND close_time >= ?) AS n30,
        (SELECT SUM(net > 0) FROM journal_trades WHERE user_id = u.id AND close_time >= ?) AS w30,
        (SELECT SUM(net) FROM journal_trades WHERE user_id = u.id AND close_time >= ?) AS net30,
        (SELECT AVG(r) FROM journal_trades WHERE user_id = u.id AND close_time >= ? AND r IS NOT NULL) AS r30,
        (SELECT MAX(currency) FROM journal_trades WHERE user_id = u.id) AS cur,
        (SELECT MAX(close_time) FROM journal_trades WHERE user_id = u.id) AS last,
        (SELECT COUNT(*) FROM journal_trades WHERE user_id = u.id AND review_req = 1) AS waiting
      FROM users u WHERE u.mentor_share = 1 ORDER BY waiting DESC, last DESC`).all(since, since, since, since);
    const waitingTrades = db.prepare(`SELECT t.id, t.symbol, t.side, t.net, t.currency, t.close_time, u.name, u.email,
        (SELECT body FROM trade_notes WHERE trade_id = t.id ORDER BY id DESC LIMIT 1) AS ask,
        (SELECT created_at FROM trade_notes WHERE trade_id = t.id ORDER BY id DESC LIMIT 1) AS asked
      FROM journal_trades t JOIN users u ON u.id = t.user_id
      WHERE t.review_req = 1 AND u.mentor_share = 1 ORDER BY asked LIMIT 50`).all();
    const total = rows.reduce((s, r) => s + r.waiting, 0);
    page(req, res, 'Mentor', `
    <div class="row between page-head"><h1>Mentor</h1><span class="muted small">Students who share their journal with you</span></div>
    <div class="stats">
      <div><span>Sharing students</span><strong>${rows.length}</strong></div>
      <div><span>Waiting for review</span><strong class="${total ? 'warn' : ''}">${total}</strong></div>
      <div><span>Traded this week</span><strong>${rows.filter((r) => r.last && Date.parse(r.last.replace(' ', 'T') + 'Z') > Date.now() - 7 * 864e5).length}</strong></div>
    </div>
    <section class="card">
      <h2>Review queue</h2>
      ${waitingTrades.length ? `<ol class="queue">${waitingTrades.map((t) => `<li><a href="/mentor/trade/${t.id}">
        <span class="q-who"><b>${esc(t.name || t.email)}</b><small>${esc(t.symbol)} ${esc(t.side)} · <span class="${cls(t.net)}">${money(t.net, t.currency)}</span></small></span>
        <span class="q-ask">“${esc(String(t.ask || '').slice(0, 140))}${String(t.ask || '').length > 140 ? '…' : ''}”</span>
        <span class="q-time">${esc(ago(t.asked))}</span></a></li>`).join('')}</ol>`
        : '<p class="muted">Nothing waiting. Questions from students show up here.</p>'}
    </section>
    <section class="card">
      <h2>Students</h2>
      ${rows.length ? `<table class="mentor-list"><thead><tr><th>Student</th><th>Trades (30 days)</th><th>Win rate</th><th>Net</th><th>Avg R</th><th>Last trade</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td><strong>${esc(r.name || r.email)}</strong><br><span class="muted small">${esc(r.email)}</span>${r.waiting ? ` <span class="tag warn">${r.waiting} waiting</span>` : ''}</td>
        <td>${r.n30}</td>
        <td>${r.n30 ? Math.round((r.w30 / r.n30) * 100) + '%' : '-'}</td>
        <td class="${cls(r.net30)}">${r.n30 ? money(r.net30, r.cur) : '-'}</td>
        <td class="${cls(r.r30)}">${r.r30 === null ? '-' : (r.r30 >= 0 ? '+' : '−') + Math.abs(r.r30).toFixed(2) + 'R'}</td>
        <td class="muted small">${r.last ? esc(ago(r.last)) : '-'}</td>
        <td class="right"><a class="small" href="/mentor/${r.id}">Open ›</a></td></tr>`).join('')}
      </tbody></table>` : `<p class="muted">No student shares their journal yet. Students turn it on from <strong>Mentor review</strong> in their side menu, or from any trade page.</p>`}
    </section>`);
  });

  app.get('/mentor/trade/:id', requireAdmin, (req, res) => {
    const t = db.prepare('SELECT * FROM journal_trades WHERE id = ?').get(req.params.id);
    const s = t && student(t.user_id);
    if (!s) return res.status(404).send('Not found');
    db.prepare('UPDATE trade_notes SET seen = 1 WHERE trade_id = ? AND by_mentor = 0 AND seen = 0').run(t.id);
    const d = t.digits ?? 5;
    const fx = (v) => (v === null || v === undefined ? '' : Number(v).toFixed(d));
    const card = {
      handle: s.card_handle || '', symbol: t.symbol, side: t.side, lots: t.lots === null ? '' : t.lots.toFixed(2),
      entry: fx(t.entry), exit: fx(t.exit), sl: fx(t.sl), tp: fx(t.tp),
      pnl: t.net, pct: t.pct, pips: t.pips, r: t.r, open: t.open_time, close: t.close_time,
      setup: t.setup, risk: t.risk_pct === null ? '' : t.risk_pct.toFixed(1), tf: t.tf,
      partials: JSON.parse(t.partials || '[]'), candles: JSON.parse(t.candles || '[]'),
    };
    const json = JSON.stringify(card).replace(/</g, '\\u003c');
    const notes = notesOf(t.id);
    const near = db.prepare(`SELECT id, symbol, side, net, close_time FROM journal_trades WHERE user_id = ? AND id != ?
      ORDER BY ABS(julianday(close_time) - julianday(?)) LIMIT 6`).all(s.id, t.id, t.close_time);
    page(req, res, `${s.name || s.email} · ${t.symbol}`, `
    <p><a href="/mentor/${s.id}">← ${esc(s.name || s.email)}</a></p>
    <div class="row between page-head"><h1>${esc(t.symbol)} ${esc(t.side)} <span class="${cls(t.net)}">${money(t.net, t.currency)}</span></h1>
      ${t.review_req ? '<span class="tag warn">Review asked</span>' : ''}</div>
    <p class="muted">${esc(s.name || s.email)} · ${mask(t.account_number)} · ${fmtDate(t.open_time)} → ${fmtDate(t.close_time)} (broker time)</p>
    <div class="mentor-split">
      <div>
        <section class="card mentor-chart">
          <h2>Chart</h2>
          <div class="row">
            <select id="style" hidden><option value="a">a</option></select>
            <select id="mode"><option value="r">Show R multiple</option><option value="money">Show $ amount</option><option value="pct">Show % of account</option></select>
            <label class="check"><input type="checkbox" id="rm" checked> KATANA risk line</label>
          </div>
          <div class="cards">
            <figure class="big"><canvas id="c2"></canvas><button class="small secondary" data-save="c2">Save chart</button></figure>
            <figure hidden><canvas id="c1"></canvas></figure>
          </div>
        </section>
        <section class="card">
          <h2>Trade</h2>
          <table><tbody>
            <tr><th>Entry</th><td>${fx(t.entry)}</td><th>Exit</th><td>${fx(t.exit)}</td></tr>
            <tr><th>Stop loss</th><td>${fx(t.sl) || '-'}</td><th>Take profit</th><td>${fx(t.tp) || '-'}</td></tr>
            <tr><th>Lots</th><td>${t.lots ?? '-'}</td><th>R multiple</th><td>${t.r === null ? '-' : t.r.toFixed(2)}</td></tr>
            <tr><th>Risk</th><td>${t.risk_pct === null ? '-' : t.risk_pct.toFixed(2) + '%'}</td><th>Best / worst move</th><td>${fx(t.mfe) || '-'} / ${fx(t.mae) || '-'}</td></tr>
          </tbody></table>
        </section>
      </div>
      <div>
        <section class="card">
          <h2>Student's notes</h2>
          <dl class="kv">
            <dt>Setup</dt><dd>${esc(t.setup) || '<span class="muted">-</span>'}</dd>
            <dt>Emotion</dt><dd>${esc(t.emotion) || '<span class="muted">-</span>'}</dd>
            <dt>Rating</dt><dd>${t.rating ? '★'.repeat(t.rating) : '<span class="muted">-</span>'}</dd>
            <dt>Mistakes</dt><dd>${esc(t.mistakes) || '<span class="muted">-</span>'}</dd>
          </dl>
          ${t.notes ? `<p class="note-text">${esc(t.notes).replace(/\n/g, '<br>')}</p>` : ''}
        </section>
        <section class="card mentor-box" id="mentor">
          <h2>Review</h2>
          ${thread(notes, s.name || 'Student') || '<p class="muted">No questions on this trade yet. You can still leave a note; the student sees it in their side menu.</p>'}
          <form method="post" action="/mentor/trade/${t.id}/note" class="note-form">
            <textarea name="body" rows="4" maxlength="2000" placeholder="Your feedback: what was good, what to change next time"></textarea>
            <div class="row"><button class="small">Send to student</button>
            ${t.review_req ? '<button class="small secondary" name="done" value="1">Mark reviewed</button>' : ''}</div>
          </form>
        </section>
        ${near.length ? `<section class="card"><h2>Trades around it</h2><table><tbody>${near.map((x) => `<tr>
          <td><a href="/mentor/trade/${x.id}">${esc(x.symbol)} ${esc(x.side)}</a><br><span class="muted small">${fmtDate(x.close_time)}</span></td>
          <td class="right ${cls(x.net)}">${money(x.net)}</td></tr>`).join('')}</tbody></table></section>` : ''}
      </div>
    </div>
    <script id="trade-data" type="application/json">${json}</script>
    <script src="/cards.js"></script>
    <script src="/journal.js"></script>`);
  });

  app.post('/mentor/trade/:id/note', requireAdmin, (req, res) => {
    const t = db.prepare('SELECT * FROM journal_trades WHERE id = ?').get(req.params.id);
    if (!t || !student(t.user_id)) return res.status(404).send('Not found');
    const body = clean(req.body.body);
    if (body) db.prepare('INSERT INTO trade_notes (trade_id, student_id, author_id, by_mentor, body) VALUES (?, ?, ?, 1, ?)').run(t.id, t.user_id, req.user.id, body);
    if (body || req.body.done) db.prepare('UPDATE journal_trades SET review_req = 0 WHERE id = ?').run(t.id);
    flash(req, 'ok', body ? 'Sent. The student sees it on the trade and in their side menu.' : req.body.done ? 'Marked as reviewed.' : 'Type a note first.');
    // next waiting trade, so the queue can be worked through in a row
    const next = db.prepare(`SELECT t.id FROM journal_trades t JOIN users u ON u.id = t.user_id
      WHERE t.review_req = 1 AND u.mentor_share = 1 ORDER BY t.id LIMIT 1`).get();
    res.redirect(body || req.body.done ? (next ? `/mentor/trade/${next.id}` : '/mentor') : `/mentor/trade/${t.id}#mentor`);
  });

  app.get('/mentor/:uid', requireAdmin, (req, res) => {
    const s = student(req.params.uid);
    if (!s) return res.status(404).send('Not found');
    const filter = req.query.show === 'waiting' ? 'AND t.review_req = 1' : req.query.show === 'notes' ? 'AND n.n > 0' : '';
    const trades = db.prepare(`SELECT t.id, t.account_number, t.symbol, t.side, t.lots, t.net, t.r, t.close_time, t.setup, t.emotion, t.currency, t.review_req,
        COALESCE(n.n, 0) AS notes
      FROM journal_trades t LEFT JOIN (SELECT trade_id, COUNT(*) AS n FROM trade_notes GROUP BY trade_id) n ON n.trade_id = t.id
      WHERE t.user_id = ? ${filter} ORDER BY t.close_time DESC LIMIT 100`).all(s.id);
    const all = db.prepare(`SELECT COUNT(*) AS n, SUM(net > 0) AS w, SUM(net) AS net, AVG(r) AS r, MAX(currency) AS cur,
        SUM(review_req) AS waiting FROM journal_trades WHERE user_id = ? AND close_time >= ?`)
      .get(s.id, new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19).replace('T', ' '));
    const mistakes = db.prepare(`SELECT mistakes AS m, COUNT(*) AS n FROM journal_trades WHERE user_id = ? AND TRIM(COALESCE(mistakes, '')) != ''
      GROUP BY LOWER(TRIM(mistakes)) ORDER BY n DESC LIMIT 5`).all(s.id);
    const tab = (v, l) => `<a class="btn small${(req.query.show || '') === v ? '' : ' secondary'}" href="/mentor/${s.id}${v ? '?show=' + v : ''}">${l}</a>`;
    page(req, res, s.name || s.email, `
    <p><a href="/mentor">← Mentor</a></p>
    <div class="row between page-head"><h1>${esc(s.name || s.email)}</h1><span class="muted small">${esc(s.email)}</span></div>
    <div class="stats">
      <div><span>Trades (30 days)</span><strong>${all.n}</strong></div>
      <div><span>Win rate</span><strong>${all.n ? Math.round((all.w / all.n) * 100) + '%' : '-'}</strong></div>
      <div><span>Net</span><strong class="${cls(all.net)}">${all.n ? money(all.net, all.cur) : '-'}</strong></div>
      <div><span>Avg R</span><strong class="${cls(all.r)}">${all.r === null ? '-' : (all.r >= 0 ? '+' : '−') + Math.abs(all.r).toFixed(2) + 'R'}</strong></div>
      <div><span>Waiting</span><strong class="${all.waiting ? 'warn' : ''}">${all.waiting || 0}</strong></div>
    </div>
    ${mistakes.length ? `<section class="card"><h2>Mistakes they log most</h2><p class="chips">${mistakes.map((m) => `<span class="tag">${esc(m.m)} · ${m.n}</span>`).join(' ')}</p></section>` : ''}
    <section class="card">
      <div class="row between"><h2>Trades</h2><span class="row">${tab('', 'All')}${tab('waiting', 'Waiting')}${tab('notes', 'With notes')}</span></div>
      ${trades.length ? `<table class="mentor-list"><thead><tr><th>Trade</th><th>Setup</th><th>Result</th><th>Review</th><th></th></tr></thead><tbody>
      ${trades.map((t) => `<tr>
        <td><strong>${esc(t.symbol)}</strong> ${esc(t.side)} ${t.lots ?? ''}<br><span class="muted small">${fmtDate(t.close_time)} · ${mask(t.account_number)}</span></td>
        <td>${esc(t.setup) || '<span class="muted">-</span>'}${t.emotion ? `<br><span class="muted small">${esc(t.emotion)}</span>` : ''}</td>
        <td class="${cls(t.net)}">${money(t.net, t.currency)}${t.r !== null ? `<br><span class="muted small">${t.r >= 0 ? '+' : '−'}${Math.abs(t.r).toFixed(2)}R</span>` : ''}</td>
        <td>${t.review_req ? '<span class="tag warn">Waiting</span>' : t.notes ? `<span class="tag">${t.notes} note${t.notes > 1 ? 's' : ''}</span>` : ''}</td>
        <td class="right"><a class="small" href="/mentor/trade/${t.id}">Open ›</a></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">No trades here.</p>'}
    </section>`);
  });

  return { studentBox };
};
