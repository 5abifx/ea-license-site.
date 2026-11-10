// Trade Journal: receives trades from the Trade Journal EA and shows them to the customer.
const crypto = require('crypto');
const { analyze, propGuard, prep, numbers, score, MIN_TRADES } = require('./insights');
const insightsView = require('./insights-view');
const desk = require('./desk');
const deskView = require('./desk-view');
const terminal = require('./terminal');
const news = require('./news');
const terminalView = require('./terminal-view');
const TP = require('./tradeplans');
const express = require('express');
const { esc, fmtDate } = require('./views');
// setup tag chips (members-only): one shape and one target, any number of levels and confluences
const tagForm = (cur) => { const have = new Set(TP.setupTags(cur)); return `<div class="tp-tags">${TP.TAGS.map(([k, l, opts, one]) => `<div class="tp-tg"><span>${l}</span><div class="tp-seg"${one ? ' data-one' : ''}>${opts.map((o) => `<label><input type="${one ? 'radio' : 'checkbox'}" name="${k}" value="${esc(o)}"${have.has(o) ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></div>`).join('')}</div>`; };

const JOURNAL_CODE = process.env.JOURNAL_EA_CODE || 'JOURNAL';
const EMOTIONS = ['', 'Calm', 'Confident', 'Patient', 'Anxious', 'Greedy', 'Fearful', 'Revenge', 'Bored', 'FOMO'];

const KEEP_IF_EDITED = ['sl', 'r', 'risk_money', 'risk_pct'];   // columns the trader can correct

module.exports = function registerJournal(app, { db, page, flash, requireUser, isExpired, cleanAccount, mentorBox, setJournalAccess }) {
  TP.init(db);
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
  if (setJournalAccess) setJournalAccess(hasJournal);
  app.use((req, res, next) => { req.hasJournal = hasJournal(req.user); next(); });
  const requireJournal = (req, res, next) => {
    if (req.hasJournal) return next();
    page(req, res, 'Trade Journal', `
      <div class="card narrow"><h1>Trade Journal</h1>
      <p>The Trade Journal is not part of your license yet. Contact us to add it to your account.</p></div>`);
  };

  // ---------- API: the EA sends one closed trade ----------
  // POST /api/journal/calendar  { key, account, events: [[event_id, utc_seconds, cur, name, imp, actual, forecast, previous, unit, move, dir]] }
  // MT5's own economic calendar, sent by the Trade Journal EA; feeds the Desk's news catalysts for everyone
  app.post('/api/journal/calendar', express.json({ limit: '2mb' }), (req, res) => {
    const b = req.body || {};
    const account = cleanAccount(b.account);
    const u = b.key ? db.prepare('SELECT * FROM users WHERE journal_key = ?').get(String(b.key)) : null;
    if (!u) return res.status(403).json({ ok: false, message: 'Wrong journal key' });
    if (!hasJournal(u)) return res.status(403).json({ ok: false, message: 'Trade Journal license is not active' });
    if (!account || !db.prepare('SELECT 1 FROM accounts WHERE user_id = ? AND account_number = ?').get(u.id, account)) {
      return res.status(403).json({ ok: false, message: `Account ${account} is not registered on your dashboard` });
    }
    res.json({ ok: true, saved: news.save(db, b.events) });
  });

  // POST /api/journal/plan  { key, account, plan: { symbol, side, entry, sl, tp, risk_pct, risk_money, lots, balance, time, shape, loc, target, conf } }
  // KATANA's PLAN button: the trade set up on the chart becomes a plan, with the profile shape and level Compass saw
  app.post('/api/journal/plan', express.json({ limit: '32kb' }), (req, res) => {
    const b = req.body || {}, p = b.plan;
    const fail = (status, message) => res.status(status).json({ ok: false, message });
    const account = cleanAccount(b.account);
    if (!account || !p || typeof p !== 'object') return fail(400, 'Missing account or plan');
    const u = b.key ? db.prepare('SELECT * FROM users WHERE journal_key = ?').get(String(b.key)) : null;
    if (!u) return fail(403, 'Wrong journal key');
    if (!hasJournal(u)) return fail(403, 'Trade Journal license is not active');
    if (!db.prepare('SELECT 1 FROM accounts WHERE user_id = ? AND account_number = ?').get(u.id, account)) return fail(403, `Account ${account} is not on your dashboard`);
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const side = String(p.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY', dir = side === 'SELL' ? -1 : 1;
    const entry = n(p.entry), sl = n(p.sl), tp = n(p.tp), risk = n(p.risk_pct);
    const symbol = String(p.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9._#-]/g, '').slice(0, 20);
    if (!symbol || !(entry > 0 && sl > 0)) return fail(400, 'Set entry and stop first');
    if (!(tp > 0) || (tp - entry) * dir <= 0) return fail(400, 'Pick a target first');
    if ((entry - sl) * dir <= 0) return fail(400, 'Stop is on the wrong side');
    const t = /^\d{4}[.-]\d\d[.-]\d\d \d\d:\d\d(:\d\d)?$/.test(String(p.time || '')) ? String(p.time).replace(/\./g, '-').slice(0, 19).padEnd(19, ':00').slice(0, 19) : TP.brokerNow(u.ny_offset ?? desk.NY_DEFAULT);
    const dup = db.prepare("SELECT id FROM trade_plans WHERE user_id = ? AND symbol = ? AND side = ? AND entry = ? AND sl = ? AND tp = ? AND status = 'open' AND created_at > datetime('now', '-10 minutes')").get(u.id, symbol, side, entry, sl, tp);
    if (dup) return res.json({ ok: true, id: dup.id, message: 'Already saved' });
    const r = db.prepare(`INSERT INTO trade_plans (user_id, account_number, symbol, side, entry, sl, tp, risk_pct, risk_money, lots, balance, setup, checks, reason, source, plan_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '', 'katana', ?)`).run(u.id, account, symbol, side, entry, sl, tp,
      risk > 0 && risk <= 10 ? risk : null, n(p.risk_money), n(p.lots), n(p.balance), TP.setupText(p), t);
    res.json({ ok: true, id: Number(r.lastInsertRowid), message: 'Plan saved' });
  });

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
    // break-even / trailed stop is not the risk: no R or risk % from it
    if (row.sl !== null && row.entry !== null && (side === 'BUY' ? row.sl >= row.entry : row.sl <= row.entry)) {
      row.r = null; row.risk_money = null; row.risk_pct = null;
    }
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO journal_trades (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})
      ON CONFLICT (user_id, account_number, position_id) DO UPDATE SET
      ${cols.filter((c) => !['user_id', 'account_number', 'position_id'].includes(c))
        .map((c) => (KEEP_IF_EDITED.includes(c) ? `${c} = CASE WHEN sl_edited = 1 THEN ${c} ELSE excluded.${c} END` : `${c} = excluded.${c}`)).join(', ')},
      updated_at = datetime('now')`).run(row);
    db.prepare(`UPDATE accounts SET last_check_at = datetime('now'), last_check_ea = ? WHERE user_id = ? AND account_number = ?`)
      .run(JOURNAL_CODE, u.id, account);
    res.json({ ok: true, message: 'Stored' });
  });

  // ---------- pages ----------
  // "+$1,234.56" for dollar accounts (app-like), "+1,234.56 EUR" for the rest
  const money = (v, cur = '') => (v === null || v === undefined ? '-' : `${v < 0 ? '−' : '+'}${cur === 'USD' ? '$' : ''}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur && cur !== 'USD' ? ' ' + esc(cur) : ''}`);
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  // big numbers in the stat boxes: the currency is small, so "+1,868.45 USD" fits the box
  const bigMoney = (v, cur) => (cur === 'USD' ? money(v, cur) : `${money(v)}${cur ? `<small class="u">${esc(cur)}</small>` : ''}`);

  // private text (account numbers, broker servers): hidden when "Hide private info" is on
  const priv = (real, mask) => `<span class="priv"><span class="priv-real">${real}</span><span class="priv-mask">${mask}</span></span>`;
  const acctLabel = (a) => priv(`${esc(a.broker || 'Account')} · ${esc(a.account_number)}`, `Account ••${esc(String(a.account_number).slice(-2))}`);

  // accounts: live ones are still on My EAs; removed ones keep their trades in their own tab;
  // hidden ones (user's choice) are left out of the tabs and "All accounts" until shown again.
  // ?account= picks one (hidden ones too); without it, all live, not hidden accounts.
  const scope = (req) => {
    const u = req.user;
    const live = new Set(db.prepare('SELECT account_number FROM accounts WHERE user_id = ?').all(u.id).map((a) => a.account_number));
    const hidden = new Set(db.prepare('SELECT account_number FROM journal_hidden WHERE user_id = ?').all(u.id).map((a) => a.account_number));
    const accts = db.prepare(`SELECT account_number, COUNT(*) AS n, SUM(net) AS net, MAX(broker) AS broker, MAX(currency) AS cur
        FROM journal_trades WHERE user_id = ? GROUP BY account_number ORDER BY MAX(close_time) DESC`).all(u.id);
    accts.forEach((a) => { a.removed = !live.has(a.account_number); a.hidden = hidden.has(a.account_number); });
    const shown = accts.filter((a) => !a.hidden);
    const liveAccts = shown.filter((a) => !a.removed), removedAccts = shown.filter((a) => a.removed);
    const hiddenAccts = accts.filter((a) => a.hidden);
    const q = cleanAccount(req.query.account);
    const sel = accts.find((a) => a.account_number === q) || null;
    const liveNums = liveAccts.map((a) => a.account_number);
    const where = sel ? 'user_id = ? AND account_number = ?'
      : `user_id = ? AND account_number IN (${liveNums.map(() => '?').join(', ') || "''"})`;
    const args = sel ? [u.id, sel.account_number] : [u.id, ...liveNums];
    return { accts, liveAccts, removedAccts, hiddenAccts, sel, where, args };
  };

  // account tabs (journal and insights pages) + the hide / show bar of the picked account
  const acctBar = (req, base, qs, { accts, liveAccts, removedAccts, hiddenAccts, sel }, cur) => {
    if (!accts.length) return '';
    const chip = (a, label, sub, href, on) => `<a class="acct${a && (a.removed || a.hidden) ? ' removed' : ''}${on ? ' on' : ''}" href="${href}">
      <small>${label}</small><b class="${cls(a ? a.net : 0)}">${a ? money(a.net, a.cur) : ''}</b><small>${sub}</small></a>`;
    const allNet = liveAccts.reduce((s, a) => s + (a.net || 0), 0), allN = liveAccts.reduce((s, a) => s + a.n, 0);
    const openHidden = hiddenAccts.length && (req.query.hidden === '1' || (sel && sel.hidden));
    const back = encodeURIComponent(base + qs({}));
    const bar = sel ? `<div class="acct-hidebar">${sel.hidden
      ? `<span class="muted small">This account is hidden: it is left out of the tabs and "All accounts". Its trades are kept.</span>
        <form method="post" action="/journal/accounts/${esc(sel.account_number)}/show?back=${back}" class="inline"><button class="small">Show account again</button></form>`
      : `<form method="post" action="/journal/accounts/${esc(sel.account_number)}/hide?back=${encodeURIComponent(base)}" class="inline"><button class="small secondary" title="Leaves this account out of the tabs and All accounts. Its trades stay saved and you can show it again.">Hide this account</button></form>`}</div>` : '';
    return `<div class="accts" role="navigation" aria-label="Accounts">
      ${liveAccts.length > 1 || removedAccts.length || (hiddenAccts.length && liveAccts.length) ? `<a class="acct${sel ? '' : ' on'}" href="${base}${qs({ account: '' })}"><small>All accounts</small><b class="${cls(allNet)}">${money(allNet, cur)}</b><small>${allN} trades</small></a>` : ''}
      ${liveAccts.map((a) => chip(a, acctLabel(a), `${a.n} trades`, `${base}${qs({ account: a.account_number })}`, sel === a || (!sel && liveAccts.length === 1 && !removedAccts.length && !hiddenAccts.length))).join('')}
      ${removedAccts.map((a) => chip(a, acctLabel(a), '<span class="tag">Removed</span>', `${base}${qs({ account: a.account_number })}`, sel === a)).join('')}
      ${openHidden ? hiddenAccts.map((a) => chip(a, acctLabel(a), '<span class="tag">Hidden</span>', `${base}${qs({ account: a.account_number })}`, sel === a)).join('')
        : hiddenAccts.length ? `<a class="acct acct-more" href="${base}${qs({ hidden: '1' })}"><small>Hidden accounts</small><b>${hiddenAccts.length}</b><small>Tap to see</small></a>` : ''}
    </div>${bar}`;
  };

  // columns the insights read
  const INS_COLS = `id, account_number, symbol, side, lots, entry, exit, sl, tp, open_time, close_time, net, r, risk_pct,
    balance_after, mfe, mae, candles, setup, emotion, mistakes`;
  // lighter set for the recap, the desk and the Time / Habits tabs
  const DESK_COLS = 'id, account_number, symbol, side, lots, open_time, close_time, net, r, balance_after, setup';
  const PROP_COLS = 'prop_daily, prop_max, prop_target, prop_start, prop_consistency, prop_firm';
  const limitsOf = (a) => ({ daily: a.prop_daily, max: a.prop_max, target: a.prop_target, start: a.prop_start, consistency: a.prop_consistency, firm: a.prop_firm });
  const maskNum = (n) => `Account ••${esc(String(n).slice(-2))}`;

  // trade plans: { trade id: plan } for the matched ones, and the small tag shown next to a trade
  const plansByTrade = (uid) => Object.fromEntries(db.prepare("SELECT * FROM trade_plans WHERE user_id = ? AND status = 'matched'").all(uid).map((p) => [p.trade_id, p]));
  const planTag = (p) => (p ? '<br><span class="ptag">Planned</span>' : '<br><span class="ptag no">No plan</span>');
  // prop firm desk cards for these accounts (all their trades)
  const deskCards = (u, accounts, cur, linkTo) => accounts.map((a) => {
    const L = limitsOf(db.prepare(`SELECT ${PROP_COLS} FROM accounts WHERE user_id = ? AND account_number = ?`).get(u.id, a.account_number) || {});
    const rows = desk.prepRows(db.prepare(`SELECT ${DESK_COLS} FROM journal_trades WHERE user_id = ? AND account_number = ? ORDER BY close_time`).all(u.id, a.account_number));
    const D = desk.desk(rows, L, desk.serverToday(u.ny_offset ?? desk.NY_DEFAULT));
    return { has: !!D, html: deskView.deskCard(D, { title: priv(`${esc(a.broker || 'Account')} · ${esc(a.account_number)}`, maskNum(a.account_number)), money: (v) => money(v, cur), href: linkTo(a) }) };
  });

  app.get('/journal', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const key = ensureKey(u);

    const sc = scope(req);
    const { accts, liveAccts, removedAccts, sel, where, args } = sc;

    // month shown: ?month=YYYY-MM, else the month of the latest trade
    const latest = db.prepare(`SELECT MAX(close_time) AS t FROM journal_trades WHERE ${where}`).get(...args).t;
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month
      : (latest || new Date().toISOString()).slice(0, 7);
    const trades = db.prepare(`SELECT id, account_number, symbol, side, lots, net, r, open_time, close_time, balance_after, setup, currency, broker
        FROM journal_trades WHERE ${where} AND substr(close_time, 1, 7) = ? ORDER BY close_time`).all(...args, month);
    TP.match(db, u);
    const plans = plansByTrade(u.id);
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
        ? `<button type="button" class="day ${s >= 0 ? 'win' : 'loss'}" data-day="${iso(d)}" aria-pressed="${iso(d) === pickDay}"><span class="d">${d}</span><span class="v ${cls(s)}">${short(s)}</span><span class="n" title="${l.length} trade${l.length > 1 ? 's' : ''}">${l.length}<span class="w"> trade${l.length > 1 ? 's' : ''}</span></span></button>`
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
        <div class="dayp-scroll"><table><tbody>${l.map((t) => `<tr>
          <td class="muted">${esc(t.close_time.slice(11, 16))}</td>
          <td><strong>${esc(t.symbol)}</strong> ${esc(t.side)} ${t.lots ?? ''}${!sel && liveAccts.length > 1 ? `<br><span class="muted small">${priv(`${esc(t.broker || 'Account')} · ${esc(t.account_number)}`, `Account ••${esc(String(t.account_number).slice(-2))}`)}</span>` : ''}${t.setup ? `<br><span class="muted small">${esc(t.setup)}</span>` : ''}${planTag(plans[t.id])}</td>
          <td class="right"><span class="${cls(t.net)}">${money(t.net)}</span><br><a class="small" href="/journal/${t.id}">Open ›</a></td></tr>`).join('')}
        </tbody></table></div></div>`;
    }).join('');

    // insights strip: last 90 days of the shown accounts; the full page is /journal/insights
    const since = latest ? new Date(Date.parse(latest.slice(0, 10) + 'T00:00:00Z') - 89 * 864e5).toISOString().slice(0, 10) : '';
    const ins = latest ? analyze(db.prepare(`SELECT ${INS_COLS} FROM journal_trades WHERE ${where} AND close_time >= ? ORDER BY close_time`)
      .all(...args, since), { money: (v) => money(v, cur), esc }) : null;
    const insHref = `/journal/insights${sel ? '?account=' + encodeURIComponent(sel.account_number) : ''}`;
    const insightsHtml = !ins ? '' : `<section class="card insights">
      <div class="row between"><h2>Insights</h2><span class="muted small">${ins.locked ? '' : `Last 90 days · ${ins.count} trades${sel ? '' : liveAccts.length > 1 ? ' · all accounts' : ''}`}</span></div>
      ${insightsView.stripHtml(ins, { money: (v) => money(v, cur), href: insHref })}
    </section>`;

    const site = req.protocol + '://' + req.get('host');

    // What we found: questions most traders can't answer about their own trading, last 90 days
    const foundRows = latest ? db.prepare(`SELECT ${INS_COLS}, profit, risk_money FROM journal_trades WHERE ${where} AND close_time >= ? ORDER BY close_time`).all(...args, since) : [];
    const foundHtml = TP.foundHtml(TP.found(foundRows, plans, { money: (v) => money(v, cur), esc, off: u.ny_offset ?? desk.NY_DEFAULT }));

    // hero: the month's P&L big, with four tiles under it
    const N = numbers(prep(trades));
    const rT = trades.filter((t) => t.r !== null && t.r !== undefined);
    const dayNets = dayKeys.map((d) => sum(days[d]));
    const heroHtml = deskView.heroHtml({ label: monthName, n: trades.length, net, wins, losses: trades.filter((t) => t.net < 0).length,
      winRate: N.winRate, pf: N.pf, avgW: N.avgW, avgL: N.avgL, avgR: rT.length ? rT.reduce((a, t) => a + Number(t.r), 0) / rT.length : null,
      pct: N.start ? (net / N.start) * 100 : null, days: dayKeys.length, greenDays, bestDay, worstDay: dayNets.length ? Math.min(...dayNets) : null },
    { cur, shareHref: accts.length ? `/journal/report${qs({})}` : '' });
    // recap: the week of the latest trade, the last session, recent trades
    const recent = latest ? desk.prepRows(db.prepare(`SELECT ${DESK_COLS} FROM journal_trades WHERE ${where} ORDER BY close_time DESC LIMIT 300`).all(...args).reverse()) : [];
    const multi = !sel && liveAccts.length > 1;
    const recapHtml = deskView.recapHtml(desk.recap(recent), { money: (v) => money(v, cur), mask: (t) => (multi ? priv(esc(t.account_number), maskNum(t.account_number)) : esc(t.side)) });
    // prop firm desk: accounts with rules
    const dk = deskCards(u, sel ? (sel.removed ? [] : [sel]) : liveAccts, cur, (a) => `/journal/insights?tab=prop&account=${encodeURIComponent(a.account_number)}`);
    const deskHtml = !liveAccts.length ? '' : dk.some((x) => x.has)
      ? `<section class="desk-row"><div class="row between"><h2>Prop firm desk</h2><a class="small" href="/journal/insights?tab=prop${sel ? '&account=' + encodeURIComponent(sel.account_number) : ''}">All rules ›</a></div><div class="dk-grid">${dk.filter((x) => x.has).map((x) => x.html).join('')}</div></section>`
      : `<p class="small muted desk-hint">Trading a prop firm? <a href="/journal/insights?tab=prop${sel ? '&account=' + encodeURIComponent(sel.account_number) : ''}">Add its rules</a> to see the room left today, the room to max loss and the target on this page.</p>`;

    page(req, res, 'Trade Journal', `
    <div class="row between page-head"><h1>Trade Journal</h1>
      <span class="head-btns"><button type="button" class="small secondary replay-btn" data-replay title="Play the opening animation again">↻ Replay</button><a class="btn small" href="/journal/plan">Plan a trade</a>${accts.length ? `<a class="btn small" href="/journal/report${qs({})}" title="A picture of this month's results to share, like the trade cards">Share report</a>` : ''}
      <button type="button" class="small secondary priv-toggle" aria-pressed="false" title="Hides account numbers, broker servers, your name and the journal key, so you can screenshot this page">Hide private info</button></span></div>
    ${acctBar(req, '/journal', qs, sc, cur)}

    ${sel && sel.removed ? `<section class="card notice">
      <p><strong>Account ${esc(sel.account_number)} is no longer on <a href="/dashboard">My EAs</a>.</strong> Its ${sel.n} trades are kept here and left out of "All accounts". Add the account again on My EAs to bring it back, or delete these trades for good.</p>
      <form method="post" action="/journal/accounts/${esc(sel.account_number)}/delete" onsubmit="return confirm('Delete all ${sel.n} trades of account ${esc(sel.account_number)}? This cannot be undone.')">
        <button class="small danger">Delete these trades</button></form>
    </section>` : ''}

    ${heroHtml}
    ${recapHtml}
    ${foundHtml}
    ${deskHtml}
    <div class="cal-split" id="cal">
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
    <script src="/hero.js"></script>

    ${insightsHtml}

    <details class="card connect priv-hide"${accts.length ? '' : ' open'}>
      <summary><h2>Connect the Trade Journal EA</h2><span class="muted small">Journal key and setup steps</span></summary>
      <ol class="steps">
        <li>Download <strong>Trade Journal</strong> from <a href="/dashboard">My EAs</a> and attach it to <strong>one extra chart</strong> on each MT5 account (MT5 allows one EA per chart, so open a new chart for it; any symbol works). It reads the whole account, so it logs every symbol and every EA, and it never trades, so it runs safely next to KATANA.</li>
        <li>Paste this key into the EA's <strong>Journal key</strong> input:
          <span class="keybox"><code class="block" data-key="${esc(key)}">••••••••••••••••••••••••••••••••</code>
          <button type="button" class="small secondary key-show">Show</button><button type="button" class="small secondary key-copy">Copy</button></span></li>
        <li>Make sure the account number is on <a href="/dashboard">My EAs</a>, and that MT5 allows <code>${esc(site)}</code> under Tools → Options → Expert Advisors → Allow WebRequest.</li>
      </ol>
      <form method="post" action="/journal/key" onsubmit="return confirm('Make a new key? The old key stops working and you must paste the new one into the EA.')">
        <button class="small secondary">Make a new key</button></form>
    </details>`);
  });

  // ---------- account report: share cards of a whole account (or all accounts) ----------
  // ?period=YYYY-MM (a month) | 30 | 90 | all, ?account= as on the journal. Account numbers are always masked.
  app.get('/journal/report', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const sc = scope(req);
    const { liveAccts, sel, where, args } = sc;
    const cur = (sel ? sel.cur : liveAccts[0]?.cur) || '';
    const latest = db.prepare(`SELECT MAX(close_time) AS t FROM journal_trades WHERE ${where}`).get(...args).t;
    if (!latest) return res.redirect('/journal');
    const q = String(req.query.period || req.query.month || '');
    const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(q) || ['30', '90', 'all'].includes(q) ? q : latest.slice(0, 7);
    const isMonth = period.length === 7;
    let from = '', to = '';
    if (isMonth) {
      const [y, m] = period.split('-').map(Number);
      from = period + '-01'; to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    } else if (period !== 'all') {
      from = new Date(Date.parse(latest.slice(0, 10) + 'T00:00:00Z') - (Number(period) - 1) * 864e5).toISOString().slice(0, 10);
    }
    const rows = db.prepare(`SELECT ${INS_COLS} FROM journal_trades WHERE ${where}${from ? ' AND close_time >= ?' : ''}${to ? ' AND close_time < ?' : ''} ORDER BY close_time`)
      .all(...args, ...(from ? [from] : []), ...(to ? [to] : []));
    const trades = prep(rows);
    const N = numbers(trades);
    const S = trades.length >= MIN_TRADES ? score(N) : null;

    // per day: money, R and count (for the calendar card)
    const days = {};
    trades.forEach((t) => { const d = t.close_time.slice(0, 10); const x = (days[d] ||= { net: 0, r: 0, n: 0, rn: 0 }); x.net += t.net; x.n++; if (t.r !== null) { x.r += t.r; x.rn++; } });
    const rT = trades.filter((t) => t.r !== null);
    let run = 0, bestRun = 0, lrun = 0, worstRun = 0;
    trades.forEach((t) => { if (t.net > 0) { run++; lrun = 0; } else if (t.net < 0) { lrun++; run = 0; } bestRun = Math.max(bestRun, run); worstRun = Math.max(worstRun, lrun); });
    const step = Math.max(1, Math.ceil(N.equity.length / 240));
    const eq = N.equity.filter((e, i) => i % step === 0 || i === N.equity.length - 1).map((e) => Math.round(e.eq * 100) / 100);
    const dayNets = Object.values(days).map((d) => d.net);
    const symbols = {};
    trades.forEach((t) => { const k = t.symbol; (symbols[k] ||= { n: 0, net: 0 }); symbols[k].n++; symbols[k].net += t.net; });

    const monthName = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const label = isMonth ? monthName(period) : period === 'all' ? 'All time' : `Last ${period} days`;
    const first = trades[0]?.close_time.slice(0, 10) || '', last = trades.at(-1)?.close_time.slice(0, 10) || '';
    const acctName = sel ? `Account ••${String(sel.account_number).slice(-2)}` : liveAccts.length > 1 ? `${liveAccts.length} accounts` : liveAccts[0] ? `Account ••${String(liveAccts[0].account_number).slice(-2)}` : '';
    const data = {
      label, isMonth, month: isMonth ? period : '', from: first, to: last, acct: acctName, cur, handle: u.card_handle || '',
      n: N.n, net: N.net, wins: N.wins, losses: N.losses, winRate: N.winRate, pf: Number.isFinite(N.pf) ? N.pf : (N.pf === Infinity ? 'inf' : null),
      avgW: N.avgW, avgL: N.avgL, start: N.start, maxDD: N.maxDD, maxDDPct: N.maxDDPct,
      totalR: rT.length ? rT.reduce((s, t) => s + t.r, 0) : null, avgR: rT.length ? rT.reduce((s, t) => s + t.r, 0) / rT.length : null,
      bestTradeR: rT.length ? Math.max(...rT.map((t) => t.r)) : null, bestTrade: trades.length ? Math.max(...trades.map((t) => t.net)) : null,
      bestDay: dayNets.length ? Math.max(...dayNets) : null, worstDay: dayNets.length ? Math.min(...dayNets) : null,
      days: N.days, greenDays: N.greenDays, bestRun, worstRun, score: S ? S.total : null, scoreLabel: S ? S.label : '',
      equity: eq, daily: days,
      // where the edge is: sessions in New York time + buys vs sells (big report)
      sessions: desk.timeStats(trades, u.ny_offset ?? desk.NY_DEFAULT).ranked.slice(0, 4).map((x) => ({ k: x.name, n: x.n, net: x.net, win: x.win, avgR: x.avgR })),
      sides: [['Buys', trades.filter((t) => t.side !== 'SELL')], ['Sells', trades.filter((t) => t.side === 'SELL')]].map(([k, l]) => {
        const rl = l.filter((t) => t.r !== null);
        return { k, n: l.length, net: l.reduce((a, t) => a + t.net, 0), win: l.length ? Math.round(l.filter((t) => t.net > 0).length / l.length * 100) : 0, avgR: rl.length ? rl.reduce((a, t) => a + t.r, 0) / rl.length : null };
      }),
      parts: S ? S.parts.map((x) => ({ n: x.name, v: x.v })) : null, weakest: S ? S.weakest.name : '',
      symbols: Object.entries(symbols).sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([k, v]) => ({ s: k, n: v.n, net: v.net })),
    };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');

    // periods to pick: the last 6 months with trades + ranges
    const months = db.prepare(`SELECT DISTINCT substr(close_time, 1, 7) AS m FROM journal_trades WHERE ${where} ORDER BY m DESC LIMIT 6`).all(...args).map((r) => r.m);
    if (isMonth && !months.includes(period)) months.unshift(period);
    const opts = [...months.map((m) => [m, monthName(m)]), ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']];
    const acctOpts = [...(liveAccts.length > 1 ? [['', 'All accounts']] : []), ...liveAccts.map((a) => [a.account_number, `Account ••${String(a.account_number).slice(-2)}`]),
      ...(sel && !liveAccts.includes(sel) ? [[sel.account_number, `Account ••${String(sel.account_number).slice(-2)}`]] : [])];
    const back = `/journal?${new URLSearchParams(Object.entries({ account: sel ? sel.account_number : '', month: isMonth ? period : '' }).filter(([, v]) => v)).toString()}`;

    page(req, res, 'Share report', `
    <div class="row between page-head"><h1>Share report</h1><a class="btn small secondary" href="${back}">‹ Back to journal</a></div>
    <section class="card report-card">
      <p class="muted">Your whole account as two story cards (Instagram, WhatsApp) or one big picture (Discord, X, iPad). Account numbers are never shown.</p>
      <form method="get" action="/journal/report" class="card-controls report-pick">
        <label>Period <select name="period" onchange="this.form.submit()">${opts.map(([k, l]) => `<option value="${esc(k)}"${k === period ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        ${acctOpts.length > 1 ? `<label>Account <select name="account" onchange="this.form.submit()">${acctOpts.map(([k, l]) => `<option value="${esc(k)}"${(sel ? sel.account_number : '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : sel ? `<input type="hidden" name="account" value="${esc(sel.account_number)}">` : ''}
        <label>Show <select id="rmode">
          <option value="money">Money ($)</option>${N.start ? '<option value="pct">Percent of account</option>' : ''}<option value="r">R only (hide money)</option></select></label>
        <label class="check"><input type="checkbox" id="rkat" checked> KATANA line</label>
        <noscript><button class="small">Show</button></noscript>
      </form>
      ${trades.length ? `<div class="cards">
        <figure><canvas id="r1"></canvas><span class="share-btns"><button type="button" class="small" data-save="r1">Save card 1</button><button type="button" class="small secondary" data-share="r1" hidden>Share</button></span></figure>
        <figure><canvas id="r2"></canvas><span class="share-btns"><button type="button" class="small" data-save="r2">Save card 2</button><button type="button" class="small secondary" data-share="r2" hidden>Share</button></span></figure>
      </div>
      <h2 class="report-big-h">Big report <span class="muted small">one picture, iPad / desktop size (4:3)</span></h2>
      <figure class="report-big"><canvas id="r3"></canvas><span class="share-btns"><button type="button" class="small" data-save="r3">Save big report</button><button type="button" class="small secondary" data-share="r3" hidden>Share</button></span></figure>` : '<p class="muted">No closed trades in this period. Pick another one above.</p>'}
      <p class="muted small">Your handle on the cards: <strong>${esc(u.card_handle || '5abifx.com')}</strong>. Change it on any trade page.</p>
    </section>
    <script id="report-data" type="application/json">${json}</script>
    <script src="/cards.js"></script>
    <script src="/report.js"></script>`);
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

  // hide / show an account in the journal (its trades stay saved)
  const backTo = (req) => { const b = String(req.query.back || ''); return /^\/journal(\/insights)?(\?[\w=&%.-]*)?$/.test(b) ? b : '/journal'; };
  app.post('/journal/accounts/:num/hide', requireUser, requireJournal, (req, res) => {
    const num = cleanAccount(req.params.num);
    if (num && db.prepare('SELECT 1 FROM journal_trades WHERE user_id = ? AND account_number = ? LIMIT 1').get(req.user.id, num)) {
      db.prepare('INSERT OR IGNORE INTO journal_hidden (user_id, account_number) VALUES (?, ?)').run(req.user.id, num);
      flash(req, 'ok', `Account ${num} is hidden. Its trades are kept; tap "Hidden accounts" in the tabs to show it again.`);
    }
    res.redirect(backTo(req));
  });
  app.post('/journal/accounts/:num/show', requireUser, requireJournal, (req, res) => {
    const num = cleanAccount(req.params.num);
    if (num) db.prepare('DELETE FROM journal_hidden WHERE user_id = ? AND account_number = ?').run(req.user.id, num);
    res.redirect(backTo(req));
  });

  app.post('/journal/key', requireUser, requireJournal, (req, res) => {
    db.prepare('UPDATE users SET journal_key = ? WHERE id = ?').run(crypto.randomBytes(16).toString('hex'), req.user.id);
    flash(req, 'ok', 'New journal key created. Paste it into the EA inputs.');
    res.redirect('/journal');
  });

  // ---------- full Insights page ----------
  const PERIODS = { 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months', all: 'All time' };
  app.get('/journal/insights', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const sc = scope(req);
    const { accts, liveAccts, removedAccts, sel, where, args } = sc;
    const cur = (sel ? sel.cur : liveAccts[0]?.cur) || '';
    const m = (v) => money(v, cur);
    const period = Object.keys(PERIODS).includes(String(req.query.days)) ? String(req.query.days) : '90';
    const latest = db.prepare(`SELECT MAX(close_time) AS t FROM journal_trades WHERE ${where}`).get(...args).t;
    const since = latest && period !== 'all'
      ? new Date(Date.parse(latest.slice(0, 10) + 'T00:00:00Z') - (Number(period) - 1) * 864e5).toISOString().slice(0, 10) : '';
    const rows = latest ? db.prepare(`SELECT ${INS_COLS} FROM journal_trades WHERE ${where}${since ? ' AND close_time >= ?' : ''} ORDER BY close_time`)
      .all(...args, ...(since ? [since] : [])) : [];
    const TABS = { overview: 'Overview', time: 'Time', habits: 'Habits', prop: 'Prop firm' };
    const tab = Object.keys(TABS).includes(String(req.query.tab)) ? String(req.query.tab) : 'overview';
    const tz = req.query.tz === 'mt5' ? 'mt5' : 'ny';
    const qs = (o) => '?' + new URLSearchParams(Object.entries({ account: sel ? sel.account_number : '', days: period, tab: tab === 'overview' ? '' : tab, tz: tz === 'mt5' ? 'mt5' : '', ...o }).filter(([, v]) => v)).toString();
    const insHref = (a2) => `/journal/insights${qs({ tab: 'prop', account: a2.account_number })}`;

    let body = '';
    if (!latest) body = `<section class="card"><p class="muted">No trades yet. Connect the Trade Journal EA on the <a href="/journal">Journal</a> page; insights start after ${MIN_TRADES} closed trades.</p></section>`;
    else if (tab === 'overview') {
      const pr = desk.prepRows(rows);
      const wiData = JSON.stringify({ cur, ...desk.tagTrades(pr, u.ny_offset ?? desk.NY_DEFAULT) }).replace(/</g, '\\u003c');
      const whatif = `<section class="card wi" id="whatif"><div class="row between"><h2>What if…</h2><button type="button" class="small secondary" data-wi-reset hidden>Reset</button></div>
        <p class="muted small">Switch off a session, a day, a symbol or a side, or cap your trades a day, and see what this period would have looked like. Your journal does not change.</p>
        <div class="wi-body"><div class="wi-ctl"></div><div class="wi-res"></div></div></section>
        <script id="wi-data" type="application/json">${wiData}</script><script src="/whatif.js"></script>`;
      body = insightsView.fullHtml(analyze(rows, { money: m, esc }), { money: m, cur, prop: '', whatif });
    }
    else if (tab === 'time' || tab === 'habits') {
      const dr = desk.prepRows(db.prepare(`SELECT ${DESK_COLS} FROM journal_trades WHERE ${where}${since ? ' AND close_time >= ?' : ''} ORDER BY close_time`).all(...args, ...(since ? [since] : [])));
      const off = tz === 'mt5' ? 0 : (u.ny_offset ?? desk.NY_DEFAULT);
      const offsetForm = `<div class="tz-pick"><a href="/journal/insights${qs({ tz: '' })}"${tz === 'ny' ? ' class="on"' : ''}>New York</a><a href="/journal/insights${qs({ tz: 'mt5' })}"${tz === 'mt5' ? ' class="on"' : ''}>MT5 time</a>
        <form method="post" action="/journal/settings/ny-offset" class="tz-off"><input type="hidden" name="back" value="/journal/insights${esc(qs({}))}"><label>MT5 = NY +<input name="offset" type="number" min="-12" max="14" value="${u.ny_offset ?? desk.NY_DEFAULT}"> h</label><button class="small secondary">Save</button></form></div>`;
      body = tab === 'time'
        ? deskView.timeHtml(desk.timeStats(dr, off), { data: JSON.stringify({ cur, ...desk.tagTrades(dr, off) }).replace(/</g, '\\u003c'), money: m, offsetForm, tzName: tz === 'mt5' ? 'MT5 server time' : 'New York time', shift: tz === 'mt5' ? (u.ny_offset ?? desk.NY_DEFAULT) : 0 })
        : dr.length ? deskView.habitsHtml(desk.habits(dr), { money: (v) => money(v, cur === 'USD' ? 'USD' : '') }) : '<section class="card"><p class="muted">No trades in this period.</p></section>';
    } else {
      // prop firm: one account in full (desk + history + rules form), or a card per account
      if (sel && !sel.removed) {
        const acc = db.prepare(`SELECT ${PROP_COLS} FROM accounts WHERE user_id = ? AND account_number = ?`).get(u.id, sel.account_number);
        const L = limitsOf(acc);
        const card = deskCards(u, [sel], cur, () => '')[0];
        const P = propGuard(db.prepare(`SELECT ${INS_COLS} FROM journal_trades WHERE user_id = ? AND account_number = ? ORDER BY close_time`).all(u.id, sel.account_number), L, { money: m });
        body = `<div class="dk-detail"><section class="card"><h2>Today</h2>${card.has ? card.html : '<p class="muted small">Add the rules on the right to see the room left today, the room to max loss and the target.</p>'}</section>
          <section class="card"><h2>Your firm's rules</h2>${deskView.deskForm(sel.account_number, L)}</section></div>
          ${P && !P.error ? insightsView.propHtml(P, sel.account_number, L).replace(/<details[\s\S]*<\/details>/, '') : ''}`;
      } else if (liveAccts.length) {
        const dk = deskCards(u, liveAccts, cur, insHref);
        body = `<p class="muted small">Pick an account above to type or change its rules.</p><div class="dk-grid">${dk.map((x) => x.html).join('')}</div>`;
      } else body = '<section class="card"><p class="muted">No live accounts. Add one on My EAs.</p></section>';
    }
    const tabsNav = `<nav class="ins-tabs" aria-label="Insights">${Object.entries(TABS).map(([k, l]) => `<a href="/journal/insights${qs({ tab: k === 'overview' ? '' : k })}"${k === tab ? ' class="on" aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
    page(req, res, 'Insights', `
    <div class="row between page-head"><h1>Insights</h1>
      <span class="head-btns">${latest ? `<a class="btn small" href="/journal/report?${new URLSearchParams(Object.entries({ account: sel ? sel.account_number : '', period: period === '365' ? 'all' : period }).filter(([, v]) => v)).toString()}">Share report</a>` : ''}
      <button type="button" class="small secondary priv-toggle" aria-pressed="false" title="Hides account numbers, broker servers and your name, so you can screenshot this page">Hide private info</button></span></div>
    ${acctBar(req, '/journal/insights', qs, sc, cur)}
    ${tabsNav}
    <div class="periods" role="navigation" aria-label="Period">${Object.entries(PERIODS).map(([k, l]) => `<a href="/journal/insights${qs({ days: k })}"${k === period ? ' class="on" aria-current="true"' : ''}>${l}</a>`).join('')}
      <span class="muted small">${rows.length} trades${sel ? '' : liveAccts.length > 1 ? ' · all accounts' : ''}</span></div>
    ${body}`);
  });

  // the Desk: mistake forecast, today's rules, day map, next trade check, you vs your rules
  app.get('/journal/desk', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const sc = scope(req);
    const { liveAccts, sel, where, args } = sc;
    const cur = (sel ? sel.cur : liveAccts[0]?.cur) || '';
    const m = (v) => money(v, cur);
    const qs = (o) => '?' + new URLSearchParams(Object.entries({ account: sel ? sel.account_number : '', ...o }).filter(([, v]) => v)).toString();
    const off = u.ny_offset ?? desk.NY_DEFAULT;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    const nyNow = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    const rows = db.prepare(`SELECT ${INS_COLS} FROM journal_trades WHERE ${where} ORDER BY close_time`).all(...args);
    const A = rows.length >= MIN_TRADES ? analyze(rows, { money: m, esc }) : { items: [] };
    // prop firm numbers when one live account is in view and it has rules
    const one = sel && !sel.removed ? sel : !sel && liveAccts.length === 1 ? liveAccts[0] : null;
    let prop = null;
    if (one) {
      const acc = db.prepare(`SELECT ${PROP_COLS} FROM accounts WHERE user_id = ? AND account_number = ?`).get(u.id, one.account_number);
      if (acc) {
        const dr = desk.prepRows(db.prepare(`SELECT ${DESK_COLS} FROM journal_trades WHERE user_id = ? AND account_number = ? ORDER BY close_time`).all(u.id, one.account_number));
        const D = desk.desk(dr, limitsOf(acc), desk.serverToday(off));
        if (D && !D.error) prop = D;
      }
    }
    const T = terminal.build(prep(rows), { offset: off, todayNy: new Date(nyNow).toISOString().slice(0, 10), nowMin: (+p.hour % 24) * 60 + +p.minute,
      nowBroker: nyNow + off * 3600e3, prop, leaks: A.items, money: m });
    const N = T.locked ? null : news.catalysts(db, prep(rows), { offset: off });
    page(req, res, 'Desk', `
    <div class="row between page-head"><h1>Desk</h1>
      <span class="head-btns"><button type="button" class="small secondary replay-btn" data-replay title="Play the opening animation again">↻ Replay</button><button type="button" class="small secondary priv-toggle" aria-pressed="false" title="Hides account numbers, broker servers and your name, so you can screenshot this page">Hide private info</button></span></div>
    ${acctBar(req, '/journal/desk', qs, sc, cur)}
    ${terminalView.html(T, { news: N, money: m, cur, acctNote: one ? (prop ? 'Prop firm rules included' : 'Add firm rules in Insights › Prop firm to include them') : 'All accounts' })}`);
  });

  // prop firm rules of one account (percent of the start balance)
  app.post('/journal/insights/limits', requireUser, requireJournal, (req, res) => {
    const num = cleanAccount(req.body.account);
    const acc = num && db.prepare('SELECT id FROM accounts WHERE user_id = ? AND account_number = ?').get(req.user.id, num);
    if (!acc) { flash(req, 'error', 'Pick one of your accounts first.'); return res.redirect('/journal/insights'); }
    const p = (v, max) => { const x = Number(String(v ?? '').replace(',', '.').replace('%', '').trim()); return String(v ?? '').trim() && Number.isFinite(x) && x > 0 && x <= max ? x : null; };
    const firm = Object.keys(desk.FIRMS).includes(String(req.body.firm)) ? String(req.body.firm) : '';
    db.prepare('UPDATE accounts SET prop_daily = ?, prop_max = ?, prop_target = ?, prop_start = ?, prop_consistency = ?, prop_firm = ? WHERE id = ?')
      .run(p(req.body.daily, 100), p(req.body.max, 100), p(req.body.target, 1000), p(req.body.start, 1e9), p(req.body.consistency, 100), firm, acc.id);
    flash(req, 'ok', 'Prop firm rules saved.');
    res.redirect(`/journal/insights?tab=prop&account=${encodeURIComponent(num)}`);
  });

  // hours between New York time and the trader's MT5 server clock (Time tab)
  app.post('/journal/settings/ny-offset', requireUser, requireJournal, (req, res) => {
    const n = Math.round(Number(req.body.offset));
    if (Number.isFinite(n) && n >= -12 && n <= 14) db.prepare('UPDATE users SET ny_offset = ? WHERE id = ?').run(n, req.user.id);
    const back = String(req.body.back || '');
    res.redirect(back.startsWith('/journal/insights') ? back : '/journal/insights?tab=time');
  });

  // ---------- trade plans: written before the trade, matched to it when it opens on MT5 ----------
  const num = (v) => { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) ? n : NaN; };
  app.get('/journal/plan', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    TP.match(db, u);
    const accts = db.prepare('SELECT account_number FROM accounts WHERE user_id = ? ORDER BY id').all(u.id).map((a) => a.account_number);
    const last = {};
    db.prepare(`SELECT account_number, balance_after, broker, currency FROM journal_trades WHERE user_id = ? AND balance_after IS NOT NULL ORDER BY close_time`).all(u.id)
      .forEach((t) => { last[t.account_number] = t; });
    // money per 1.0 price move per lot, per symbol, from the trader's own trades (for the lot size)
    const vpl = {}, symCount = {};
    db.prepare("SELECT symbol, entry, exit, lots, profit FROM journal_trades WHERE user_id = ? AND lots > 0 AND exit IS NOT NULL AND entry IS NOT NULL AND exit != entry AND partials = '[]' ORDER BY close_time DESC LIMIT 3000").all(u.id)
      .forEach((t) => { if (!t.profit) return; (vpl[t.symbol] ||= []).push(Math.abs(t.profit / ((t.exit - t.entry) * t.lots))); symCount[t.symbol] = (symCount[t.symbol] || 0) + 1; });
    Object.keys(vpl).forEach((k) => { const l = vpl[k].sort((a, b) => a - b); vpl[k] = l[l.length >> 1]; });
    const syms = Object.keys(symCount).sort((a, b) => symCount[b] - symCount[a]);
    const quick = (syms.length ? syms : ['XAUUSD', 'NAS100', 'EURUSD', 'GBPUSD']).slice(0, 4);
    const lastPlan = db.prepare('SELECT risk_pct FROM trade_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(u.id);
    const medRisk = (() => { const l = db.prepare('SELECT risk_pct FROM journal_trades WHERE user_id = ? AND risk_pct > 0 ORDER BY close_time DESC LIMIT 40').all(u.id).map((r) => r.risk_pct).sort((a, b) => a - b); return l.length ? l[l.length >> 1] : null; })();
    const risk = lastPlan?.risk_pct || (medRisk ? Math.round(medRisk * 10) / 10 : 1);
    const data = JSON.stringify({ vpl, bal: Object.fromEntries(Object.entries(last).map(([k, t]) => [k, { b: t.balance_after, c: t.currency }])) }).replace(/</g, '\\u003c');

    const plans = db.prepare('SELECT p.*, t.net, t.entry AS t_entry, t.exit AS t_exit, t.sl AS t_sl, t.tp AS t_tp, t.risk_pct AS t_risk, t.risk_money AS t_riskm, t.profit AS t_profit, t.currency FROM trade_plans p LEFT JOIN journal_trades t ON t.id = p.trade_id WHERE p.user_id = ? ORDER BY p.status = \'open\' DESC, p.plan_time DESC, p.id DESC LIMIT 60').all(u.id);
    const nowMs = Date.parse(TP.brokerNow(u.ny_offset ?? desk.NY_DEFAULT).replace(' ', 'T') + 'Z');
    const counts = { wait: plans.filter((p) => p.status === 'open').length, done: plans.filter((p) => p.status === 'matched').length };
    const rr = (p) => (Math.abs(p.tp - p.entry) / Math.abs(p.entry - p.sl)).toFixed(1);
    const list = plans.map((p) => {
      let st;
      if (p.status === 'matched') {
        const c = TP.compare(p, { entry: p.t_entry, exit: p.t_exit, sl: p.t_sl, tp: p.t_tp, risk_pct: p.t_risk, risk_money: p.t_riskm, profit: p.t_profit, net: p.net });
        st = `<a class="tp-st done" href="/journal/${p.trade_id}" title="Kept ${c.followed} of ${c.total} parts of the plan"><span class="pips">${c.rows.map((r) => `<i class="${r.ok ? 'ok' : ''}"></i>`).join('')}</span> <span class="${cls(p.net)}">${money(p.net, p.currency)}</span> ›</a>`;
      } else if (p.status === 'missed') st = '<span class="tp-st">No trade taken</span>';
      else {
        const age = (nowMs - Date.parse(p.plan_time.replace(' ', 'T') + 'Z')) / 60e3;
        st = age <= TP.MATCH_AFTER ? `<span class="tp-st live"><i></i>Waiting · ${Math.max(0, Math.round(TP.MATCH_AFTER - age))} min left</span>`
          : '<span class="tp-st">No trade yet</span>';
      }
      const kind = p.status === 'matched' ? 'done' : p.status === 'open' ? 'wait' : 'miss';
      return `<li class="tp-row" data-k="${kind}">
        <div class="tp-main"><b>${esc(p.symbol)}</b><span class="tp-side ${p.side === 'BUY' ? 'b' : 's'}">${p.side === 'BUY' ? 'Buy' : 'Sell'}</span>
          <small>${esc(p.plan_time.slice(5, 16).replace('-', '/'))}${p.source === 'katana' ? ' · KATANA' : ''}${p.setup ? ' · ' + esc(p.setup) : ''}</small></div>
        <div class="tp-nums" title="Entry ${p.entry} · Stop ${p.sl} · Target ${p.tp}"><b>${p.entry}</b><i>›</i>${p.tp}<span>${rr(p)}R${p.risk_pct ? ` · ${(+p.risk_pct).toFixed(1)}%` : ''}</span></div>
        <div class="tp-foot">${st}${p.status === 'open' ? `<a class="small tp-edit" href="/journal/plan/${p.id}/tags" title="Setup tags">${p.setup ? 'Tags' : '+ Tags'}</a>` : ''}${p.status === 'open' ? `<form method="post" action="/journal/plan/${p.id}/delete" onsubmit="return confirm('Delete this plan?')"><button class="link small" aria-label="Delete plan" title="Delete plan">✕</button></form>` : ''}</div></li>`;
    }).join('');

    const seg = (name, opts, val) => `<div class="tp-seg" role="radiogroup">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${esc(v)}"${v === val ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
    page(req, res, 'Plan a trade', `
    <div class="row between page-head"><h1>Plan a trade</h1><a class="small" href="/journal">← Journal</a></div>
    <ol class="plan-steps"><li><b>1</b>Plan it here</li><li><b>2</b>Open it on MT5 within 4 h</li><li><b>3</b>See plan vs result</li></ol>
    <div class="plan-split">
      <form method="post" action="/journal/plan" class="card plan-form" id="plan-form" autocomplete="off">
        ${accts.length > 1 ? `<label>Account<select name="account">${accts.map((a) => `<option value="${esc(a)}">${esc((last[a]?.broker ? last[a].broker + ' · ' : '') + a)}</option>`).join('')}</select></label>` : `<input type="hidden" name="account" value="${esc(accts[0] || '')}">`}
        <label>Pair<input name="symbol" list="plan-syms" required maxlength="20" value="${esc(quick[0])}" class="up"></label>
        <datalist id="plan-syms">${syms.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="tp-chips" data-for="symbol">${quick.map((x) => `<button type="button" class="tp-chip" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <div class="lbl">Direction</div>${seg('side', [['BUY', 'Buy'], ['SELL', 'Sell']], 'BUY')}
        <div class="plan-prices">
          <label>Entry<input name="entry" inputmode="decimal" required></label>
          <label>Stop-loss<input name="sl" inputmode="decimal" required></label>
          <label>Target<input name="tp" inputmode="decimal" required></label>
          <label>Risk %<input name="risk_pct" inputmode="decimal" value="${risk}" required></label>
        </div>
        <div class="plan-viz">
          <svg id="pc-lad" viewBox="0 0 150 168" aria-label="Target, entry and stop drawn to scale"></svg>
          <div class="plan-calc" id="plan-calc" aria-live="polite">
            <div><span>Reward : risk</span><b id="pc-rr">-</b><span class="pc-blocks" id="pc-blocks"></span></div>
            <div><span>Risk</span><b id="pc-risk">-</b></div>
            <div><span>Lot</span><b id="pc-lot">-</b></div>
          </div>
        </div>
        <p class="small muted plan-warn" id="pc-warn" hidden></p>
        <div class="lbl">Setup <span class="muted small">(optional, tap again to clear)</span></div>${tagForm('')}
        <div class="lbl">Before I enter</div>
        <div class="tp-checks">${TP.CHECKS.map(([k, l]) => `<label class="check"><input type="checkbox" name="checks" value="${k}"> ${l}</label>`).join('')}</div>
        <label>Why this trade?<textarea name="reason" rows="3" maxlength="600" placeholder="e.g. London high taken, price back inside value. Long back to the high."></textarea></label>
        <button>Save plan</button>
      </form>
      <section class="card plan-list"><div class="row between"><h2>Your plans</h2>${list ? `<div class="tp-filter" role="tablist">${[['all', 'All', plans.length], ['wait', 'Waiting', counts.wait], ['done', 'Done', counts.done]].map(([k, l, n], i) => `<button type="button" data-f="${k}" aria-pressed="${i === 0}">${l} <span>${n}</span></button>`).join('')}</div>` : ''}</div>
        ${list ? `<ul class="tp-scroll">${list}</ul>` : '<p class="muted">No plans yet. Your first one shows here, then links to its trade when it closes.</p>'}</section>
    </div>
    <script id="plan-data" type="application/json">${data}</script>
    <script src="/plan.js"></script>`);
  });

  app.post('/journal/plan', requireUser, requireJournal, (req, res) => {
    const u = req.user, b = req.body || {};
    const side = b.side === 'SELL' ? 'SELL' : 'BUY', dir = side === 'SELL' ? -1 : 1;
    const entry = num(b.entry), sl = num(b.sl), tp = num(b.tp), risk = num(b.risk_pct);
    const symbol = String(b.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9._#-]/g, '').slice(0, 20);
    const bad = !symbol ? 'Type the pair.' : !(entry > 0 && sl > 0 && tp > 0) ? 'Type the entry, stop-loss and target prices.'
      : (entry - sl) * dir <= 0 ? `The stop-loss must be ${side === 'BUY' ? 'below' : 'above'} the entry for a ${side === 'BUY' ? 'buy' : 'sell'}.`
        : (tp - entry) * dir <= 0 ? `The target must be ${side === 'BUY' ? 'above' : 'below'} the entry for a ${side === 'BUY' ? 'buy' : 'sell'}.`
          : !(risk > 0 && risk <= 10) ? 'Risk % must be between 0.01 and 10.' : '';
    if (bad) { flash(req, 'error', bad); return res.redirect('/journal/plan'); }
    const acct = db.prepare('SELECT account_number FROM accounts WHERE user_id = ? AND account_number = ?').get(u.id, String(b.account || ''));
    const bal = acct ? db.prepare('SELECT balance_after FROM journal_trades WHERE user_id = ? AND account_number = ? AND balance_after IS NOT NULL ORDER BY close_time DESC LIMIT 1').get(u.id, acct.account_number)?.balance_after ?? null : null;
    const checks = [].concat(b.checks || []).filter((c) => TP.CHECKS.some(([k]) => k === c));
    db.prepare(`INSERT INTO trade_plans (user_id, account_number, symbol, side, entry, sl, tp, risk_pct, risk_money, balance, setup, checks, reason, plan_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(u.id, acct ? acct.account_number : '', symbol, side, entry, sl, tp, risk,
      bal ? Math.round(bal * risk) / 100 : null, bal, TP.setupText(b), JSON.stringify(checks),
      String(b.reason || '').trim().slice(0, 600), TP.brokerNow(u.ny_offset ?? desk.NY_DEFAULT));
    flash(req, 'ok', `Plan saved. Open the ${symbol} ${side === 'BUY' ? 'buy' : 'sell'} on MT5 within 4 hours and the journal links it to this plan.`);
    res.redirect('/journal/plan');
  });

  // setup tags on a saved plan (KATANA plans arrive with the shape and level Compass saw; add the rest here)
  app.get('/journal/plan/:id/tags', requireUser, requireJournal, (req, res) => {
    const p = db.prepare('SELECT * FROM trade_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!p) return res.redirect('/journal/plan');
    page(req, res, 'Setup tags', `
    <div class="row between page-head"><h1>Setup tags</h1><a class="small" href="/journal/plan">← Plans</a></div>
    <form method="post" action="/journal/plan/${p.id}/tags" class="card plan-form tp-tagcard">
      <p class="muted small">${esc(p.symbol)} ${p.side === 'BUY' ? 'buy' : 'sell'} · entry ${p.entry} · stop ${p.sl} · target ${p.tp}${p.source === 'katana' ? ' · from KATANA' : ''}</p>
      ${tagForm(p.setup)}
      <button>Save tags</button>
    </form>
    <script src="/plan.js"></script>`);
  });
  app.post('/journal/plan/:id/tags', requireUser, requireJournal, (req, res) => {
    const p = db.prepare('SELECT id, trade_id FROM trade_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (p) {
      const st = TP.setupText(req.body || {});
      db.prepare('UPDATE trade_plans SET setup = ? WHERE id = ?').run(st, p.id);
      flash(req, 'ok', 'Tags saved.');
    }
    res.redirect('/journal/plan');
  });

  app.post('/journal/plan/:id/delete', requireUser, requireJournal, (req, res) => {
    db.prepare("DELETE FROM trade_plans WHERE id = ? AND user_id = ? AND status = 'open'").run(req.params.id, req.user.id);
    res.redirect('/journal/plan');
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
    TP.match(db, req.user);
    const plan = db.prepare("SELECT * FROM trade_plans WHERE trade_id = ? AND user_id = ? AND status = 'matched'").get(t.id, req.user.id);
    let planHtml = '<p class="muted small plan-none"><span class="ptag no">No plan</span> <a href="/journal/plan">Plan your next trade</a></p>';
    if (plan) {
      const c = TP.compare(plan, t);
      const ck = JSON.parse(plan.checks || '[]');
      const cost = (r) => (r.cost && r.cost > 0 ? `<em class="${r.kind === 'left' ? 'left' : 'risk'}">${r.kind === 'left' ? `${money(r.cost, t.currency).replace(/^[+]/, '')} left` : `+${money(r.cost, t.currency).replace(/^[+]/, '')} risk`}</em>` : '');
      planHtml = `<section class="card pvr">
        <div class="row between"><h2>Plan vs result</h2><span class="pvr-score"><span class="pips">${c.rows.map((r) => `<i class="${r.ok ? 'ok' : ''}"></i>`).join('')}</span><b>${c.followed}/${c.total}</b> kept</span></div>
        <div class="pvr-split">
          <div class="pvr-chart">${TP.chartSvg(plan, t)}<p class="small muted"><i class="k-pl"></i>Plan <i class="k-ac"></i>What you did</p></div>
          <ul class="pvr-rows">${c.rows.map((r) => `<li class="${r.ok ? 'ok' : 'bad'}"><i>${r.ok ? '✓' : '!'}</i><span><b>${r.label}</b><small>${esc(r.detail)}</small></span>${cost(r)}</li>`).join('')}</ul>
        </div>
        <div class="pvr-foot">
          <span>Result <b class="${cls(t.net)}">${money(t.net, t.currency)}</b></span>
          ${c.planPays ? `<span>Plan target <b>${money(c.planPays, t.currency)}</b></span>` : ''}
          <span class="muted">${plan.setup ? esc(plan.setup) + ' · ' : ''}${ck.length ? ck.map((k) => `✓ ${esc((TP.CHECKS.find((x) => x[0] === k) || [k, k])[1])}`).join('  ') : ''}</span>
        </div>
        ${plan.reason ? `<p class="pvr-why">“${esc(plan.reason)}”</p>` : ''}
      </section>`;
    }

    page(req, res, `${t.symbol} ${t.side}`, `
    <p><a href="/journal">← All trades</a></p>
    <h1>${esc(t.symbol)} ${esc(t.side)} <span class="${cls(t.net)}">${money(t.net, t.currency)}</span></h1>
    <p class="muted"><span class="priv"><span class="priv-real">Account ${esc(t.account_number)} · position ${esc(t.position_id)}</span><span class="priv-mask">Account ••${esc(String(t.account_number).slice(-2))}</span></span> · ${fmtDate(t.open_time)} → ${fmtDate(t.close_time)} (broker time)</p>

    ${planHtml}

    <section class="card">
      <h2>Share cards <span class="tag">5ABI.FX story · 9:16</span></h2>
      <p class="muted">Swipe story: card 1 is the result, card 2 is the real MT5 chart of this trade.</p>
      <div class="row">
        <select id="style" aria-label="Card style"><option value="a">Style: Cinematic</option><option value="b">Style: Chart first</option><option value="c">Style: Ticket</option></select>
        <select id="mode"><option value="money">Show $ amount</option><option value="pct">Show % of account</option><option value="r">Show R multiple</option></select>
        <label class="check"><input type="checkbox" id="rm" checked> KATANA risk line</label>
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
        <tr><th>Stop loss</th><td>${fx(t.sl) || '-'}${t.sl_edited ? ' <span class="muted">(edited)</span>' : ''}</td><th>Take profit</th><td>${fx(t.tp) || '-'}</td></tr>
        <tr><th>Lots</th><td>${t.lots ?? '-'}</td><th>Pips</th><td>${t.pips ?? '-'}</td></tr>
        <tr><th>R multiple</th><td>${t.r === null ? '-' : t.r.toFixed(2)}</td><th>Risk</th><td>${t.risk_pct === null ? '-' : t.risk_pct.toFixed(2) + '%'}</td></tr>
        <tr><th>Gross / costs</th><td>${money(t.profit)} / ${money((t.commission || 0) + (t.swap || 0))}</td><th>Best / worst move</th><td>${fx(t.mfe) || '-'} / ${fx(t.mae) || '-'}</td></tr>
        <tr><th>Magic / comment</th><td>${t.magic ?? '-'} ${esc(t.comment)}</td><th>Partial closes</th><td>${partials.length ? partials.map((p) => `${p.lots} @ ${fx(p.price)}`).join('<br>') : 'none'}</td></tr>
      </tbody></table>
      ${t.r === null && t.entry !== null ? `<p class="muted">${t.sl !== null && (t.side === 'BUY' ? t.sl >= t.entry : t.sl <= t.entry)
        ? 'The stop shown is at break-even or in profit, so it was moved before the journal saw your first stop. Type your original stop-loss to get R and risk %.'
        : 'No stop-loss was recorded. Type the stop-loss you used to get R and risk %.'}</p>` : ''}
      <form method="post" action="/journal/${t.id}/sl" class="inline-form">
        <label>Original stop-loss <input name="sl" inputmode="decimal" placeholder="${t.side === 'BUY' ? 'below' : 'above'} entry ${fx(t.entry)}" value="${t.sl_edited ? fx(t.sl) : ''}" required></label>
        <button class="secondary small">Save stop</button>
      </form>
    </section>

    <section class="card">
      <h2>Your notes</h2>
      <form method="post" action="/journal/${t.id}" class="grid">
        <label>Setup<input name="setup" value="${esc(t.setup)}" maxlength="120" placeholder="e.g. London breakout"></label>
        <label>Emotion<select name="emotion">${EMOTIONS.map((e) => `<option ${e === t.emotion ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
        <label>Rating<select name="rating">${['', 1, 2, 3, 4, 5].map((r) => `<option value="${r}" ${String(r) === String(t.rating ?? '') ? 'selected' : ''}>${r ? '★'.repeat(r) : '-'}</option>`).join('')}</select></label>
        <label>Mistakes<input name="mistakes" value="${esc(t.mistakes)}" maxlength="200" placeholder="e.g. moved stop, entered early"></label>
        <label class="full">Notes<textarea name="notes" rows="4" maxlength="4000">${esc(t.notes)}</textarea></label>
        <div><button>Save notes</button></div>
      </form>
    </section>

    ${mentorBox ? mentorBox(req, t) : ''}

    ${req.user.is_admin ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Montserrat:wght@500;600&display=swap">' : ''}
    <script id="trade-data" type="application/json">${json}</script>
    <script src="/cards.js"></script>
    ${req.user.is_admin ? '<script src="/overlay.js"></script>' : ''}
    <script src="/journal.js"></script>`);
  });

  app.post('/journal/handle', requireUser, requireJournal, (req, res) => {
    db.prepare('UPDATE users SET card_handle = ? WHERE id = ?').run(String(req.body.card_handle || '').trim().slice(0, 40), req.user.id);
    res.redirect(`/journal/${Number(req.body.back) || ''}`);
  });

  // The trader corrects the stop-loss (e.g. moved to break-even before the EA saw it).
  // R comes from prices: average exit vs entry, over the entry-to-stop distance.
  app.post('/journal/:id/sl', requireUser, requireJournal, (req, res) => {
    const t = getTrade(req);
    if (!t) return res.status(404).send('Not found');
    const sl = Number(String(req.body.sl || '').replace(',', '.').trim());
    const buy = t.side === 'BUY';
    if (!Number.isFinite(sl) || sl <= 0 || t.entry === null || (buy ? sl >= t.entry : sl <= t.entry)) {
      flash(req, 'error', `The original stop must be ${buy ? 'below' : 'above'} the entry price ${t.entry}.`);
      return res.redirect(`/journal/${t.id}`);
    }
    const parts = JSON.parse(t.partials || '[]').filter((p) => Number.isFinite(p.price) && Number.isFinite(p.lots));
    const lots = Number(t.lots) || 0;
    const partLots = parts.reduce((a, p) => a + p.lots, 0);
    const restLots = Math.max(0, lots - partLots);
    const avgExit = lots > 0 && t.exit !== null
      ? (parts.reduce((a, p) => a + p.price * p.lots, 0) + t.exit * restLots) / (partLots + restLots || 1)
      : t.exit;
    const move = (buy ? 1 : -1) * (avgExit - t.entry);
    const r = avgExit === null ? null : move / Math.abs(t.entry - sl);
    const riskMoney = r && t.net !== null ? Math.abs(t.net / r) : null;
    const startBal = t.balance_after !== null && t.net !== null ? t.balance_after - t.net : null;
    const riskPct = riskMoney && startBal > 0 ? (riskMoney / startBal) * 100 : null;
    db.prepare(`UPDATE journal_trades SET sl = ?, r = ?, risk_money = ?, risk_pct = ?, sl_edited = 1, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?`).run(sl, r, riskMoney, riskPct, t.id, req.user.id);
    flash(req, 'ok', r === null ? 'Stop-loss saved.' : `Stop-loss saved. This trade is ${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R.`);
    res.redirect(`/journal/${t.id}`);
  });

  app.post('/journal/:id', requireUser, requireJournal, (req, res) => {
    const t = getTrade(req);
    if (!t) return res.status(404).send('Not found');
    const rating = Number(req.body.rating);
    db.prepare(`UPDATE journal_trades SET setup = ?, emotion = ?, mistakes = ?, notes = ?, rating = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(String(req.body.setup || '').trim().slice(0, 120), EMOTIONS.includes(req.body.emotion) ? req.body.emotion : '',
        String(req.body.mistakes || '').trim().slice(0, 200), String(req.body.notes || '').slice(0, 4000),
        rating >= 1 && rating <= 5 ? rating : null, t.id);
    flash(req, 'ok', 'Notes saved.');
    res.redirect(`/journal/${t.id}`);
  });
};
