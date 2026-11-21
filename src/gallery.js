// "My gallery": a small picture of every card a member saves from Share Studio (video, GIF or photo), so they can find
// their recent cards again. Only a 432x768 JPEG of the finished frame is kept (about 40-80 KB), never the video itself.
// Newest 30 per member. Shown in Share Studio (public/gallery.js) and as a side card on wide PCs (public/side.js).
const express = require('express');
const KEEP = 30;
module.exports = (app, { db, requireUser }) => {
  db.exec(`CREATE TABLE IF NOT EXISTS card_gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    label TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'photo', w INTEGER, h INTEGER, jpg BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS card_gallery_user ON card_gallery(user_id, id);`);
  const journalOnly = (req, res, next) => (req.hasJournal ? next() : res.status(403).json({ error: 'The gallery comes with the Trade Journal.' }));
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

  app.get('/journal/studio/gallery.json', requireUser, journalOnly, (req, res) => {
    const rows = db.prepare('SELECT id, created_at, label, kind, w, h FROM card_gallery WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(req.user.id, KEEP);
    res.set('Cache-Control', 'no-store').json({ cards: rows.map((r) => ({ id: r.id, at: r.created_at + 'Z', label: r.label, kind: r.kind, w: r.w, h: r.h, src: `/journal/studio/gallery/${r.id}.jpg` })) });
  });
  app.get('/journal/studio/gallery/:id.jpg', requireUser, journalOnly, (req, res) => {
    const r = db.prepare('SELECT jpg FROM card_gallery WHERE id = ? AND user_id = ?').get(Number(req.params.id) || 0, req.user.id);
    if (!r) return res.status(404).end();
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }).send(r.jpg);
  });
  app.post('/journal/studio/gallery', requireUser, journalOnly, express.raw({ type: 'image/jpeg', limit: '400kb' }), (req, res) => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length < 100 || b[0] !== 0xff || b[1] !== 0xd8) return res.status(400).json({ error: 'Not a picture.' });
    const kind = ['video', 'gif', 'photo'].includes(req.query.kind) ? req.query.kind : 'photo';
    const w = Math.min(4000, Number(req.query.w) || 0) || null, h = Math.min(4000, Number(req.query.h) || 0) || null;
    const id = db.prepare('INSERT INTO card_gallery (user_id, label, kind, w, h, jpg) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, clean(req.query.label, 80), kind, w, h, b).lastInsertRowid;
    db.prepare('DELETE FROM card_gallery WHERE user_id = ? AND id NOT IN (SELECT id FROM card_gallery WHERE user_id = ? ORDER BY id DESC LIMIT ?)').run(req.user.id, req.user.id, KEEP);
    res.json({ ok: true, id: Number(id) });
  });
  app.post('/journal/studio/gallery/:id/delete', requireUser, journalOnly, (req, res) => {
    db.prepare('DELETE FROM card_gallery WHERE id = ? AND user_id = ?').run(Number(req.params.id) || 0, req.user.id);
    res.json({ ok: true });
  });
};
