// Guided tour of the members area (public/tour.js, public/tour.css).
// users.tour: NULL = new member, ask "How should we show you around?" on the first members page;
// 'beginner' | 'advanced' | 'skip' = answered; 'old' = joined before the tour existed (not asked, can still open it).
module.exports = function tour(app, { db, requireUser }) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('tour')) {
    db.exec('ALTER TABLE users ADD COLUMN tour TEXT');
    db.exec("UPDATE users SET tour = 'old'");   // existing members are not interrupted
  }

  // POST /api/tour { choice: beginner | advanced | skip }
  app.post('/api/tour', requireUser, require('express').json(), (req, res) => {
    const c = String((req.body || {}).choice || '');
    if (['beginner', 'advanced', 'skip'].includes(c)) db.prepare('UPDATE users SET tour = ? WHERE id = ?').run(c, req.user.id);
    res.json({ ok: true });
  });
};

// the script tag for signed-in pages (src/views.js appShell)
module.exports.script = (req, u) => {
  const offer = u.tour == null && u.status !== 'pending' ? 1 : 0;
  return `<link rel="stylesheet" href="/tour.css"><script src="/tour.js" defer data-tour data-offer="${offer}" data-j="${req.hasJournal ? 1 : 0}" data-m="${req.mentorEligible && (req.hasJournal || u.mentor_share) ? 1 : 0}"></script>`;
};
