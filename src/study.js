// Study room (/journal/study): a full-screen PC workbench where closed trades are studied and turned into setups.
//   Left   - "To study" (trades the Journal EA recorded that have not been studied yet) and the member's setups
//   Middle - the board: the trade's MT5 chart (its saved candles) plus screenshots from other platforms, each one
//            marked up with Chart Ink (hand-drawn arrows, boxes, lines, handwriting; public/study.js)
//   Right  - the trade, its environment (asked one question at a time; same answers = same setup), notes, grade
//   Compare - this trade next to past trades of the same setup;  Playbook - every setup's curve, numbers and pairs
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
    CREATE TABLE IF NOT EXISTS study_words (user_id INTEGER NOT NULL, room TEXT NOT NULL, qk TEXT NOT NULL, word TEXT NOT NULL, UNIQUE (user_id, room, qk, word));`);
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
    return { id: t.id, symbol: t.symbol, side: t.side, lots: t.lots, entry: t.entry, exit: t.exit, sl: t.sl, tp: t.tp, digits: t.digits,
      open: t.open_time, close: t.close_time, net: t.net, r: t.r, cur: t.currency || '', tf: t.tf || '', candles: candles.slice(-400),
      setup: st.setup_id || null, env: parse(st.env, []), notes: parse(st.notes, []), grade: st.grade || '', marks: parse(st.marks, []), studied: Boolean(st.studied_at), shots };
  }

  app.get('/journal/study', requireUser, (req, res) => {
    if (!req.hasJournal) return res.redirect('/journal');
    const uid = req.user.id;
    // which room: students get the order flow room; others the room for the edge they picked at sign-up (users.profile.edge)
    let prof = {}; try { prof = JSON.parse(req.user.profile || '{}') || {}; } catch (e) { /* ignore */ }
    const student = Boolean(req.mentorEligible || req.user.is_admin);
    const rooms = roomsFor(req);
    if (rooms.includes(String(req.query.room)) && req.query.room !== req.user.study_room) db.prepare('UPDATE users SET study_room = ? WHERE id = ?').run(String(req.query.room), uid);
    const auto = student ? 'flow' : ({ pa: 'pa', ict: 'ict', breakout: 'pa' }[prof.edge] || 'own');
    const room = [req.query.room, req.user.study_room].map(String).find((r) => rooms.includes(r)) || auto;
    const RN = { flow: 'Order flow', pa: 'Price action', ict: 'ICT / SMC', own: 'My own' };

    // trades still to study (newest first), and the one on the board
    const inbox = db.prepare(`SELECT t.id, t.symbol, t.side, t.close_time, t.net, t.r, (SELECT COUNT(*) FROM study_shots s WHERE s.user_id = t.user_id AND s.trade_id = t.id) AS shots
      FROM journal_trades t LEFT JOIN study_trades st ON st.user_id = t.user_id AND st.trade_id = t.id
      WHERE t.user_id = ? AND st.studied_at IS NULL ORDER BY t.close_time DESC LIMIT 40`).all(uid);
    const left = db.prepare(`SELECT COUNT(*) AS n FROM journal_trades t LEFT JOIN study_trades st ON st.user_id = t.user_id AND st.trade_id = t.id WHERE t.user_id = ? AND st.studied_at IS NULL`).get(uid).n;
    let cur = req.query.t ? ownTrade(uid, req.query.t) : null;
    if (!cur && inbox.length) cur = ownTrade(uid, inbox[0].id);
    if (!cur) cur = db.prepare('SELECT * FROM journal_trades WHERE user_id = ? ORDER BY close_time DESC LIMIT 1').get(uid);

    // setups of this room with every studied trade's R (oldest first) -> curves, cards, pairs
    const sets = db.prepare('SELECT id, name, rule FROM study_setups WHERE user_id = ? AND room = ? ORDER BY id').all(uid, room);
    const studied = db.prepare(`SELECT st.setup_id, st.env, t.id, t.r, t.net, t.close_time FROM study_trades st JOIN journal_trades t ON t.id = st.trade_id AND t.user_id = st.user_id
      WHERE st.user_id = ? AND st.studied_at IS NOT NULL AND st.setup_id IS NOT NULL ORDER BY t.close_time`).all(uid);
    const setups = sets.map((s) => { const ts = studied.filter((x) => x.setup_id === s.id);
      return { id: s.id, n: s.name, rule: s.rule, r: ts.map((x) => Math.round((x.r || 0) * 100) / 100), last: ts.length ? ts[ts.length - 1].close_time : '', trades: ts.map((x) => ({ id: x.id, r: x.r, close: x.close_time })) }; });
    const pairs = {};
    studied.forEach((x) => { const s = sets.find((q) => q.id === x.setup_id); if (!s) return;
      parse(x.env, []).slice(1).flat().filter((w) => !s.name.toLowerCase().includes(String(w).toLowerCase())).forEach((w) => { const k = s.name + '\u0001' + w; (pairs[k] = pairs[k] || [s.name, w, 0, 0]); pairs[k][2]++; pairs[k][3] += x.r || 0; }); });
    const words = db.prepare('SELECT qk, word FROM study_words WHERE user_id = ? AND room = ?').all(uid, room);
    const used = db.prepare('SELECT COUNT(*) AS n FROM study_shots WHERE user_id = ?').get(uid).n;
    const data = { room, trade: cur ? tradeData(uid, cur) : null, inbox, left, setups, words,
      pairs: Object.values(pairs).filter((p) => p[2] >= 2).sort((a, b) => b[3] - a[3]).slice(0, 6).map((p) => [p[0], p[1], p[2], Math.round(p[3] * 10) / 10]),
      shots: { used, cap: CAP, perTrade: PER_TRADE } };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const tool = (t, k, title, path) => `<button type="button" class="ci-tool" data-tool="${t}" title="${title} (${k})" aria-label="${title}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg><kbd>${k}</kbd></button>`;
    page(req, res, 'Study room', `
    <link rel="stylesheet" href="/study.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Instrument+Serif:ital@0;1&family=Architects+Daughter&family=Caveat:wght@500;700&family=Kalam:wght@400;700&family=Permanent+Marker&family=Patrick+Hand&display=swap">
    <script>document.documentElement.classList.add('sr-full')</script>

    <div class="sr-phone card"><h2>Study room works on a PC</h2><p class="muted">It is a big workbench: your chart, your screenshots and your setups side by side. Open 5abifx.com on your computer to use it.</p></div>

    <script type="application/json" id="sr-data">${json}</script>
    <div class="sr-app" id="sr-app" data-room="${room}">
      <header class="sr-top">
        <div class="sr-title"><span class="sr-k">Study room</span><h1 id="sr-setname">Absorption at value high</h1></div>
        <div class="sr-nums" id="sr-nums"></div>
        <nav class="sr-modes" aria-label="Study room views"><button class="on" data-m="study">Study</button><button data-m="compare">Compare</button><button data-m="book">Playbook</button></nav>
        <label class="sr-room" title="Your room follows the edge you picked at sign-up. Change it in Profile."><span>Room</span><select id="sr-room" onchange="location.search='?room='+this.value">${rooms.map((r) => `<option value="${r}"${r === room ? ' selected' : ''}>${RN[r]}</option>`).join('')}</select></label>
        ${data.trade ? '' : '<span class="sr-prev" title="Your trades show up here once the Journal EA records them.">Sample trade</span>'}
      </header>

      <div class="sr-body">
        <aside class="sr-lib">
          <div class="sr-sec"><div class="sr-sh"><span class="sr-k">To study</span><em class="count" id="sr-left">${left}</em></div><div id="sr-inbox"></div></div>
          <div class="sr-sec"><div class="sr-sh"><span class="sr-k">My setups</span><button type="button" class="sr-add" title="New setup">+</button></div><div id="sr-sets"></div></div>
          <p class="sr-quote" id="sr-q"></p>
        </aside>

        <main class="sr-main">
          <section class="sr-view on" id="v-study">
            <div class="sr-tabs" id="sr-tabs"></div>
            <div class="sr-board">
              <nav class="ci-rail" aria-label="Pen tools">
                ${tool('select', 'V', 'Select and move', 'M5 3l14 8-6 2-3 6z')}
                ${tool('text', 'T', 'Handwriting', 'M5 6c3-1.5 9-1.5 14 0M12 5.5c-.3 5 0 9 .3 13.5M9 19h6')}
                ${tool('arrow', 'A', 'Arrow', 'M4 19C8 13 12 9 19 5M13 5.5l6-.5-1 6')}
                ${tool('ellipse', 'O', 'Circle', 'M15 5.5C10 3.5 3.5 6 4 12s8 8 13 5.5 3-10-4-11.5')}
                ${tool('rect', 'R', 'Box', 'M3 6.5l18-.8M20 5l.6 13.5M21.5 18 3.5 18.6M4 19.5 3.6 5')}
                ${tool('line', 'L', 'Level line', 'M3 13c6-.6 12-.4 18 .3')}
                ${tool('pen', 'P', 'Pen', 'M3 17c3-6 5 2 8-3s4-7 6-4 2 6 4 4')}
                <i class="ci-sep"></i>
                <div class="ci-sws" id="ci-sws"></div>
                <button type="button" class="ci-tool" id="ci-undo" title="Undo (Ctrl+Z)" aria-label="Undo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg></button>
              </nav>
              <div class="ci-wrap">
                <div class="ci-bar" id="ci-bar"></div>
                <div class="ci-stage" id="ci-stage"><canvas id="ci-cv" width="1600" height="900"></canvas><textarea class="ci-type" id="ci-type" hidden spellcheck="false"></textarea><div class="ci-hint" id="ci-hint" hidden>Paste (Ctrl+V) or drop a screenshot here</div></div>
              </div>
            </div>
            <div class="sr-strip"><span class="sr-k">Same setup before</span><div id="sr-past"></div><button type="button" class="ci-act" data-go="compare">Compare side by side</button></div>
          </section>

          <section class="sr-view" id="v-compare"><div class="sr-cmp" id="sr-cmp"></div></section>

          <section class="sr-view" id="v-book">
            <div class="sr-bk-top">
              <div class="sr-curve"><div class="sr-sh"><span class="sr-k">Each setup over time, in R</span><span class="sr-chips" id="sr-flt"><button class="on">All</button><button>Wins</button><button>Losses</button></span></div><canvas id="sr-curves"></canvas><div class="sr-leg" id="sr-leg"></div></div>
              <div class="sr-pairs"><span class="sr-k">Setup pairs</span><p class="muted small">Trades where two things lined up, best first.</p><div id="sr-pairs"></div></div>
            </div>
            <div class="sr-tbl"><div class="sr-tr sr-th"><span>Setup</span><span>Curve</span><span>Per trade</span><span>Profit factor</span><span>Won</span><span>Trades</span><span>Last traded</span></div><div id="sr-cards"></div></div>
          </section>
        </main>

        <aside class="sr-insp" id="sr-insp">
          <div class="sr-tcard">
            <div class="sr-trow"><b>XAUUSD</b><span class="sr-side">Sell</span><span class="sr-when">Thu 20 Nov · 09:42</span></div>
            <div class="sr-big"><span class="neg">−1.0R</span><small>−$184</small></div>
            <div class="sr-ladder" aria-label="Target 4000.0, entry 4012.4, stop 4018.6"><i class="tp"></i><i class="sl"></i><u></u></div>
            <div class="sr-lv"><span>Target<b>4000.0</b></span><span>Entry<b>4012.4</b></span><span>Stop<b>4018.6</b></span></div>
            <p class="sr-meta">Held 42 min · New York session · recorded by the Journal EA</p>
          </div>
          <div class="sr-itabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-p="env">Environment</button><button type="button" role="tab" data-p="notes">Notes</button><button type="button" role="tab" data-p="review">Review</button></div>
          <section class="sr-pane on" id="p-env">
            <div class="sr-step" id="sr-step"></div>
            <div class="sr-rec" id="sr-rec"></div>
          </section>
          <section class="sr-pane" id="p-notes">
            <div class="sr-k sr-pk">Write it like you'd tell a friend. Short is fine.</div>
            <div class="sr-paper">
              <label>What I saw<textarea rows="3">Sellers sat on the value high. Three taps, no break.</textarea></label>
              <label>What I did<textarea rows="3">Sold the 3rd tap. Took nothing at 1R. It turned and took my stop.</textarea></label>
              <label>Next time<textarea rows="3" id="sr-next">Take half at 1R when the next level is close.</textarea></label>
            </div></section>
          <section class="sr-pane" id="p-review">
            <h3 class="sr-qh">How did you <em>trade</em> it?</h3>
            <div class="sr-chips2" id="sr-grade">${[['A+', 'Perfect, by the plan'], ['A', 'Good, small slip'], ['B', 'Right idea, poor exit'], ['C', 'Forced it'], ['F', 'Broke my rules']].map(([g, h], i) => `<button type="button" class="sr-chip${i === 2 ? ' on' : ''}" data-h="${h}"><b>${g}</b></button>`).join('')}</div>
            <p class="sr-hint" id="sr-gh">Right idea, poor exit</p>
            <label class="sr-tog"><input type="checkbox" id="sr-fix" checked><i></i><span>Add “Next time” to my Focus panel</span></label>
            ${req.mentorEligible ? '<button type="button" class="sr-link">Ask my mentor about this trade →</button>' : ''}</section>
          <div class="sr-save"><button type="button" class="sr-share" id="sr-done"><span>Save to “Absorption at value high”</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
        </aside>
      </div>
    </div>
    <script src="/study.js" defer></script>`);
  });

  const json = express.json({ limit: '200kb' });
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
    res.json({ ok: true, setup: setupId, fixed });
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
