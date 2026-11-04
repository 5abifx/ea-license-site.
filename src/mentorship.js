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

  // ---------- the page ----------
  function socials() {
    const links = [
      ['YouTube', process.env.MENTOR_YOUTUBE, 'Watch on YouTube'],
      ['Discord', process.env.MENTOR_DISCORD, '5ABI Community'],
      ['Instagram', process.env.MENTOR_INSTAGRAM || 'https://www.instagram.com/5abi.fx/', '@5abi.fx'],
      ['X', process.env.MENTOR_X, 'Follow on X'],
      ['WhatsApp', process.env.MENTOR_WHATSAPP, 'Ask a question'],
    ].filter(([, url]) => url && /^https?:\/\//.test(url));
    return `<div class="socials">${links.map(([n, url, sub]) => `<a class="soc" href="${esc(url)}" target="_blank" rel="noopener"><b>${n}</b><span>${esc(sub)}</span></a>`).join('')}</div>`;
  }

  function seats() {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(process.env.MENTOR_SEATS || '').trim());
    if (!m) return '';
    const taken = Math.min(Number(m[1]), Number(m[2])), total = Math.min(Number(m[2]), 40);
    return `<div class="seats"><span class="dots">${Array.from({ length: total }, (_, i) => `<i${i < taken ? '' : ' class="o"'}></i>`).join('')}</span><span class="mono">${taken} of ${total} seats taken this intake</span></div>`;
  }

  const signupLink = '/signup?next=mentorship';
  const lockLink = (text = 'Sign up free to see prices') => `<a class="lockp" href="${signupLink}">🔒 ${esc(text)}</a>`;

  function tier(p, u, waiting, pr) {
    const li = (items) => items.map(([cls, t]) => `<li${cls ? ` class="${cls}"` : ''}>${t}</li>`).join('');
    const list = {
      selfstudy: [['', 'Recorded lessons'], ['', 'Learn at your own pace'], ['', 'Private Discord'], ['', 'Trade Journal, 3 months'], ['no', 'Live classes'], ['no', '1-to-1 calls'], ['no', 'Trader Awareness Test report'], ['no', 'Trading software included'], ['no', `${EA_DISCOUNT}% off EAs`]],
      mentorship: [['', '8 weekly live classes at the midnight open'], ['', 'Group trade reviews + private Discord'], ['', '1 × 1-to-1 call'], ['', 'Trader Awareness Test report'], ['', 'KATANA + Journal, 3 months'], ['', 'Student indicator at graduation'], ['', `${EA_DISCOUNT}% off all 5ABI.FX EAs`], ['no', 'Trading software included']],
      full: [['', 'Everything in Mentorship'], ['hl', 'Trading software included: heatmap + one platform you pick'], ['hl', '4 × 1-to-1 calls (not 1)'], ['hl', 'KATANA + Journal for 6 months (not 3)'], ['hl', `${EA_DISCOUNT}% off all EAs while you're a member`], ['', 'Priority answers in Discord']],
    }[p.id];
    const head = {
      selfstudy: ['Recorded lessons, at your own pace', '<span class="mbadge soonb">Coming soon</span>'],
      mentorship: ['Live sessions plus your own plan', ''],
      full: ['Everything, software included', '<span class="mbadge">Most students pick this</span>'],
    }[p.id];
    const off = p.soon ? null : pr;
    const amount = u ? `<div class="amt">${off ? `<s>${money(p.price)}</s>` : ''}<b>${money(cut(p.price, off))}</b><span>one-time</span></div>${off ? `<div class="pplan promo-tag">Mystery discount: ${off.pct}% off</div>` : ''}${p.part ? `<div class="pplan">or ${PARTS} × ${money(cut(p.part, off))}</div>` : ''}`
      : `<div class="amt locked-amt">${lockLink()}</div>`;
    let action;
    if (!u) action = `<a class="btn${p.id === 'full' ? ' pri' : ''}" href="${signupLink}">Sign up to see the price</a>`;
    else if (p.soon) action = waiting ? '<p class="ok">✓ You\'re on the list. We\'ll email you when Self-Study opens.</p>'
      : `<form method="post" action="/mentorship/waitlist"><button class="btn" type="submit">Notify me when it opens</button></form>`;
    else if (u.mentor_plan === p.id) action = '<p class="ok">✓ You\'re in. Check your email and Discord for your first class.</p>';
    else action = `<form method="post" action="/mentorship/checkout" class="pay">
        <input type="hidden" name="plan" value="${p.id}">
        <button class="btn${p.id === 'full' ? ' pri' : ''}" name="pay" value="once">Pay ${money(cut(p.price, off))}</button>
        ${p.part ? `<button class="btn ghost" name="pay" value="parts">Pay in ${PARTS} parts</button>` : ''}
      </form>`;
    return `<div class="tier${p.id === 'full' ? ' top' : ''}${p.soon ? ' soon' : ''}">
      ${head[1]}
      <div class="nm">${esc(p.name)}</div><div class="for">${head[0]}</div>
      ${amount}
      <ul>${li(list)}</ul>
      ${p.id === 'mentorship' ? `<div class="nudge">Get the trading software (worth $3,500+) and 4 private calls for just <b>${u ? `${money(cut(getMentorPlan('full').price, pr) - cut(p.price, pr))} more` : 'a little more'}</b> →</div>` : ''}
      ${action}
    </div>`;
  }

  function pricing(u, waiting, pr) {
    return `<section class="band alt" id="price"><div class="in">
  <div class="sec-head"><div class="eyebrow">Pricing · USD · one-time · 8 weeks</div><h2>Pick how far you want to go.</h2>
  ${u ? '' : '<p class="lede">Prices are shown to members. Sign up free in one tap, no card needed.</p>'}</div>
  ${u ? '' : `<div class="gate"><a class="btn pri" href="${signupLink}">Sign up free to see prices</a><a class="btn" href="/login?next=mentorship">I have an account</a></div>`}
  <div class="ladder">${MENTOR_PLANS.map((p) => tier(p, u, waiting, pr)).join('')}</div>
  ${u ? '<p class="fine center">Card payment by Stripe. Paying in 3 parts charges the same card once a month for 3 months.</p>' : ''}
</div></section>`;
  }

  function promoBar(pr, u) {
    if (!pr) return '';
    return `<div class="promo-bar" data-ends="${pr.ends.toISOString()}"><span>Limited time</span><b>${claimed(u) ? `${pr.pct}% off the mentorship` : 'Mystery discount for new students'}</b>
      <span class="mono" data-countdown>ends ${esc(pr.ends.toISOString().slice(0, 10))}</span>${claimed(u) ? '<span class="ok">✓ Claimed</span>' : '<a href="/mentorship/claim" data-claim>Claim</a>'}</div>`;
  }
  function promoPopup(pr, u) {
    if (!pr || u) return ''; // first-time visitors only: signed-in people just see the bar
    // a small ticket that slides in at the side: it never blocks the page
    return `<aside class="mystery" id="mystery" hidden aria-labelledby="mystery-t">
      <div class="mystery-stub" aria-hidden="true"><b>?%</b><span>OFF</span></div>
      <div class="mystery-body">
        <button type="button" class="mystery-x" data-close aria-label="Close">×</button>
        <p class="mystery-k">Limited time</p>
        <h2 id="mystery-t">Mystery discount</h2>
        <p class="mystery-t mono" data-countdown>ends ${esc(pr.ends.toISOString().slice(0, 10))}</p>
        <a class="mystery-go" href="/mentorship/claim">Reveal my discount →</a>
        <p class="mystery-s">Free account, no card.</p>
      </div>
    </aside>`;
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
    const price = (id) => (u ? money(cut(MENTOR_PLANS.find((p) => p.id === id).price, pr)) : lockLink('Sign up to see'));
    page(req, res, 'Mentorship', `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&display=swap"><link rel="stylesheet" href="/mentorship.css"><div class="mp">${promoBar(promo(), u)}${body({ u, seats: seats(), socials: socials(), price, pricing: pricing(u, waiting, pr) })}${promoPopup(promo(), u)}</div><script src="/mentorship.js"></script>`, { wide: true });
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
      const s = await call('POST', '/v1/checkout/sessions', params);
      res.redirect(303, s.url);
    } catch (e) {
      console.error('Stripe mentorship checkout:', e.message);
      flash(req, 'error', 'Card payment could not start. Please try again in a minute or contact us.');
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

// the page sections (prices are filled in by pricing() and price())
function body({ seats, socials, price, pricing }) {
  return `
<section class="band mp-hero"><div class="in">
  <div>
    <div class="eyebrow">5ABI.FX Mentorship · 8 live classes</div>
    <h1>Stop predicting candles. Read what's behind them.</h1>
    <p class="lede">An 8-week live mentorship with Gursewak: the tools and the knowledge to use them in day trading. One 90-minute live class a week at the <b>midnight open</b>, where we all trade together, plus a live trading lab to finish. A method you won't find on YouTube. Included: one pro platform (your choice of NinjaTrader, ATAS or DeepCharts) and a heatmap.</p>
    <div class="ctas"><a class="btn pri" href="#price">See the plans</a><a class="btn" href="#reviews">Read student reviews</a></div>
    ${seats}
  </div>
  <div class="desk" aria-label="Illustration of a trading desk">
    <div class="bar"><span>Live class</span><span>Market open</span></div>
    <div class="dom">
      <span style="height:22%"></span><span style="height:35%"></span><span class="s" style="height:48%"></span><span style="height:62%"></span><span style="height:78%"></span><span class="p" style="height:100%"></span><span style="height:84%"></span><span class="s" style="height:66%"></span><span style="height:52%"></span><span class="s" style="height:40%"></span><span style="height:28%"></span><span style="height:18%"></span>
    </div>
    <div class="row"><span class="chip on">Buyers in control</span><span class="chip">POC</span><span class="chip">VAH</span><span class="chip">VAL</span><span class="chip on">KATANA risk set</span></div>
  </div>
</div></section>

<section class="band" style="padding-block:28px 56px"><div class="in">
  <div class="proof">
    <div><b class="mono">8</b><span>live classes, 90 minutes each</span></div>
    <div><b class="mono">00:00</b><span>live at the midnight open</span></div>
    <div><b class="mono">1:1</b><span>personal calls with your mentor</span></div>
    <div><b class="mono">30%</b><span>off every 5ABI.FX EA for students</span></div>
  </div>
</div></section>

<section class="band alt"><div class="in">
  <div class="sec-head"><div class="eyebrow">What you learn</div><h2>How price actually moves, and who is moving it.</h2><p class="lede">No setups to memorise and no recycled internet content. You learn to read the market while it's open, from someone who trades it.</p></div>
  <div class="topics"><span>Read who is in control</span><span>Know where price is fair</span><span>Plan before the open</span><span>Time your entry</span><span>Size risk from your own numbers</span><span>Fix the habits that cost you</span><span>Pass prop-firm rules</span></div>
  <div class="vs">
    <div><h3>Most trading courses</h3><ul><li>Cheap recorded content from people with no real experience</li>
<li>Hard to follow, with nobody to ask</li><li>Predict moves from old candles</li><li>Weekend classes on a closed market, recapping what already happened</li><li>Tools sold to you on top</li><li>Then you're on your own</li></ul></div>
    <div class="us"><h3>5ABI.FX mentorship</h3><ul><li>Taught live in the open market only, never on weekends</li>
<li>Taught live by a trader who trades it every day</li><li>Explained clearly and simply, ask as many times as you need</li>
<li>Read price and volume, no predictions</li><li>See the reaction in real time</li><li>Trading software included, and we teach you to use it</li><li>Your mentor stays involved in your growth</li></ul></div>
  </div>
</div></section>

<section class="band" id="inside"><div class="in">
  <div class="sec-head"><div class="eyebrow">What you get</div><h2>Everything serious traders pay for separately.</h2></div>
  <div class="stack">
    <div class="item"><div class="ico">01</div><div><h3>8 live classes</h3><p>One 90-minute live class a week with Gursewak. The method is taught in class only, never posted online.</p></div><div class="val">included</div></div>
    <div class="item"><div class="ico">02</div><div><h3>Personal 1-to-1 calls</h3><p>Ask anything as many times as you need. We go through your trades and the habits holding you back.</p></div><div class="val">included</div></div>
    <div class="item"><div class="ico">03</div><div><h3>Trading software included</h3><p>The software you need for day trading, set up for you, and taught step by step. You don't buy it yourself.</p></div><div class="val">included</div></div>
    <div class="item"><div class="ico">04</div><div><h3>KATANA risk manager + Trade Journal</h3><p>Exact lot size, a real stop on every trade, daily loss guard, and a journal that finds your leaks.</p></div><div class="val">included</div></div>
    <div class="item"><div class="ico">05</div><div><h3>Private student indicator</h3><p>Handed out at graduation in week 8, once you can read the levels by hand. Not sold anywhere else.</p></div><div class="val">students only</div></div>
    <div class="item"><div class="ico">06</div><div><h3>Trader Awareness Test + report</h3><p>Your personal report on strengths and resistances, with advice on what to change in your trading style.</p></div><div class="val">included</div></div>
    <div class="item"><div class="ico">07</div><div><h3>30% off every 5ABI.FX EA</h3><p>For as long as you're a mentorship member.</p></div><div class="val">ongoing</div></div>
    <div class="item"><div class="ico">08</div><div><h3>Private Discord</h3><p>Inner-circle channels, journals, achievements, and Q&amp;A with other students.</p></div><div class="val">included</div></div>
    <div class="total"><span>Everything above, in one place</span><span>Full mentorship <strong>${price('full')}</strong></span></div>
  </div>
</div></section>

<section class="band" id="test"><div class="in tt">
  <div>
    <div class="eyebrow">Trader Awareness Test</div>
    <h2 style="margin-top:8px">Know what holds you back before the market shows you.</h2>
    <p class="lede" style="margin-top:14px">On Mentorship and Full Mentorship, you take our Trader Awareness Test. You get a personal report on where you express yourself and where you resist, and I tell you exactly what to change in the way you trade.</p>
    <ul class="ttl"><li>Personal colour score report, private to you</li><li>Your strengths and resistances as a trader</li><li>Advice on what to change in your trading style</li><li>Reviewed with you on a 1-to-1 call</li></ul>
  </div>
  <div class="rep" aria-label="Sample Trader Awareness Test report">
    <div class="rh"><b>5ABI.FX · Trader Awareness Test</b><span>SAMPLE · CONFIDENTIAL</span></div>
    <div class="leg"><span>Resistance (−)</span><span>Expression (+)</span></div>
    <div class="tr"><span class="cn">Yellow</span><div class="neg"><i style="width:13%;background:#e9c84a"></i></div><div class="pos"><i style="width:63%;background:#e9c84a"></i></div><span class="nv">+63 / -13</span></div><div class="tr"><span class="cn">Blue</span><div class="neg"><i style="width:25%;background:#4a8fe9"></i></div><div class="pos"><i style="width:38%;background:#4a8fe9"></i></div><span class="nv">+38 / -25</span></div><div class="tr"><span class="cn">Orange</span><div class="neg"><i style="width:0%;background:#ff8a3d"></i></div><div class="pos"><i style="width:50%;background:#ff8a3d"></i></div><span class="nv">+50 / 0</span></div><div class="tr"><span class="cn">Turquoise</span><div class="neg"><i style="width:38%;background:#2fd3b0"></i></div><div class="pos"><i style="width:25%;background:#2fd3b0"></i></div><span class="nv">+25 / -38</span></div><div class="tr"><span class="cn">Green</span><div class="neg"><i style="width:50%;background:#4cc76a"></i></div><div class="pos"><i style="width:13%;background:#4cc76a"></i></div><span class="nv">+13 / -50</span></div><div class="tr"><span class="cn">Beige</span><div class="neg"><i style="width:13%;background:#cdb79a"></i></div><div class="pos"><i style="width:0%;background:#cdb79a"></i></div><span class="nv">0 / -13</span></div><div class="tr"><span class="cn">Purple</span><div class="neg"><i style="width:25%;background:#9a6be9"></i></div><div class="pos"><i style="width:13%;background:#9a6be9"></i></div><span class="nv">+13 / -25</span></div><div class="tr"><span class="cn">Red</span><div class="neg"><i style="width:13%;background:#e5484d"></i></div><div class="pos"><i style="width:38%;background:#e5484d"></i></div><span class="nv">+38 / -13</span></div>
    <div class="adv"><b>Advice</b><p>Strong drive to act, low patience. Trade fewer setups, wait for your level, and set your daily limit in KATANA before the open.</p></div>
  </div>
</div></section>
<section class="band alt" id="reviews"><div class="in">
  <div class="sec-head"><div class="eyebrow">Student reviews</div><h2>In their own words</h2><p class="lede">Posted by students in our Discord mentorship reviews.</p></div>
  <div class="reviews">
    <div class="rev"><q>I've been trading for 5 years and bought many courses: SMC, ICT and more. They all still felt like prediction. This mentorship completely changed the way I see the markets.</q><p style="margin:0;color:var(--muted);font-size:14px">"Free access to professional software, which makes learning much easier, and personal 1-on-1 meetings where you can ask questions."</p><div class="who"><span class="av">R</span><div><b>Ranjeet S.</b><span>5 years trading</span></div></div><span class="src">Discord · Aug 2026</span></div>
    <div class="rev"><q>Most people think trading education is just charts and reading past candles. Here the game is completely different. This mentorship teaches you about yourself: your trading style, the problems you face, and how to fix them.</q><p style="margin:0;color:var(--muted);font-size:14px">"Everyone needs a mentor who doesn't just help with learning, but also with personal development."</p><div class="who"><span class="av">K</span><div><b>Karam</b><span>4 months in</span></div></div><span class="src">Discord · Oct 2026</span></div>
    <div class="rev"><q>He doesn't just teach setups. He focuses on helping you understand why the market is moving and what is happening behind the candles.</q><p style="margin:0;color:var(--muted);font-size:14px">"His patience, clear explanations, and the way he breaks complicated concepts into simple steps."</p><div class="who"><span class="av">D</span><div><b>Daytona_FX</b><span>1 month in</span></div></div><span class="src">Discord · Oct 2026</span></div>
  </div>
</div></section>

<section class="band" id="tools"><div class="in">
  <div class="sec-head"><div class="eyebrow">The real cost of learning alone</div><h2>Learning to day trade by yourself costs thousands before your first trade.</h2><p class="lede">To day trade this way you need trading software and live market data. Here's what that costs if you buy it yourself, at official prices.</p></div>
  <div class="cost">
    <div class="bill">
      <div class="bh">If you start alone · software</div>
      <div class="bl"><div><b>Heatmap software</b><span>Global+ lifetime</span></div><em>$1,990</em></div>
      <div class="bl"><div><b>ATAS</b><span>Ultra lifetime</span></div><em>€1,999</em></div>
      <div class="bl"><div><b>NinjaTrader</b><span>Lifetime licence</span></div><em>$1,499</em></div>
      <div class="bl tot"><div><b>Software</b></div><em>~$5,800</em></div>
      <div class="bh" style="margin-top:14px">Then the data feed · every month</div>
      <div class="bl"><div><b>Level 1</b><span>Top of book</span></div><em>$39/mo</em></div>
      <div class="bl"><div><b>Level 2</b><span>Full market depth</span></div><em>$97/mo</em></div>
      <div class="bl tot"><div><b>Depth data</b></div><em>~$1,160/yr</em></div>
      <p class="fine">Official list prices (dxFeed, CME Group data). Prices can change.</p>
    </div>
    <div class="with">
      <div class="bh">With Full Mentorship</div>
      <div class="big">${price('full')}</div>
      <p>Software included: the heatmap plus one platform you pick (NinjaTrader, ATAS or DeepCharts), set up for you.</p>
      <p>And someone shows you how to use it, live, for 8 weeks.</p>
      <div class="save">You skip $3,500+ of software (heatmap + one platform) and months of guessing.</div>
      <p class="fine">Live market data is billed by the data provider.</p>
      <a class="btn pri" href="#price">See the plans</a>
    </div>
  </div>
  <div class="tools" style="margin-top:20px">
    <div class="tool ours"><span class="k">Built by 5ABI.FX</span><h3>KATANA + Trade Journal</h3><p>Our own tools: risk rules you can't break, and a journal that finds your mistakes.</p></div>
  </div>
</div></section>

<section class="band alt" id="curriculum"><div class="in">
  <div class="sec-head"><div class="eyebrow">The 8-week journey</div><h2>Eight live classes. The method stays inside the room.</h2><p class="lede">We don't publish the method. What you learn is taught live, by a trader who uses it every day, and shown only to students.</p></div>
  <div class="fmt">
    <div><span class="k">Before week 1</span><b>Foundations</b><p>The basics done quickly, so live time goes to charts.</p></div>
    <div><span class="k">Every week · midnight open</span><b>90-minute live class</b><p>We unite live at the midnight open (00:00 New York time) and learn on the real market. Weekdays only, weekends off.</p></div>
    <div><span class="k">Between classes</span><b>Practice + review</b><p>Drills on real charts and feedback on your trades.</p></div>
    <div><span class="k">Week 8</span><b>Graduation</b><p>Trade the full routine live and leave with your own plan.</p></div>
  </div>
  <ol class="weeks">
    <li><span class="n">1</span><div><b>How markets really move</b><p>See the market the way the big players do.</p></div></li>
    <li><span class="n">2</span><div><b>Finding value</b><p>Know where price is fair, and where it isn't.</p></div></li>
    <li><span class="n">3</span><div><b>The big picture</b><p>Build the map before you look for trades.</p></div></li>
    <li><span class="n">4</span><div><b>The game plan</b><p>Walk into every session with a written plan.</p></div></li>
    <li><span class="n">5</span><div><b>Reading the session</b><p>Know what kind of day it is, early.</p></div></li>
    <li><span class="n">6</span><div><b>Timing the entry</b><p>Enter only when the market confirms it.</p></div></li>
    <li><span class="n">7</span><div><b>Risk by the numbers</b><p>Size and protect your account, prop firms included.</p></div></li>
    <li><span class="n">8</span><div><b>Live trading lab</b><p>Put it all together live, then graduate.</p></div></li>
  </ol>
  <div class="locked"><span class="lk" aria-hidden="true">🔒</span><div><b>The full syllabus is shared with students only.</b><p>The exact rules, levels and setups are taught live in class and never posted online.</p></div></div>
</div></section>



<section class="band" id="mentor"><div class="in mentor">
  <div class="photo"><img src="/logo.png" alt="5ABI.FX" width="160"></div>
  <div>
    <div class="eyebrow">Your mentor</div>
    <h2 style="margin-top:8px">Gursewak · 5ABI.FX</h2>
    <p class="lede" style="margin-top:14px">I teach the way I trade: live at the midnight open, reading price and volume instead of guessing. I built KATANA and the Trade Journal because I needed them myself. I stay with every student until it clicks.</p>
    ${socials}
  </div>
</div></section>

${pricing}

<section class="band" id="faq"><div class="in" style="max-width:820px">
  <div class="sec-head"><div class="eyebrow">FAQ</div><h2>Questions before you join</h2></div>
  <details><summary>I've only traded candles, SMC or ICT. Is this for me?</summary><p>Yes. Most students come from candle-based strategies. Weeks 1 and 2 set up your platforms and cover the basics first.</p></details>
  <details><summary>When are the live classes?</summary><p>At the midnight open, 00:00 New York time. That's when we all meet and trade the market live together. Classes run only while the market is open. Weekends are off for everyone.</p></details>
  <details><summary>Isn't this all free on YouTube?</summary><p>The names of the tools are online. The way we put them together, the exact rules, and a trader checking your trades live are not. That part is only taught inside the mentorship.</p></details>
  <details><summary>Is it live or recorded?</summary><p>Live. You get 8 live 90-minute classes, one a week, with practice and trade reviews between classes. A short Foundations step covers the basics before week 1. The method itself is never recorded or posted online.</p></details>
  <details><summary>Do I need to buy any software?</summary><p>Not on Full Mentorship. You get a heatmap and one trading platform you pick (NinjaTrader, ATAS or DeepCharts). Live market data is billed by the data provider and is not included.</p></details>
  <details><summary>Do students get a discount on the EAs?</summary><p>Yes. Mentorship and Full Mentorship students get 30% off every 5ABI.FX EA plan.</p></details>
  <details><summary>Does this work with prop firms?</summary><p>Yes. KATANA keeps you inside daily loss and drawdown rules, and the Journal tracks each account.</p></details>
  <details><summary>Can I pay in parts?</summary><p>Yes. Mentorship and Full Mentorship can be paid in 3 monthly parts by card.</p></details>
  <details><summary>What happens after 8 weeks?</summary><p>You can stay in Discord and keep your tools and EA discount on the Alumni plan.</p></details>
</div></section>

`;
}
