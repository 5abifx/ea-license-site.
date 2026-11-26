// "What's new" for signed-in members (public/whatsnew.js, public/whatsnew.css).
// AUTOMATIC: every member-facing change adds its lines to src/whatsnew-notes.json in the same PR. On start-up
// (= each deploy) lines whose id is not in the database yet are published at once, so the owner does nothing.
// The owner can still add a line by hand in Admin > What's new (/admin/whatsnew). Hand-made lines wait as a draft
// until "Publish to members"; each member then sees the new lines once, as a popup (a bottom sheet on phones),
// with an orange dot on "What's new" in the menu until they close it. /whats-new lists every past update.
//
// whatsnew: one row per line. published_at NULL = draft. audience: all | students | admins.
// users.whatsnew_seen: when the member last closed the popup (NULL = never; then their sign-up date counts,
// so a new member is not shown lines from before they joined).
const express = require('express');
const { esc } = require('./views');

const AUD = { all: 'All members', students: 'Students only', admins: 'Admins only (test)' };
// icon key -> stroke path (24x24); the same set is drawn in public/whatsnew.js
const ICONS = {
  star: 'M12 3l2.5 6 6.5.5-5 4 1.5 6.5L12 16l-5.5 4 1.5-6.5-5-4 6.5-.5z',
  video: 'M4 5h16v14H4zM10 9l5 3-5 3z',
  learn: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5',
  note: 'M5 4h10l4 4v12H5zM9 12h6M9 16h4',
  chart: 'M3 17l5-6 4 4 6-8 3 4',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2',
  phone: 'M8 2h8v20H8zM11 18h2',
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 21c1-4 5-6 8-6s7 2 8 6',
  shield: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',
  spark: 'M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M5 19l3.5-3.5M15.5 8.5L19 5',
  tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  study: 'M4 19V6a2 2 0 0 1 2-2h5v15H6a2 2 0 0 0-2 2zM20 19V6a2 2 0 0 0-2-2h-5v15h5a2 2 0 0 1 2 2z',
  export: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  split: 'M3 12h7l4-6h7M14 18h7M10 12l4 6',
};
const MAX_LINE = 50, MAX_NAME = 30;
const svg = (k, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[k] || ICONS.spark}"/></svg>`;
// the popup gets the icon's path, so public/whatsnew.js needs no copy of the set
const forPop = (r) => ({ name: r.name, line: r.line, link: r.link, icon: ICONS[r.icon] || ICONS.spark });

// src/whatsnew-notes.json -> published lines (one timestamp per deploy, so they show as one update)
function syncNotes() {
  let notes = [];
  try { notes = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'whatsnew-notes.json'), 'utf8')); } catch (e) { console.error('whatsnew-notes.json:', e.message); return; }
  const have = new Set(db.prepare('SELECT note_id FROM whatsnew WHERE note_id IS NOT NULL').all().map((r) => r.note_id));
  const fresh = notes.filter((n) => n && n.id && n.name && n.line && !have.has(String(n.id)));
  if (!fresh.length) return;
  const at = db.prepare("SELECT datetime('now') AS t").get().t;
  const ins = db.prepare('INSERT INTO whatsnew (note_id, name, line, link, icon, audience, pos, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  fresh.forEach((n, i) => ins.run(String(n.id), String(n.name).slice(0, MAX_NAME), String(n.line).slice(0, MAX_LINE), cleanLink(n.link),
    ICONS[n.icon] ? n.icon : 'spark', AUD[n.audience] ? n.audience : 'all', i, at));
  console.log(`What's new: published ${fresh.length} line(s) from whatsnew-notes.json`);
}

const isStudent = (u) => !!(u.student || u.mentor_plan || u.is_admin);
const audienceSql = (u) => (u.is_admin ? "('all','students','admins')" : isStudent(u) ? "('all','students')" : "('all')");
// a link must stay on this site
const cleanLink = (v) => { const s = String(v || '').trim(); return /^(\/(?!\/)[^\s"'<>]*|#[a-z-]+)$/i.test(s) ? s.slice(0, 200) : ''; };
const fmtDay = (s) => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };

let db;
function unseen(u) {
  if (!db || !u) return [];
  const since = u.whatsnew_seen || u.created_at || '1970-01-01';
  return db.prepare(`SELECT id, name, line, link, icon, published_at FROM whatsnew WHERE published_at IS NOT NULL AND published_at > ?
    AND audience IN ${audienceSql(u)} ORDER BY published_at DESC, pos, id LIMIT 12`).all(since);
}

module.exports = function whatsnew(app, ctx) {
  db = ctx.db;
  const { page, flash, requireUser, requireAdmin } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS whatsnew (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, line TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'star', audience TEXT NOT NULL DEFAULT 'all', pos INTEGER NOT NULL DEFAULT 0,
    published_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('whatsnew_seen')) db.exec('ALTER TABLE users ADD COLUMN whatsnew_seen TEXT');
  if (!db.prepare('PRAGMA table_info(whatsnew)').all().some((c) => c.name === 'note_id')) db.exec('ALTER TABLE whatsnew ADD COLUMN note_id TEXT');
  // first start: the recent features wait as a draft, ready for the owner to check and publish
  if (!db.prepare('SELECT 1 FROM whatsnew LIMIT 1').get()) {
    const ins = db.prepare('INSERT INTO whatsnew (name, line, link, icon, pos) VALUES (?, ?, ?, ?, ?)');
    [['Share Studio', 'Motion cards for your day, week and month', '/journal/studio', 'video'],
      ['Log trade', 'Add feelings and an A+ to F grade', '/journal/log', 'note'],
      ['Motion trade cards', '7-second video of any trade', '/journal', 'chart'],
      ['Candle clock', 'See where in the candle you enter', '/journal/insights?tab=time', 'clock'],
      ['Install the app', 'Add 5ABI.FX to your home screen', '/?install=1', 'phone'],
      ['Public profile', 'Share your page, earn from referrals', '/profile', 'user'],
      ['Guided tour', 'Replay it any time from the menu', '#tour', 'star'],
    ].forEach((r, i) => ins.run(...r, i));
  }
  syncNotes();

  // the member closed the popup (or opened /whats-new)
  app.post('/api/whatsnew/seen', requireUser, (req, res) => {
    db.prepare("UPDATE users SET whatsnew_seen = datetime('now') WHERE id = ?").run(req.user.id);
    res.json({ ok: true });
  });

  // every past update, newest first
  app.get('/whats-new', requireUser, (req, res) => {
    const u = req.user;
    const rows = db.prepare(`SELECT * FROM whatsnew WHERE published_at IS NOT NULL AND audience IN ${audienceSql(u)} ORDER BY published_at DESC, pos, id LIMIT 200`).all();
    db.prepare("UPDATE users SET whatsnew_seen = datetime('now') WHERE id = ?").run(u.id);
    const groups = [];
    rows.forEach((r) => { const g = groups[groups.length - 1]; if (g && g.at === r.published_at) g.rows.push(r); else groups.push({ at: r.published_at, rows: [r] }); });
    page(req, res, "What's new", `<link rel="stylesheet" href="/whatsnew.css">
      <div class="wn-page">
        <h1 class="wn-h">What's <em>new</em></h1>
        <p class="wn-sub">Short notes on what we added to the site.</p>
        ${groups.length ? groups.map((g) => `<section class="wn-glass wn-day"><span class="wn-chip">${esc(fmtDay(g.at))}</span>
          <div class="wn-list">${g.rows.map(row).join('')}</div></section>`).join('') : '<p class="wn-sub">Nothing yet. New features will show up here.</p>'}
      </div>`);
  });

  const row = (r) => {
    const inner = `<span class="wn-ic">${svg(r.icon)}</span><span class="wn-tx"><b>${esc(r.name)}</b> <span>${esc(r.line)}</span></span>`;
    return r.link ? `<a class="wn-row" href="${esc(r.link)}"${r.link === '#tour' ? ' data-tour-open' : ''}>${inner}<i class="wn-go" aria-hidden="true">›</i></a>` : `<div class="wn-row">${inner}</div>`;
  };

  // ---------- Admin > What's new ----------
  app.get('/admin/whatsnew', requireAdmin, (req, res) => {
    const drafts = db.prepare('SELECT * FROM whatsnew WHERE published_at IS NULL ORDER BY pos, id').all();
    const edit = req.query.edit ? db.prepare('SELECT * FROM whatsnew WHERE id = ?').get(Number(req.query.edit)) : null;
    const f = edit || { name: '', line: '', link: '', icon: 'spark', audience: 'all' };
    const past = db.prepare(`SELECT published_at AS at, COUNT(*) AS n, GROUP_CONCAT(name, ', ') AS names FROM whatsnew
      WHERE published_at IS NOT NULL GROUP BY published_at ORDER BY published_at DESC LIMIT 12`).all();
    const seen = (at) => db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 0 AND whatsnew_seen >= ?').get(at).n;
    const preview = JSON.stringify(drafts.map(forPop));
    page(req, res, "What's new", `<link rel="stylesheet" href="/whatsnew.css">
      <div class="wn-admin">
        <div><h1 class="wn-h">What's <em>new</em></h1>
          <p class="wn-sub">Site updates add their own lines automatically when they go live. Use this only for something extra, like an event or a new video.</p></div>
        <div class="wn-cols">
          <form class="wn-glass wn-form" method="post" action="/admin/whatsnew${edit ? `/${edit.id}` : ''}">
            <b class="wn-ft">${edit ? 'Edit line' : 'Add a line'}</b>
            <label>Feature name<input name="name" required maxlength="${MAX_NAME}" value="${esc(f.name)}" placeholder="Share Studio"></label>
            <label>One short line <small data-wn-count>${(f.line || '').length} / ${MAX_LINE}</small>
              <input name="line" required maxlength="${MAX_LINE}" value="${esc(f.line)}" placeholder="Motion cards for your day, week and month" data-wn-line></label>
            <label>Opens page (optional)<input name="link" value="${esc(f.link)}" placeholder="/journal/studio"></label>
            <fieldset><legend>Icon</legend><div class="wn-icons">${Object.keys(ICONS).map((k) => `<label class="wn-pick" title="${k}"><input type="radio" name="icon" value="${k}"${f.icon === k ? ' checked' : ''}><span>${svg(k)}</span></label>`).join('')}</div></fieldset>
            <fieldset><legend>Who sees it</legend><div class="wn-aud">${Object.entries(AUD).map(([k, t]) => `<label class="wn-pill"><input type="radio" name="audience" value="${k}"${f.audience === k ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div></fieldset>
            <div class="wn-actions"><button class="wn-white">${edit ? 'Save line' : 'Add to next update'}</button>${edit ? '<a class="wn-ghost" href="/admin/whatsnew">Cancel</a>' : ''}</div>
          </form>
          <div class="wn-side">
            <section class="wn-card">
              <div class="wn-head"><b>Next update</b><span class="wn-draft">${drafts.length ? 'Draft, not shown yet' : 'Empty'}</span>
                ${drafts.length ? `<button type="button" class="wn-ghost" data-wn-preview='${esc(preview)}'>Preview popup</button>
                <form method="post" action="/admin/whatsnew/publish"><button class="wn-orange">Publish to members</button></form>` : ''}</div>
              ${drafts.map((d, i) => `<div class="wn-drow"><span class="wn-ic sm">${svg(d.icon, 16)}</span><b>${esc(d.name)}</b><span class="wn-dl">${esc(d.line)}${d.audience !== 'all' ? ` <em>· ${esc(AUD[d.audience])}</em>` : ''}</span>
                <span class="wn-dact">${i ? `<form method="post" action="/admin/whatsnew/${d.id}/up"><button class="wn-link" title="Move up">↑</button></form>` : ''}<a class="wn-link" href="/admin/whatsnew?edit=${d.id}">Edit</a><form method="post" action="/admin/whatsnew/${d.id}/delete"><button class="wn-link">Remove</button></form></span></div>`).join('') || '<p class="wn-sub">Add a line on the left. Nothing is shown to members until you press Publish.</p>'}
            </section>
            <section class="wn-card dim"><b>Past updates</b>
              ${past.map((p) => `<div class="wn-past"><span>${esc(fmtDay(p.at))} · ${p.n} line${p.n === 1 ? '' : 's'}</span><span class="wn-dl">${esc(p.names)}</span><span class="wn-seen">seen by ${seen(p.at)}</span>
                <form method="post" action="/admin/whatsnew/unpublish"><input type="hidden" name="at" value="${esc(p.at)}"><button class="wn-link" title="Hide it from members and move it back to the draft">Take back</button></form></div>`).join('') || '<p class="wn-sub">None yet.</p>'}
            </section>
          </div>
        </div>
      </div>
      <script src="/whatsnew.js" defer data-admin></script>`);
  });

  const form = express.urlencoded({ extended: false });
  const read = (b) => ({
    name: String(b.name || '').trim().slice(0, MAX_NAME), line: String(b.line || '').trim().slice(0, MAX_LINE),
    link: cleanLink(b.link), icon: ICONS[b.icon] ? b.icon : 'spark', audience: AUD[b.audience] ? b.audience : 'all',
  });
  app.post('/admin/whatsnew', requireAdmin, form, (req, res) => {
    const r = read(req.body || {});
    if (!r.name || !r.line) { flash(req, 'error', 'Add a feature name and one short line.'); return res.redirect('/admin/whatsnew'); }
    const pos = (db.prepare('SELECT MAX(pos) AS m FROM whatsnew WHERE published_at IS NULL').get().m ?? -1) + 1;
    db.prepare('INSERT INTO whatsnew (name, line, link, icon, audience, pos) VALUES (?, ?, ?, ?, ?, ?)').run(r.name, r.line, r.link, r.icon, r.audience, pos);
    flash(req, 'success', `Added "${r.name}" to the next update.`);
    res.redirect('/admin/whatsnew');
  });
  app.post('/admin/whatsnew/publish', requireAdmin, (req, res) => {
    const n = db.prepare("UPDATE whatsnew SET published_at = datetime('now') WHERE published_at IS NULL").run().changes;
    flash(req, 'success', n ? `Published ${n} line${n === 1 ? '' : 's'}. Members see them next time they open the site.` : 'Nothing to publish.');
    res.redirect('/admin/whatsnew');
  });
  app.post('/admin/whatsnew/unpublish', requireAdmin, form, (req, res) => {
    db.prepare('UPDATE whatsnew SET published_at = NULL WHERE published_at = ?').run(String((req.body || {}).at || ''));
    flash(req, 'success', 'Moved back to the draft. Members no longer see it.');
    res.redirect('/admin/whatsnew');
  });
  app.post('/admin/whatsnew/:id/up', requireAdmin, (req, res) => {
    const list = db.prepare('SELECT id FROM whatsnew WHERE published_at IS NULL ORDER BY pos, id').all().map((r) => r.id);
    const i = list.indexOf(Number(req.params.id));
    if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; const up = db.prepare('UPDATE whatsnew SET pos = ? WHERE id = ?'); list.forEach((id, p) => up.run(p, id)); }
    res.redirect('/admin/whatsnew');
  });
  app.post('/admin/whatsnew/:id/delete', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM whatsnew WHERE id = ?').run(Number(req.params.id));
    res.redirect('/admin/whatsnew');
  });
  app.post('/admin/whatsnew/:id', requireAdmin, form, (req, res) => {
    const r = read(req.body || {});
    if (r.name && r.line) db.prepare('UPDATE whatsnew SET name = ?, line = ?, link = ?, icon = ?, audience = ? WHERE id = ?').run(r.name, r.line, r.link, r.icon, r.audience, Number(req.params.id));
    flash(req, 'success', 'Saved.');
    res.redirect('/admin/whatsnew');
  });
};

// For the members menu (src/views.js appShell): how many lines this member has not seen yet
module.exports.count = (u) => unseen(u).length;
// the popup script for signed-in pages; it only loads when there is something new to show
module.exports.script = (req, u) => {
  if (u.status === 'pending' || req.path === '/whats-new' || req.path.startsWith('/admin/whatsnew')) return '';
  if (u.tour == null) return '';   // the guided tour asks first; What's new waits for the next page
  const items = unseen(u);
  if (!items.length) return '';
  const data = { at: fmtDay(items[0].published_at), items: items.map(forPop) };
  return `<link rel="stylesheet" href="/whatsnew.css"><script type="application/json" id="wn-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script><script src="/whatsnew.js" defer></script>`;
};
module.exports.ICONS = ICONS;
