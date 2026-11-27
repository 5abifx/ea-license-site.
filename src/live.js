// Live screen (/journal/live): the journal made for a second screen (iPad, phone, side monitor) while trading.
// Today's result, the open trade, guard rails and the next red news, readable from arm's length.
// Page: public/live.css + public/live.js. Fills its own width (container queries), so a shrunk window,
// an iPad, a phone or a thin monitor strip each get their own arrangement.
// Open trades need the Journal EA live pulse (not sent yet): until then ?demo=1 plays a sample trade.
const { esc } = require('./views');

module.exports = function registerLive(app, { db, page, requireUser, requireJournal, scope, desk, prep, DESK_COLS, PROP_COLS, limitsOf }) {
  app.get('/journal/live', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const { liveAccts, sel, where, args } = scope(req);
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
    page(req, res, 'Live', `
      <link rel="stylesheet" href="/live.css">
      <div class="lv" data-lv data-state="flat">
        <script type="application/json" data-lv-data>${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
        <div class="lv-glow" aria-hidden="true"><i></i><i></i><i></i></div>
        <header class="lv-top">
          <div class="lv-ttl"><h1>Live</h1><span class="lv-pulse" data-lv-conn><em></em><span>${data.demo ? 'Sample trade' : 'Waiting for MT5'}</span></span></div>
          <div class="lv-chips">
            ${data.acct ? `<span class="lv-chip">${esc(data.acct)}</span>` : ''}
            <span class="lv-chip" data-lv-sess>New York</span>
            <span class="lv-chip lv-clock" data-lv-clock>--:--</span>
          </div>
          <div class="lv-btns">
            <button type="button" class="lv-ib" data-lv-priv title="Hide private info" aria-label="Hide private info"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button type="button" class="lv-ib" data-lv-full title="Full screen" aria-label="Full screen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          </div>
        </header>

        <div class="lv-grid">
          <section class="lv-t lv-today">
            <div class="lv-lbl">Today</div>
            <div class="lv-big" data-lv-today data-no-ig>$0</div>
            <div class="lv-sub"><b data-lv-todayr></b> <span data-lv-todayn></span></div>
            <div class="lv-dots" data-lv-dots></div>
            <canvas class="lv-cv" data-lv-eq aria-hidden="true"></canvas>
          </section>

          <section class="lv-t lv-trade">
            <div class="lv-flat" data-lv-flat>
              <div class="lv-lbl">No open trade</div>
              <h2 class="lv-q">Before you click buy or sell</h2>
              <div class="lv-chk">
                <label><input type="checkbox"><span>My setup is on the chart, not in my head</span></label>
                <label><input type="checkbox"><span>Stop sits where the idea is wrong</span></label>
                <label><input type="checkbox"><span>Risk is my normal size or less</span></label>
                <label><input type="checkbox"><span>No red news in the next 15 minutes</span></label>
              </div>
            </div>
            <div class="lv-open" data-lv-open>
              <div class="lv-hd"><b class="lv-sym" data-lv-sym>XAUUSD</b><span class="lv-side" data-lv-side>Buy 0.40</span><span class="lv-tim" data-lv-tim></span></div>
              <div class="lv-big lv-fl" data-lv-fl data-no-ig>$0</div>
              <div class="lv-sub"><b data-lv-flr></b> <span>right now</span></div>
              <canvas class="lv-cv lv-path" data-lv-path aria-hidden="true"></canvas>
              <div class="lv-tube">
                <canvas data-lv-tube aria-hidden="true"></canvas>
                <div class="lv-tl"><span>Stop <b class="l" data-lv-sl></b></span><span>Entry</span><span>Target <b class="w" data-lv-tp></b></span></div>
              </div>
              <div class="lv-facts"><div><small>Risk</small><b data-lv-risk>0.25%</b></div><div><small>Planned</small><b data-lv-plan>1 : 2</b></div><div><small>Stop moved</small><b>No</b></div></div>
            </div>
          </section>

          <section class="lv-t lv-guard">
            <div class="lv-lbl">Guard rails</div>
            <div class="lv-orbw"><canvas class="lv-orb" data-lv-orb aria-hidden="true"></canvas><div class="lv-orbt"><b data-lv-used data-no-ig>0%</b><span data-lv-left>of daily loss used</span></div></div>
            <div class="lv-rows">
              <div><span>Losses today</span><b data-lv-loss></b></div>
              <div><span>Trades today</span><b data-lv-trades></b></div>
              <div><span>KATANA</span><b class="w" data-lv-kat>Armed</b></div>
            </div>
            <div class="lv-news" data-lv-news><small>Next red news</small><b data-lv-nn>None today</b><span class="lv-cd" data-lv-cd data-no-ig></span></div>
          </section>
        </div>

        <div class="lv-tap" data-lv-tap>
          <span class="lv-tq">How do you feel?</span>
          <div class="lv-feel" role="group" aria-label="How do you feel?"><button type="button" aria-pressed="false">Calm</button><button type="button" aria-pressed="false">Focused</button><button type="button" aria-pressed="false">Unsure</button><button type="button" aria-pressed="false">FOMO</button><button type="button" aria-pressed="false">Revenge</button></div>
          <button type="button" class="lv-mark" data-lv-mark>Mark this moment</button>
        </div>

        <div class="lv-ov lv-rev" data-lv-rev hidden><div class="lv-box">
          <div class="lv-lbl" data-lv-revh>Trade closed</div>
          <div class="lv-big" data-lv-revn data-no-ig></div>
          <p class="lv-oq">Did you follow your plan?</p>
          <div class="lv-opts"><button type="button">Yes</button><button type="button">Partly</button><button type="button">No</button></div>
          <p class="lv-oq">Grade it</p>
          <div class="lv-opts"><button type="button">A+</button><button type="button">A</button><button type="button">B</button><button type="button">C</button><button type="button">F</button></div>
          <p class="lv-fine" data-lv-revt>Closes by itself in 8 s</p>
        </div></div>

        <div class="lv-ov lv-lock" data-lv-lock hidden><div class="lv-box">
          <div class="lv-lbl">Two losses in a row</div>
          <div class="lv-breath"><canvas data-lv-breath aria-hidden="true"></canvas><span data-lv-bt>Breathe in</span></div>
          <div class="lv-big lv-lcd" data-lv-lcd data-no-ig>30:00</div>
          <p>Lost the battle, not the war. Step away until the timer ends.</p>
        </div></div>

        ${data.demo ? `<div class="lv-demo" role="group" aria-label="Sample moments"><span>Sample</span>
          <button type="button" data-lv-go="flat">Flat</button><button type="button" data-lv-go="trade" aria-pressed="true">In a trade</button>
          <button type="button" data-lv-go="near">Near limit</button><button type="button" data-lv-go="closed">Just closed</button><button type="button" data-lv-go="lock">Cooldown</button></div>` : ''}
      </div>
      <script src="/live.js"></script>`);
  });
};
