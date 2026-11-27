// Live screen (/journal/live): the journal made for a second screen (iPad, phone, side monitor) while trading.
// Today's result, the open trade, guard rails and the next red news, readable from arm's length.
// Page: public/live.css + public/live.js. Fills its own width (container queries), so a shrunk window,
// an iPad, a phone or a thin monitor strip each get their own arrangement.
// Open trades need the Journal EA live pulse (not sent yet): until then ?demo=1 plays a sample trade.
const { esc } = require('./views');

module.exports = function registerLive(app, { db, page, requireUser, requireJournal, scope, acctBar, desk, prep, DESK_COLS, PROP_COLS, limitsOf }) {
  app.get('/journal/live', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const sc = scope(req);
    const { liveAccts, sel, where, args } = sc;
    const off = u.ny_offset ?? desk.NY_DEFAULT;
    const today = desk.serverToday(off);
    const rows = db.prepare(`SELECT ${DESK_COLS} FROM journal_trades WHERE ${where} AND substr(close_time, 1, 10) = ? ORDER BY close_time`).all(...args, today);
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
    // losses in a row at the end of today
    let streak = 0;
    for (let i = rows.length - 1; i >= 0 && rows[i].net < 0; i--) streak++;
    const data = {
      cur, demo: req.query.demo === '1',
      acct: one ? `Account ••${String(one.account_number).slice(-2)}` : '',
      today: { net, r: rs.length ? rs.reduce((s, t) => s + t.r, 0) : null, n: rows.length,
        list: rows.map((t) => [Math.round(t.net * 100) / 100, t.r === null ? null : Math.round(t.r * 100) / 100]) },
      guard: { daily, losses: rows.filter((t) => t.net < 0).length, streak, trades: rows.length, maxLosses: 2, maxTrades: 5 },
      news,
    };
    req.noSide = true;   // the live screen uses the full width: no side cards
    const qs = (o) => '?' + new URLSearchParams(Object.entries({ account: sel ? sel.account_number : '', ...o }).filter(([, v]) => v)).toString();
    const btn = (attr, label, title) => `<button type="button" class="small secondary" ${attr} title="${title}">${label}</button>`;
    page(req, res, 'Live', `
      <link rel="stylesheet" href="/live.css">
      <div class="lv" data-lv data-state="flat">
        <script type="application/json" data-lv-data>${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
        <div class="row between page-head lv-head"><h1>Live <span class="lv-pulse" data-lv-conn><em></em><span>${data.demo ? 'Sample trade' : 'Waiting for MT5'}</span></span></h1>
          <span class="head-btns">${btn('data-lv-priv aria-pressed="false"', 'Hide private info', 'Blurs the money amounts, so you can film or stream')}${btn('data-lv-full', 'Full screen', 'Fill the whole screen')}</span></div>
        ${acctBar ? acctBar(req, '/journal/live', qs, sc, cur) : ''}

        <section class="lv-hero">
          <canvas class="lv-line" data-lv-line aria-hidden="true"></canvas>
          <div class="lv-lbl" data-lv-lbl>Today P&amp;L</div>
          <div class="lv-num" data-lv-num data-no-ig>$0</div>
          <div class="lv-subl" data-lv-subl></div>
          <dl class="lv-stats">
            <div><dt>Today</dt><dd data-lv-today data-no-ig>–</dd></div>
            <div><dt>Today R</dt><dd data-lv-todayr>–</dd></div>
            <div><dt>Trades</dt><dd data-lv-trades>–</dd></div>
            <div data-lv-dlw><dt>Daily loss used</dt><dd data-lv-used data-no-ig>–</dd><i class="lv-bar"><b data-lv-usedbar></b></i></div>
            <div><dt>Losses</dt><dd data-lv-loss>–</dd></div>
            <div data-lv-news><dt data-lv-nn>Next red news</dt><dd data-lv-cd data-no-ig>None</dd></div>
          </dl>
        </section>

        <section class="lv-run" data-lv-run>
          <div class="lv-track"><i class="lv-fill" data-lv-fill></i><i class="lv-ent"></i><i class="lv-dot" data-lv-dot></i></div>
          <div class="lv-tl"><span>Stop <b class="neg" data-lv-sl></b></span><span>Entry <b data-lv-ep></b></span><span>Target <b class="pos" data-lv-tp></b></span></div>
        </section>

        <section class="lv-check" data-lv-check>
          <div class="lv-lbl">Before you click buy or sell</div>
          <div class="lv-chk">
            <label><input type="checkbox"><span>My setup is on the chart, not in my head</span></label>
            <label><input type="checkbox"><span>Stop sits where the idea is wrong</span></label>
            <label><input type="checkbox"><span>Risk is my normal size or less</span></label>
            <label><input type="checkbox"><span>No red news in the next 15 minutes</span></label>
          </div>
        </section>

        <div class="ov-btns lv-btns">
          <span class="lv-feel" role="group" aria-label="How do you feel?"><button type="button" class="ov-btn" aria-pressed="false">Calm</button><button type="button" class="ov-btn" aria-pressed="false">Focused</button><button type="button" class="ov-btn" aria-pressed="false">Unsure</button><button type="button" class="ov-btn" aria-pressed="false">FOMO</button><button type="button" class="ov-btn" aria-pressed="false">Revenge</button></span>
          <button type="button" class="ov-btn o lv-mark" data-lv-mark>Mark this moment</button>
        </div>

        <div class="lv-ov" data-lv-rev hidden><div class="ov-pn lv-box">
          <div class="lv-lbl" data-lv-revh>Trade closed</div>
          <div class="lv-num lv-num-s" data-lv-revn data-no-ig></div>
          <p class="lv-oq">Did you follow your plan?</p>
          <div class="lv-opts"><button type="button" class="ov-btn">Yes</button><button type="button" class="ov-btn">Partly</button><button type="button" class="ov-btn">No</button></div>
          <p class="lv-oq">Grade it</p>
          <div class="lv-opts"><button type="button" class="ov-btn">A+</button><button type="button" class="ov-btn">A</button><button type="button" class="ov-btn">B</button><button type="button" class="ov-btn">C</button><button type="button" class="ov-btn">F</button></div>
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
          <button type="button" data-lv-go="near">Near limit</button><button type="button" data-lv-go="closed">Just closed</button><button type="button" data-lv-go="lock">Cooldown</button></div>` : ''}
      </div>
      <script src="/live.js"></script>`);
  });
};
