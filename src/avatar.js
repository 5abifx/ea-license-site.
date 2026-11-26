// Profile picture for the round avatar in the members top bar (public/avatar.js, public/avatar.css).
// users.avatar: '' = first letter (default), 'p:<name>' = one of the site's pictures below, 'u' = the member's own
// upload, kept as a 256x256 JPEG in users.avatar_jpg (cropped and shrunk in the browser, about 10-30 KB).
const express = require('express');
const { esc } = require('./views');

// built-in pictures: the Appearance backgrounds (public/look/) + the chrome logo
const PRESETS = { logo: '/logo.png', katana: '/look/katana.jpg', hyper: '/look/hyper.jpg', gt: '/look/gt.jpg', coupe: '/look/coupe.jpg',
  nightrun: '/look/nightrun.jpg', chrome: '/look/chrome.jpg', rivers: '/look/rivers.jpg', ridge: '/look/ridge.jpg' };

// the image URL for a member ('' = show the letter)
function src(u) {
  const a = (u && u.avatar) || '';
  if (a === 'u' && u.avatar_at) return `/me/avatar.jpg?t=${encodeURIComponent(u.avatar_at)}`;
  if (a.startsWith('p:') && PRESETS[a.slice(2)]) return PRESETS[a.slice(2)];
  return '';
}
// the inside of the round avatar: picture or first letter
function inner(u) {
  const s = src(u);
  const letter = esc(((u.name || u.email || 'M').trim()[0] || 'M').toUpperCase());
  return s ? `<img class="av-img${u.avatar === 'p:logo' ? ' av-logo' : ''}" src="${esc(s)}" alt="">` : letter;
}

module.exports = function avatar(app, { db, requireUser }) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('avatar')) db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('avatar_jpg')) db.exec('ALTER TABLE users ADD COLUMN avatar_jpg BLOB');
  if (!cols.includes('avatar_at')) db.exec('ALTER TABLE users ADD COLUMN avatar_at TEXT');

  app.get('/me/avatar.jpg', requireUser, (req, res) => {
    const r = db.prepare('SELECT avatar_jpg FROM users WHERE id = ?').get(req.user.id);
    if (!r || !r.avatar_jpg) return res.status(404).end();
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }).send(r.avatar_jpg);
  });
  // own upload: a JPEG made by public/avatar.js
  app.post('/api/avatar/upload', requireUser, express.raw({ type: 'image/jpeg', limit: '200kb' }), (req, res) => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length < 100 || b[0] !== 0xff || b[1] !== 0xd8) return res.status(400).json({ error: 'That is not a picture.' });
    db.prepare("UPDATE users SET avatar = 'u', avatar_jpg = ?, avatar_at = datetime('now') WHERE id = ?").run(b, req.user.id);
    const u = db.prepare('SELECT avatar, avatar_at FROM users WHERE id = ?').get(req.user.id);
    res.json({ ok: true, src: src(u) });
  });
  // a built-in picture, or back to the letter
  app.post('/api/avatar', requireUser, express.json({ limit: '2kb' }), express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const p = String((req.body || {}).pick || '');
    const v = PRESETS[p] ? 'p:' + p : '';
    db.prepare('UPDATE users SET avatar = ?, avatar_jpg = NULL WHERE id = ?').run(v, req.user.id);
    res.json({ ok: true, src: v ? PRESETS[p] : '' });
  });
};
module.exports.src = src;
module.exports.inner = inner;
module.exports.PRESETS = PRESETS;
