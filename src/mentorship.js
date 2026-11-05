// Mentorship sales page (/mentorship), mentorship checkout and the Admin "Mentorship" leads page.
//
//  - The page is public, but prices only show to signed-in users. "Sign up free to see prices" sends
//    people to /signup (no card needed for this) and brings them back to the price cards.
//  - Every step is saved in mentor_events so the owner can follow up: saw the prices, joined the
//    Self-Study waitlist, started a checkout, paid.
//  - Paying (Stripe, one payment or 3 monthly parts) sets users.mentor_plan. That unlocks KATANA + Journal
//    for 3 or 6 months and 30% off every EA plan. The student indicator is NOT unlocked on payment:
//    the owner clicks "Graduate" in Admin at week 8, which ticks Student.
//
//  - Mystery discount: the owner sets a % and an end date in Admin > Mentorship. While it runs, the page shows a
//    "limited time" bar with a real countdown and a pop-up. Claiming it needs an account (a lead), and the
//    discount is taken off the mentorship price at checkout until the end date.
//
// Plans and prices are edited in MENTOR_PLANS below. Optional env: MENTOR_SEATS ("3/10" shows a seats
// counter), MENTOR_YOUTUBE, MENTOR_DISCORD, MENTOR_INSTAGRAM, MENTOR_X, MENTOR_WHATSAPP (links on the page).
const { esc, fmtDate } = require('./views');
const { cinePage } = require('./cine');

const MENTOR_PLANS = [
  { id: 'selfstudy', name: 'Self-Study', price: 997, soon: true },
  { id: 'mentorship', name: 'Mentorship', price: 2797, part: 975, eaMonths: 3 },
  { id: 'full', name: 'Full Mentorship', price: 3200, part: 1099, eaMonths: 6 },
];
const PARTS = 3;                 // "or 3 × $975": a monthly Stripe subscription that stops after 3 payments
const EA_DISCOUNT = 30;          // % off every EA plan for paying mentorship students
const getMentorPlan = (id) => MENTOR_PLANS.find((p) => p.id === id && !p.soon) || null;
const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
const eaDiscountFor = (u) => (u && getMentorPlan(u.mentor_plan) ? EA_DISCOUNT : 0);

// link preview when the mentorship page is shared (Discord, iMessage, WhatsApp)
const OG = {
  title: '5ABI.FX Mentorship · Learn to day trade live',
  desc: 'An 8-week live day trading mentorship with Gursewak. Live classes at the midnight open, a pro platform and a heatmap included.',
  image: 'og-mentorship.png',
};

module.exports = function mentorship(app, { db, page, flash, requireUser, requireAdmin, grantAllActiveEas, PAYMENT_URL }) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('mentor_plan')) db.exec("ALTER TABLE users ADD COLUMN mentor_plan TEXT NOT NULL DEFAULT ''");   // mentorship | full (paid)
  if (!cols.includes('mentor_paid_at')) db.exec('ALTER TABLE users ADD COLUMN mentor_paid_at TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS mentor_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event      TEXT NOT NULL,                 -- prices | waitlist | checkout | paid
    plan       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, event, plan)
  )`);
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const getSetting = (k) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value || '';
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  // the running mystery discount, or null: { pct, ends: Date }
  function promo() {
    const pct = Math.round(Number(getSetting('mentor_promo_pct')));
    const ends = new Date(getSetting('mentor_promo_ends') || 0);
    return pct > 0 && pct < 100 && ends > new Date() ? { pct, ends } : null;
  }
  const claimed = (u) => Boolean(u && db.prepare("SELECT 1 FROM mentor_events WHERE user_id = ? AND event = 'claim'").get(u.id));
  const promoFor = (u) => { const pr = promo(); return pr && claimed(u) ? pr : null; };
  const cut = (n, pr) => (pr ? Math.round(n * (100 - pr.pct) / 100) : n);
  const track = (userId, event, plan = '') => db.prepare('INSERT OR IGNORE INTO mentor_events (user_id, event, plan) VALUES (?, ?, ?)').run(userId, event, plan);
  const stripeOn = () => Boolean(process.env.STRIPE_SECRET_KEY);
  const siteUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  // ---------- the page (cinematic layout: src/cine-pages/mentorship.html + public/cine/mentorship.*) ----------
  function socials() {
    const links = [
      ['YouTube', process.env.MENTOR_YOUTUBE],
      ['Discord', process.env.MENTOR_DISCORD],
      ['Instagram', process.env.MENTOR_INSTAGRAM || 'https://www.instagram.com/5abi.fx/'],
      ['X', process.env.MENTOR_X],
      ['WhatsApp', process.env.MENTOR_WHATSAPP],
    ].filter(([, url]) => url && /^https?:\/\//.test(url));
    return links.length ? `<div class="socs">${links.map(([n, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${n}</a>`).join('')}</div>` : '';
  }

  // third gauge on the "One market. One open." slide: seats left (MENTOR_SEATS = "taken/total"), or "small batches"
  function seatsGauge() {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(process.env.MENTOR_SEATS || '').trim());
    const ring = (to) => `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1" stroke-dasharray="1 5"/><circle class="arc" cx="100" cy="100" r="92" fill="none" stroke="var(--glow)" stroke-width="1.4" stroke-dasharray="578" stroke-dashoffset="578" transform="rotate(-90 100 100)" data-to="${to}"/></svg>`;
    if (!m || !Number(m[2])) return `<div class="gauge">${ring(1)}<b>Small</b><p>batches only</p></div>`;
    const total = Number(m[2]), left = Math.max(0, total - Math.min(Number(m[1]), total));
    return `<div class="gauge">${ring((left / total).toFixed(2))}<b data-count="${left}">${left}</b><p>${left === 1 ? 'seat' : 'seats'} left</p></div>`;
  }

  const signupLink = '/signup?next=mentorship';
  const LISTS = {
    selfstudy: [['', 'Recorded lessons from real sessions'], ['', 'Learn at your own pace'], ['', 'Private Discord'], ['', 'Trade Journal, 3 months'], ['no', 'Live classes'], ['no', 'Private calls'], ['no', 'Trader Awareness Test'], ['no', 'Trading software']],
    mentorship: [['', '8 weeks of live classes at the midnight open'], ['', 'Group trade reviews + private Discord'], ['', '1 private call'], ['', 'Trader Awareness Test report'], ['', 'KATANA + Journal, 3 months'], ['', 'Student indicator at graduation'], ['', `${EA_DISCOUNT}% off all 5ABI.FX EAs`], ['no', 'Trading software']],
    full: [['', 'Everything in Mentorship'], ['hl', 'Trading software: heatmap + one platform you pick'], ['hl', '4 private calls, not 1'], ['hl', 'KATANA + Journal for 6 months, not 3'], ['hl', `${EA_DISCOUNT}% off all EAs while you are a member`], ['', 'Priority answers in Discord']],
  };
  const HEAD = {
    selfstudy: ['Recorded lessons, at your own pace', '<span class="badge soon">Coming soon</span>'],
    mentorship: ['Live classes plus your own plan', ''],
    full: ['Everything, software included', '<span class="badge">Most students pick this</span>'],
  };

  function tier(p, u, waiting, pr) {
    const off = p.soon ? null : pr;
    const pri = p.id === 'full' ? ' pri' : '';
    const amount = u
      ? `<span class="mem">${off ? `<s>${money(p.price)}</s>` : ''}<b>${money(cut(p.price, off))}</b><i>one-time</i>${p.part ? `<em>or ${PARTS} × ${money(cut(p.part, off))}</em>` : ''}</span>${off ? `<span class="promo-tag">Mystery discount · ${off.pct}% off</span>` : ''}`
      : `<a class="vis lock" href="${signupLink}">🔒 Sign up free to see the price</a>`;
    let action;
    if (!u) action = `<a class="pb${pri}" href="${signupLink}">Sign up to see the price</a>`;
    else if (p.soon) action = waiting ? '<p class="ok">✓ You\'re on the list. We\'ll email you when Self-Study opens.</p>'
      : '<form method="post" action="/mentorship/waitlist"><button class="pb" type="submit">Notify me when it opens</button></form>';
    else if (u.mentor_plan === p.id) action = '<p class="ok">✓ You\'re in. Check your email and Discord for your first class.</p>';
    else action = `<form method="post" action="/mentorship/checkout"><input type="hidden" name="plan" value="${p.id}">
        <button class="pb${pri}" name="pay" value="once">Pay ${money(cut(p.price, off))}</button>
        ${p.part ? `<button class="pb ghost" name="pay" value="parts">Pay in ${PARTS} parts</button>` : ''}</form>`;
    const nudge = p.id === 'mentorship'
      ? `<p class="nudge">Get the trading software (worth $3,500+) and 4 private calls for just <b>${u ? `${money(cut(getMentorPlan('full').price, pr) - cut(p.price, pr))} more` : 'a little more'}</b> →</p>` : '';
    return `<article class="tier${p.id === 'full' ? ' top' : ''}${p.soon ? ' soon' : ''}">${HEAD[p.id][1]}<h3>${esc(p.name)}</h3><p class="for">${HEAD[p.id][0]}</p>
<div class="amt">${amount}</div>
<ul>${LISTS[p.id].map(([c, t]) => `<li${c ? ` class="${c}"` : ''}>${t}</li>`).join('')}</ul>${nudge}<div class="act">${action}</div></article>`;
  }

  function pricing(u, waiting, pr) {
    const live = promo();
    const note = live && !u
      ? `<aside class="mys" id="mys" hidden><button type="button" aria-label="Close" data-x>×</button><b>A mystery discount is waiting</b><p>For new students, for a short time. Ends in <span class="mono" data-ends="${live.ends.toISOString()}">soon</span></p><a href="/mentorship/claim">Reveal →</a></aside>` : '';
    const claimLine = live && u && !pr
      ? `<p class="pfine">A mystery discount is running for new students. Ends in <span class="mono" data-ends="${live.ends.toISOString()}">soon</span>. <a href="/mentorship/claim">Claim it →</a></p>` : '';
    return `<section class="band g" id="price" data-view="${u ? 'member' : 'visitor'}">
  <div class="in">
    <div class="phead"><div><p class="k rv">Plans · USD · one-time · 8 weeks</p><h2 class="rv">Pick how far<br><span class="m">you want to go.</span></h2></div></div>
    ${u ? claimLine : `<div class="gate rv"><p>Prices are shown to members. Sign up free in one tap, no card needed.</p><a class="pb pri" href="${signupLink}">Sign up free to see prices</a><a class="pb ghost" href="/login?next=mentorship">I have an account</a></div>`}
    <div class="tiers rv">${MENTOR_PLANS.map((p) => tier(p, u, waiting, pr)).join('')}</div>
    ${u ? '<p class="pfine">Card payment by Stripe. Paying in 3 parts charges the same card once a month for 3 months.</p>' : ''}
  </div>
  ${note}
</section>`;
  }

  // Claim the mystery discount. Signed out: make a free account first, then it is claimed on the way back.
  app.get('/mentorship/claim', (req, res) => {
    if (!promo()) return res.redirect('/mentorship#price');
    if (!req.user) { req.session.claim = 1; return res.redirect('/signup?next=mentorship'); }
    if (!claimed(req.user)) { track(req.user.id, 'claim'); flash(req, 'ok', `Mystery discount unlocked: ${promo().pct}% off the mentorship until ${promo().ends.toISOString().slice(0, 10)}.`); }
    res.redirect('/mentorship#price');
  });

  app.get('/mentorship', (req, res) => {
    const u = req.user;
    if (u && req.session.claim) {
      req.session.claim = null;
      if (promo() && !claimed(u)) { track(u.id, 'claim'); flash(req, 'ok', `Mystery discount unlocked: ${promo().pct}% off the mentorship until ${promo().ends.toISOString().slice(0, 10)}.`); }
    }
    if (u && !u.is_admin) track(u.id, 'prices');
    const pr = promoFor(u);
    const waiting = u && db.prepare("SELECT 1 FROM mentor_events WHERE user_id = ? AND event = 'waitlist' AND plan = 'selfstudy'").get(u.id);
    const navr = u
      ? '<a class="go hide-s" href="/dashboard">My EAs</a><a class="go" href="#price">See the plans</a>'
      : '<a class="go hide-s" href="/">Home</a><a class="go hide-s" href="/login?next=mentorship">Sign in</a><a class="go" href="#price">See the plans</a>';
    res.send(cinePage(req, 'mentorship', { NAVR: navr, SEATS: seatsGauge(), PRICE: pricing(u, waiting, pr), SOCIALS: socials() },
      { title: `Mentorship · ${OG.title.split(' · ')[0]}`, og: OG }));
  });

  // ---------- waitlist and checkout ----------
  app.post('/mentorship/waitlist', requireUser, (req, res) => {
    track(req.user.id, 'waitlist', 'selfstudy');
    flash(req, 'ok', "You're on the Self-Study list. We'll email you when it opens.");
    res.redirect('/mentorship#price');
  });

  async function call(method, path, params) {
    const form = new URLSearchParams();
    const add = (obj, prefix) => { for (const [k, v] of Object.entries(obj)) { if (v === undefined || v === null) continue; const key = prefix ? `${prefix}[${k}]` : k; if (typeof v === 'object') add(v, key); else form.append(key, String(v)); } };
    if (params) add(params, '');
    const r = await fetch((process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '') + path, {
      method, headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: params ? form.toString() : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || `Stripe error ${r.status}`);
    return data;
  }

  app.post('/mentorship/checkout', requireUser, async (req, res) => {
    const p = getMentorPlan(req.body.plan);
    if (!p) return res.redirect('/mentorship#price');
    const parts = req.body.pay === 'parts' && p.part;
    const u = req.user;
    const pr = promoFor(u);
    track(u.id, 'checkout', p.id);
    if (!stripeOn()) {
      if (PAYMENT_URL) return res.redirect(303, PAYMENT_URL);
      flash(req, 'ok', `Thanks! We got your request for ${p.name}. We will contact you to finish payment.`);
      return res.redirect('/mentorship#price');
    }
    const meta = { kind: 'mentorship', user_id: u.id, mplan: p.id, parts: parts ? PARTS : 1 };
    const params = {
      mode: parts ? 'subscription' : 'payment',
      client_reference_id: String(u.id),
      success_url: `${siteUrl(req)}/mentorship?paid=1#price`,
      cancel_url: `${siteUrl(req)}/mentorship#price`,
      line_items: { 0: { quantity: 1, price_data: {
        currency: 'usd',
        unit_amount: cut(parts ? p.part : p.price, pr) * 100,
        ...(parts ? { recurring: { interval: 'month' } } : {}),
        product_data: { name: `5ABI.FX ${p.name}${parts ? ` (${PARTS} monthly payments)` : ''}${pr ? ` · ${pr.pct}% mystery discount` : ''}` },
      } } },
      metadata: meta,
      ...(pr ? {} : { allow_promotion_codes: 'true' }),
    };
    if (parts) params.subscription_data = { metadata: meta };
    else params.payment_intent_data = { metadata: meta };
    if (u.stripe_customer) params.customer = u.stripe_customer;
    else { params.customer_email = u.email; if (!parts) params.customer_creation = 'always'; }
    try {
      let s;
      try {
        s = await call('POST', '/v1/checkout/sessions', params);
      } catch (e) {
        // a saved customer from test mode (or a deleted one) is unknown to the live key: start fresh with the email
        if (!params.customer || !/no such customer/i.test(e.message)) throw e;
        db.prepare('UPDATE users SET stripe_customer = NULL WHERE id = ?').run(u.id);
        delete params.customer;
        params.customer_email = u.email;
        if (!parts) params.customer_creation = 'always';
        s = await call('POST', '/v1/checkout/sessions', params);
      }
      res.redirect(303, s.url);
    } catch (e) {
      console.error('Stripe mentorship checkout:', e.message);
      // Stripe's own reason (never contains the secret key) helps the owner fix setup problems
      flash(req, 'error', `Card payment could not start: ${String(e.message || 'unknown error').slice(0, 200)} Please try again in a minute or contact us.`);
      res.redirect('/mentorship#price');
    }
  });

  // A mentorship payment went through (first payment, or the first of the 3 parts):
  // unlock KATANA + Journal for the plan's months and give the EA discount. Later parts change nothing.
  function applyMentorPaid(userId, planId) {
    const p = getMentorPlan(planId);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
    if (!p || !u) return false;
    const first = !db.prepare("SELECT 1 FROM mentor_events WHERE user_id = ? AND event = 'paid' AND plan = ?").get(u.id, p.id);
    if (!first) return true;
    const upgrade = !u.mentor_plan || (u.mentor_plan === 'mentorship' && p.id === 'full');
    db.transaction(() => {
      track(u.id, 'paid', p.id);
      if (upgrade) db.prepare("UPDATE users SET mentor_plan = ?, mentor_paid_at = datetime('now') WHERE id = ?").run(p.id, u.id);
      db.prepare(`UPDATE users SET status = 'active', trial = 0, trial_used = 1, max_accounts = MAX(max_accounts, 3),
                  expires_at = CASE WHEN expires_at IS NULL THEN NULL ELSE MAX(expires_at, datetime('now', ?)) END WHERE id = ?`)
        .run(`+${p.eaMonths} months`, u.id);
      grantAllActiveEas(u.id);
    })();
    return true;
  }

  // Called from the Stripe webhook. Returns true when the event belonged to the mentorship.
  async function onStripeEvent(type, obj) {
    const md = obj.metadata || {};
    if (type === 'checkout.session.completed' && md.kind === 'mentorship') {
      if (obj.customer) db.prepare('UPDATE users SET stripe_customer = COALESCE(stripe_customer, ?) WHERE id = ?').run(String(obj.customer), Number(md.user_id));
      if (obj.mode === 'payment' && obj.payment_status === 'paid') applyMentorPaid(md.user_id, md.mplan);
      if (obj.mode === 'subscription' && obj.subscription) {
        // stop after the 3rd monthly payment: cancel 2 months + 15 days from now, with no proration
        const end = new Date(); end.setUTCMonth(end.getUTCMonth() + PARTS - 1); end.setUTCDate(end.getUTCDate() + 15);
        await call('POST', `/v1/subscriptions/${encodeURIComponent(String(obj.subscription))}`, { cancel_at: Math.floor(end / 1000), proration_behavior: 'none' });
      }
      return true;
    }
    if (type === 'invoice.paid') {
      const smd = (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.metadata) || obj.subscription_details?.metadata || null;
      let m = smd;
      if (!m || !m.kind) {
        const subId = obj.subscription || (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription);
        if (!subId) return false;
        const sub = typeof subId === 'object' ? subId : await call('GET', `/v1/subscriptions/${encodeURIComponent(subId)}`);
        m = sub.metadata || {};
      }
      if (m.kind !== 'mentorship') return false;
      if (Number(obj.amount_paid) > 0) applyMentorPaid(m.user_id, m.mplan);
      return true;
    }
    if (type === 'customer.subscription.deleted' && md.kind === 'mentorship') return true;
    return false;
  }

  // ---------- Admin: Mentorship leads ----------
  app.get('/admin/mentorship', requireAdmin, (req, res) => {
    const rows = (event, plan) => db.prepare(`SELECT u.id, u.name, u.email, u.mentor_plan, u.student, MIN(m.created_at) AS at, GROUP_CONCAT(DISTINCT m.plan) AS plans
      FROM mentor_events m JOIN users u ON u.id = m.user_id
      WHERE m.event = ? ${plan ? 'AND m.plan = ?' : ''} GROUP BY u.id ORDER BY at DESC`).all(...(plan ? [event, plan] : [event]));
    const students = db.prepare("SELECT id, name, email, mentor_plan, mentor_paid_at, student FROM users WHERE mentor_plan != '' ORDER BY mentor_paid_at DESC").all();
    const paidIds = new Set(students.map((s) => s.id));
    const unpaid = rows('checkout').filter((r) => !paidIds.has(r.id));
    const waitlist = rows('waitlist', 'selfstudy');
    const viewed = rows('prices').filter((r) => !paidIds.has(r.id));
    const claims = db.prepare("SELECT COUNT(*) AS n FROM mentor_events WHERE event = 'claim'").get().n;
    const planName = (id) => (MENTOR_PLANS.find((p) => p.id === id) || {}).name || id;
    const who = (r) => `<a href="/admin/users/${r.id}"><strong>${esc(r.name || '-')}</strong></a><br><span class="muted">${esc(r.email)}</span>`;
    const table = (head, list, cells, empty) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${list.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="muted">${empty}</td></tr>`}</tbody></table>`;
    const emails = (list) => list.map((r) => r.email).join(', ');
    page(req, res, 'Mentorship', `
  <h1>Admin</h1>
  <div class="tabs"><a href="/admin">Users</a><a href="/admin/eas">EAs</a><a class="on" href="/admin/mentorship">Mentorship</a></div>
  <div class="stats">
    <div><span class="muted">Students</span><strong>${students.length}</strong></div>
    <div><span class="muted">Started paying, not finished</span><strong>${unpaid.length}</strong></div>
    <div><span class="muted">Self-Study waitlist</span><strong>${waitlist.length}</strong></div>
    <div><span class="muted">Saw the prices</span><strong>${viewed.length}</strong></div>
  </div>
  <section class="card">
    <h2>Mystery discount</h2>
    ${promo() ? `<p><span class="tag">running</span> ${promo().pct}% off until ${esc(promo().ends.toISOString().slice(0, 16).replace('T', ' '))} UTC · claimed by ${claims} ${claims === 1 ? 'person' : 'people'}.</p>` : '<p class="muted">Off. When it runs, /mentorship shows a "limited time" bar and a pop-up. People claim it by signing up, and get the % off at checkout until the end date.</p>'}
    <form method="post" action="/admin/mentorship/promo" class="row">
      <label class="row-inline">% off <input type="number" name="pct" min="0" max="90" value="${esc(getSetting('mentor_promo_pct') || '10')}" style="width:5em"></label>
      <label class="row-inline">Ends (UTC) <input type="datetime-local" name="ends" value="${esc((getSetting('mentor_promo_ends') || '').slice(0, 16))}"></label>
      <button class="small">Save</button>
      ${promo() ? '<button class="small secondary" name="stop" value="1">Stop now</button>' : ''}
    </form>
    <p class="muted small">Use a real end date. Changing the date later only affects new visitors' countdown, not discounts already claimed at checkout.</p>
  </section>
  <section class="card">
    <h2>Students</h2>
    <p class="muted">Paid on the site, or added below. They get KATANA + Journal and ${EA_DISCOUNT}% off EA plans. Click Graduate at week 8 to unlock the student indicator.</p>
    ${table(['Student', 'Plan', 'Since', 'Indicator'], students, (r) => [who(r), esc(planName(r.mentor_plan)), fmtDate(r.mentor_paid_at), r.student ? '<span class="tag">unlocked</span>'
      : `<form method="post" action="/admin/mentorship/${r.id}/graduate" class="inline"><button class="small">Graduate</button></form>`], 'No students yet.')}
    <form method="post" action="/admin/mentorship/add" class="row" style="margin-top:12px">
      <input type="email" name="email" required placeholder="Email of a student who paid you directly" aria-label="Student email">
      <select name="plan" aria-label="Plan">${MENTOR_PLANS.filter((p) => !p.soon).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <button class="small secondary">Add student</button>
    </form>
  </section>
  <section class="card">
    <h2>Started paying, not finished</h2>
    <p class="muted">Your hottest leads: they opened the card payment but did not pay. Message them.</p>
    ${table(['Person', 'Plan', 'When'], unpaid, (r) => [who(r), esc((r.plans || '').split(',').map(planName).join(', ')), fmtDate(r.at)], 'Nobody yet.')}
  </section>
  <section class="card">
    <h2>Self-Study waitlist</h2>
    <p class="muted">Email these people when the recorded lessons are ready.</p>
    ${table(['Person', 'Joined'], waitlist, (r) => [who(r), fmtDate(r.at)], 'Nobody yet.')}
    ${waitlist.length ? `<label>All emails (copy)<textarea readonly rows="2">${esc(emails(waitlist))}</textarea></label>` : ''}
  </section>
  <section class="card">
    <h2>Saw the prices</h2>
    <p class="muted">Signed up or signed in and opened the mentorship prices, and have not paid yet.</p>
    ${table(['Person', 'First visit'], viewed, (r) => [who(r), fmtDate(r.at)], 'Nobody yet.')}
  </section>`);
  });

  app.post('/admin/mentorship/promo', requireAdmin, (req, res) => {
    if (req.body.stop) { setSetting('mentor_promo_ends', ''); flash(req, 'ok', 'Mystery discount stopped.'); return res.redirect('/admin/mentorship'); }
    const pct = Math.round(Number(req.body.pct));
    const ends = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(req.body.ends || '')) ? new Date(`${req.body.ends}:00Z`) : null;
    if (!(pct > 0 && pct <= 90) || !ends || ends <= new Date()) { flash(req, 'error', 'Enter a % between 1 and 90 and an end date in the future.'); return res.redirect('/admin/mentorship'); }
    setSetting('mentor_promo_pct', pct); setSetting('mentor_promo_ends', ends.toISOString());
    flash(req, 'ok', `Mystery discount on: ${pct}% off until ${ends.toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
    res.redirect('/admin/mentorship');
  });

  app.post('/admin/mentorship/:id/graduate', requireAdmin, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
    if (u) { db.prepare('UPDATE users SET student = 1 WHERE id = ?').run(u.id); flash(req, 'ok', `${u.email} graduated. The student indicator is unlocked within the hour.`); }
    res.redirect('/admin/mentorship');
  });

  app.post('/admin/mentorship/add', requireAdmin, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(req.body.email || '').trim());
    const p = getMentorPlan(req.body.plan);
    if (!u || !p) { flash(req, 'error', 'No account with that email. Ask the student to sign up first.'); return res.redirect('/admin/mentorship'); }
    applyMentorPaid(u.id, p.id);
    flash(req, 'ok', `${u.email} added as a ${p.name} student.`);
    res.redirect('/admin/mentorship');
  });

  return { onStripeEvent, eaDiscountFor, EA_DISCOUNT };
};

module.exports.MENTOR_PLANS = MENTOR_PLANS;
module.exports.eaDiscountFor = eaDiscountFor;
