// Log trade: the trader logs a trade the EA did not see (or a no-trade day), and tags any trade
// with how they felt, mistakes, whether they followed the plan and an A+ to F grade.
// The same chips are used on the Log trade page, on each trade page and in the quick "Tag trades" flow.
const { esc } = require('./views');
const TP = require('./tradeplans');

const FEEL_GOOD = [['Patient', '🧘'], ['Focused', '🎯'], ['Calm', '🌊'], ['Followed rules', '📋'], ['Confident', '🛡️'], ['Selective', '⏳']];
const FEEL_BAD = [['FOMO', '🏃'], ['Revenge', '😤'], ['Impatient', '⚡'], ['Fearful', '😰'], ['Greedy', '💰'], ['Overconfident', '🎢'], ['Distracted', '📱'], ['Anxious', '😬'], ['Bored', '🥱']];
const MISTAKES = ['Entered early', 'Moved my stop', 'Closed too early', 'Too big a lot', 'No stop', 'Chased price', 'Traded the news', 'Too many trades'];
const NO_TRADE = ['No valid setup', 'Waited and missed it', 'Choppy market', 'News day', 'Hit my daily goal', 'Outside my session', 'Personal'];
const GRADES = [['A+', 'Textbook'], ['A', 'Good'], ['B', 'Okay'], ['C', 'Sloppy'], ['F', 'Broke rules']];
const PLAN = ['Yes', 'Partly', 'No'];
const STAR_GRADE = { 5: 'A+', 4: 'A', 3: 'B', 2: 'C', 1: 'F' };   // old 1-5 star ratings
const BAD = new Set(FEEL_BAD.map(([k]) => k.toLowerCase()));
const MANUAL = '0';                                                  // account number of trades logged by hand

// "a, b" text <-> list
const list = (s) => String(s || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
const clean = (v) => String(v || '').replace(/[<>\n\r]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
const pick = (body, name) => {
  const out = [];
  [].concat(body[name] || [], ...list(body[name + '_own']).map((x) => [x])).forEach((v) => {
    const c = clean(v);
    if (c && !out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c);
  });
  return out.slice(0, 10);
};
const gradeOf = (t) => t.grade || STAR_GRADE[t.rating] || '';
const isTagged = (t) => !!(t.emotion || t.grade || t.followed || t.rating);

// the review form body: plan, feelings, mistakes, grade, setup, notes. t = trade row (or {} for a new one)
function fields(t = {}, { compact = false, parts = false } = {}) {
  const feel = new Set(list(t.emotion).map((x) => x.toLowerCase()));
  const mist = new Set(list(t.mistakes).map((x) => x.toLowerCase()));
  const g = gradeOf(t);
  const chip = (name, v, icon, on, bad) => `<label class="lt-chip${bad ? ' bad' : ''}"><input type="checkbox" name="${name}" value="${esc(v)}"${on ? ' checked' : ''}><span>${icon ? `<i aria-hidden="true">${icon}</i>` : ''}${esc(v)}</span></label>`;
  const own = (name, label) => `<input class="lt-own" name="${name}_own" placeholder="${label}" maxlength="60" autocomplete="off" aria-label="${label}">`;
  // the trader's own words come back as chips too
  const extra = (have, known) => [...have].filter((x) => !known.some((k) => k.toLowerCase() === x));
  const feelOrig = list(t.emotion), mistOrig = list(t.mistakes);
  const ownFeel = extra(feel, [...FEEL_GOOD, ...FEEL_BAD].map(([k]) => k)).map((x) => feelOrig.find((o) => o.toLowerCase() === x));
  const ownMist = extra(mist, MISTAKES).map((x) => mistOrig.find((o) => o.toLowerCase() === x));
  const P = {
    plan: `<div class="lt-blk"><h4>Did you follow your plan?</h4>
      <div class="lt-seg" role="radiogroup">${PLAN.map((p) => `<label><input type="radio" name="followed" value="${p}"${t.followed === p ? ' checked' : ''}><span>${p}</span></label>`).join('')}</div></div>`,
    feel: `<div class="lt-blk"><h4>How did you feel?</h4>
      <div class="lt-feel">
        <div><p class="lt-q"><i class="dot good"></i>Good</p><div class="lt-chips" data-own="feel">${FEEL_GOOD.map(([k, i]) => chip('feel', k, i, feel.has(k.toLowerCase()))).join('')}${ownFeel.filter((x) => !BAD.has(x.toLowerCase())).map((x) => chip('feel', x, '', true)).join('')}</div></div>
        <div><p class="lt-q"><i class="dot bad"></i>Not so good</p><div class="lt-chips" data-own="feel" data-bad>${FEEL_BAD.slice(0, compact ? 6 : 99).map(([k, i]) => chip('feel', k, i, feel.has(k.toLowerCase()), true)).join('')}${compact ? FEEL_BAD.slice(6).filter(([k]) => feel.has(k.toLowerCase())).map(([k, i]) => chip('feel', k, i, true, true)).join('') : ''}</div></div>
      </div>
      ${own('feel', 'Add your own feeling…')}</div>`,
    mist: `<div class="lt-blk"><h4>Any mistakes? <small>leave empty if none</small></h4>
      <div class="lt-chips" data-own="mist">${MISTAKES.map((k) => chip('mist', k, '', mist.has(k.toLowerCase()), true)).join('')}${ownMist.map((x) => chip('mist', x, '', true, true)).join('')}</div>
      ${own('mist', 'Add your own mistake…')}</div>`,
    grade: `<div class="lt-blk"><h4>Grade this trade <small>how well you traded, not the money</small></h4>
      <div class="lt-grades" role="radiogroup">${GRADES.map(([k, l]) => `<label><input type="radio" name="grade" value="${k}"${g === k ? ' checked' : ''}><span><b>${k}</b><small>${l}</small></span></label>`).join('')}</div></div>`,
    setup: compact ? '' : `<div class="lt-blk"><h4>Setup <small>optional</small></h4><input name="setup" value="${esc(t.setup || '')}" maxlength="120" placeholder="e.g. London breakout"></div>`,
    notes: `<div class="lt-blk"><h4>Notes</h4><textarea name="notes" rows="${compact ? 2 : 4}" maxlength="4000" placeholder="What did you see? What did you do well? What would you do differently?">${esc(t.notes || '')}</textarea></div>`,
  };
  if (parts) return P;
  return `
    ${P.plan}
    ${P.feel}
    ${P.mist}
    ${P.grade}
    ${P.setup}
    ${P.notes}`;
}

// form body -> columns. Old forms (emotion select + 1-5 rating) still work.
function parse(body, t = {}) {
  const feel = pick(body, 'feel');
  if (!feel.length && body.emotion && !body.feel_own) feel.push(clean(body.emotion));
  const mist = body.mist !== undefined || body.mist_own !== undefined ? pick(body, 'mist') : list(body.mistakes).map(clean).slice(0, 10);
  let grade = GRADES.some(([k]) => k === body.grade) ? body.grade : '';
  if (!grade && STAR_GRADE[Number(body.rating)]) grade = STAR_GRADE[Number(body.rating)];
  return {
    emotion: feel.filter(Boolean).join(', '),
    mistakes: mist.join(', '),
    grade: grade || null,
    followed: PLAN.includes(body.followed) ? body.followed : '',
    notes: String(body.notes ?? t.notes ?? '').slice(0, 4000),
    setup: String(body.setup ?? t.setup ?? '').trim().slice(0, 120),
    rating: Number(body.rating) >= 1 && Number(body.rating) <= 5 ? Number(body.rating) : (t.rating ?? null),
  };
}

// Insights: win rate and result per feeling and per grade (shown once 5 trades are tagged)
function insightsHtml(rows, money) {
  const tagged = rows.filter(isTagged);
  if (tagged.length < 5) {
    return `<section class="card lt-ins"><h2>Feelings and grades</h2><p class="muted">Tag at least 5 trades with how you felt and a grade, and this box shows which feelings and grades make or lose you money. ${tagged.length ? `${tagged.length} tagged so far. ` : ''}<a href="/journal/tag">Tag trades</a></p></section>`;
  }
  const sum = (l) => l.reduce((s, t) => s + (t.net || 0), 0);
  const group = (keyFn) => { const m = {}; tagged.forEach((t) => keyFn(t).forEach((k) => (m[k] ||= []).push(t))); return m; };
  const row = (k, l, bad) => { const w = Math.round((l.filter((t) => t.net > 0).length / l.length) * 100), s = sum(l);
    return `<tr><td>${bad ? '<i class="dot bad"></i>' : ''}${esc(k)}</td><td class="right">${l.length}</td><td class="right"><span class="lt-bar"><i style="width:${w}%"></i></span>${w}%</td><td class="right ${s > 0 ? 'pos' : s < 0 ? 'neg' : ''}">${money(s)}</td></tr>`; };
  const feel = group((t) => list(t.emotion));
  const fr = Object.entries(feel).sort((a, b) => sum(b[1]) - sum(a[1]));
  const gm = group((t) => (gradeOf(t) ? [gradeOf(t)] : []));
  const gr = GRADES.map(([k]) => k).filter((k) => gm[k]).map((k) => [k, gm[k]]);
  const pm = group((t) => (t.followed ? [t.followed] : []));
  const head = (a) => `<thead><tr><th>${a}</th><th class="right">Trades</th><th class="right">Win rate</th><th class="right">Result</th></tr></thead>`;
  const worst = fr.length > 1 && sum(fr[fr.length - 1][1]) < 0 ? fr[fr.length - 1] : null;
  return `<section class="card lt-ins"><div class="row between"><h2>Feelings and grades</h2><a class="small" href="/journal/tag">Tag trades ›</a></div>
    <p class="muted small">${tagged.length} of ${rows.length} trades tagged.${worst ? ` Trades where you felt <b>${esc(worst[0])}</b> cost you <b class="neg">${money(sum(worst[1]))}</b>.` : ''}</p>
    <div class="lt-ins-grid">
      <div class="tbl-scroll"><table>${head('Feeling')}<tbody>${fr.map(([k, l]) => row(k, l, BAD.has(k.toLowerCase()))).join('')}</tbody></table></div>
      <div class="tbl-scroll"><table>${head('Grade')}<tbody>${gr.map(([k, l]) => row(k, l)).join('')}</tbody></table>
      ${Object.keys(pm).length ? `<table>${head('Followed plan')}<tbody>${PLAN.filter((k) => pm[k]).map((k) => row(k, pm[k], k === 'No')).join('')}</tbody></table>` : ''}</div>
    </div></section>`;
}

// ---------- routes ----------
function routes(app, { db, page, flash, requireUser, requireJournal, money }) {
  const myAccounts = (u) => db.prepare(`SELECT a.account_number, MAX(t.broker) AS broker, MAX(t.currency) AS cur FROM accounts a
      LEFT JOIN journal_trades t ON t.user_id = a.user_id AND t.account_number = a.account_number WHERE a.user_id = ? GROUP BY a.account_number ORDER BY a.account_number`).all(u.id);
  const untaggedSql = `FROM journal_trades WHERE user_id = ? AND emotion = '' AND grade IS NULL AND followed = '' AND rating IS NULL
      AND account_number IN (SELECT account_number FROM accounts WHERE user_id = ?) AND close_time >= ?`;
  const since30 = () => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const untagged = (u) => db.prepare(`SELECT COUNT(*) AS n ${untaggedSql}`).get(u.id, u.id, since30()).n;

  // the Log trade page (also opened from the journal's "+ Log trade" button)
  app.get('/journal/log', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const now = TP.brokerNow(u.ny_offset ?? 7).replace(' ', 'T').slice(0, 16);
    const accs = myAccounts(u);
    const acct = (v, label, on) => `<label class="lt-chip"><input type="radio" name="account" value="${esc(v)}"${on ? ' checked' : ''}><span>${label}</span></label>`;
    page(req, res, 'Log trade', `
    <p><a href="/journal">← Journal</a></p>
    <form method="post" action="/journal/log" class="lt-sheet" id="lt-form" data-draft="lt-draft-${u.id}">
      <div class="lt-top">
        <div><small class="muted">Journal</small><h1>Log trade</h1></div>
        <div class="lt-seg lt-kind" role="radiogroup" aria-label="What are you logging?"><label><input type="radio" name="kind" value="trade" checked><span>Trade</span></label><label><input type="radio" name="kind" value="none"><span>No-trade day</span></label></div>
      </div>
      <div class="lt-body">
        <div class="lt-form">
          <div class="lt-blk lt-trade"><h4>The trade <small>for trades the Journal EA did not see · times in MT5 server time</small></h4>
            <p class="lt-q">Account</p>
            <div class="lt-chips">${acct(MANUAL, 'Manual', true)}${accs.map((a) => acct(a.account_number, `<span class="priv"><span class="priv-real">${esc(a.broker || 'Account')} · ${esc(a.account_number)}</span><span class="priv-mask">Account ••${esc(String(a.account_number).slice(-2))}</span></span>`)).join('')}</div>
            <div class="lt-g2">
              <label>Symbol<input name="symbol" maxlength="20" placeholder="XAUUSD" autocapitalize="characters" data-rec="sym"></label>
              <div><span class="lt-lbl">Direction</span><div class="lt-seg lt-side"><label><input type="radio" name="side" value="BUY" checked><span>Buy</span></label><label><input type="radio" name="side" value="SELL"><span>Sell</span></label></div></div>
            </div>
            <div class="lt-g3">
              <label>Entry<input name="entry" inputmode="decimal" placeholder="0.00"></label>
              <label>Stop loss<input name="sl" inputmode="decimal" placeholder="optional"></label>
              <label>Take profit<input name="tp" inputmode="decimal" placeholder="optional"></label>
              <label>Exit<input name="exit" inputmode="decimal" placeholder="0.00"></label>
              <label>Lots<input name="lots" inputmode="decimal" placeholder="0.10"></label>
              <label>Result ($ after costs)<input name="net" inputmode="decimal" placeholder="+250 or -120" data-rec="net"></label>
            </div>
            <div class="lt-g2">
              <label>Opened<input type="datetime-local" name="open_time" value="${now}"></label>
              <label>Closed<input type="datetime-local" name="close_time" value="${now}"></label>
            </div>
          </div>
          <div class="lt-blk lt-none"><h4>Why no trade today?</h4>
            <div class="lt-chips" data-own="why">${NO_TRADE.map((k) => `<label class="lt-chip"><input type="checkbox" name="why" value="${esc(k)}"><span>${esc(k)}</span></label>`).join('')}</div>
            <input class="lt-own" name="why_own" placeholder="Add your own reason…" maxlength="60" autocomplete="off" aria-label="Add your own reason">
            <label class="lt-day">Day<input type="date" name="day" value="${now.slice(0, 10)}"></label>
          </div>
          ${fields({})}
          <div class="lt-save"><button class="btn lt-go">Save</button><span class="lt-st" aria-live="polite"><i></i><span>Draft saved on this device</span></span></div>
        </div>
        <aside class="lt-rec" aria-label="Summary">
          <h5>The record</h5>
          <div class="lt-prog"><i></i></div>
          <div class="lt-rec-hd"><div><div class="muted small" data-r="side">New trade</div><div class="lt-big" data-r="net">$0</div></div><span class="lt-gb" data-r="grade">–</span></div>
          <dl class="lt-rl">
            <div><dt>Account</dt><dd data-r="account">Manual</dd></div>
            <div><dt>Risk to reward</dt><dd data-r="rr">–</dd></div>
            <div><dt>Plan</dt><dd data-r="followed" class="e">Not answered</dd></div>
            <div><dt>Felt</dt><dd data-r="feel" class="e">Not answered</dd></div>
            <div><dt>Mistakes</dt><dd data-r="mist" class="e">None</dd></div>
          </dl>
          <p class="small muted">Your answers feed Insights: win rate by feeling, cost of each mistake and your grade next to your results.</p>
        </aside>
      </div>
    </form>
    <div class="lt-dlg-bg" id="lt-dlg" hidden><div class="lt-dlg" role="dialog" aria-modal="true" aria-labelledby="lt-dlg-h">
      <h3 id="lt-dlg-h">Continue your draft?</h3>
      <p class="muted small">You started a trade and did not save it. It is still here.</p>
      <div class="lt-dcard"><span class="lt-gb">✎</span><div><b data-d="t">Untitled trade</b><div class="muted small" data-d="s"></div></div></div>
      <div class="lt-dbtns"><button type="button" class="btn" data-d="go">Continue the draft</button><button type="button" class="btn secondary" data-d="new">Start a new trade</button></div>
    </div></div>
    <script src="/logtrade.js"></script>`);
  });

  const num = (v) => { const s = String(v ?? '').replace(',', '.').replace(/[^\d.+-]/g, ''); const n = Number(s); return s !== '' && Number.isFinite(n) ? n : null; };
  const time = (v) => (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(String(v || '')) ? String(v).slice(0, 16).replace('T', ' ') + ':00' : null);

  app.post('/journal/log', requireUser, requireJournal, (req, res) => {
    const u = req.user, b = req.body || {};
    const back = (msg) => { flash(req, 'error', msg); res.redirect('/journal/log'); };
    const R = parse(b);
    if (b.kind === 'none') {
      const day = /^\d{4}-\d\d-\d\d$/.test(String(b.day || '')) ? b.day : TP.brokerNow(u.ny_offset ?? 7).slice(0, 10);
      db.prepare(`INSERT INTO journal_days (user_id, day, reasons, emotion, notes) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, day) DO UPDATE SET reasons = excluded.reasons, emotion = excluded.emotion, notes = excluded.notes, updated_at = datetime('now')`)
        .run(u.id, day, pick(b, 'why').join(', '), R.emotion, R.notes);
      flash(req, 'ok', 'No-trade day saved. Sitting out is a decision too.');
      return res.redirect(`/journal?month=${day.slice(0, 7)}`);
    }
    const account = String(b.account || MANUAL);
    if (account !== MANUAL && !db.prepare('SELECT 1 FROM accounts WHERE user_id = ? AND account_number = ?').get(u.id, account)) return back('Pick one of your accounts, or Manual.');
    const symbol = String(b.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9._#-]/g, '').slice(0, 20);
    if (!symbol) return back('Type the symbol, e.g. XAUUSD.');
    const side = b.side === 'SELL' ? 'SELL' : 'BUY', dir = side === 'SELL' ? -1 : 1;
    const entry = num(b.entry), exit = num(b.exit), net = num(b.net), lots = num(b.lots);
    let sl = num(b.sl), tp = num(b.tp);
    if (net === null) return back('Type the result in $ (for example 250 or -120).');
    const open = time(b.open_time) || TP.brokerNow(u.ny_offset ?? 7), close = time(b.close_time) || open;
    if (close < open) return back('The close time is before the open time.');
    if (!(sl > 0)) sl = null; if (!(tp > 0)) tp = null;
    // R from prices when the stop is on the losing side of the entry
    let r = null, risk = null;
    if (entry > 0 && exit > 0 && sl && (entry - sl) * dir > 0) { r = ((exit - entry) * dir) / Math.abs(entry - sl); risk = r ? Math.abs(net / r) : null; }
    const digits = Math.min(5, Math.max(0, ...[b.entry, b.exit, b.sl, b.tp].map((v) => (String(v || '').split(/[.,]/)[1] || '').length)));
    const cur = account === MANUAL ? 'USD' : (db.prepare('SELECT MAX(currency) AS c FROM journal_trades WHERE user_id = ? AND account_number = ?').get(u.id, account).c || 'USD');
    const broker = account === MANUAL ? 'Manual' : (db.prepare('SELECT MAX(broker) AS b FROM journal_trades WHERE user_id = ? AND account_number = ?').get(u.id, account).b || '');
    const info = db.prepare(`INSERT INTO journal_trades (user_id, account_number, position_id, symbol, side, lots, entry, exit, sl, tp, digits, open_time, close_time,
        profit, commission, swap, net, r, risk_money, currency, broker, setup, emotion, mistakes, notes, rating, grade, followed, manual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)`)
      .run(u.id, account, `M${Date.now()}`, symbol, side, lots, entry, exit, sl, tp, digits, open, close, net, net, r, risk, cur, broker,
        R.setup, R.emotion, R.mistakes, R.notes, R.grade, R.followed);
    flash(req, 'ok', 'Trade saved.');
    res.redirect(`/journal/${info.lastInsertRowid}`);
  });

  // quick tagging: untagged trades from the EA (last 30 days), one at a time, newest first
  app.get('/journal/tag', requireUser, requireJournal, (req, res) => {
    const u = req.user;
    const before = /^[\d .:T-]{10,25}$/.test(String(req.query.before || '')) ? String(req.query.before) : '9999';
    const total = untagged(u);
    const t = db.prepare(`SELECT * ${untaggedSql} AND close_time < ? ORDER BY close_time DESC LIMIT 1`).get(u.id, u.id, since30(), before);
    if (!t) {
      return page(req, res, 'Tag trades', `<p><a href="/journal">← Journal</a></p>
        <section class="card lt-done"><h1>All caught up</h1><p class="muted">${total ? `You skipped ${total} trade${total > 1 ? 's' : ''}. <a href="/journal/tag">Start again</a>` : 'Every trade from the last 30 days has a tag. Nice work.'}</p>
        <p><a class="btn" href="/journal">Back to the journal</a> <a class="btn secondary" href="/journal/insights">See Insights</a></p></section>`);
    }
    const left = db.prepare(`SELECT COUNT(*) AS n ${untaggedSql} AND close_time >= ?`).get(u.id, u.id, since30(), t.close_time).n;
    const d = t.digits ?? 5, fx = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(d));
    const th = TP.thumb(t);
    page(req, res, 'Tag trades', `
    <p><a href="/journal">← Journal</a></p>
    <div class="row between page-head"><h1>Tag trades</h1><span class="muted small">Trade ${left} of ${total}</span></div>
    <div class="lt-steps" aria-hidden="true">${Array.from({ length: Math.min(total, 12) }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('')}</div>
    <form method="post" action="/journal/${t.id}" class="lt-sheet lt-tagger">
      <input type="hidden" name="next" value="tag">
      <div class="lt-body">
        <div class="lt-tcard">
          <p class="lt-ea"><i></i>Sent by the Journal EA · <span class="priv"><span class="priv-real">${esc(t.account_number)}</span><span class="priv-mask">Account ••${esc(String(t.account_number).slice(-2))}</span></span></p>
          <div class="lt-thd"><b>${esc(t.symbol)} ${t.side === 'SELL' ? 'Sell' : 'Buy'}</b><b class="${t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : ''}">${money(t.net, t.currency)}</b></div>
          <p class="muted small">${esc(String(t.close_time).replace('T', ' ').slice(0, 16))} · ${t.lots ?? '-'} lots</p>
          ${th ? `<div class="fq-thumb lt-thumb">${th}</div>` : ''}
          <div class="lt-kv"><div><small>Entry</small><b>${fx(t.entry)}</b></div><div><small>Exit</small><b>${fx(t.exit)}</b></div><div><small>Result</small><b>${t.r === null || t.r === undefined ? '-' : `${t.r >= 0 ? '+' : '−'}${Math.abs(t.r).toFixed(1)}R`}</b></div></div>
          <a class="small" href="/journal/${t.id}">Open the full trade ›</a>
        </div>
        <div class="lt-form">${fields(t, { compact: true })}
          <div class="lt-save"><a class="btn secondary" href="/journal/tag?before=${encodeURIComponent(t.close_time)}">Skip</a><button class="btn lt-go">Save and next →</button></div>
        </div>
      </div>
    </form>
    <script src="/logtrade.js"></script>`);
  });

  return { untagged };
}

module.exports = { fields, parse, insightsHtml, routes, gradeOf, isTagged, MANUAL, GRADES };
