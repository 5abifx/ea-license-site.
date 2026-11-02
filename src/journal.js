// Trade Journal: receives trades from the Trade Journal EA and shows them to the customer.
const crypto = require('crypto');
const { insights } = require('./insights');
const express = require('express');
const { esc, fmtDate } = require('./views');

const JOURNAL_CODE = process.env.JOURNAL_EA_CODE || 'JOURNAL';
const EMOTIONS = ['', 'Calm', 'Confident', 'Patient', 'Anxious', 'Greedy', 'Fearful', 'Revenge', 'Bored', 'FOMO'];

module.exports = function registerJournal(app, { db, page, flash, requireUser, isExpired, cleanAccount }) {
  const hasJournal = (u) => !!u && (u.is_admin || (u.status === 'active' && !isExpired(u) && !!db.prepare(`
    SELECT 1 FROM user_eas ue JOIN eas e ON e.id = ue.ea_id
    WHERE ue.user_id = ? AND e.code = ? AND e.active = 1`).get(u.id, JOURNAL_CODE)));

  const ensureKey = (u) => {
    if (u.journal_key) return u.journal_key;
    const key = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET journal_key = ? WHERE id = ?').run(key, u.id);
    u.journal_key = key;
    return key;
  };

  // tell the layout whether to show the Journal link
  app.use((req, res, next) => { req.hasJournal = hasJournal(req.user); next(); });
  const requireJournal = (req, res, next) => {
    if (req.hasJournal) return next();
    page(req, res, 'Trade Journal', `
      <div class="card narrow"><h1>Trade Journal</h1>
      <p>The Trade Journal is not part of your license yet. Contact us to add it to your account.</p></div>`);
  };

  // ---------- API: the EA sends one closed trade ----------
  // POST /api/journal/trades  { key, ea, account, broker, currency, trade: {...} }
  app.post('/api/journal/trades', express.json({ limit: '3mb' }), (req, res) => {
    const b = req.body || {};
    const fail = (status, message) => res.status(status).json({ ok: false, message });
    const account = cleanAccount(b.account);
    const t = b.trade;
    if (!account || !t || typeof t !== 'object') return fail(400, 'Missing account or trade');
    const u = db.prepare('SELECT * FROM users WHERE journal_key = ?').get(String(b.key || ''));
    if (!u || !b.key) return fail(403, 'Wrong journal key');
    if (!hasJournal(u)) return fail(403, 'Trade Journal license is not active');
    if (!db.prepare('SELECT 1 FROM accounts WHERE user_id = ? AND account_number = ?').get(u.id, account)) {
      return fail(403, `Account ${account} is not registered on your dashboard`);
    }

    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const s = (v, max = 120) => String(v ?? '').slice(0, max);
    const side = s(t.side).toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const positionId = s(t.position_id, 40);
    if (!positionId || !s(t.symbol)) return fail(400, 'Missing position_id or symbol');

    // partial closes: every closing deal except the final one
    const outs = (Array.isArray(t.partials) ? t.partials : []).slice(0, 100)
      .map((p) => ({ time: s(p.time, 25), price: n(p.price), lots: n(p.lots), profit: n(p.profit) }))
      .filter((p) => p.price !== null);
    const partials = outs.slice(0, -1);
    const candles = (Array.isArray(t.candles) ? t.candles : []).slice(-600)
      .filter((k) => Array.isArray(k) && k.length >= 5 && k.slice(0, 5).every((v) => Number.isFinite(Number(v))))
      .map((k) => k.slice(0, 5).map(Number));

    const row = {
      user_id: u.id, account_number: account, position_id: positionId, symbol: s(t.symbol, 40), side,
      lots: n(t.lots), entry: n(t.entry), exit: n(t.exit), sl: n(t.sl) || null, tp: n(t.tp) || null, digits: n(t.digits),
      open_time: s(t.open_time, 25), close_time: s(t.close_time, 25),
      profit: n(t.profit), commission: n(t.commission), swap: n(t.swap), net: n(t.net),
      pips: n(t.pips), r: n(t.risk_money) ? n(t.r) : null, risk_money: n(t.risk_money) || null,
      risk_pct: n(t.risk_pct) || null, pct: n(t.pct), balance_after: n(t.balance_after),
      mfe: n(t.mfe), mae: n(t.mae), magic: n(t.magic), comment: s(t.comment, 64),
      currency: s(b.currency, 8), broker: s(b.broker, 80), tf: s(t.tf, 8),
      partials: JSON.stringify(partials), candles: JSON.stringify(candles),
    };
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO journal_trades (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})
      ON CONFLICT (user_id, account_number, position_id) DO UPDATE SET
      ${cols.filter((c) => !['user_id', 'account_number', 'position_id'].includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')},
      updated_at = datetime('now')`).run(row);
    db.prepare(`UPDATE accounts SET last_check_at = datetime('now'), last_check_ea = ? WHERE user_id = ? AND account_number = ?`)
      .run(JOURNAL_CODE, u.id, account);
    res.json({ ok: true, message: 'Stored' });
  });

  // ---------- pages ----------
  const money = (v, cur = '') => (v === null || v === undefined ? '-' : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}${cur ? ' ' + esc(cur) : ''}`);
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  app.get('/journal', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const key = ensureKey(u);

    // accounts: live ones are still on My EAs; removed ones keep their trades in their own tab
    const live = new Set(db.prepare('SELECT account_number FROM accounts WHERE user_id = ?').all(u.id).map((a) => a.account_number));
    const accts = db.prepare(`SELECT account_number, COUNT(*) AS n, SUM(net) AS net, MAX(broker) AS broker, MAX(currency) AS cur
        FROM journal_trades WHERE user_id = ? GROUP BY account_number ORDER BY MAX(close_time) DESC`).all(u.id);
    accts.forEach((a) => { a.removed = !live.has(a.account_number); });
    const liveAccts = accts.filter((a) => !a.removed), removedAccts = accts.filter((a) => a.removed);
    const q = cleanAccount(req.query.account);
    const sel = accts.find((a) => a.account_number === q) || null;
    const liveNums = liveAccts.map((a) => a.account_number);
    const where = sel ? 'user_id = ? AND account_number = ?'
      : `user_id = ? AND account_number IN (${liveNums.map(() => '?').join(', ') || "''"})`;
    const args = sel ? [u.id, sel.account_number] : [u.id, ...liveNums];

    // month shown: ?month=YYYY-MM, else the month of the latest trade
    const latest = db.prepare(`SELECT MAX(close_time) AS t FROM journal_trades WHERE ${where}`).get(...args).t;
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month
      : (latest || new Date().toISOString()).slice(0, 7);
    const trades = db.prepare(`SELECT id, account_number, symbol, side, lots, net, r, close_time, setup, currency, broker
        FROM journal_trades WHERE ${where} AND substr(close_time, 1, 7) = ? ORDER BY close_time`).all(...args, month);
    const cur = (sel ? sel.cur : liveAccts[0]?.cur) || '';
    const days = {};
    trades.forEach((t) => { (days[t.close_time.slice(0, 10)] ||= []).push(t); });
    const sum = (l) => l.reduce((s, t) => s + (t.net || 0), 0);
    const dayKeys = Object.keys(days).sort();
    const net = sum(trades), wins = trades.filter((t) => t.net > 0).length;
    const greenDays = dayKeys.filter((d) => sum(days[d]) > 0).length;
    const bestDay = dayKeys.length ? Math.max(...dayKeys.map((d) => sum(days[d]))) : null;

    // calendar geometry (Monday first)
    const [yy, mm] = month.split('-').map(Number);
    const nDays = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay() + 6) % 7;
    const iso = (d) => `${month}-${String(d).padStart(2, '0')}`;
    const shift = (n) => { const dt = new Date(Date.UTC(yy, mm - 1 + n, 1)); return dt.toISOString().slice(0, 7); };
    const monthName = new Date(Date.UTC(yy, mm - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const short = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.round(Math.abs(v))}`;
    const qs = (o) => '?' + new URLSearchParams(Object.entries({ account: sel ? sel.account_number : '', month, ...o }).filter(([, v]) => v)).toString();
    const pickDay = dayKeys[dayKeys.length - 1] || '';

    let grid = DOW.map((d) => `<div class="dow">${d}</div>`).join('') + '<div class="dow">Week</div>';
    let cell = 0, week = [];
    const weekCell = () => { const l = week.flat(); grid += `<div class="wk"><span>Week</span><b class="${cls(sum(l))}">${l.length ? short(sum(l)) : '-'}</b></div>`; week = []; };
    for (let i = 0; i < lead; i++, cell++) grid += '<div class="day out"></div>';
    for (let d = 1; d <= nDays; d++, cell++) {
      const l = days[iso(d)] || [], s = sum(l), weekend = cell % 7 >= 5;
      grid += l.length
        ? `<button type="button" class="day ${s >= 0 ? 'win' : 'loss'}" data-day="${iso(d)}" aria-pressed="${iso(d) === pickDay}"><span class="d">${d}</span><span class="v ${cls(s)}">${short(s)}</span><span class="n">${l.length} trade${l.length > 1 ? 's' : ''}</span></button>`
        : `<div class="day${weekend ? ' off' : ''}"><span class="d">${d}</span></div>`;
      week.push(l);
      if ((cell + 1) % 7 === 0) weekCell();
    }
    if (cell % 7) { for (; cell % 7; cell++) grid += '<div class="day out"></div>'; weekCell(); }

    // phone: days with trades, newest first, grouped by week
    const weeks = {};
    [...dayKeys].reverse().forEach((d) => { const w = Math.floor((Number(d.slice(8)) + lead - 1) / 7); (weeks[w] ||= []).push(d); });
    const list = Object.keys(weeks).map(Number).sort((a, b) => b - a).map((w) => {
      const ws = sum(weeks[w].flatMap((d) => days[d]));
      return `<div class="wkhead"><span>Week ${w + 1}</span><span class="${cls(ws)}">${money(ws, cur)}</span></div>` + weeks[w].map((d) => {
        const l = days[d], s = sum(l), mx = Math.max(...l.map((t) => Math.abs(t.net || 0)), 1);
        const wd = DOW[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7];
        return `<button type="button" class="arow" data-day="${d}" aria-pressed="${d === pickDay}"><span class="dt">${wd} ${Number(d.slice(8))}<small>${l.length} trade${l.length > 1 ? 's' : ''}</small></span>
          <span class="bars">${l.map((t) => `<i class="${(t.net || 0) >= 0 ? 'up' : 'down'}" style="height:${Math.max(4, Math.round(Math.abs(t.net || 0) / mx * 22))}px"></i>`).join('')}</span>
          <span class="v ${cls(s)}">${money(s, cur)}</span></button>`;
      }).join('');
    }).join('');

    // one hidden panel per trading day; the calendar shows the picked one
    const panels = dayKeys.map((d) => {
      const l = days[d], s = sum(l), wd = DOW[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7];
      return `<div class="dayp" data-day="${d}"${d === pickDay ? '' : ' hidden'}>
        <h3>${wd} ${Number(d.slice(8))} ${esc(monthName.split(' ')[0])}</h3>
        <p class="muted">${l.length} trade${l.length > 1 ? 's' : ''} · <strong class="${cls(s)}">${money(s, cur)}</strong></p>
        <table><tbody>${l.map((t) => `<tr>
          <td class="muted">${esc(t.close_time.slice(11, 16))}</td>
          <td><strong>${esc(t.symbol)}</strong> ${esc(t.side)} ${t.lots ?? ''}${!sel && liveAccts.length > 1 ? `<br><span class="muted small">${esc(t.broker || 'Account')} · ${esc(t.account_number)}</span>` : ''}${t.setup ? `<br><span class="muted small">${esc(t.setup)}</span>` : ''}</td>
          <td class="right"><span class="${cls(t.net)}">${money(t.net)}</span><br><a class="small" href="/journal/${t.id}">Open ›</a></td></tr>`).join('')}
        </tbody></table></div>`;
    }).join('');

    // insights over the last 90 days of the shown accounts
    const since = latest ? new Date(Date.parse(latest.slice(0, 10) + 'T00:00:00Z') - 89 * 864e5).toISOString().slice(0, 10) : '';
    const ins = latest ? insights(db.prepare(`SELECT account_number, symbol, side, net, r, open_time, close_time
        FROM journal_trades WHERE ${where} AND close_time >= ? ORDER BY close_time`).all(...args, since), { money: (v) => money(v, cur), esc }) : null;
    const insightsHtml = !ins ? '' : `<section class="card insights">
      <div class="row between"><h2>Insights</h2><span class="muted small">${ins.locked ? '' : `Last 90 days · ${ins.count} trades${sel ? '' : liveAccts.length > 1 ? ' · all accounts' : ''}`}</span></div>
      ${ins.locked ? `<p class="muted">Insights unlock after ${ins.need} closed trades. ${ins.have} so far.</p>`
        : ins.items.length ? `<div class="ins-grid">${ins.items.map((i) => `<div class="ins ${i.tone}"><span class="ins-tag"><i></i>${esc(i.tag)}</span><p>${i.html}</p></div>`).join('')}</div>`
        : '<p class="muted">No clear patterns yet. Keep journaling and check back.</p>'}
    </section>`;

    const chip = (a, label, sub, href, on) => `<a class="acct${a && a.removed ? ' removed' : ''}${on ? ' on' : ''}" href="${href}">
      <small>${label}</small><b class="${cls(a ? a.net : 0)}">${a ? money(a.net, a.cur) : ''}</b><small>${sub}</small></a>`;
    const allNet = liveAccts.reduce((s, a) => s + (a.net || 0), 0), allN = liveAccts.reduce((s, a) => s + a.n, 0);
    const site = req.protocol + '://' + req.get('host');

    page(req, res, 'Trade Journal', `
    <h1>Trade Journal</h1>
    ${accts.length ? `<div class="accts" role="navigation" aria-label="Accounts">
      ${liveAccts.length > 1 || removedAccts.length ? `<a class="acct${sel ? '' : ' on'}" href="/journal${qs({ account: '' })}"><small>All accounts</small><b class="${cls(allNet)}">${money(allNet, cur)}</b><small>${allN} trades</small></a>` : ''}
      ${liveAccts.map((a) => chip(a, `${esc(a.broker || 'Account')} · ${esc(a.account_number)}`, `${a.n} trades`, `/journal${qs({ account: a.account_number })}`, sel === a || (!sel && liveAccts.length === 1 && !removedAccts.length))).join('')}
      ${removedAccts.map((a) => chip(a, `${esc(a.broker || 'Account')} · ${esc(a.account_number)}`, '<span class="tag">Removed</span>', `/journal${qs({ account: a.account_number })}`, sel === a)).join('')}
    </div>` : ''}

    ${sel && sel.removed ? `<section class="card notice">
      <p><strong>Account ${esc(sel.account_number)} is no longer on <a href="/dashboard">My EAs</a>.</strong> Its ${sel.n} trades are kept here and left out of "All accounts". Add the account again on My EAs to bring it back, or delete these trades for good.</p>
      <form method="post" action="/journal/accounts/${esc(sel.account_number)}/delete" onsubmit="return confirm('Delete all ${sel.n} trades of account ${esc(sel.account_number)}? This cannot be undone.')">
        <button class="small danger">Delete these trades</button></form>
    </section>` : ''}

    <div class="stats">
      <div><span>${esc(monthName)}</span><strong class="${cls(net)}">${trades.length ? money(net, cur) : '-'}</strong></div>
      <div><span>Trades</span><strong>${trades.length}</strong></div>
      <div><span>Win rate</span><strong>${trades.length ? Math.round((wins / trades.length) * 100) + '%' : '-'}</strong></div>
      <div><span>Green days</span><strong>${dayKeys.length ? `${greenDays} / ${dayKeys.length}` : '-'}</strong></div>
      <div><span>Best day</span><strong class="${cls(bestDay)}">${bestDay === null ? '-' : money(bestDay, cur)}</strong></div>
    </div>

    <div class="cal-split">
      <section class="card">
        <div class="row between cal-head"><h2>${esc(monthName)}</h2>
          <span><a class="btn small secondary" href="/journal${qs({ month: shift(-1) })}" aria-label="Previous month">‹</a>
          <a class="btn small secondary" href="/journal${qs({ month: shift(1) })}" aria-label="Next month">›</a></span></div>
        ${accts.length ? `<div class="cal-grid">${grid}</div>
        <div class="cal-list">${list || '<p class="muted">No trades this month.</p>'}</div>`
        : '<p class="muted">No trades yet. Connect the Trade Journal EA below; every trade you close will appear here.</p>'}
      </section>
      <aside class="card day-panel" aria-live="polite">${panels || `<p class="muted">${accts.length ? 'No trades this month. Use ‹ › to change month.' : 'Tap a day to see its trades.'}</p>`}</aside>
    </div>
    <script src="/calendar.js"></script>

    ${insightsHtml}

    <section class="card">
      <h2>Connect the Trade Journal EA</h2>
      <ol class="steps">
        <li>Download <strong>Trade Journal</strong> from <a href="/dashboard">My EAs</a> and attach it to <strong>one extra chart</strong> on each MT5 account (MT5 allows one EA per chart, so open a new chart for it; any symbol works). It reads the whole account, so it logs every symbol and every EA, and it never trades, so it runs safely next to KATANA.</li>
        <li>Paste this key into the EA's <strong>Journal key</strong> input:
          <code class="block">${esc(key)}</code></li>
        <li>Make sure the account number is on <a href="/dashboard">My EAs</a>, and that MT5 allows <code>${esc(site)}</code> under Tools → Options → Expert Advisors → Allow WebRequest.</li>
      </ol>
      <form method="post" action="/journal/key" onsubmit="return confirm('Make a new key? The old key stops working and you must paste the new one into the EA.')">
        <button class="small secondary">Make a new key</button></form>
    </section>`);
  });

  // delete the trades of an account that was removed from My EAs (live accounts are refused)
  app.post('/journal/accounts/:num/delete', requireUser, requireJournal, (req, res) => {
    const num = cleanAccount(req.params.num);
    if (!num || db.prepare('SELECT 1 FROM accounts WHERE user_id = ? AND account_number = ?').get(req.user.id, num)) {
      flash(req, 'error', 'Only trades of removed accounts can be deleted.');
      return res.redirect('/journal');
    }
    const r = db.prepare('DELETE FROM journal_trades WHERE user_id = ? AND account_number = ?').run(req.user.id, num);
    flash(req, 'ok', `Deleted ${r.changes} trade${r.changes === 1 ? '' : 's'} of account ${num}.`);
    res.redirect('/journal');
  });

  app.post('/journal/key', requireUser, requireJournal, (req, res) => {
    db.prepare('UPDATE users SET journal_key = ? WHERE id = ?').run(crypto.randomBytes(16).toString('hex'), req.user.id);
    flash(req, 'ok', 'New journal key created. Paste it into the EA inputs.');
    res.redirect('/journal');
  });

  const getTrade = (req) => db.prepare('SELECT * FROM journal_trades WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

  app.get('/journal/:id', requireUser, requireJournal, (req, res) => {
    const t = getTrade(req);
    if (!t) return res.status(404).send('Not found');
    const d = t.digits ?? 5;
    const fx = (v) => (v === null || v === undefined ? '' : Number(v).toFixed(d));
    const card = {
      handle: req.user.card_handle || '', symbol: t.symbol, side: t.side, lots: t.lots === null ? '' : t.lots.toFixed(2),
      entry: fx(t.entry), exit: fx(t.exit), sl: fx(t.sl), tp: fx(t.tp),
      pnl: t.net, pct: t.pct, pips: t.pips, r: t.r, open: t.open_time, close: t.close_time,
      setup: t.setup, risk: t.risk_pct === null ? '' : t.risk_pct.toFixed(1), ticket: t.position_id, tf: t.tf,
      partials: JSON.parse(t.partials || '[]'), candles: JSON.parse(t.candles || '[]'),
    };
    const json = JSON.stringify(card).replace(/</g, '\\u003c');
    const partials = card.partials;

    page(req, res, `${t.symbol} ${t.side}`, `
    <p><a href="/journal">← All trades</a></p>
    <h1>${esc(t.symbol)} ${esc(t.side)} <span class="${cls(t.net)}">${money(t.net, t.currency)}</span></h1>
    <p class="muted">Account ${esc(t.account_number)} · position ${esc(t.position_id)} · ${fmtDate(t.open_time)} → ${fmtDate(t.close_time)} (broker time)</p>

    <section class="card">
      <h2>Share cards <span class="tag">5ABI.FX story · 9:16</span></h2>
      <p class="muted">Swipe story: card 1 is the result, card 2 is the real MT5 chart of this trade.</p>
      <div class="row">
        <select id="mode"><option value="money">Show $ amount</option><option value="pct">Show % of account</option><option value="r">Show R multiple</option></select>
        <label class="check"><input type="checkbox" id="rm" checked> KATANA badge</label>
      </div>
      <div class="cards">
        <figure><canvas id="c1"></canvas><button class="small" data-save="c1">Save card 1</button></figure>
        <figure><canvas id="c2"></canvas><button class="small" data-save="c2">Save card 2</button></figure>
      </div>
      <form method="post" action="/journal/handle" class="row">
        <input name="card_handle" value="${esc(req.user.card_handle)}" placeholder="Your handle on the cards, e.g. @5abi.fx" maxlength="40">
        <button class="small secondary">Save handle</button>
        <input type="hidden" name="back" value="${t.id}">
      </form>
    </section>

    ${req.user.is_admin ? `<section class="card">
      <h2>Story overlay <span class="tag">admin test · transparent PNG</span></h2>
      <p class="muted">Quote, the real candles of this trade with entry/exit arrows, and the result, on a transparent background for Instagram stories. No prices, SL or TP. Only admins see this for now.</p>
      <div class="row">
        <select id="ov-style">${Object.entries({ scalper: 'Scalper', trend: 'Trend following', counter: 'Counter trend', swing: 'Swing' }).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <select id="ov-show"><option value="pct">Show %</option><option value="r">Show R</option><option value="pips">Show pips</option></select>
        <label class="check"><input type="checkbox" id="ov-ad" checked> 5ABI.FX line</label>
        <button type="button" class="small secondary" id="ov-next">Next quote</button>
        <label class="check"><input type="checkbox" id="ov-candles" checked> Candles</label>
        <label class="check"><input type="checkbox" id="ov-scrim"> Dark fade</label>
      </div>
      <div class="row">
        <label>Preview photo <input type="file" id="ov-photo" accept="image/*"></label>
        <label class="check"><input type="checkbox" id="ov-bake"> Include photo in PNG</label>
      </div>
      <div class="cards">
        <figure><canvas id="ov" class="overlay"></canvas><button class="small" data-save-ov>Save overlay PNG</button></figure>
      </div>
    </section>` : ''}

    <section class="card">
      <h2>Trade</h2>
      <table><tbody>
        <tr><th>Entry</th><td>${fx(t.entry)}</td><th>Exit</th><td>${fx(t.exit)}</td></tr>
        <tr><th>Stop loss</th><td>${fx(t.sl) || '-'}</td><th>Take profit</th><td>${fx(t.tp) || '-'}</td></tr>
        <tr><th>Lots</th><td>${t.lots ?? '-'}</td><th>Pips</th><td>${t.pips ?? '-'}</td></tr>
        <tr><th>R multiple</th><td>${t.r === null ? '-' : t.r.toFixed(2)}</td><th>Risk</th><td>${t.risk_pct === null ? '-' : t.risk_pct.toFixed(2) + '%'}</td></tr>
        <tr><th>Gross / costs</th><td>${money(t.profit)} / ${money((t.commission || 0) + (t.swap || 0))}</td><th>Best / worst move</th><td>${fx(t.mfe) || '-'} / ${fx(t.mae) || '-'}</td></tr>
        <tr><th>Magic / comment</th><td>${t.magic ?? '-'} ${esc(t.comment)}</td><th>Partial closes</th><td>${partials.length ? partials.map((p) => `${p.lots} @ ${fx(p.price)}`).join('<br>') : 'none'}</td></tr>
      </tbody></table>
    </section>

    <section class="card">
      <h2>Your notes</h2>
      <form method="post" action="/journal/${t.id}" class="grid">
        <label>Setup<input name="setup" value="${esc(t.setup)}" maxlength="60" placeholder="e.g. London breakout"></label>
        <label>Emotion<select name="emotion">${EMOTIONS.map((e) => `<option ${e === t.emotion ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
        <label>Rating<select name="rating">${['', 1, 2, 3, 4, 5].map((r) => `<option value="${r}" ${String(r) === String(t.rating ?? '') ? 'selected' : ''}>${r ? '★'.repeat(r) : '-'}</option>`).join('')}</select></label>
        <label>Mistakes<input name="mistakes" value="${esc(t.mistakes)}" maxlength="200" placeholder="e.g. moved stop, entered early"></label>
        <label class="full">Notes<textarea name="notes" rows="4" maxlength="4000">${esc(t.notes)}</textarea></label>
        <div><button>Save notes</button></div>
      </form>
    </section>

    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Hanken+Grotesk:wght@500;700&family=IBM+Plex+Mono:wght@500;600${req.user.is_admin ? '&family=DM+Serif+Display:ital@0;1&family=Montserrat:wght@500;600' : ''}&display=swap">
    <script id="trade-data" type="application/json">${json}</script>
    <script src="/cards.js"></script>
    ${req.user.is_admin ? '<script src="/overlay.js"></script>' : ''}
    <script src="/journal.js"></script>`);
  });

  app.post('/journal/handle', requireUser, requireJournal, (req, res) => {
    db.prepare('UPDATE users SET card_handle = ? WHERE id = ?').run(String(req.body.card_handle || '').trim().slice(0, 40), req.user.id);
    res.redirect(`/journal/${Number(req.body.back) || ''}`);
  });

  app.post('/journal/:id', requireUser, requireJournal, (req, res) => {
    const t = getTrade(req);
    if (!t) return res.status(404).send('Not found');
    const rating = Number(req.body.rating);
    db.prepare(`UPDATE journal_trades SET setup = ?, emotion = ?, mistakes = ?, notes = ?, rating = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(String(req.body.setup || '').trim().slice(0, 60), EMOTIONS.includes(req.body.emotion) ? req.body.emotion : '',
        String(req.body.mistakes || '').trim().slice(0, 200), String(req.body.notes || '').slice(0, 4000),
        rating >= 1 && rating <= 5 ? rating : null, t.id);
    flash(req, 'ok', 'Notes saved.');
    res.redirect(`/journal/${t.id}`);
  });
};
