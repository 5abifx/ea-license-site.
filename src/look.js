// Appearance: each member picks their own members-area background, panel tint and accent colour.
const express = require('express');
// Saved on the account (users.look, small JSON) so it follows them to every device. An uploaded photo or clip
// stays on the device it was picked on (browser storage); other devices fall back to Ember.
// Client: public/look.js (draws the background, measures it, recolours text/panels) + public/look-picker.js.

const BG = new Set(['none', 'colour', 'grad', 'upload', 'ember', 'rivers', 'heat', 'grid', 'aurora', 'candles', 'gold', 'lagoon', 'porcelain',
  'ph-hyper', 'ph-gt', 'ph-chromecar', 'ph-coupe', 'ph-nightrun', 'ph-katana', 'ph-rivers', 'ph-ridge', 'ph-chrome', 'ph-still']);
const PANEL = new Set(['auto', 'midnight', 'onyx', 'graphite']);
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

function clean(raw) {
  let o = {};
  try { o = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (e) { o = {}; }
  const accent = String(o.accent || '');
  return {
    bg: BG.has(o.bg) ? o.bg : 'none',
    motion: o.motion !== false,
    depth: num(o.depth, 0, 100, 40),
    dim: num(o.dim, 0, 80, 0),
    blur: num(o.blur, 0, 24, 0),
    panel: PANEL.has(o.panel) ? o.panel : 'auto',
    accent: /^(m|f)-[a-z]{2,10}$/.test(accent) || /^c-#[0-9a-f]{6}$/i.test(accent) ? accent : 'm-ember',
    colour: HEX.test(o.colour) ? o.colour : '#1d3557',
    g1: HEX.test(o.g1) ? o.g1 : '#ff5a1f',
    g2: HEX.test(o.g2) ? o.g2 : '#1a1033',
  };
}

// <script> tags for every signed-in page: the saved choice + the engine. JSON is escaped for a script block.
function tags(u) {
  const look = clean(u && u.look);
  const json = JSON.stringify(look).replace(/</g, '\\u003c');
  return `<script>window.__LOOK=${json}</script><script src="/look.js"></script>`;
}

module.exports = function setup(app, { db, page, requireUser }) {
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'look')) db.exec("ALTER TABLE users ADD COLUMN look TEXT NOT NULL DEFAULT ''");

  app.get('/appearance', requireUser, (req, res) => {
    page(req, res, 'Appearance', `<div class="ap">
  <div class="ap-prev">
    <div class="ap-intro"><h1>Make it yours</h1><p class="muted">Pick a background, a panel tint and your colour. Text and panels adjust by themselves so everything stays easy to read. It shows on every members page.</p></div>
    <section class="card ap-hero" aria-label="Preview">
      <div>
        <div class="k">Total P&amp;L · preview</div>
        <div class="big">+$4,812</div>
        <div class="ap-chips"><span class="ap-chip"><b class="pos">↗ 3.1%</b> in 7 days</span><span class="ap-chip"><b>31W</b> / 19L</span><span class="ap-chip">Sample numbers</span></div>
      </div>
      <svg class="ap-spark" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="apg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent-2)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent-2)" stop-opacity="0"/></linearGradient></defs>
        <path class="a" fill="url(#apg)" d=""/><path class="l" fill="none" stroke="var(--accent-2)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d=""/><circle class="e" r="4.5" fill="var(--accent-2)"/>
      </svg>
    </section>
    <section class="ap-stats" aria-label="Preview tiles">
      <div class="card"><span class="muted">Win rate</span><span class="v">62%</span><span class="muted">50 trades</span></div>
      <div class="card"><span class="muted">Avg win</span><span class="v">1.8R</span><div class="ap-bar"><i style="width:60%"></i></div></div>
      <div class="card"><span class="muted">Profit factor</span><span class="v">2.14</span><div class="ap-bar"><i style="width:71%"></i></div></div>
      <div class="card"><span class="muted">Best day</span><span class="v pos">+$1,140</span><span class="muted">sample</span></div>
    </section>
  </div>

  <aside class="card ap-panel" aria-label="Appearance settings">
    <div class="ap-sec">
      <div class="ap-sec-h"><b>Background</b><span class="ap-tog">Motion <button type="button" class="ap-sw" id="apMotion" role="switch" aria-checked="true" aria-label="Motion"></button></span></div>
      <div class="ap-well ap-sl"><div class="row"><label for="apDepth">3D depth</label><output id="apDepthO">40</output></div><input type="range" id="apDepth" min="0" max="100" value="40"></div>
      <div class="ap-tiles"><button type="button" class="ap-tile" data-bg="none"><span class="th classic"><img src="/logo.png" alt=""></span><span class="nm">Classic 5ABI.FX</span></button></div>
      <div class="ap-grp">5ABI garage · move your mouse, the car floats</div>
      <div class="ap-tiles" id="apCars"></div>
      <div class="ap-grp">5ABI scenes</div>
      <div class="ap-tiles" id="apScenes"></div>
      <div class="ap-grp">Live</div>
      <div class="ap-tiles" id="apLive"></div>
      <div class="ap-grp">Your own</div>
      <div class="ap-tiles">
        <label class="ap-tile" data-bg="colour"><span class="th add" id="apColourTh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18" opacity=".4"/></svg><input type="color" id="apColour" value="#1d3557" aria-label="Pick any background colour"></span><span class="nm">Any colour</span></label>
        <label class="ap-tile" data-bg="upload"><span class="th add" id="apUpTh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg><input type="file" id="apUpload" accept="image/*,video/*" aria-label="Upload a picture or clip"></span><span class="nm">Photo / clip</span></label>
        <button type="button" class="ap-tile" data-bg="grad" id="apGrad"><span class="th"><canvas width="160" height="100" id="apGradTh"></canvas><span class="tag">MIX</span></span><span class="nm">Two-colour mix</span></button>
      </div>
      <p class="ap-note">Your own photo or clip stays on this device only.</p>
      <div class="ap-well ap-sl">
        <div class="row"><label for="apDim">Dim background</label><output id="apDimO">0</output></div><input type="range" id="apDim" min="0" max="80" value="0">
        <div class="row"><label for="apBlur">Soften (blur)</label><output id="apBlurO">0</output></div><input type="range" id="apBlur" min="0" max="24" value="0">
      </div>
    </div>
    <div class="ap-sec">
      <div class="ap-sec-h"><b>Panel tint</b><small>Auto picks for you</small></div>
      <div class="ap-well ap-seg" id="apPanel">
        <button type="button" data-v="auto"><i style="background:conic-gradient(#0b0b0e 0 50%,#3a3a42 0)"></i>Auto</button>
        <button type="button" data-v="midnight"><i style="background:#141a2e"></i>Midnight</button>
        <button type="button" data-v="onyx"><i style="background:#050507"></i>Onyx</button>
        <button type="button" data-v="graphite"><i style="background:#2a2b31"></i>Graphite</button>
      </div>
    </div>
    <div class="ap-sec">
      <div class="ap-sec-h"><b>Accent</b><small>Buttons, highlights, the page you are on</small></div>
      <div class="ap-grp">Metallic</div><div class="ap-dots" id="apMetal"></div>
      <div class="ap-grp">Matte</div><div class="ap-dots" id="apMatte"></div>
    </div>
    <div class="ap-sec">
      <div class="ap-sec-h"><b>Readability check</b><span class="ap-ok" id="apOk">AAA</span></div>
      <div class="ap-well ap-read"><span class="sc" id="apScore">-</span><p id="apReadTxt">Choose a background to see the check.</p></div>
      <p class="ap-note" id="apAdj">The site measures your background and picks text colour, panel tint and accent shade so nothing gets lost.</p>
    </div>
    <div class="ap-save"><span id="apSaved" aria-live="polite">Changes save by themselves.</span></div>
  </aside>
</div>
<script src="/look-picker.js"></script>`);
  });

  app.post('/appearance', requireUser, (req, res) => {
    const look = clean(req.body.look);
    db.prepare('UPDATE users SET look = ? WHERE id = ?').run(JSON.stringify(look), req.user.id);
    res.json({ ok: true, look });
  });

  // Accessibility (public/a11y.js): colour-safe P&L colours, bigger text, contrast, glass cursor. Saved per account.
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'a11y')) db.exec("ALTER TABLE users ADD COLUMN a11y TEXT NOT NULL DEFAULT ''");
  app.post('/api/a11y', requireUser, express.json({ limit: '2kb' }), (req, res) => {
    const a = a11yClean(req.body);
    db.prepare('UPDATE users SET a11y = ? WHERE id = ?').run(JSON.stringify(a), req.user.id);
    res.json({ ok: true, a11y: a });
  });
};
function a11yClean(raw) {
  let o = {};
  try { o = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (e) { o = {}; }
  return { cb: ['off', 'rg', 'by', 'mono'].includes(o.cb) ? o.cb : 'off', big: !!o.big, hc: !!o.hc, cur: !!o.cur };
}
// <head> tags for every page: the saved choice (signed in) + the engine, so it applies before the page paints
function a11yHead(u) {
  const json = u ? JSON.stringify(u.a11y ? a11yClean(u.a11y) : {}).replace(/</g, '\\u003c') : '';
  return `<link rel="stylesheet" href="/a11y.css">${u ? `<script>window.__A11Y=${json}</script>` : ''}<script src="/a11y.js"></script>`;
}
module.exports.a11yHead = a11yHead;
module.exports.tags = tags;
module.exports.clean = clean;
