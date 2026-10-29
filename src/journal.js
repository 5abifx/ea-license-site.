// Trade Journal: receives trades from the Trade Journal EA and shows them to the customer.
const crypto = require('crypto');
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
    const acc = cleanAccount(req.query.account);
    const where = acc ? 'user_id = ? AND account_number = ?' : 'user_id = ?';
    const args = acc ? [u.id, acc] : [u.id];
    const st = db.prepare(`SELECT COUNT(*) AS n, SUM(net > 0) AS wins, SUM(net) AS net,
        SUM(CASE WHEN net > 0 THEN net ELSE 0 END) AS gross_win, SUM(CASE WHEN net < 0 THEN -net ELSE 0 END) AS gross_loss,
        AVG(r) AS avg_r, MAX(currency) AS cur FROM journal_trades WHERE ${where}`).get(...args);
    const trades = db.prepare(`SELECT id, account_number, symbol, side, lots, net, r, pips, open_time, close_time, setup, rating, currency
        FROM journal_trades WHERE ${where} ORDER BY close_time DESC LIMIT 300`).all(...args);
    const accounts = db.prepare('SELECT DISTINCT account_number FROM journal_trades WHERE user_id = ? ORDER BY 1').all(u.id);
    const winRate = st.n ? Math.round((st.wins / st.n) * 100) : 0;
    const pf = st.gross_loss ? (st.gross_win / st.gross_loss).toFixed(2) : st.gross_win ? '∞' : '-';
    const site = req.protocol + '://' + req.get('host');

    page(req, res, 'Trade Journal', `
    <h1>Trade Journal</h1>
    ${accounts.length > 1 ? `<form method="get" action="/journal" class="row"><select name="account" onchange="this.form.submit()">
      <option value="">All accounts</option>${accounts.map((a) => `<option ${a.account_number === acc ? 'selected' : ''}>${esc(a.account_number)}</option>`).join('')}
    </select></form>` : ''}
    <div class="stats">
      <div><span>Trades</span><strong>${st.n}</strong></div>
      <div><span>Win rate</span><strong>${st.n ? winRate + '%' : '-'}</strong></div>
      <div><span>Net P&amp;L</span><strong class="${cls(st.net)}">${st.n ? money(st.net, st.cur) : '-'}</strong></div>
      <div><span>Profit factor</span><strong>${pf}</strong></div>
      <div><span>Average R</span><strong>${st.avg_r === null ? '-' : (st.avg_r >= 0 ? '+' : '−') + Math.abs(st.avg_r).toFixed(2) + 'R'}</strong></div>
    </div>

    <section class="card">
      <h2>Trades</h2>
      ${trades.length ? `<table><thead><tr><th>Closed</th><th>Symbol</th><th>Side</th><th>Lots</th><th>Net</th><th>R</th><th>Setup</th><th></th></tr></thead><tbody>
      ${trades.map((t) => `<tr>
        <td>${fmtDate(t.close_time)}${accounts.length > 1 ? `<br><span class="muted">${esc(t.account_number)}</span>` : ''}</td>
        <td><strong>${esc(t.symbol)}</strong></td><td>${esc(t.side)}</td><td>${t.lots ?? '-'}</td>
        <td class="${cls(t.net)}">${money(t.net)}</td>
        <td>${t.r === null ? '-' : (t.r >= 0 ? '+' : '−') + Math.abs(t.r).toFixed(2)}</td>
        <td>${esc(t.setup) || '<span class="muted">add notes</span>'}</td>
        <td><a class="btn small secondary" href="/journal/${t.id}">Open</a></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">No trades yet. Connect the Trade Journal EA below; every trade you close will appear here.</p>'}
    </section>

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

    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Hanken+Grotesk:wght@500;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
    <script id="trade-data" type="application/json">${json}</script>
    <script src="/cards.js"></script>
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
