// Admin sales dashboard (/admin/sales): track record by month, the sign-up funnel and where people drop off,
// people to follow up, and a "what to fix" list worked out from the numbers.
//
// Data: users (sign-ups, trial, plan, Stripe), sales_log (trials, payments, cancels, from this release on),
// agreements (plan picked = checkout started), mentor_events (mentorship prices / waitlist / checkout / paid),
// visits (first-party visitor counter: a random id in the session cookie, no IP stored).
const crypto = require('crypto');
const { esc, fmtDate, trialDays } = require('./views');
const { getPlan } = require('./plans');

const TRACKED = { '/': 'Home', '/mentorship': 'Mentorship', '/pricing': 'Pricing', '/signup': 'Sign up', '/login': 'Sign in' };
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|discord|telegram|curl|wget|python|headless|lighthouse|monitor|uptime/i;
const SOURCES = [
  [/instagram/, 'instagram'], [/youtu/, 'youtube'], [/discord/, 'discord'], [/(^|\.)t\.me$|telegram/, 'telegram'],
  [/whatsapp|wa\.me/, 'whatsapp'], [/facebook|fb\.com|fb\.me/, 'facebook'], [/tiktok/, 'tiktok'], [/(^|\.)t\.co$|twitter|(^|\.)x\.com$/, 'x'],
  [/google\./, 'google'], [/bing\.|duckduckgo|yahoo\./, 'search'], [/reddit/, 'reddit'], [/linkedin/, 'linkedin'],
];
const cleanSrc = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
function sourceOf(req) {
  const tag = req.query.utm_source || req.query.src || req.query.source;
  if (tag) { const t = cleanSrc(tag); return (SOURCES.find(([re]) => re.test(t)) || [0, t])[1]; }
  let host = '';
  try { host = new URL(req.get('referer') || '').hostname.replace(/^www\./, ''); } catch { return ''; }
  if (!host || host === String(req.get('host') || '').replace(/:\d+$/, '').replace(/^www\./, '')) return '';
  return (SOURCES.find(([re]) => re.test(host)) || [0, cleanSrc(host)])[1];
}

// counts signed-out visitors on the public pages, remembers where they first came from
function trackVisits(db) {
  const ins = db.prepare('INSERT OR IGNORE INTO visits (day, path, vid, src) VALUES (date(\'now\'), ?, ?, ?)');
  return (req, res, next) => {
    try {
      if (req.method === 'GET' && TRACKED[req.path] && !req.user && req.session && !BOT.test(req.get('user-agent') || '')) {
        if (!req.session.vid) req.session.vid = crypto.randomBytes(8).toString('hex');
        if (req.session.src === undefined) req.session.src = sourceOf(req) || '';
        else if (!req.session.src) { const s = sourceOf(req); if (s) req.session.src = s; }
        ins.run(req.path, req.session.vid, req.session.src || '');
      }
    } catch (e) { console.error('visits:', e.message); }
    next();
  };
}

const LABEL = { '': 'Direct / unknown', referral: 'Referral link', instagram: 'Instagram', youtube: 'YouTube', discord: 'Discord', telegram: 'Telegram',
  whatsapp: 'WhatsApp', facebook: 'Facebook', tiktok: 'TikTok', x: 'X (Twitter)', google: 'Google', search: 'Other search', reddit: 'Reddit', linkedin: 'LinkedIn', admin: 'Added by you' };
const srcLabel = (s) => LABEL[s] || s;

function routes(app, { db, page, requireAdmin, stripe, mentorPlans, backup }) {

  const PERIODS = { 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months', all: 'All time' };
  const now = () => Date.now();
  const ts = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')) : NaN);
  const sqlDay = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  app.get('/admin/sales', requireAdmin, (req, res) => {
    const p = PERIODS[req.query.p] ? req.query.p : 'all';
    const days = p === 'all' ? null : Number(p);
    const from = days ? sqlDay(now() - days * 86400000) : '0000';
    const prevFrom = days ? sqlDay(now() - 2 * days * 86400000) : null;

    const all = db.prepare(`SELECT u.*,
        EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.last_check_at IS NOT NULL) AS connected,
        EXISTS (SELECT 1 FROM journal_trades j WHERE j.user_id = u.id) AS traded,
        EXISTS (SELECT 1 FROM sales_log s WHERE s.user_id = u.id AND s.kind IN ('ea', 'mentorship')) AS paid_log,
        (SELECT MAX(g.created_at) FROM agreements g WHERE g.user_id = u.id AND g.plan LIKE '%:%') AS picked_at
      FROM users u WHERE u.is_admin = 0 ORDER BY u.created_at DESC`).all();
    const expired = (u) => u.expires_at && ts(u.expires_at) < now();
    const payingNow = (u) => Boolean(u.plan && !u.trial && !expired(u));
    const everPaid = (u) => Boolean(u.plan || u.mentor_plan || u.paid_log);
    const startedTrial = (u) => Boolean(u.trial || u.trial_used || everPaid(u));
    // early members / students the owner gave free access to: kept out of the funnel so it shows real sales
    const free = (u) => !everPaid(u) && (u.student || (!u.expires_at && !u.trial));

    const inPeriod = (u) => !days || u.created_at >= from;
    const cohort = all.filter((u) => inPeriod(u) && !free(u));
    const freeN = all.filter((u) => inPeriod(u) && free(u)).length;
    const visitors = db.prepare('SELECT COUNT(DISTINCT vid) AS n FROM visits WHERE day >= ?').get(from.slice(0, 10)).n;
    const visitsSince = db.prepare('SELECT MIN(day) AS d FROM visits').get().d;

    // how far each person got; a later step counts as having passed the earlier ones (a mentorship buyer may never connect MT5)
    const stage = (u) => (everPaid(u) ? 5 : u.traded ? 4 : u.connected ? 3 : startedTrial(u) ? 2 : 1);
    const steps = [
      ['Signed up', cohort.length, 'Created an account'],
      ['Started trial', cohort.filter((u) => stage(u) >= 2).length, stripe.cardTrial() ? 'Added a card, so the free trial started' : 'Free trial started'],
      ['Connected MT5', cohort.filter((u) => stage(u) >= 3).length, 'An EA checked in from their MT5 account'],
      ['Logged a trade', cohort.filter((u) => stage(u) >= 4).length, 'The Journal EA sent at least one trade'],
      ['Paid', cohort.filter(everPaid).length, 'Paid for a plan or the mentorship'],
    ];
    // visitors only belong in the funnel when they were counted for the whole period
    const visitorsFit = visitors && visitsSince && visitsSince <= from.slice(0, 10);
    if (visitorsFit) steps.unshift(['Visitors', visitors, 'Different people who opened Home, Mentorship, Pricing or Sign up']);
    let leak = null;
    for (let i = 1; i < steps.length; i++) {
      const lost = steps[i - 1][1] - steps[i][1];
      const rate = steps[i - 1][1] ? lost / steps[i - 1][1] : 0;
      if (steps[i - 1][1] >= 2 && lost > 0 && (!leak || rate > leak.rate)) leak = { i, lost, rate };
    }

    // ---- KPIs ----
    const signups = all.filter(inPeriod).length;
    const prevSignups = days ? all.filter((u) => u.created_at >= prevFrom && u.created_at < from).length : null;
    const trialsNow = all.filter((u) => u.trial && !expired(u)).length;
    const paying = all.filter(payingNow);
    const mrr = paying.reduce((s, u) => { const pl = getPlan(u.plan); return s + (pl ? (u.billing === 'annual' ? pl.annual : pl.monthly) : 0); }, 0);
    const rev = db.prepare("SELECT COALESCE(SUM(amount), 0) AS s, COUNT(*) AS n FROM sales_log WHERE kind IN ('ea', 'mentorship') AND created_at >= ?").get(from);
    const students = all.filter((u) => u.mentor_plan).length;
    const logSince = db.prepare('SELECT MIN(created_at) AS d FROM sales_log').get().d;

    // ---- track record by month (last 12 months) ----
    const months = [];
    const d0 = new Date(); d0.setUTCDate(1);
    for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
    const byMonth = (sql) => Object.fromEntries(db.prepare(sql).all().map((r) => [r.m, r]));
    const mSign = byMonth("SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS n FROM users WHERE is_admin = 0 GROUP BY m");
    const mVis = byMonth('SELECT substr(day, 1, 7) AS m, COUNT(DISTINCT vid) AS n FROM visits GROUP BY m');
    const mTrial = byMonth("SELECT substr(created_at, 1, 7) AS m, COUNT(DISTINCT user_id) AS n FROM sales_log WHERE kind = 'trial' GROUP BY m");
    const mPick = byMonth("SELECT substr(created_at, 1, 7) AS m, COUNT(DISTINCT user_id) AS n FROM agreements WHERE plan LIKE '%:%' GROUP BY m");
    const mNew = byMonth(`SELECT substr(f, 1, 7) AS m, COUNT(*) AS n FROM (SELECT user_id, MIN(created_at) AS f FROM sales_log WHERE kind = 'ea' GROUP BY user_id) GROUP BY m`);
    const mMent = byMonth("SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS n FROM mentor_events WHERE event = 'paid' GROUP BY m");
    const mRev = byMonth("SELECT substr(created_at, 1, 7) AS m, SUM(amount) AS n FROM sales_log WHERE kind IN ('ea', 'mentorship') GROUP BY m");
    const mCancel = byMonth("SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS n FROM sales_log WHERE kind = 'cancel' GROUP BY m");
    const v = (map, m) => (map[m] ? map[m].n || 0 : 0);
    const firstMonth = months.findIndex((m) => v(mSign, m) || v(mVis, m) || v(mMent, m) || v(mRev, m));
    const shown = months.slice(firstMonth < 0 ? 9 : Math.min(firstMonth, 9));
    const rows = shown.map((m) => ({ m, vis: v(mVis, m), sign: v(mSign, m), trial: v(mTrial, m), pick: v(mPick, m), neu: v(mNew, m), ment: v(mMent, m), rev: v(mRev, m), cancel: v(mCancel, m) })).reverse();

    // ---- people to follow up ----
    const in7 = now() + 7 * 86400000;
    const lists = [
      { id: 'nocard', title: 'Signed up, no card yet', why: 'Their free trial never started, so they have not seen anything work.', list: all.filter((u) => stripe.needsCardTrial(u)), at: (u) => u.created_at, atLabel: 'Signed up' },
      { id: 'checkout', title: 'Picked a plan, did not finish', why: 'Opened the payment and left. Your warmest EA leads.',
        list: all.filter((u) => (u.picked_at && !u.trial_used && !u.plan) || (u.plan_request && !u.trial && !payingNow(u) && !stripe.needsCardTrial(u))), at: (u) => u.picked_at, atLabel: 'Picked' },
      { id: 'ending', title: 'Trial ends in the next 7 days', why: 'Message them before the trial ends.', list: all.filter((u) => u.trial && !expired(u) && ts(u.expires_at) < in7), at: (u) => u.expires_at, atLabel: 'Trial ends' },
      { id: 'noconnect', title: 'On trial, MT5 not connected', why: 'They cannot see the value until an EA runs on their account.', list: all.filter((u) => u.trial && !expired(u) && !u.connected), at: (u) => u.created_at, atLabel: 'Signed up' },
      { id: 'lost', title: 'Trial or plan ended, not paying', why: 'Win them back with an offer.', list: all.filter((u) => expired(u) && (u.trial_used || u.plan) && !u.student && !u.mentor_plan), at: (u) => u.expires_at, atLabel: 'Ended' },
      { id: 'cancelled', title: 'Cancelled, access still running', why: 'Their card subscription is off. Ask why before access ends.', list: all.filter((u) => payingNow(u) && u.stripe_customer && !u.stripe_sub && db.prepare("SELECT 1 FROM sales_log WHERE user_id = ? AND kind = 'cancel'").get(u.id)), at: (u) => u.expires_at, atLabel: 'Access ends' },
    ];
    const L = Object.fromEntries(lists.map((l) => [l.id, l.list.length]));

    // ---- mentorship ----
    const mCount = (event, plan) => db.prepare(`SELECT COUNT(DISTINCT m.user_id) AS n FROM mentor_events m JOIN users u ON u.id = m.user_id AND u.is_admin = 0 AND u.mentor_plan = '' WHERE m.event = ? ${plan ? 'AND m.plan = ?' : ''}`).get(...(plan ? [event, plan] : [event])).n;
    const ment = { prices: mCount('prices'), checkout: mCount('checkout'), wait: mCount('waitlist', 'selfstudy'), visitors: db.prepare("SELECT COUNT(DISTINCT vid) AS n FROM visits WHERE path = '/mentorship' AND day >= ?").get(from.slice(0, 10)).n };

    // ---- sources ----
    const srcRows = (() => {
      const m = {};
      for (const u of all.filter(inPeriod)) { const k = u.source || ''; (m[k] = m[k] || { s: k, sign: 0, paid: 0, vis: 0 }).sign++; if (everPaid(u)) m[k].paid++; }
      for (const r of db.prepare('SELECT src, COUNT(DISTINCT vid) AS n FROM visits WHERE day >= ? GROUP BY src').all(from.slice(0, 10))) (m[r.src] = m[r.src] || { s: r.src, sign: 0, paid: 0, vis: 0 }).vis = r.n;
      return Object.values(m).sort((a, b) => b.paid - a.paid || b.sign - a.sign || b.vis - a.vis);
    })();
    const pageRows = db.prepare('SELECT path, COUNT(DISTINCT vid) AS n FROM visits WHERE day >= ? GROUP BY path ORDER BY n DESC').all(from.slice(0, 10));

    // ---- what to fix (worked out from the numbers, most important first) ----
    const fixes = [];
    const add = (score, title, fix, link) => fixes.push({ score, title, fix, link });
    if (leak) {
      const a = steps[leak.i - 1][0], b = steps[leak.i][0];
      const tips = {
        'Signed up': 'Your pages get visitors but few sign up. Put one clear "Start free" button above the fold, show a real journal screenshot, and make Google sign-in one tap.',
        'Started trial': 'Most people stop at the card step. Show them what they get before asking for a card (the sample journal and share card), say "no charge until day ' + (trialDays() || 15) + '" next to the button, and email the "no card yet" list below.',
        'Connected MT5': 'People start the trial but never connect MT5. Send a short setup video, offer a 10 minute Telegram setup call, and check the dashboard steps are clear on phones.',
        'Logged a trade': 'MT5 is connected but no trades arrive. Remind them the Journal EA must run on its own chart with Algo Trading on, and that only closed trades show.',
        'Paid': 'People use the trial but do not pay. Message them before the trial ends with a result from their own journal, and offer the annual price or a small discount.',
      };
      add(100, `Biggest leak: ${pct(leak.lost, steps[leak.i - 1][1])}% are lost between "${a}" and "${b}" (${plural(leak.lost, 'person', 'people')})`, tips[b] || '', '#funnel');
    }
    if (L.checkout) add(90, `${plural(L.checkout, 'person', 'people')} picked a plan but did not finish paying`, 'These are your warmest leads. Message them today, ask what stopped them (card declined? price? not sure it works with their prop firm?).', '#l-checkout');
    if (ment.checkout) add(88, `${plural(ment.checkout, 'person', 'people')} started the mentorship payment and did not finish`, 'Message them personally. Offer a short call, or remind them about the 3-part payment.', '/admin/mentorship');
    if (L.ending) add(85, `${plural(L.ending, 'trial ends', 'trials end')} in the next 7 days`, 'Send each one a message with something from their own journal (win rate, best day) and the plan that fits them.', '#l-ending');
    if (L.nocard) add(80, `${plural(L.nocard, 'person', 'people')} signed up but never added a card`, 'Email them: what they get, that the trial is free, and a screenshot of a real journal. If this list keeps growing, test a short no-card trial (TRIAL_NEEDS_CARD=false).', '#l-nocard');
    if (L.noconnect) add(75, `${plural(L.noconnect, 'trial user has', 'trial users have')} not connected MT5`, 'They will not pay for something they never saw working. Send the setup steps or offer to help on Telegram.', '#l-noconnect');
    if (L.lost) add(60, `${plural(L.lost, 'person', 'people')} ended a trial or plan without paying`, 'Run a win-back offer: the annual price, a referral discount, or a free week if they connect MT5.', '#l-lost');
    if (L.cancelled) add(65, `${plural(L.cancelled, 'customer', 'customers')} cancelled and still have access`, 'Ask why. One reply tells you what to fix, and some will stay.', '#l-cancelled');
    if (ment.prices >= 3 && ment.checkout === 0 && students === 0) add(70, `${ment.prices} people saw the mentorship prices but nobody started paying`, 'Add a free intro call or a "talk to Gursewak" button next to the prices, and more student results right above them.', '/admin/mentorship');
    if (ment.wait) add(40, `${plural(ment.wait, 'person is', 'people are')} on the Self-Study waitlist`, 'Every one of them wants to learn from you. Record the first lessons and email them, or offer them the Live Room now.', '/admin/mentorship');
    const referred = all.filter((u) => u.referred_by).length;
    if (paying.length + students >= 3 && referred === 0) add(50, 'Nobody has signed up through a referral link yet', 'Ask paying members and students to share their link (their friend gets a discount, they get free days). Put the link on the share cards.', '/dashboard');
    if (!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)) add(45, 'Google sign-in is off', 'One-tap sign up gets more people through the first step. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Render.', null);
    if (backup) {
      const bk = backup.status();
      if (!bk.cloudOn) add(95, 'Nightly backup is not set up', 'There is only one copy of your members, licences and journals. Set up the automatic backup (a few keys on Render).', '/admin/security');
      else if (!bk.healthy) add(97, 'The nightly backup is late', bk.error ? `Last problem: ${bk.error}` : 'No backup in the last 30 hours. Open Security and press Back up now.', '/admin/security');
    }
    if (req.user && !req.user.totp_secret) add(92, 'Your admin sign-in code is off', 'A stolen password would open Admin. Turn on the 6-digit code from Google Authenticator (2 minutes).', '/admin/security');
    if (!stripe.on()) add(55, 'Card payments are off', 'People can only pay by contacting you. Add the Stripe key on Render so they can pay on the spot.', null);
    const lastSign = all[0] && ts(all[0].created_at);
    if (!lastSign || now() - lastSign > 14 * 86400000) add(78, 'No new sign-ups in the last 14 days', 'Traffic is the problem, not the site. Post the ad kit, go live on Instagram, and share a trade card with your link.', null);
    if (visitors >= 100 && pct(signups, visitors) < 3) add(72, `Only ${pct(signups, visitors)}% of visitors sign up`, 'Most visitors leave without trying. Make the first screen say what they get in one line, and add a free sample (share card or journal) people can try without an account.', '#funnel');
    const known = srcRows.filter((r) => r.s && r.sign).length;
    if (signups >= 5 && !known) add(35, 'You cannot see which posts bring sign-ups', 'Use tagged links everywhere: 5abifx.com/?utm_source=instagram in the bio, ?utm_source=youtube under videos, ?utm_source=discord in Discord. The table below then shows which one sells.', '#sources');
    fixes.sort((a, b) => b.score - a.score);

    // ---- view ----
    const tile = (label, value, sub = '') => `<div><span class="muted">${label}</span><strong>${value}</strong>${sub ? `<em class="sd-sub">${sub}</em>` : ''}</div>`;
    const delta = prevSignups == null ? '' : signups === prevSignups ? 'same as before' : `${signups > prevSignups ? '▲' : '▼'} ${Math.abs(signups - prevSignups)} vs previous ${days} days`;
    const who = (u) => `<a href="/admin/users/${u.id}"><strong>${esc(u.name || '-')}</strong></a><br><span class="muted">${esc(u.email)}</span>`;
    const top = steps[0][1] || 1;
    const funnel = steps.map(([name, n, hint], i) => {
      const prev = i ? steps[i - 1][1] : null;
      const isLeak = leak && leak.i === i;
      return `<div class="sd-step${isLeak ? ' leak' : ''}">
        <div class="sd-step-h"><b>${name}</b><span class="muted small">${hint}</span></div>
        <div class="sd-bar"><i style="width:${Math.max(2, pct(n, top))}%"></i><span>${n}</span></div>
        <div class="sd-step-r">${i ? `<strong>${pct(n, prev)}%</strong><span class="muted small">${prev - n > 0 ? `${prev - n} lost` : 'no loss'}</span>` : '<span class="muted small">start</span>'}</div>
      </div>`;
    }).join('');

    // bar chart: sign-ups vs new paying (EA first payment + mentorship sale) per month
    const chart = (() => {
      const data = rows.slice().reverse();
      const W = 1000, H = 170, P = 22, bw = (W - P) / data.length;
      const max = Math.max(1, ...data.map((r) => Math.max(r.sign, r.neu + r.ment)));
      const y = (n) => H - (n / max) * (H - 20);
      return `<svg class="sd-chart" viewBox="0 0 ${W} ${H + 22}" role="img" aria-label="Sign-ups and new paying customers per month">
        <line x1="${P}" x2="${W}" y1="${H}" y2="${H}" class="ax"/>
        ${data.map((r, i) => { const x = P + i * bw, w = Math.min(22, bw * 0.32), paid = r.neu + r.ment;
          return `<rect class="b1" x="${x + bw / 2 - w - 1}" y="${y(r.sign)}" width="${w}" height="${H - y(r.sign)}" rx="3"><title>${r.m}: ${r.sign} sign-ups</title></rect>
          <rect class="b2" x="${x + bw / 2 + 1}" y="${y(paid)}" width="${w}" height="${H - y(paid)}" rx="3"><title>${r.m}: ${paid} new paying</title></rect>
          ${r.sign ? `<text x="${x + bw / 2 - w / 2 - 1}" y="${y(r.sign) - 4}" class="v">${r.sign}</text>` : ''}${paid ? `<text x="${x + bw / 2 + w / 2 + 1}" y="${y(paid) - 4}" class="v o">${paid}</text>` : ''}
          <text x="${x + bw / 2}" y="${H + 16}" class="m">${new Date(r.m + '-01T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`; }).join('')}
      </svg>`;
    })();

    const listHtml = lists.map((l) => `<details class="sd-list" id="l-${l.id}"${l.list.length && ['checkout', 'ending'].includes(l.id) ? ' open' : ''}>
      <summary><b>${l.title}</b><span class="tag${l.list.length ? ' warn' : ''}">${l.list.length}</span></summary>
      <p class="muted small">${l.why}</p>
      ${l.list.length ? `<div class="sd-scroll"><table><thead><tr><th>Person</th><th>${l.atLabel}</th><th>Status</th></tr></thead><tbody>
        ${l.list.slice(0, 100).map((u) => `<tr><td>${who(u)}</td><td class="nowrap">${fmtDate(l.at(u))}</td><td>${u.trial ? '<span class="tag warn">trial</span> ' : ''}${u.plan ? `<span class="tag">${esc((getPlan(u.plan) || {}).name || u.plan)}</span> ` : ''}${u.connected ? '<span class="tag">MT5 on</span>' : '<span class="muted small">no MT5</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <label class="small">All emails (copy)<textarea readonly rows="2">${esc(l.list.map((u) => u.email).filter((e) => /@/.test(e)).join(', '))}</textarea></label>` : '<p class="muted small">Nobody right now.</p>'}
    </details>`).join('');

    page(req, res, 'Sales dashboard', `
  <h1>Admin</h1>
  <div class="tabs"><a class="on" href="/admin/sales">Dashboard</a><a href="/admin">Users</a><a href="/admin/eas">EAs</a><a href="/admin/mentorship">Mentorship</a><a href="/admin/security">Security</a></div>
  <div class="row between sd-head">
    <h2>Sales dashboard</h2>
    <form method="get" action="/admin/sales" class="seg" role="group" aria-label="Period">${Object.entries(PERIODS).map(([k, t]) => `<button name="p" value="${k}" aria-pressed="${k === p}">${t}</button>`).join('')}</form>
  </div>
  <div class="stats sd-kpis">
    ${tile('Visitors', visitors || '-', visitsSince ? `counted since ${esc(visitsSince)}` : 'counting starts now')}
    ${tile('Sign-ups', signups, delta)}
    ${tile('Trials running', trialsNow)}
    ${tile('Paying now', paying.length, mrr ? `≈ ${money(mrr)} / month` : '')}
    ${tile('Money in', money(rev.s), `${plural(rev.n, 'payment', 'payments')}${logSince ? '' : ' · tracked from now'}`)}
    ${tile('Mentorship students', students)}
  </div>

  ${fixes.length ? `<section class="card sd-fix">
    <h2>What to fix to sell more</h2>
    <p class="muted">Worked out from your numbers, most important first.</p>
    <ol>${fixes.slice(0, 7).map((f) => `<li><b>${esc(f.title)}</b><span>${esc(f.fix)}</span>${f.link ? `<a class="small" href="${f.link}">See ${f.link.startsWith('#') ? 'below' : 'page'} →</a>` : ''}</li>`).join('')}</ol>
  </section>` : ''}

  <section class="card" id="funnel">
    <h2>Where people drop off</h2>
    <p class="muted">${PERIODS[p]}: everyone who signed up${days ? ' in this period' : ''}, and how far they got. ${freeN ? `${plural(freeN, 'early member or student', 'early members and students')} with free access ${freeN === 1 ? 'is' : 'are'} left out.` : ''}${visitors && !visitorsFit ? ` Visitors are counted since ${esc(visitsSince)}, so pick a shorter period to see visitors in the funnel.` : ''}</p>
    <div class="sd-funnel">${funnel}</div>
  </section>

  <section class="card">
    <h2>Track record by month</h2>
    <div class="sd-legend"><span><i class="b1"></i>Sign-ups</span><span><i class="b2"></i>New paying (plans + mentorship)</span></div>
    ${chart}
    <div class="sd-scroll"><table class="sd-table"><thead><tr><th>Month</th><th>Visitors</th><th>Sign-ups</th><th>Trials started</th><th>Picked a plan</th><th>New paying</th><th>Mentorship sales</th><th>Cancels</th><th>Money in</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="nowrap"><b>${new Date(r.m + '-01T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b></td><td>${r.vis || '-'}</td><td>${r.sign}</td><td>${r.trial || '-'}</td><td>${r.pick || '-'}</td><td>${r.neu || '-'}</td><td>${r.ment || '-'}</td><td>${r.cancel || '-'}</td><td class="nowrap">${r.rev ? money(r.rev) : '-'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Sign-ups, plan picks and mentorship sales go back to the start. Visitors, trials, payments and cancels are counted from ${logSince || visitsSince ? esc((logSince || visitsSince).slice(0, 10)) : 'today'} on (earlier card payments are in your Stripe dashboard).</p>
  </section>

  <section class="card">
    <h2>People to follow up</h2>
    <p class="muted">Tap a list to see who. Copy the emails to send one message to all.</p>
    ${listHtml}
  </section>

  <section class="card">
    <h2>Mentorship interest</h2>
    <div class="stats">
      ${tile('Opened the page', ment.visitors || '-')}
      ${tile('Saw the prices', ment.prices)}
      ${tile('Started paying', ment.checkout)}
      ${tile('Self-Study waitlist', ment.wait)}
      ${tile('Students', students)}
    </div>
    <p><a href="/admin/mentorship">See names on the Mentorship page →</a></p>
  </section>

  <section class="card" id="sources">
    <h2>Where people come from</h2>
    <div class="sd-two">
      <div class="sd-scroll"><table><thead><tr><th>Source</th><th>Visitors</th><th>Sign-ups</th><th>Paid</th></tr></thead><tbody>
        ${srcRows.map((r) => `<tr><td>${esc(srcLabel(r.s))}</td><td>${r.vis || '-'}</td><td>${r.sign}</td><td>${r.paid || '-'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No data yet.</td></tr>'}
      </tbody></table></div>
      <div class="sd-scroll"><table><thead><tr><th>Page</th><th>Visitors</th></tr></thead><tbody>
        ${pageRows.map((r) => `<tr><td>${esc(TRACKED[r.path] || r.path)}</td><td>${r.n}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No visits counted yet.</td></tr>'}
      </tbody></table></div>
    </div>
    <p class="muted small">Tag your links so you can see which post sells: <code>5abifx.com/?utm_source=instagram</code>, <code>?utm_source=youtube</code>, <code>?utm_source=discord</code>, <code>/mentorship?utm_source=tiktok</code>. Links from Instagram, YouTube, Discord and Google are also picked up by themselves when the app passes them on.</p>
  </section>`);
  });
}

// remembers where a new account came from: a referral link first, otherwise the visitor's first source
function attachSource(req, userId) {
  try {
    const { db } = require('./db');
    const u = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId);
    const src = u && u.referred_by ? 'referral' : cleanSrc(req.session && req.session.src);
    if (src) db.prepare('UPDATE users SET source = ? WHERE id = ?').run(src, userId);
  } catch (e) { console.error('source:', e.message); }
}

module.exports = { trackVisits, routes, attachSource, sourceOf };
