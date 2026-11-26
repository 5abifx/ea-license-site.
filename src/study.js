// Study room (/journal/study): an open canvas, like a whiteboard, where closed trades are studied and turned into setups.
//   Boards   - every setup gets its own endless board; members can add free boards too (study_boards.data = items + marks)
//   Tabs     - clicking a trade opens it on its own board (study_boards.trade_id), shown as a tab like a browser tab
//   Canvas   - trade frames (the trade's MT5 candles), screenshots, sticky notes, handwriting, hand-drawn boxes/arrows/lines
//   Trades   - right panel: account buttons, search, To study / Studied, wins / losses; drag a trade onto the board
//   Question - click a trade: the same one-question-at-a-time panel as sign-up (environment), notes, grade, save to setup
// Rooms: students get the order flow room; others the room for the edge picked at sign-up (price action, ICT, own).
// Screenshots are stored as JPEG BLOBs (max 1600 px wide) with a per-member cap. PC only (phones get a short note).
const express = require('express');
const CAP = Number(process.env.STUDY_SHOT_CAP) || 150;     // screenshots per member (5 GB disk; ~150 KB each)
const PER_TRADE = 6;                                         // screenshots per trade
const ROOMS = ['flow', 'pa', 'ict', 'own'];
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f<>]/g, '').trim().slice(0, n);
const arr = (v, n, m) => (Array.isArray(v) ? v : []).map((x) => clean(x, m)).filter(Boolean).slice(0, n);

module.exports = (app, { db, page, requireUser }) => {
  db.exec(`CREATE TABLE IF NOT EXISTS study_setups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, room TEXT NOT NULL, name TEXT NOT NULL, rule TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (user_id, room, name));
    CREATE TABLE IF NOT EXISTS study_trades (
      user_id INTEGER NOT NULL, trade_id INTEGER NOT NULL, setup_id INTEGER, env TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '[]',
      grade TEXT NOT NULL DEFAULT '', marks TEXT NOT NULL DEFAULT '[]', studied_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, trade_id));
    CREATE TABLE IF NOT EXISTS study_shots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, trade_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '',
      marks TEXT NOT NULL DEFAULT '[]', bytes INTEGER NOT NULL DEFAULT 0, jpg BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS study_shots_trade ON study_shots(user_id, trade_id);
    CREATE TABLE IF NOT EXISTS study_boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, room TEXT NOT NULL, name TEXT NOT NULL, setup_id INTEGER,
      data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS study_boards_user ON study_boards(user_id, room);
    CREATE TABLE IF NOT EXISTS study_words (user_id INTEGER NOT NULL, room TEXT NOT NULL, qk TEXT NOT NULL, word TEXT NOT NULL, UNIQUE (user_id, room, qk, word));`);
  // a trade opened from the Trades list gets its own board, shown as a tab (open = tab still open)
  const bcols = db.prepare('PRAGMA table_info(study_boards)').all().map((c) => c.name);
  if (!bcols.includes('trade_id')) db.exec('ALTER TABLE study_boards ADD COLUMN trade_id INTEGER');
  if (!bcols.includes('open')) db.exec('ALTER TABLE study_boards ADD COLUMN open INTEGER NOT NULL DEFAULT 0');
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'study_room')) db.exec("ALTER TABLE users ADD COLUMN study_room TEXT NOT NULL DEFAULT ''");

  const roomsFor = (req) => (req.mentorEligible || req.user.is_admin ? ROOMS : ROOMS.slice(1));
  const ownTrade = (uid, id) => db.prepare('SELECT * FROM journal_trades WHERE id = ? AND user_id = ?').get(Number(id) || 0, uid);
  const parse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
  const marksOk = (m) => (Array.isArray(m) ? JSON.stringify(m.slice(0, 200)) : '[]');
  const journalOnly = (req, res, next) => (req.hasJournal ? next() : res.status(403).json({ error: 'The Study room comes with the Trade Journal.' }));

  // everything the page needs for one trade, as JSON (also used by Compare for a past trade)
  function tradeData(uid, t) {
    const st = db.prepare('SELECT * FROM study_trades WHERE user_id = ? AND trade_id = ?').get(uid, t.id) || {};
    const shots = db.prepare('SELECT id, name, marks FROM study_shots WHERE user_id = ? AND trade_id = ? ORDER BY id').all(uid, t.id)
      .map((x) => ({ id: x.id, name: x.name, marks: parse(x.marks, []) }));
    let candles = parse(t.candles, []); if (!Array.isArray(candles)) candles = [];
    return { id: t.id, acct: t.account_number, symbol: t.symbol, side: t.side, lots: t.lots, entry: t.entry, exit: t.exit, sl: t.sl, tp: t.tp, digits: t.digits,
      open: t.open_time, close: t.close_time, net: t.net, r: t.r, cur: t.currency || '', tf: t.tf || '', candles: candles.slice(-400),
      setup: st.setup_id || null, env: parse(st.env, []), notes: parse(st.notes, []), grade: st.grade || '', marks: parse(st.marks, []), studied: Boolean(st.studied_at), shots };
  }

  const json = express.json({ limit: '200kb' });
  const RN = { flow: 'Order flow', pa: 'Price action', ict: 'ICT / SMC', own: 'My own' };
  function roomOf(req) {
    let prof = {}; try { prof = JSON.parse(req.user.profile || '{}') || {}; } catch (e) { /* ignore */ }
    const rooms = roomsFor(req), student = Boolean(req.mentorEligible || req.user.is_admin);
    if (rooms.includes(String(req.query.room)) && req.query.room !== req.user.study_room) db.prepare('UPDATE users SET study_room = ? WHERE id = ?').run(String(req.query.room), req.user.id);
    const auto = student ? 'flow' : ({ pa: 'pa', ict: 'ict', breakout: 'pa' }[prof.edge] || 'own');
    return { rooms, room: [req.query.room, req.user.study_room].map(String).find((r) => rooms.includes(r)) || auto };
  }
  // one board per setup (made when first needed) + the member's own free boards
  function ensureSetupBoard(uid, room, setupId, name) {
    const b = db.prepare('SELECT id FROM study_boards WHERE user_id = ? AND setup_id = ?').get(uid, setupId);
    if (b) return b.id;
    return Number(db.prepare('INSERT INTO study_boards (user_id, room, name, setup_id) VALUES (?, ?, ?, ?)').run(uid, room, name, setupId).lastInsertRowid);
  }
  // setups of a room with every studied trade's R (oldest first)
  function setupStats(uid, room) {
    const sets = db.prepare('SELECT id, name, rule FROM study_setups WHERE user_id = ? AND room = ? ORDER BY id').all(uid, room);
    const studied = db.prepare(`SELECT st.setup_id, t.id, t.r, t.close_time FROM study_trades st JOIN journal_trades t ON t.id = st.trade_id AND t.user_id = st.user_id
      WHERE st.user_id = ? AND st.studied_at IS NOT NULL AND st.setup_id IS NOT NULL ORDER BY t.close_time`).all(uid);
    return sets.map((s) => { const ts = studied.filter((x) => x.setup_id === s.id);
      return { id: s.id, n: s.name, rule: s.rule, r: ts.map((x) => Math.round((x.r || 0) * 100) / 100), last: ts.length ? ts[ts.length - 1].close_time : '' }; });
  }
  // accounts with trades (hidden ones left out), newest first
  function accounts(uid) {
    const hidden = new Set(db.prepare('SELECT account_number FROM journal_hidden WHERE user_id = ?').all(uid).map((a) => a.account_number));
    return db.prepare(`SELECT t.account_number AS num, COUNT(*) AS n, MAX(t.broker) AS broker,
        SUM(CASE WHEN st.studied_at IS NULL THEN 1 ELSE 0 END) AS todo
      FROM journal_trades t LEFT JOIN study_trades st ON st.user_id = t.user_id AND st.trade_id = t.id
      WHERE t.user_id = ? GROUP BY t.account_number ORDER BY MAX(t.close_time) DESC`).all(uid)
      .filter((a) => !hidden.has(a.num)).map((a) => ({ num: a.num, n: a.n, todo: a.todo, name: `${clean(a.broker, 18) || 'Account'} ••${String(a.num).slice(-3)}` }));
  }

  app.get('/journal/study', requireUser, (req, res) => {
    if (!req.hasJournal) return res.redirect('/journal');
    const uid = req.user.id, { rooms, room } = roomOf(req);
    const setups = setupStats(uid, room);
    setups.forEach((s) => ensureSetupBoard(uid, room, s.id, s.n));
    if (!db.prepare('SELECT 1 FROM study_boards WHERE user_id = ? AND room = ? AND setup_id IS NULL AND trade_id IS NULL').get(uid, room)) db.prepare("INSERT INTO study_boards (user_id, room, name) VALUES (?, ?, 'My board')").run(uid, room);
    let want = Number(req.query.b) || 0;
    // ?t=<trade>: open that trade on its own board (its own tab), made the first time
    const tr = req.query.t ? ownTrade(uid, req.query.t) : null;
    if (tr) {
      const tb = db.prepare('SELECT id FROM study_boards WHERE user_id = ? AND trade_id = ?').get(uid, tr.id);
      if (tb) { want = tb.id; db.prepare('UPDATE study_boards SET open = 1 WHERE id = ?').run(tb.id); }
      else {
        const side = String(tr.side).toLowerCase() === 'sell' ? 'sell' : 'buy', data = { items: [{ id: 't' + tr.id, type: 'trade', tid: tr.id, x: 0, y: 0, w: 900 }] };
        want = Number(db.prepare('INSERT INTO study_boards (user_id, room, name, trade_id, open, data) VALUES (?, ?, ?, ?, 1, ?)').run(uid, room, clean(`${tr.symbol} ${side}`, 50), tr.id, JSON.stringify(data)).lastInsertRowid);
      }
    }
    const boards = db.prepare('SELECT id, name, setup_id AS setup, trade_id AS trade, open, updated_at FROM study_boards WHERE user_id = ? AND room = ? AND (trade_id IS NULL OR open = 1 OR id = ?) ORDER BY setup_id IS NULL, name').all(uid, room, want);
    const cur = boards.find((b) => b.id === want) || boards.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
    const board = db.prepare('SELECT data FROM study_boards WHERE id = ?').get(cur.id);
    // the open trade tabs, oldest first, with the trade's day and result for the tab label
    const tabs = boards.filter((b) => b.trade).sort((a, b) => a.id - b.id).slice(-12).map((b) => { const t = db.prepare('SELECT close_time, net, r FROM journal_trades WHERE id = ? AND user_id = ?').get(b.trade, uid) || {};
      return { id: b.id, trade: b.trade, name: b.name, close: t.close_time || '', net: t.net || 0, r: t.r || 0 }; });
    const accts = accounts(uid), used = db.prepare('SELECT COUNT(*) AS n FROM study_shots WHERE user_id = ?').get(uid).n;
    const words = db.prepare('SELECT qk, word FROM study_words WHERE user_id = ? AND room = ?').all(uid, room);
    const data = { room, rooms: rooms.map((r) => [r, RN[r]]), board: { id: cur.id, name: cur.name, setup: cur.setup, trade: cur.trade || null, data: parse(board.data, {}) },
      boards: boards.filter((b) => !b.trade).map((b) => ({ id: b.id, name: b.name, setup: b.setup })), tabs, setups, accts, words, mentor: Boolean(req.mentorEligible), shots: { used, cap: CAP } };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    page(req, res, 'Study room', `
    <link rel="stylesheet" href="/study.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Architects+Daughter&family=Caveat:wght@500;700&display=swap">
    <script>document.documentElement.classList.add('sr-full')</script>
    <div class="sr-phone card"><h2>Study room works on a PC</h2><p class="muted">It is a big open board: your trades, screenshots and notes side by side. Open 5abifx.com on your computer to use it.</p></div>
    <script type="application/json" id="sr-data">${json}</script>
    <div class="sr-app" id="sr-app" data-room="${room}"><h1 class="sr-vh">Study room</h1>
      <div class="sr-vp" id="sr-vp"><div class="sr-world" id="sr-world"><svg class="sr-ink" id="sr-ink"></svg></div></div>
      <div class="sr-isl" id="sr-tl"></div>
      <nav class="sr-isl" id="sr-tabs" hidden aria-label="Open trades"></nav>
      <div class="sr-isl" id="sr-boards" hidden></div>
      <nav class="sr-isl" id="sr-tools" aria-label="Tools"></nav>
      <div class="sr-isl" id="sr-props" hidden></div>
      <aside class="sr-isl sr-side" id="sr-drawer" aria-label="Trades"></aside>
      <aside class="sr-isl sr-side" id="sr-insp" hidden aria-label="This trade"></aside>
      <button type="button" class="sr-isl sr-tab" id="sr-tab" hidden></button>
      <div class="sr-isl" id="sr-zoom"></div>
      <div class="sr-hint" id="sr-hint"></div>
      <div class="sr-toast" id="sr-toast" hidden role="status"></div>
      <input type="file" id="sr-file" accept="image/*" hidden>
    </div>
    <script src="/study.js" defer></script>`);
  });

  // the trade list on the right: one account (or all), To study / Studied, wins / losses, search; 60 at a time
  app.get('/journal/study/trades.json', requireUser, journalOnly, (req, res) => {
    const uid = req.user.id, q = req.query, w = ['t.user_id = ?'], a = [uid];
    const accts = accounts(uid);
    if (q.acct && accts.some((x) => x.num === q.acct)) { w.push('t.account_number = ?'); a.push(q.acct); } else { w.push(`t.account_number IN (${accts.map(() => '?').join(',') || "''"})`); a.push(...accts.map((x) => x.num)); }
    if (q.st === 'todo') w.push('st.studied_at IS NULL'); else if (q.st === 'done') w.push('st.studied_at IS NOT NULL');
    if (q.res === 'win') w.push('t.net > 0'); else if (q.res === 'loss') w.push('t.net <= 0');
    const s = clean(q.q, 30).toLowerCase(); if (s) { w.push('(LOWER(t.symbol) LIKE ? OR LOWER(COALESCE(ss.name, \'\')) LIKE ? OR LOWER(t.setup) LIKE ?)'); a.push(`%${s}%`, `%${s}%`, `%${s}%`); }
    const from = `FROM journal_trades t LEFT JOIN study_trades st ON st.user_id = t.user_id AND st.trade_id = t.id LEFT JOIN study_setups ss ON ss.id = st.setup_id WHERE ${w.join(' AND ')}`;
    const off = Math.max(0, Number(q.off) || 0), total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...a).n;
    const rows = db.prepare(`SELECT t.id, t.symbol, t.side, t.net, t.r, t.close_time AS close, t.account_number AS acct, ss.name AS setup, st.studied_at IS NOT NULL AS done ${from}
      ORDER BY t.close_time DESC LIMIT 60 OFFSET ?`).all(...a, off);
    res.set('Cache-Control', 'no-store').json({ rows, total, more: off + rows.length < total });
  });
  // a board: save its items and marks (auto-saved), rename, new, delete
  const big = express.json({ limit: '1500kb' });
  const ownBoard = (uid, id) => db.prepare('SELECT * FROM study_boards WHERE id = ? AND user_id = ?').get(Number(id) || 0, uid);
  app.post('/journal/study/board/:id', requireUser, journalOnly, big, (req, res) => {
    const b = ownBoard(req.user.id, req.params.id); if (!b) return res.status(404).json({ error: 'Board not found.' });
    const d = req.body && req.body.data; if (!d || typeof d !== 'object') return res.status(400).json({ error: 'Nothing to save.' });
    const out = { items: (Array.isArray(d.items) ? d.items : []).slice(0, 400), shapes: (Array.isArray(d.shapes) ? d.shapes : []).slice(0, 800), view: d.view && typeof d.view === 'object' ? d.view : null };
    db.prepare("UPDATE study_boards SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(out), b.id);
    res.json({ ok: true });
  });
  app.post('/journal/study/boards/new', requireUser, journalOnly, json, (req, res) => {
    const { room } = roomOf(req), name = clean(req.body && req.body.name, 50) || 'New board';
    if (db.prepare('SELECT COUNT(*) AS n FROM study_boards WHERE user_id = ? AND trade_id IS NULL').get(req.user.id).n >= 60) return res.status(400).json({ error: 'You have 60 boards already. Delete one first.' });
    res.json({ ok: true, id: Number(db.prepare('INSERT INTO study_boards (user_id, room, name) VALUES (?, ?, ?)').run(req.user.id, room, name).lastInsertRowid) });
  });
  app.post('/journal/study/board/:id/rename', requireUser, journalOnly, json, (req, res) => {
    const b = ownBoard(req.user.id, req.params.id); if (!b) return res.status(404).json({ error: 'Board not found.' });
    const name = clean(req.body && req.body.name, 50); if (!name) return res.status(400).json({ error: 'Type a name first.' });
    if (b.setup_id) return res.status(400).json({ error: 'Setup boards keep the setup name.' });
    db.prepare('UPDATE study_boards SET name = ? WHERE id = ?').run(name, b.id); res.json({ ok: true });
  });
  app.post('/journal/study/board/:id/close', requireUser, journalOnly, (req, res) => {
    const b = ownBoard(req.user.id, req.params.id); if (!b || !b.trade_id) return res.status(404).json({ error: 'Tab not found.' });
    db.prepare('UPDATE study_boards SET open = 0 WHERE id = ?').run(b.id); res.json({ ok: true });
  });
  app.post('/journal/study/board/:id/delete', requireUser, journalOnly, (req, res) => {
    const b = ownBoard(req.user.id, req.params.id); if (!b) return res.status(404).json({ error: 'Board not found.' });
    if (b.setup_id) return res.status(400).json({ error: 'A setup board stays while the setup has trades.' });
    db.prepare('DELETE FROM study_boards WHERE id = ?').run(b.id); res.json({ ok: true });
  });
  // screenshot dropped on a board (not tied to one trade)
  app.post('/journal/study/board/:id/shot', requireUser, journalOnly, express.raw({ type: 'image/jpeg', limit: '700kb' }), (req, res) => {
    const uid = req.user.id, bd = ownBoard(uid, req.params.id); if (!bd) return res.status(404).json({ error: 'Board not found.' });
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length < 100 || b[0] !== 0xff || b[1] !== 0xd8) return res.status(400).json({ error: 'That is not a picture.' });
    const used = db.prepare('SELECT COUNT(*) AS n FROM study_shots WHERE user_id = ?').get(uid).n;
    if (used >= CAP) return res.status(400).json({ error: `You have used all ${CAP} screenshots. Delete old ones to add more.` });
    const id = db.prepare('INSERT INTO study_shots (user_id, trade_id, name, bytes, jpg) VALUES (?, ?, ?, ?, ?)').run(uid, bd.trade_id || 0, clean(req.query.name, 30) || 'Screenshot', b.length, b).lastInsertRowid;
    res.json({ ok: true, id: Number(id), used: used + 1, cap: CAP });
  });

  // a past trade for Compare
  app.get('/journal/study/trade/:id.json', requireUser, journalOnly, (req, res) => {
    const t = ownTrade(req.user.id, req.params.id); if (!t) return res.status(404).json({ error: 'Trade not found.' });
    res.set('Cache-Control', 'no-store').json(tradeData(req.user.id, t));
  });
  // save the study of one trade: environment answers, notes, grade, MT5 chart marks, and the setup it belongs to
  app.post('/journal/study/:id/save', requireUser, journalOnly, json, (req, res) => {
    const uid = req.user.id, t = ownTrade(uid, req.params.id); if (!t) return res.status(404).json({ error: 'Trade not found.' });
    const b = req.body || {}, room = roomsFor(req).includes(b.room) ? b.room : 'own';
    const env = (Array.isArray(b.env) ? b.env : []).slice(0, 6).map((g) => arr(g, 12, 40));
    const notes = [0, 1, 2].map((i) => clean((Array.isArray(b.notes) ? b.notes : [])[i], 1200)), grade = ['A+', 'A', 'B', 'C', 'F'].includes(b.grade) ? b.grade : '';
    let setupId = null; const name = clean(b.setup, 70);
    if (b.done && name) {
      db.prepare('INSERT OR IGNORE INTO study_setups (user_id, room, name) VALUES (?, ?, ?)').run(uid, room, name);
      setupId = db.prepare('SELECT id FROM study_setups WHERE user_id = ? AND room = ? AND name = ?').get(uid, room, name).id;
      // the trade also lands on its setup's board (to the right of what is there)
      const bid = ensureSetupBoard(uid, room, setupId, name), bd = parse(db.prepare('SELECT data FROM study_boards WHERE id = ?').get(bid).data, {}) || {};
      bd.items = Array.isArray(bd.items) ? bd.items : [];
      if (!bd.items.some((o) => o && o.type === 'trade' && o.tid === t.id)) {
        const n = bd.items.filter((o) => o && o.type === 'trade').length;
        bd.items.push({ id: 'b' + Date.now().toString(36), type: 'trade', tid: t.id, x: (n % 3) * 660, y: Math.floor(n / 3) * 420, w: 600 });
        db.prepare("UPDATE study_boards SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(bd), bid);
      }
    }
    db.prepare(`INSERT INTO study_trades (user_id, trade_id, setup_id, env, notes, grade, marks, studied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, trade_id) DO UPDATE SET setup_id = COALESCE(excluded.setup_id, setup_id), env = excluded.env, notes = excluded.notes,
      grade = excluded.grade, marks = excluded.marks, studied_at = COALESCE(excluded.studied_at, studied_at), updated_at = datetime('now')`)
      .run(uid, t.id, setupId, JSON.stringify(env), JSON.stringify(notes), grade, marksOk(b.marks), b.done ? new Date().toISOString() : null);
    // "Next time" -> a fix in the Focus panel (max 6 fixes, like the panel itself)
    let fixed = false;
    if (b.done && b.fix && notes[2]) {
      const u = db.prepare('SELECT focus FROM users WHERE id = ?').get(uid); const f = parse(u && u.focus, {}) || {};
      f.fixes = Array.isArray(f.fixes) ? f.fixes : []; const text = notes[2].slice(0, 80);
      if (f.fixes.length < 6 && !f.fixes.some((x) => x.text === text)) { f.fixes.push({ id: Math.random().toString(36).slice(2, 10), text, days: {} }); db.prepare('UPDATE users SET focus = ? WHERE id = ?').run(JSON.stringify(f), uid); fixed = true; }
    }
    res.json({ ok: true, setup: setupId, fixed, board: setupId ? db.prepare('SELECT id FROM study_boards WHERE user_id = ? AND setup_id = ?').get(uid, setupId).id : null });
  });
  // set a setup's one-line rule
  app.post('/journal/study/setup/:id/rule', requireUser, journalOnly, json, (req, res) => {
    db.prepare('UPDATE study_setups SET rule = ? WHERE id = ? AND user_id = ?').run(clean(req.body && req.body.rule, 120), Number(req.params.id) || 0, req.user.id);
    res.json({ ok: true });
  });
  // the member's own words for a question (e.g. FVG)
  app.post('/journal/study/word', requireUser, journalOnly, json, (req, res) => {
    const b = req.body || {}, room = ROOMS.includes(b.room) ? b.room : 'own', word = clean(b.word, 28), qk = clean(b.qk, 20);
    if (!word || !qk) return res.status(400).json({ error: 'Type a word first.' });
    if (db.prepare('SELECT COUNT(*) AS n FROM study_words WHERE user_id = ?').get(req.user.id).n >= 200) return res.status(400).json({ error: 'You have 200 words already.' });
    db.prepare('INSERT OR IGNORE INTO study_words (user_id, room, qk, word) VALUES (?, ?, ?, ?)').run(req.user.id, room, qk, word);
    res.json({ ok: true });
  });
  // screenshots: upload (JPEG, already shrunk in the browser), marks, picture, delete
  app.post('/journal/study/:id/shot', requireUser, journalOnly, express.raw({ type: 'image/jpeg', limit: '700kb' }), (req, res) => {
    const uid = req.user.id, t = ownTrade(uid, req.params.id); if (!t) return res.status(404).json({ error: 'Trade not found.' });
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length < 100 || b[0] !== 0xff || b[1] !== 0xd8) return res.status(400).json({ error: 'That is not a picture.' });
    const used = db.prepare('SELECT COUNT(*) AS n FROM study_shots WHERE user_id = ?').get(uid).n;
    if (used >= CAP) return res.status(400).json({ error: `You have used all ${CAP} screenshots. Delete old ones to add more.` });
    if (db.prepare('SELECT COUNT(*) AS n FROM study_shots WHERE user_id = ? AND trade_id = ?').get(uid, t.id).n >= PER_TRADE) return res.status(400).json({ error: `Up to ${PER_TRADE} screenshots per trade.` });
    const id = db.prepare('INSERT INTO study_shots (user_id, trade_id, name, bytes, jpg) VALUES (?, ?, ?, ?, ?)').run(uid, t.id, clean(req.query.name, 30) || 'Screenshot', b.length, b).lastInsertRowid;
    res.json({ ok: true, id: Number(id), used: used + 1, cap: CAP });
  });
  app.get('/journal/study/shot/:id.jpg', requireUser, journalOnly, (req, res) => {
    const r = db.prepare('SELECT jpg FROM study_shots WHERE id = ? AND user_id = ?').get(Number(req.params.id) || 0, req.user.id);
    if (!r) return res.status(404).end();
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }).send(r.jpg);
  });
  app.post('/journal/study/shot/:id/marks', requireUser, journalOnly, json, (req, res) => {
    db.prepare('UPDATE study_shots SET marks = ? WHERE id = ? AND user_id = ?').run(marksOk(req.body && req.body.marks), Number(req.params.id) || 0, req.user.id);
    res.json({ ok: true });
  });
  app.post('/journal/study/shot/:id/delete', requireUser, journalOnly, (req, res) => {
    db.prepare('DELETE FROM study_shots WHERE id = ? AND user_id = ?').run(Number(req.params.id) || 0, req.user.id);
    res.json({ ok: true, used: db.prepare('SELECT COUNT(*) AS n FROM study_shots WHERE user_id = ?').get(req.user.id).n });
  });
};
