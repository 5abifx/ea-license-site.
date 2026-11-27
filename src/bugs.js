// "Report a bug": members tell the owner something is broken, with a typed note and/or a screenshot.
// The form lives in the corner help panel (beside "Request a feature") and, when that panel is off, as a small
// round button beside the + on wide screens (public/bug.js). Reports land in Admin > Bug reports (/admin/bugs).
// Screenshots are shrunk in the browser to a JPEG (longest side 1600px) and kept in bug_reports.jpg.
// The page, screen size and browser are added by themselves so the owner can find the problem.
const { esc } = require('./views');

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);

module.exports = function setup(app, { db, express, page, requireUser, requireAdmin }) {
  db.exec(`CREATE TABLE IF NOT EXISTS bug_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '', page TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '', jpg BLOB, bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const json = express.json({ limit: '3mb' });

  // owner menu count: new reports not yet marked fixed
  app.use((req, res, next) => {
    if (req.user && req.user.is_admin && req.method === 'GET') {
      try { req.bugsNew = db.prepare("SELECT COUNT(*) AS n FROM bug_reports WHERE status = 'new'").get().n; } catch (e) { /* table missing */ }
    }
    next();
  });

  app.post('/api/bug', requireUser, json, (req, res) => {
    const b = req.body || {};
    const text = str(b.text, 2000);
    let jpg = null;
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.img || ''));
    if (m) {
      jpg = Buffer.from(m[1], 'base64');
      if (jpg.length < 100 || jpg[0] !== 0xff || jpg[1] !== 0xd8) jpg = null;   // not a real JPEG
      else if (jpg.length > 2.2e6) return res.status(413).json({ error: 'That picture is too big.' });
    }
    if (text.length < 3 && !jpg) return res.status(400).json({ error: 'Tell us what went wrong, or add a screenshot.' });
    const recent = db.prepare("SELECT COUNT(*) n FROM bug_reports WHERE user_id = ? AND created_at > datetime('now', '-1 day')").get(req.user.id).n;
    if (recent >= 15) return res.status(429).json({ error: 'Thanks! That is plenty for today.' });
    const ua = str(req.get('user-agent'), 300);
    const device = [str(b.screen, 30), str(b.look, 30) && 'look ' + str(b.look, 30), ua].filter(Boolean).join(' · ');
    db.prepare('INSERT INTO bug_reports (user_id, text, page, device, jpg, bytes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, text, str(b.page, 200), device, jpg, jpg ? jpg.length : 0);
    res.json({ ok: true });
  });

  app.get('/admin/bugs/:id.jpg', requireAdmin, (req, res) => {
    const r = db.prepare('SELECT jpg FROM bug_reports WHERE id = ?').get(Number(req.params.id));
    if (!r || !r.jpg) return res.status(404).end();
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }).send(r.jpg);
  });

  app.post('/admin/bugs/:id', requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const id = Number(req.params.id), act = String((req.body || {}).act || '');
    if (act === 'delete') db.prepare('DELETE FROM bug_reports WHERE id = ?').run(id);
    else db.prepare('UPDATE bug_reports SET status = ? WHERE id = ?').run(act === 'fixed' ? 'fixed' : 'new', id);
    res.redirect('/admin/bugs' + (req.query.show ? '?show=' + encodeURIComponent(req.query.show) : ''));
  });

  app.get('/admin/bugs', requireAdmin, (req, res) => {
    const show = req.query.show === 'fixed' ? 'fixed' : req.query.show === 'all' ? 'all' : 'new';
    const where = show === 'all' ? '' : 'WHERE b.status = ?';
    const rows = db.prepare(`SELECT b.id, b.user_id, b.text, b.page, b.device, b.bytes, b.status, b.created_at, u.email, u.name
      FROM bug_reports b LEFT JOIN users u ON u.id = b.user_id ${where} ORDER BY b.id DESC LIMIT 300`).all(...(show === 'all' ? [] : [show]));
    const n = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status').all().map((r) => [r.status, r.n]));
    const tab = (k, label, c) => `<a class="bg-tab${show === k ? ' on' : ''}" href="/admin/bugs${k === 'new' ? '' : '?show=' + k}">${label}${c ? ` <em>${c}</em>` : ''}</a>`;
    const q = show === 'new' ? '' : '?show=' + show;
    const item = (r) => `<article class="card bg-item${r.status === 'fixed' ? ' done' : ''}">
      ${r.bytes ? `<a class="bg-shot" href="/admin/bugs/${r.id}.jpg" target="_blank" rel="noopener"><img src="/admin/bugs/${r.id}.jpg" alt="Screenshot from the member" loading="lazy"></a>` : '<div class="bg-shot bg-none">No screenshot</div>'}
      <div class="bg-body">
        <div class="bg-meta"><a href="/admin/user/${r.user_id}">${esc(r.name || r.email || '#' + r.user_id)}</a><span>${esc(r.created_at.slice(0, 16))} UTC</span>${r.status === 'fixed' ? '<span class="bg-ok">Fixed</span>' : '<span class="bg-new">New</span>'}</div>
        <p class="bg-text">${r.text ? esc(r.text) : '<span class="muted">(screenshot only)</span>'}</p>
        <div class="bg-where muted small">Page <b>${esc(r.page || '?')}</b>${r.device ? ` · ${esc(r.device)}` : ''}</div>
        <form method="post" action="/admin/bugs/${r.id}${q}" class="bg-act">
          ${r.status === 'fixed' ? '<button name="act" value="new" class="btn secondary small">Reopen</button>' : '<button name="act" value="fixed" class="btn small">Mark fixed</button>'}
          <button name="act" value="delete" class="btn secondary small" onclick="return confirm('Delete this report?')">Delete</button>
        </form>
      </div>
    </article>`;
    page(req, res, 'Bug reports', `<style>
      .bg-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 14px}
      .bg-tab{padding:6px 12px;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:inherit;text-decoration:none;font-size:13px;background:rgba(10,10,14,.6)}
      .bg-tab.on{border-color:#ff5a1f;background:rgba(255,90,31,.12)}
      .bg-tab em{font-style:normal;color:#ffb07a;font-weight:700}
      .bg-list{display:grid;gap:12px}
      .bg-item{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;align-items:start;margin:0}
      .bg-item.done{opacity:.7}
      .bg-shot{display:block;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:#0b0b0f;aspect-ratio:16/10}
      .bg-shot img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
      .bg-none{display:grid;place-items:center;color:#8a8a92;font-size:12px}
      .bg-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px;color:#a1a1aa}
      .bg-meta a{font-weight:700;color:#f4f4f5}
      .bg-new,.bg-ok{padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700}
      .bg-new{background:rgba(255,90,31,.16);color:#ffb07a}.bg-ok{background:rgba(38,198,160,.16);color:#5fe0bf}
      .bg-text{margin:8px 0;white-space:pre-wrap;word-break:break-word}
      .bg-where{word-break:break-word}
      .bg-act{display:flex;gap:8px;margin-top:10px}
      @media (max-width:640px){.bg-item{grid-template-columns:1fr}}
    </style>
    <h1>Bug reports</h1>
    <p class="muted">What members reported from <b>Need help? › Report a bug</b>. Tap a screenshot to see it full size.</p>
    <div class="bg-tabs">${tab('new', 'New', n.new)}${tab('fixed', 'Fixed', n.fixed)}${tab('all', 'All')}</div>
    ${rows.length ? `<div class="bg-list">${rows.map(item).join('')}</div>` : `<div class="card"><p class="muted">${show === 'new' ? 'No new bug reports. All clear.' : 'Nothing here yet.'}</p></div>`}`);
  });
};
