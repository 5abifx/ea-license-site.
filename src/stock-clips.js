// "Shuffle" backgrounds for Share Studio: free stock clips from Pixabay or Pexels (both free for commercial use).
// Nothing is stored on our side: the search runs live and the clip plays from their own servers.
// Needs env PIXABAY_API_KEY (pixabay.com/api/docs) or PEXELS_API_KEY (pexels.com/api); with neither, Shuffle is not shown.
// With both, each shuffle picks one of them at random.
// No movie / show / music-video clips: those are copyrighted, members use their own clip for that.
// q: search words (one picked at random); must: a clip is kept only if its tags (Pixabay) or page link (Pexels)
// contain one of these words, so a "Watches" shuffle never shows a city.
const TOPICS = {
  racing: { q: ['car burnout', 'drift car smoke', 'race car', 'tire smoke', 'drag race', 'sports car speed', 'motorcycle wheelie'], must: ['burnout', 'drift', 'race', 'racing', 'tire', 'tyre', 'smoke', 'speed', 'motorcycle', 'motorbike', 'sports car', 'supercar'] },
  dark: { q: ['dark city rain night', 'man silhouette rain', 'dark alley', 'man in hood dark', 'city night rain', 'thunder night city'], must: ['dark', 'night', 'rain', 'silhouette', 'shadow', 'hood', 'alley', 'thunder', 'noir'] },
  war: { q: ['soldier', 'army soldiers', 'military tank', 'battlefield smoke', 'military helicopter', 'warrior', 'explosion'], must: ['soldier', 'army', 'military', 'tank', 'war', 'battle', 'warrior', 'helicopter', 'explosion', 'weapon'] },
  beast: { q: ['lion roar', 'lion', 'wolf', 'tiger', 'black panther', 'bull', 'eagle', 'gorilla'], must: ['lion', 'wolf', 'tiger', 'panther', 'leopard', 'bull', 'eagle', 'gorilla', 'bear', 'predator'] },
  fight: { q: ['boxing', 'boxer training', 'mma fight', 'punching bag', 'gym workout dark', 'kickboxing'], must: ['boxing', 'boxer', 'mma', 'fight', 'punch', 'kick', 'gym', 'workout', 'martial'] },
  supercars: { q: ['supercar', 'lamborghini', 'ferrari', 'sports car night', 'luxury car'], must: ['supercar', 'lamborghini', 'ferrari', 'porsche', 'sports car', 'luxury car', 'car'] },
  money: { q: ['money cash', 'dollar bills', 'gold bars', 'money counting', 'luxury lifestyle', 'private jet', 'yacht'], must: ['money', 'cash', 'dollar', 'gold', 'banknote', 'luxury', 'jet', 'yacht', 'rich', 'wealth'] },
  watches: { q: ['luxury watch', 'wrist watch', 'gold watch', 'watch mechanism'], must: ['watch', 'wristwatch', 'clock'] },
  fire: { q: ['fire flames', 'explosion fire', 'lightning storm', 'sparks', 'burning'], must: ['fire', 'flame', 'explosion', 'lightning', 'spark', 'burn', 'storm'] },
};
const cache = new Map();   // query -> { at, list }, an hour, so a busy evening does not hit the API limit

// Every member with the Journal (requireJournal). Searches are cached an hour per query, so the API limit holds.
module.exports = function registerStockClips(app, { requireUser, requireJournal }) {
  const ownerOnly = requireJournal;
  const pexels = () => process.env.PEXELS_API_KEY || '', pixabay = () => process.env.PIXABAY_API_KEY || '';
  const key = () => pexels() || pixabay();
  async function fromPexels(q, portrait) {
    const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=${portrait ? 'portrait' : 'landscape'}&size=medium&per_page=40`, { headers: { Authorization: pexels() } });
    if (!r.ok) throw new Error('pexels ' + r.status);
    const j = await r.json();
    return (j.videos || []).map((v) => {
      // the smallest file that is still at least 1080 on its short side (else the biggest), mp4 only
      const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height).sort((a, b) => a.width * a.height - b.width * b.height);
      const f = files.find((x) => Math.min(x.width, x.height) >= 1080) || files[files.length - 1];
      return f && v.duration >= 5 ? { url: f.link, w: f.width, h: f.height, by: v.user?.name || '', page: v.url, src: 'Pexels', thumb: v.image || '', tags: String(v.url || '').toLowerCase().replace(/[-/]/g, ' ') } : null;
    }).filter(Boolean);
  }
  async function fromPixabay(q, portrait) {
    const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabay())}&q=${encodeURIComponent(q)}&video_type=film&safesearch=true&per_page=80`);
    if (!r.ok) throw new Error('pixabay ' + r.status);
    const j = await r.json();
    const list = (j.hits || []).map((h) => {
      const v = h.videos || {}, f = [v.large, v.medium, v.small].find((x) => x && x.url && Math.min(x.width, x.height) >= 720) || v.medium || v.small;
      return f && f.url && h.duration >= 5 ? { url: f.url, w: f.width, h: f.height, by: h.user || '', page: h.pageURL, src: 'Pixabay', thumb: (v.tiny && v.tiny.thumbnail) || (v.small && v.small.thumbnail) || (f && f.thumbnail) || '', tags: String(h.tags || '').toLowerCase() } : null;
    }).filter(Boolean);
    // Pixabay has no orientation filter for videos: prefer the ones that match, else keep all (they are cropped to fit)
    const fit = list.filter((c) => (portrait ? c.h > c.w : c.w >= c.h));
    return fit.length >= 5 ? fit : list;
  }
  app.get('/journal/studio/clips', requireUser, ownerOnly, async (req, res) => {
    if (!key()) return res.status(404).json({ clips: [] });
    const topic = TOPICS[req.query.topic] ? req.query.topic : 'racing', portrait = req.query.wide !== '1', T = TOPICS[topic];
    const q = T.q[Math.floor(Math.random() * T.q.length)];
    const use = pexels() && pixabay() ? (Math.random() < 0.5 ? 'pexels' : 'pixabay') : pexels() ? 'pexels' : 'pixabay';
    const ck = use + '|' + q + (portrait ? '|p' : '|l'), hit = cache.get(ck);
    if (hit && Date.now() - hit.at < 3600e3) return res.json({ clips: hit.list });
    try {
      const all = use === 'pexels' ? await fromPexels(q, portrait) : await fromPixabay(q, portrait);
      const ok = (c) => T.must.some((w) => c.tags.includes(w));
      const list = all.filter(ok).map(({ tags, ...c }) => c);
      cache.set(ck, { at: Date.now(), list });
      res.json({ clips: list });
    } catch (e) { res.status(502).json({ clips: [] }); }
  });
  // same-origin copy of a Pexels / Pixabay clip, only for browsers where the direct file cannot be drawn into the video
  app.get('/journal/studio/clip', requireUser, ownerOnly, async (req, res) => {
    let u; try { u = new URL(String(req.query.u || '')); } catch { return res.status(400).end(); }
    if (u.protocol !== 'https:' || !/(^|\.)(pexels|pixabay)\.com$/.test(u.hostname)) return res.status(400).end();
    try {
      const r = await fetch(u, { headers: req.headers.range ? { Range: req.headers.range } : {} });
      res.status(r.status);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => { const v = r.headers.get(h); if (v) res.setHeader(h, v); });
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (!r.body) return res.end();
      const reader = r.body.getReader();
      req.on('close', () => reader.cancel().catch(() => {}));
      for (;;) { const { done, value } = await reader.read(); if (done) break; if (!res.write(value)) await new Promise((ok) => res.once('drain', ok)); }
      res.end();
    } catch (e) { if (!res.headersSent) res.status(502); res.end(); }
  });
  return { enabled: () => !!key(), topics: Object.keys(TOPICS) };
};
