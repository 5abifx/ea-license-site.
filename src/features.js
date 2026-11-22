// Feature usage: which parts of the members area people actually use, so we can grow what they love
// and retire what nobody touches (Admin > Feature usage, /admin/usage).
//
// HOW TO TAG A NEW FEATURE: add one line to FEATURES below. Nothing else is needed.
//   page:  (r) => true when a signed-in page view / form post is this feature
//          r = { get(path), post(path), q } where path can be a string or a RegExp
//   click: a CSS selector; a tap (or a change, for selects and switches) on it counts one use
//   Custom code can also count a use from the browser with  window.ft('feature-key').
// The date a key first appears is saved on start-up, so a new feature is marked "Too new to judge"
// for its first 14 days instead of looking unused.
//
// Privacy: first-party only. One row per member, feature and day (a count). No IP, no page content,
// no third-party scripts. Admins are recorded but left out of the numbers unless "Include my own use" is on.
const { esc } = require('./views');

const AREAS = { eas: 'EAs', journal: 'Journal', cards: 'Share cards', insights: 'Insights', desk: 'Desk', plan: 'Plan a trade', mentor: 'Mentor', account: 'Account & help' };
const isId = /^\/journal\/\d+$/;
const tab = (r, t) => r.get('/journal/insights') && (r.q.tab || 'overview') === t;

const FEATURES = [
  // EAs
  { key: 'my-eas', area: 'eas', name: 'My EAs page', page: (r) => r.get('/dashboard') },
  { key: 'ea-download', area: 'eas', name: 'Download an EA', page: (r) => r.get(/^\/download\/\d+$/) },
  { key: 'add-account', area: 'eas', name: 'Add an MT5 account', page: (r) => r.post('/accounts') },
  { key: 'copy-site', area: 'eas', name: 'Copy the WebRequest address', click: '[data-copy]' },
  // Journal
  { key: 'journal', area: 'journal', name: 'Journal page', page: (r) => r.get('/journal') },
  { key: 'calendar-day', area: 'journal', name: 'Calendar: tap a day', click: '[data-day]' },
  { key: 'month-browse', area: 'journal', name: 'Browse past months', page: (r) => r.get('/journal') && !!r.q.month },
  { key: 'account-tabs', area: 'journal', name: 'Account tabs', page: (r) => (r.get('/journal') || r.get('/journal/insights')) && !!r.q.account },
  { key: 'hide-private', area: 'journal', name: 'Hide private info switch', click: '.priv-toggle' },
  { key: 'intro-replay', area: 'journal', name: 'Replay the opening animation', click: '.replay-btn' },
  { key: 'journal-key', area: 'journal', name: 'Show / copy journal key', click: '.key-show, .key-copy' },
  { key: 'hide-account', area: 'journal', name: 'Hide an account', page: (r) => r.post(/^\/journal\/accounts\/[^/]+\/hide$/) },
  { key: 'trade-page', area: 'journal', name: 'Open a trade', page: (r) => r.get(isId) },
  { key: 'trade-notes', area: 'journal', name: 'Save trade notes, setup, emotion', page: (r) => r.post(isId) },
  { key: 'original-sl', area: 'journal', name: 'Type the original stop-loss', page: (r) => r.post(/^\/journal\/\d+\/sl$/) },
  { key: 'study-room', area: 'journal', name: 'Study room page', page: (r) => r.get('/journal/study') },
  { key: 'study-save', area: 'journal', name: 'Study room: save a trade to a setup', click: '#sr-done' },
  { key: 'study-shot', area: 'journal', name: 'Study room: add a screenshot', click: '#sr-addpic' },
  { key: 'study-board', area: 'journal', name: 'Study room: switch board', click: '#sr-boards [data-b]' },
  { key: 'study-trade', area: 'journal', name: 'Study room: put a trade on the board', click: '#sr-drawer .s-tr' },
  { key: 'trade-replay', area: 'journal', name: 'Trade replay (play candles)', click: '#tv-play, #tv-spd button' },
  { key: 'report', area: 'journal', name: 'Account report page', page: (r) => r.get('/journal/report') },
  { key: 'report-save', area: 'journal', name: 'Save a report card', click: '[data-save="r1"], [data-save="r2"], [data-save="r3"]' },
  // Share cards
  { key: 'card-save', area: 'cards', name: 'Save a trade card', click: '[data-save="c1"], [data-save="c2"]' },
  { key: 'card-share', area: 'cards', name: 'Share button (phone)', click: '[data-share]' },
  { key: 'card-style', area: 'cards', name: 'Change card style / $ % R', click: '#style, #mode, #rm' },
  { key: 'card-handle', area: 'cards', name: 'Set card @handle', page: (r) => r.post('/journal/handle') },
  { key: 'story-overlay', area: 'cards', name: 'Story overlay PNG', click: '[data-save-ov]' },
  // Insights
  { key: 'ins-overview', area: 'insights', name: 'Insights: Overview', page: (r) => tab(r, 'overview') },
  { key: 'ins-time', area: 'insights', name: 'Insights: Time (session clock)', page: (r) => tab(r, 'time') },
  { key: 'ins-habits', area: 'insights', name: 'Insights: Habits', page: (r) => tab(r, 'habits') },
  { key: 'ins-prop', area: 'insights', name: 'Insights: Prop firm', page: (r) => tab(r, 'prop') },
  { key: 'what-if', area: 'insights', name: 'What if… simulator', click: '#whatif .wi-ctl, [data-wi-reset]' },
  { key: 'session-clock', area: 'insights', name: 'Session clock: tap a session', click: 'svg.ck [data-s], .ck-l, ol.rank li, .dial-btns button' },
  { key: 'heat-tap', area: 'insights', name: 'Day × hour heatmap: tap a square', click: '[data-h][data-d]' },
  { key: 'ins-period', area: 'insights', name: 'Change Insights period', page: (r) => r.get('/journal/insights') && !!r.q.days },
  { key: 'prop-rules', area: 'insights', name: 'Save prop firm rules', page: (r) => r.post('/journal/insights/limits') },
  { key: 'ny-offset', area: 'insights', name: 'Set MT5 clock vs New York', page: (r) => r.post('/journal/settings/ny-offset') },
  // Desk
  { key: 'desk', area: 'desk', name: 'Desk page', page: (r) => r.get('/journal/desk') },
  { key: 'desk-news', area: 'desk', name: 'Desk: news day switch', click: '#tm-days button' },
  { key: 'desk-chart', area: 'desk', name: 'Desk: live chart symbols', click: 'button[data-tv]' },
  // Plan a trade
  { key: 'plan', area: 'plan', name: 'Plan a trade page', page: (r) => r.get('/journal/plan') },
  { key: 'plan-save', area: 'plan', name: 'Save a trade plan', page: (r) => r.post('/journal/plan') },
  { key: 'plan-tags', area: 'plan', name: 'Tag a plan after the trade', page: (r) => r.post(/^\/journal\/plan\/\d+\/tags$/) },
  // Mentor
  { key: 'mentor-review', area: 'mentor', name: 'Mentor review page', page: (r) => r.get('/journal/mentor') },
  { key: 'mentor-share', area: 'mentor', name: 'Share journal with mentor', page: (r) => r.post('/journal/mentor/share') },
  { key: 'mentor-ask', area: 'mentor', name: 'Ask the mentor on a trade', page: (r) => r.post(/^\/journal\/\d+\/note$/) },
  // Account & help
  { key: 'mentorship', area: 'account', name: 'Mentorship page (signed in)', page: (r) => r.get('/mentorship') },
  { key: 'plans', area: 'account', name: 'Plans page', page: (r) => r.get('/pricing') },
  { key: 'help', area: 'account', name: 'Help & FAQ', page: (r) => r.get('/faq') || r.get(/^\/help\//) },
  { key: 'support', area: 'account', name: '"Need help?" button', click: '#sup-btn' },
];
const BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
const CLICKS = FEATURES.filter((f) => f.click).map((f) => [f.key, f.click]);
const ACTIVE = '_active';   // any signed-in page view: "active members" for the reach %
const NEW_DAYS = 14;

// tiny script for the members area: counts taps on the tagged buttons (see public/ft.js)
const clientTag = () => `<script>window.__FT=${JSON.stringify(CLICKS).replace(/</g, '\\u003c')}</script><script src="/ft.js" defer></script>`;

function setup(app, { db, express, requireAdmin, page }) {
  db.exec(`CREATE TABLE IF NOT EXISTS feature_use (
    day     TEXT NOT NULL,
    feature TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    n       INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (day, feature, user_id)
  ) WITHOUT ROWID`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_feature_use_f ON feature_use(feature, day)');
  // first_seen = when the feature first appeared on the site; status/note = the owner's decision
  db.exec(`CREATE TABLE IF NOT EXISTS feature_meta (
    feature    TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL DEFAULT (date('now')),
    status     TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT ''
  )`);
  const seen = db.prepare('INSERT OR IGNORE INTO feature_meta (feature) VALUES (?)');
  FEATURES.forEach((f) => seen.run(f.key));
  try { db.prepare("DELETE FROM feature_use WHERE day < date('now', '-400 days')").run(); } catch { /* ignore */ }

  const add = db.prepare(`INSERT INTO feature_use (day, feature, user_id) VALUES (date('now'), ?, ?)
    ON CONFLICT (day, feature, user_id) DO UPDATE SET n = n + 1`);
  const last = new Map();   // user:feature -> time, so a double tap or a reload loop counts once
  const record = (uid, key) => {
    const k = `${uid}:${key}`, t = Date.now();
    if (t - (last.get(k) || 0) < 2000) return;
    last.set(k, t);
    if (last.size > 5000) last.clear();
    try { add.run(key, uid); } catch (e) { console.error('feature_use:', e.message); }
  };

  // signed-in page views and form posts
  app.use((req, res, next) => {
    const u = req.user;
    if (!u || req.path.startsWith('/api/') || req.path.startsWith('/admin') || !['GET', 'POST'].includes(req.method)) return next();
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const is = (m) => (p) => req.method === m && (typeof p === 'string' ? req.path === p : p.test(req.path));
      const r = { get: is('GET'), post: is('POST'), q: req.query || {} };
      if (req.method === 'GET' && res.statusCode < 300) record(u.id, ACTIVE);
      for (const f of FEATURES) if (f.page) { try { if (f.page(r)) record(u.id, f.key); } catch { /* bad matcher: skip */ } }
    });
    next();
  });

  // taps from public/ft.js
  app.post('/api/ft', express.text({ limit: '100b', type: '*/*' }), (req, res) => {
    const key = String(req.body || '').trim();
    if (req.user && BY_KEY[key]) record(req.user.id, key);
    res.status(204).end();
  });

  // owner's decision per feature
  const STATUS = { '': 'No decision', grow: 'Grow it', keep: 'Keep', watch: 'Watch', remove: 'Remove' };
  app.post('/admin/usage/:key', requireAdmin, (req, res) => {
    const key = req.params.key;
    if (BY_KEY[key]) {
      const st = STATUS[req.body.status] !== undefined ? req.body.status : '';
      db.prepare('INSERT INTO feature_meta (feature, status, note) VALUES (?, ?, ?) ON CONFLICT (feature) DO UPDATE SET status = excluded.status, note = excluded.note')
        .run(key, st, String(req.body.note || '').slice(0, 200));
    }
    res.redirect(`/admin/usage?${new URLSearchParams({ p: req.query.p || '', me: req.query.me || '' })}#f-${encodeURIComponent(key)}`);
  });

  app.get('/admin/usage', requireAdmin, (req, res) => {
    const P = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' };
    const days = P[req.query.p] ? Number(req.query.p) : 30;
    const me = req.query.me === '1';
    const dayAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const from = dayAgo(days - 1), prevFrom = dayAgo(2 * days - 1);
    const who = me ? '' : ' AND user_id NOT IN (SELECT id FROM users WHERE is_admin = 1)';
    const agg = (a, b) => Object.fromEntries(db.prepare(`SELECT feature AS k, COUNT(DISTINCT user_id) AS u, SUM(n) AS n FROM feature_use WHERE day >= ? AND day < ?${who} GROUP BY feature`)
      .all(a, b).map((x) => [x.k, x]));
    const cur = agg(from, '9999'), prev = agg(prevFrom, from);
    const active = (cur[ACTIVE] || { u: 0 }).u, prevActive = (prev[ACTIVE] || { u: 0 }).u;
    const meta = Object.fromEntries(db.prepare('SELECT * FROM feature_meta').all().map((m) => [m.feature, m]));
    // per-day members for the little line on each row
    const spark = {};
    db.prepare(`SELECT feature AS k, day AS d, COUNT(DISTINCT user_id) AS u FROM feature_use WHERE day >= ?${who} GROUP BY feature, day`).all(from)
      .forEach((x) => { (spark[x.k] = spark[x.k] || {})[x.d] = x.u; });
    const dayList = Array.from({ length: days }, (_, i) => dayAgo(days - 1 - i));
    const today = dayAgo(0);
    const ageDays = (k) => Math.floor((Date.parse(today) - Date.parse((meta[k] || {}).first_seen || today)) / 864e5);

    const rows = FEATURES.map((f) => {
      const c = cur[f.key] || { u: 0, n: 0 }, p = prev[f.key] || { u: 0, n: 0 };
      const reach = active ? c.u / active : 0, preach = prevActive ? p.u / prevActive : 0;
      const young = ageDays(f.key) < NEW_DAYS;
      const verdict = young ? 'new' : !c.u ? 'unused' : reach >= 0.4 ? 'loved' : reach >= 0.15 ? 'steady' : 'low';
      return { ...f, u: c.u, n: c.n, reach, delta: reach - preach, hadPrev: prevActive > 0, verdict, age: ageDays(f.key), meta: meta[f.key] || {} };
    });
    const V = { loved: ['Loved', 'ok'], steady: ['Steady', 'mid'], low: ['Low use', 'warn'], unused: ['Unused', 'bad'], new: ['Too new to judge', 'new'] };
    const sorted = [...rows].sort((a, b) => b.reach - a.reach || b.n - a.n);
    const loved = sorted.filter((r) => r.verdict === 'loved').slice(0, 5);
    const unused = rows.filter((r) => r.verdict === 'unused' || r.verdict === 'low').sort((a, b) => a.reach - b.reach);
    const decided = rows.filter((r) => r.meta.status);
    const qs = (o) => '?' + new URLSearchParams(Object.entries({ p: String(days), me: me ? '1' : '', ...o }).filter(([, v]) => v)).toString();
    const pctTxt = (x) => `${Math.round(x * 100)}%`;

    const sparkSvg = (k) => {
      const s = spark[k] || {}, mx = Math.max(1, ...dayList.map((d) => s[d] || 0)), W = 120, H = 26;
      const pts = dayList.map((d, i) => `${((i / Math.max(1, dayList.length - 1)) * W).toFixed(1)},${(H - 2 - ((s[d] || 0) / mx) * (H - 4)).toFixed(1)}`).join(' ');
      return `<svg class="fu-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
    };
    const trend = (r) => {
      if (!r.hadPrev || r.verdict === 'new') return '<span class="muted">-</span>';
      const d = Math.round(r.delta * 100);
      return d > 2 ? `<span class="fu-up">▲ ${d}</span>` : d < -2 ? `<span class="fu-down">▼ ${-d}</span>` : '<span class="muted">●</span>';
    };
    const decision = (r) => `<form method="post" action="/admin/usage/${esc(r.key)}${qs({})}" class="fu-dec">
        <select name="status" aria-label="Decision for ${esc(r.name)}" onchange="this.form.submit()">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}"${r.meta.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input name="note" value="${esc(r.meta.note || '')}" placeholder="Note" maxlength="200" aria-label="Note"><button class="small secondary">Save</button></form>`;
    const row = (r) => `<tr id="f-${esc(r.key)}" class="fu-${r.verdict}">
        <td><b>${esc(r.name)}</b><small class="muted">${esc(AREAS[r.area])}${r.click ? ' · tap' : ' · page'}${r.verdict === 'new' ? ` · added ${r.age}d ago` : ''}</small></td>
        <td><span class="fu-tag ${V[r.verdict][1]}">${V[r.verdict][0]}</span></td>
        <td class="right"><span class="fu-reach"><i style="width:${Math.round(r.reach * 100)}%"></i></span><b>${pctTxt(r.reach)}</b></td>
        <td class="right">${r.u}</td><td class="right">${r.n}</td><td class="right">${trend(r)}</td>
        <td>${sparkSvg(r.key)}</td><td>${decision(r)}</td></tr>`;
    const byArea = Object.keys(AREAS).map((a) => {
      const list = sorted.filter((r) => r.area === a);
      return list.length ? `<tbody><tr class="fu-area"><th colspan="8">${esc(AREAS[a])}</th></tr>${list.map(row).join('')}</tbody>` : '';
    }).join('');
    const pill = (r) => `<a class="fu-pill" href="#f-${esc(r.key)}"><b>${esc(r.name)}</b><span>${pctTxt(r.reach)} of members · ${r.n} uses</span></a>`;

    const body = `<section class="card fu">
      <div class="row between"><h1>Feature usage</h1>
        <form method="get" action="/admin/usage" class="vz-filters">
          <select name="p" aria-label="Period" onchange="this.form.submit()">${Object.entries(P).map(([k, l]) => `<option value="${k}"${Number(k) === days ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <label class="check small"><input type="checkbox" name="me" value="1"${me ? ' checked' : ''} onchange="this.form.submit()"> Include my own use</label>
          <noscript><button class="small">Apply</button></noscript>
        </form></div>
      <p class="muted small">What members actually use in the members area. Grow what they love, and retire what nobody touches so the site stays fast and simple. ${me ? 'Your own use is included.' : 'Your own use (admins) is left out.'}</p>
      <div class="stats vz-kpis">
        <div><span>Active members</span><strong>${active}</strong></div>
        <div><span>Most loved</span><strong class="sm">${sorted[0] && sorted[0].u ? esc(sorted[0].name) : '-'}</strong></div>
        <div><span>Features used</span><strong>${rows.filter((r) => r.u).length}<small class="muted"> / ${rows.length}</small></strong></div>
        <div><span>Remove candidates</span><strong>${rows.filter((r) => r.verdict === 'unused').length}</strong></div>
      </div>
    </section>
    <div class="fu-two">
      <section class="card"><h2>Members love</h2><p class="muted small">Used by 40% or more of active members. Build more around these.</p>
        ${loved.length ? loved.map(pill).join('') : '<p class="muted small">Nothing yet. This fills in as members use the site.</p>'}</section>
      <section class="card"><h2>Nobody uses</h2><p class="muted small">Unused or used by under 15% of members for ${days} days. Candidates to remove or rework. New features get ${NEW_DAYS} days first.</p>
        ${unused.length ? unused.slice(0, 8).map(pill).join('') : '<p class="muted small">Nothing flagged.</p>'}</section>
    </div>
    ${decided.length ? `<section class="card"><h2>Your decisions</h2><div class="fu-decided">${decided.map((r) => `<a href="#f-${esc(r.key)}"><span class="fu-tag ${r.meta.status === 'remove' ? 'bad' : r.meta.status === 'grow' ? 'ok' : 'mid'}">${STATUS[r.meta.status]}</span> ${esc(r.name)}${r.meta.note ? ` <small class="muted">· ${esc(r.meta.note)}</small>` : ''}</a>`).join('')}</div></section>` : ''}
    <section class="card"><h2>Every feature</h2>
      <p class="muted small"><b>Reach</b> = share of active members who used it. <b>Members</b> = different people. <b>Uses</b> = total taps or visits. <b>Trend</b> = reach vs the ${days} days before (points).</p>
      <div class="sd-scroll"><table class="fu-table"><thead><tr><th>Feature</th><th>Verdict</th><th class="right">Reach</th><th class="right">Members</th><th class="right">Uses</th><th class="right">Trend</th><th>Per day</th><th>Decision</th></tr></thead>
      ${byArea}</table></div>
      <p class="muted small">Adding a feature? Tag it with one line in <code>src/features.js</code> and it shows up here. One row per member, feature and day is kept for 400 days. No IP addresses, no third-party trackers.</p>
    </section>`;
    page(req, res, 'Feature usage', body);
  });
}

module.exports = { FEATURES, AREAS, clientTag, setup };
