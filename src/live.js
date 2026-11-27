// Live screen (/journal/live): the journal made for a second screen (iPad, phone, side monitor) while trading.
// Today's result, the open trade, guard rails and the next red news, readable from arm's length.
// Page: public/live.css + public/live.js. Fills its own width (container queries), so a shrunk window,
// an iPad, a phone or a thin monitor strip each get their own arrangement.
// Open trades need the Journal EA live pulse (not sent yet): until then ?demo=1 plays a sample trade.
const { esc } = require('./views');

module.exports = function registerLive(app, { db, page, requireUser, requireJournal, scope, acctBar, desk, prep, DESK_COLS, PROP_COLS, limitsOf, hasJournal }) {
  // one background design per kind of screen (PC, iPad / tablet, phone), saved on the account so it comes back on any device of that kind.
  // An own picture / clip is never uploaded: the design only remembers "own" and each device keeps its own file.
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'live_bg')) db.exec("ALTER TABLE users ADD COLUMN live_bg TEXT NOT NULL DEFAULT ''");
  const DEVS = ['pc', 'tab', 'phone'], KINDS = /^(none|smoke|ember|floor|own|racing|dark|war|beast|fight|supercars|money|watches|fire)$/;
  const HIDES = ['accts', 'sub', 'line', 'today', 'todayr', 'trades', 'used', 'loss', 'news', 'check', 'feel', 'mark'];
  const cleanBg = (o) => {
    if (!o || typeof o !== 'object' || !KINDS.test(o.k)) return null;
    const dim = Math.min(0.85, Math.max(0.2, Number(o.dim) || 0.5));
    const c = o.clip && typeof o.clip === 'object' && /^https:\/\/[^\s"'<>]{8,600}$/.test(o.clip.url || '') ? o.clip : null;
    const str = (v, n) => String(v || '').slice(0, n);
    const hide = Array.isArray(o.hide) ? [...new Set(o.hide.filter((h) => HIDES.includes(h)))] : [];
    return { k: o.k, dim, bw: o.bw === true, hide, clip: c ? { k: str(c.k, 20), url: c.url, by: str(c.by, 80), page: /^https:\/\//.test(c.page || '') ? str(c.page, 400) : '', src: str(c.src, 20) } : null };
  };
  const bgsOf = (u) => { let o = {}; try { o = JSON.parse(u.live_bg || '{}') || {}; } catch (e) {} const r = {}; DEVS.forEach((d) => { const v = cleanBg(o[d]); if (v) r[d] = v; }); return r; };
  app.post('/journal/live/bg', requireUser, (req, res) => {
    let raw = null; try { raw = JSON.parse(String(req.body.bg || '').slice(0, 4000)); } catch (e) {}
    const dev = DEVS.includes(req.body.dev) ? req.body.dev : null, bg = cleanBg(raw);
    if (!dev || !bg) return res.status(400).json({ ok: false });
    const row = db.prepare('SELECT live_bg FROM users WHERE id = ?').get(req.user.id) || {}, all = bgsOf(row);
    all[dev] = bg; db.prepare('UPDATE users SET live_bg = ? WHERE id = ?').run(JSON.stringify(all), req.user.id);
    res.json({ ok: true });
  });

  /* ---------- live pulse from the Journal EA (1.35+): open trades + floating P&L ----------
     Kept in memory only (never written to the database): one small snapshot per account, replaced on every pulse.
     The EA sends every ~2 s while a trade is open and only when something changed, every 60 s when flat. */
  const PULSE = new Map();                         // `${userId}:${account}` -> { at, eq, bal, cur, pos: [...] }
  const keyCache = new Map();                      // journal key -> { uid, ok, at } for 60 s, so a pulse costs no DB read
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v, n) => String(v ?? '').slice(0, n);
  app.post('/api/journal/pulse', require('express').json({ limit: '64kb' }), (req, res) => {
    const b = req.body || {}, key = str(b.key, 80), account = str(b.account, 20).replace(/[^0-9]/g, '');
    if (!key || !account) return res.status(400).json({ ok: false, message: 'Missing key or account' });
    let k = keyCache.get(key);
    if (!k || Date.now() - k.at > 60e3) {
      const u = db.prepare('SELECT * FROM users WHERE journal_key = ?').get(key);
      k = { uid: u ? u.id : 0, ok: !!u && hasJournal(u), accts: u ? new Set(db.prepare('SELECT account_number FROM accounts WHERE user_id = ?').all(u.id).map((a) => String(a.account_number))) : new Set(), at: Date.now() };
      keyCache.set(key, k); if (keyCache.size > 5000) keyCache.clear();
    }
    if (!k.uid) return res.status(403).json({ ok: false, message: 'Wrong journal key' });
    if (!k.ok) return res.status(403).json({ ok: false, message: 'Trade Journal license is not active' });
    if (!k.accts.has(account)) return res.status(403).json({ ok: false, message: `Account ${account} is not registered on your dashboard` });
    const pos = (Array.isArray(b.pos) ? b.pos : []).slice(0, 200).map((p) => ({
      id: str(p.id, 30), sym: str(p.sym, 30), side: str(p.side, 4).toUpperCase() === 'SELL' ? 'SELL' : 'BUY', lots: num(p.lots) || 0,
      entry: num(p.entry), sl: num(p.sl), tp: num(p.tp), pnl: num(p.pnl) || 0, risk: num(p.risk), reward: num(p.reward),
      open: num(p.open), digits: Math.max(0, Math.min(8, num(p.digits) || 2)), magic: num(p.magic) || 0,
    }));
    PULSE.set(`${k.uid}:${account}`, { at: Date.now(), srv: num(b.srv), eq: num(b.eq), bal: num(b.bal), cur: str(b.cur, 6) || 'USD', pos });
    if (PULSE.size > 20000) { const old = Date.now() - 3600e3; for (const [kk, v] of PULSE) if (v.at < old) PULSE.delete(kk); }
    res.json({ ok: true, next: pos.length ? 2 : 60 });   // seconds until the EA should send again (it may send sooner on a change)
  });
  // the page asks every 2 s for the accounts in view (?account= like the page)
  app.get('/api/live/pulse', requireUser, requireJournal, (req, res) => {
    const sc = scope(req), list = sc.sel ? [sc.sel] : sc.liveAccts;
    let at = 0, pos = [], cur = '', bal = 0, srvNow = 0;
    list.forEach((a) => { const p = PULSE.get(`${req.user.id}:${a.account_number}`); if (!p) return; at = Math.max(at, p.at); cur = cur || p.cur; bal += p.bal || 0; if (p.srv) srvNow = Math.max(srvNow, p.srv + Math.round((Date.now() - p.at) / 1000)); p.pos.forEach((x) => pos.push(Object.assign({ acct: String(a.account_number).slice(-2) }, x))); });
    res.set('Cache-Control', 'no-store').json({ at, age: at ? Math.round((Date.now() - at) / 1000) : null, cur, bal, srvNow, pos });
  });

  app.get('/journal/live', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const sc = scope(req);
    const { liveAccts, sel, where, args } = sc;
    const off = u.ny_offset ?? desk.NY_DEFAULT;
    const today = desk.serverToday(off);
    const rows = db.prepare(`SELECT ${DESK_COLS}, magic FROM journal_trades WHERE ${where} AND substr(close_time, 1, 10) = ? ORDER BY close_time`).all(...args, today);
    const cur = (sel ? sel.cur : liveAccts[0]?.cur) || 'USD';
    const net = rows.reduce((s, t) => s + (t.net || 0), 0);
    const rs = rows.filter((t) => t.r !== null && t.r !== undefined);
    // guard rails: the prop firm daily limit of the account in view (set once on the Desk), else none
    const one = sel && !sel.removed ? sel : liveAccts[0] || null;
    let daily = null;
    if (one) {
      const acc = db.prepare(`SELECT ${PROP_COLS} FROM accounts WHERE user_id = ? AND account_number = ?`).get(u.id, one.account_number);
      if (acc && acc.prop_daily) {
        const all = prep(db.prepare(`SELECT ${DESK_COLS} FROM journal_trades WHERE user_id = ? AND account_number = ? ORDER BY close_time`).all(u.id, one.account_number));
        const D = desk.desk(all, limitsOf(acc), today);
        if (D && D.daily) daily = { allow: D.daily.allow, used: D.daily.used, pct: D.daily.pct };
      }
    }
    let news = null;
    try {
      const n = db.prepare('SELECT name, cur, t FROM news_events WHERE imp = 3 AND t > ? ORDER BY t LIMIT 1').get(Date.now());
      if (n) news = { name: n.name, cur: n.cur, t: n.t };
    } catch (e) { /* no news table yet */ }
    // algo / bot days: past BUSY trades today, or most trades placed by an EA (magic number), the screen shows the day as a whole
    const BUSY = 30;
    const busy = rows.length > BUSY && (rows.length > 120 || rows.filter((t) => t.magic).length > rows.length / 2);
    const thin = (list) => { let run = 0; const eq = [0, ...list.map((t) => (run += t.net))]; const step = Math.max(1, Math.ceil(eq.length / 240));
      return eq.filter((v, i) => i % step === 0 || i === eq.length - 1).map((v) => Math.round(v * 100) / 100); };
    // losses in a row at the end of today
    let streak = 0;
    for (let i = rows.length - 1; i >= 0 && rows[i].net < 0; i--) streak++;
    const data = {
      bgs: bgsOf(db.prepare('SELECT live_bg FROM users WHERE id = ?').get(req.user.id) || {}),
      stock: !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY),   // clip tiles, same free clips as Share Studio
      cur, demo: req.query.demo === '1',
      acct: one ? `Account ••${String(one.account_number).slice(-2)}` : '',
      today: { net, r: rs.length ? rs.reduce((s, t) => s + t.r, 0) : null, n: rows.length, won: rows.filter((t) => t.net > 0).length,
        // a normal day sends every trade; a bot day (hundreds of trades) sends the equity line cut down to 240 points
        list: busy ? [] : rows.map((t) => [Math.round(t.net * 100) / 100, t.r === null ? null : Math.round(t.r * 100) / 100]),
        eq: busy ? thin(rows) : null, bots: rows.filter((t) => t.magic).length },
      busy,
      guard: { daily, losses: rows.filter((t) => t.net < 0).length, streak, trades: rows.length, maxLosses: 2, maxTrades: 5 },
      news, lastId: rows.length ? rows[rows.length - 1].id : null,
    };
    req.noSide = true;   // the live screen uses the full width: no side cards
    const qs = (o) => '?' + new URLSearchParams(Object.entries({ account: sel ? sel.account_number : '', ...o }).filter(([, v]) => v)).toString();
    const btn = (attr, label, title) => `<button type="button" class="small secondary" ${attr} title="${title}">${label}</button>`;
    page(req, res, 'Live', `
      <link rel="stylesheet" href="/live.css">
      <div class="lv" data-lv data-state="flat">
        <script type="application/json" data-lv-data>${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
        <div class="row between page-head lv-head"><h1>Live <span class="lv-pulse" data-lv-conn><em></em><span>${data.demo ? 'Sample trade' : 'Waiting for MT5'}</span></span></h1>
          <span class="head-btns">${btn('data-lv-bgbtn aria-expanded="false"', 'Customize', 'Background, and what shows on this screen')}${btn('data-lv-full', 'Full screen', 'Fill the whole screen')}</span></div>
        <div data-h="accts">${acctBar ? acctBar(req, '/journal/live', qs, sc, cur) : ''}</div>

        <section class="lv-hero">
          <div class="lv-bg" data-lv-bg aria-hidden="true"></div>
          <canvas class="lv-line" data-lv-line data-h="line" aria-hidden="true"></canvas>
          <div class="lv-lbl" data-lv-lbl>Today P&amp;L</div>
          <div class="lv-num" data-lv-num data-no-ig>$0</div>
          <div class="lv-subl" data-lv-subl data-h="sub"></div>
          <dl class="lv-stats">
            <div data-h="today"><dt>Today</dt><dd data-lv-today data-no-ig>–</dd></div>
            <div data-h="todayr"><dt>Today R</dt><dd data-lv-todayr>–</dd></div>
            <div data-h="trades"><dt>Trades</dt><dd data-lv-trades>–</dd></div>
            <div data-lv-dlw data-h="used"><dt>Daily loss used</dt><dd data-lv-used data-no-ig>–</dd><i class="lv-bar"><b data-lv-usedbar></b></i></div>
            <div data-h="loss"><dt>Losses</dt><dd data-lv-loss>–</dd></div>
            <div data-lv-news data-h="news"><dt data-lv-nn>Next red news</dt><dd data-lv-cd data-no-ig>None</dd></div>
          </dl>
        </section>

        <section class="lv-run" data-lv-run>
          <div class="lv-track"><i class="lv-fill" data-lv-fill></i><i class="lv-ent"></i><i class="lv-dot" data-lv-dot></i></div>
          <div class="lv-tl"><span>Stop <b class="neg" data-lv-sl></b></span><span>Entry <b data-lv-ep></b></span><span>Target <b class="pos" data-lv-tp></b></span></div>
        </section>

        <section class="lv-check" data-lv-check data-h="check">
          <div class="lv-lbl">Before you click buy or sell</div>
          <div class="lv-chk">
            <label><input type="checkbox"><span>My setup is on the chart, not in my head</span></label>
            <label><input type="checkbox"><span>Stop sits where the idea is wrong</span></label>
            <label><input type="checkbox"><span>Risk is my normal size or less</span></label>
            <label><input type="checkbox"><span>No red news in the next 15 minutes</span></label>
          </div>
        </section>

        <div class="ov-btns lv-btns">
          <span class="lv-feel" data-h="feel" role="group" aria-label="How do you feel?"><button type="button" class="ov-btn" aria-pressed="false">Calm</button><button type="button" class="ov-btn" aria-pressed="false">Focused</button><button type="button" class="ov-btn" aria-pressed="false">Unsure</button><button type="button" class="ov-btn" aria-pressed="false">FOMO</button><button type="button" class="ov-btn" aria-pressed="false">Revenge</button></span>
          <button type="button" class="ov-btn o lv-mark" data-lv-mark data-h="mark">Mark this moment</button>
        </div>

        <div class="lv-ov" data-lv-rev hidden><div class="ov-pn lv-box">
          <div class="lv-lbl" data-lv-revh>Trade closed</div>
          <div class="lv-num lv-num-s" data-lv-revn data-no-ig></div>
          <p class="lv-oq">Did you follow your plan?</p>
          <div class="lv-opts"><button type="button" class="ov-btn">Yes</button><button type="button" class="ov-btn">Partly</button><button type="button" class="ov-btn">No</button></div>
          <p class="lv-oq">Grade it</p>
          <div class="lv-opts"><button type="button" class="ov-btn">A+</button><button type="button" class="ov-btn">A</button><button type="button" class="ov-btn">B</button><button type="button" class="ov-btn">C</button><button type="button" class="ov-btn">F</button></div>
          <div class="lv-share"><a class="ov-btn o" data-lv-share href="/journal/studio">Make a share card</a><button type="button" class="ov-btn" data-lv-done>Done</button></div>
          <p class="lv-fine" data-lv-revt>Closes by itself in 8 s</p>
        </div></div>

        <div class="lv-ov" data-lv-lock hidden><div class="ov-pn lv-box">
          <div class="lv-lbl">Two losses in a row</div>
          <div class="lv-num lv-num-s" data-lv-lcd data-no-ig>30:00</div>
          <div class="lv-breath"><i></i><span data-lv-bt>Breathe in</span></div>
          <p>Lost the battle, not the war. Step away until the timer ends.</p>
        </div></div>

        ${data.demo ? `<div class="lv-demo" role="group" aria-label="Sample moments"><span>Sample</span>
          <button type="button" data-lv-go="flat">Flat</button><button type="button" data-lv-go="trade" aria-pressed="true">In a trade</button>
          <button type="button" data-lv-go="near">Near limit</button><button type="button" data-lv-go="closed">Just closed</button><button type="button" data-lv-go="lock">Cooldown</button><button type="button" data-lv-go="algo">Algo day</button></div>` : ''}
      </div>
      <div class="ov-pn lv-bgp" data-lv-bgp hidden role="dialog" aria-label="Customize">
        <div class="lv-bgp-h"><b>Customize</b><button type="button" class="lv-x" data-lv-bgx aria-label="Close">×</button></div>
        <div class="lv-devs" role="group" aria-label="Design for"><span>Design for</span>
          <button type="button" data-dev="pc">PC</button><button type="button" data-dev="tab">iPad</button><button type="button" data-dev="phone">Phone</button></div>
        <p class="lv-devn" data-lv-devn></p>
        <div class="lv-sec">Background</div>
        <div class="lv-tiles" data-lv-tiles></div>
        <div class="lv-bgp-row"><label>Darken <input type="range" min="0.2" max="0.85" step="0.05" data-lv-dim></label>
          <label class="lv-tog"><input type="checkbox" data-lv-bw> Black and white</label></div>
        <p class="lv-bgp-n" data-lv-bgn>Your own picture or clip stays on this device. It is never uploaded.</p>
        <div class="lv-sec">Show on this screen <small>Tap to hide, for a clean look or a video</small></div>
        <div class="lv-shows" data-lv-shows></div>
        <input type="file" accept="image/*,video/*" data-lv-own hidden style="display:none">
      </div>
      <script src="/live.js"></script>
      <script src="/live-bg.js"></script>`);
  });
};
