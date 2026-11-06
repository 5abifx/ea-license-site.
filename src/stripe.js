// Card payments with Stripe Checkout (subscriptions). On when STRIPE_SECRET_KEY is set.
//
//  - POST /subscribe starts a Checkout session for the picked plan (monthly or annual). Prices come
//    from src/plans.js, so nothing has to be created in the Stripe dashboard first.
//  - Stripe calls POST /api/stripe/webhook (set STRIPE_WEBHOOK_SECRET). Every paid invoice (first
//    payment and each renewal) applies the plan and extends the licence to the end of the paid period,
//    exactly like the admin "Mark as paid" button. A cancelled subscription simply runs out.
//  - POST /billing opens the Stripe customer portal (change card, cancel, invoices).
const crypto = require('crypto');
const express = require('express');
const { getPlan, cleanBilling, dueNow, BILLING } = require('./plans');
const { trialDays } = require('./views');
const { logSale } = require('./db');

const API = () => (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
const on = () => Boolean(process.env.STRIPE_SECRET_KEY);
// New sign ups must add a card to start the free trial (Stripe trial, first charge after TRIAL_DAYS).
// On whenever Stripe and the trial are on; TRIAL_NEEDS_CARD=false keeps the old no-card trial.
const cardTrial = () => on() && trialDays() > 0 && process.env.TRIAL_NEEDS_CARD !== 'false';
// this user can still get the card trial: never had a trial or a plan
// (and has no access yet: early members with no expiry date or users the admin gave time to are left alone)
const needsCardTrial = (u) => Boolean(u && cardTrial() && !u.is_admin && !u.student && !u.trial_used && !u.trial && !u.plan && !u.stripe_sub
  && u.expires_at && Date.parse(u.expires_at.replace(' ', 'T') + 'Z') <= Date.now());
const GRACE_SECONDS = 2 * 86400;   // keeps working this long after the paid period, while a renewal is retried

// Stripe wants form encoding with bracket keys: { a: { b: 1 } } -> a[b]=1
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(method, path, body) {
  const r = await fetch(API() + path, {
    method,
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: body ? form(body).toString() : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data.error && data.error.message) || `Stripe error ${r.status}`);
  return data;
}

// Stripe-Signature: t=TIMESTAMP,v1=HMAC_SHA256(secret, `${t}.${rawBody}`)
function verify(raw, header, secret, toleranceSec = 300) {
  const parts = {};
  for (const p of String(header || '').split(',')) {
    const i = p.indexOf('=');
    if (i > 0) (parts[p.slice(0, i)] = parts[p.slice(0, i)] || []).push(p.slice(i + 1));
  }
  const t = Number((parts.t || [])[0]);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return (parts.v1 || []).some((sig) => sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)));
}

const sqlTime = (unix) => new Date(unix * 1000).toISOString().slice(0, 19).replace('T', ' ');

module.exports = function stripeSetup(app, { db, flash, requireUser, applyPaid, startTrial, mentor }) {
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('stripe_customer')) db.exec('ALTER TABLE users ADD COLUMN stripe_customer TEXT');
  if (!cols.includes('stripe_sub')) db.exec('ALTER TABLE users ADD COLUMN stripe_sub TEXT');
  if (!cols.includes('trial_used')) {   // 1 = already had a free trial or a paid plan (no second card trial)
    db.exec('ALTER TABLE users ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0');
    db.exec("UPDATE users SET trial_used = 1 WHERE trial = 1 OR plan != '' OR stripe_sub IS NOT NULL OR expires_at IS NOT NULL");
  }

  const siteUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  // Called by POST /subscribe when Stripe is on. Returns the Checkout URL to send the customer to.
  // foreverPct: a discount on every payment (mentorship students), used instead of the one-time referral discount
  async function checkoutUrl(req, u, plan, billing, discountPct, foreverPct = 0) {
    const params = {
      mode: 'subscription',
      client_reference_id: String(u.id),
      success_url: `${siteUrl(req)}/dashboard?paid=1`,
      cancel_url: `${siteUrl(req)}/subscribe?plan=${plan.id}&billing=${billing}`,
      line_items: { 0: {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(dueNow(plan, billing) * 100),
          recurring: { interval: billing === 'annual' ? 'year' : 'month' },
          product_data: { name: `5ABI.FX ${plan.name} (${BILLING[billing].label})` },
        },
      } },
      metadata: { user_id: u.id, plan: plan.id, billing },
      subscription_data: { metadata: { user_id: u.id, plan: plan.id, billing } },
      custom_text: { submit: { message: `By subscribing you accept the 5ABI.FX Terms of service (${siteUrl(req)}/terms). Payments are final and non-refundable. Cancel future renewals anytime from your dashboard.` } },
    };
    if (u.stripe_customer) params.customer = u.stripe_customer;
    else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email || '')) params.customer_email = u.email; // Stripe asks for one itself when the login is not an email
    if (needsCardTrial(u)) {
      // free trial: card saved now, first charge when the trial ends
      params.subscription_data.trial_period_days = trialDays();
      params.payment_method_collection = 'always';
      params.metadata.trial = '1';
      if (discountPct) params.metadata.ref_off = discountPct;   // added to the subscription after checkout, so it hits the first real charge
      discountPct = 0;
    }
    if (foreverPct) {
      const c = await call('POST', '/v1/coupons', { percent_off: foreverPct, duration: 'forever', name: `Mentorship student ${foreverPct}% off` });
      params.discounts = { 0: { coupon: c.id } };
    } else if (discountPct) {
      // referral discount: a one-time coupon for the first payment only
      const c = await call('POST', '/v1/coupons', { percent_off: discountPct, duration: 'once', name: `Referral ${discountPct}% off` });
      params.discounts = { 0: { coupon: c.id } };
    } else {
      params.allow_promotion_codes = 'true';
    }
    try {
      return (await call('POST', '/v1/checkout/sessions', params)).url;
    } catch (e) {
      // a saved customer from test mode (or a deleted one) is unknown to the live key: start fresh with the email
      if (!params.customer || !/no such customer/i.test(e.message)) throw e;
      db.prepare('UPDATE users SET stripe_customer = NULL WHERE id = ?').run(u.id);
      delete params.customer;
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email || '')) params.customer_email = u.email; // Stripe asks for one itself when the login is not an email
      return (await call('POST', '/v1/checkout/sessions', params)).url;
    }
  }

  // Stripe customer portal: update card, cancel, download invoices
  app.post('/billing', requireUser, async (req, res) => {
    if (!on() || !req.user.stripe_customer) return res.redirect('/pricing');
    try {
      const s = await call('POST', '/v1/billing_portal/sessions', { customer: req.user.stripe_customer, return_url: `${siteUrl(req)}/dashboard` });
      res.redirect(303, s.url);
    } catch (e) {
      console.error('Stripe portal:', e.message);
      flash(req, 'error', 'Could not open billing right now. Please try again or contact us.');
      res.redirect('/dashboard');
    }
  });

  async function onInvoicePaid(inv) {
    const subId = inv.subscription
      || (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription)
      || null;
    if (!subId || !(Number(inv.amount_paid) >= 0)) return;
    const sub = typeof subId === 'object' ? subId : await call('GET', `/v1/subscriptions/${encodeURIComponent(subId)}`);
    if (sub.status === 'trialing' || (Number(inv.amount_paid) === 0 && inv.billing_reason === 'subscription_create' && sub.trial_end)) return;   // the $0 trial invoice
    const md = sub.metadata || {};
    let u = md.user_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(Number(md.user_id)) : null;
    if (!u && inv.customer) u = db.prepare('SELECT * FROM users WHERE stripe_customer = ?').get(String(inv.customer));
    if (!u) { console.error('Stripe invoice.paid: no user for', sub.id); return; }
    const plan = getPlan(md.plan) || getPlan(u.plan);
    const billing = cleanBilling(md.billing || u.billing);
    // the paid period ends at the line item's period end (falls back to the subscription's)
    const line = inv.lines && inv.lines.data && inv.lines.data[0];
    const end = (line && line.period && line.period.end) || sub.current_period_end
      || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end);
    db.prepare('UPDATE users SET stripe_customer = COALESCE(?, stripe_customer), stripe_sub = ? WHERE id = ?')
      .run(inv.customer ? String(inv.customer) : null, sub.id, u.id);
    applyPaid(u, plan, billing, end ? sqlTime(Number(end) + GRACE_SECONDS) : null, { amount: Number(inv.amount_paid) / 100, via: 'stripe' });
  }

  app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!secret || !verify(raw, req.get('stripe-signature'), secret)) return res.status(400).send('Bad signature');
    let ev;
    try { ev = JSON.parse(raw); } catch { return res.status(400).send('Bad JSON'); }
    if (db.prepare('SELECT 1 FROM stripe_events WHERE id = ?').get(ev.id)) return res.json({ received: true, duplicate: true });
    const obj = (ev.data && ev.data.object) || {};
    try {
      if (mentor && await mentor.onStripeEvent(ev.type, obj)) {
        // a mentorship payment (src/mentorship.js), never an EA plan
      } else if (ev.type === 'checkout.session.completed') {
        const id = Number(obj.client_reference_id || (obj.metadata && obj.metadata.user_id));
        if (id && obj.customer) db.prepare('UPDATE users SET stripe_customer = ?, stripe_sub = COALESCE(?, stripe_sub) WHERE id = ?').run(String(obj.customer), obj.subscription ? String(obj.subscription) : null, id);
        if (id && obj.metadata && obj.metadata.trial === '1') {
          // card added: start the free trial now (one extra day so the first charge lands before access ends)
          const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
          if (u && !u.trial_used) {
            startTrial(id, trialDays(), 'stripe');
            db.prepare(`UPDATE users SET trial_used = 1, plan_request = ?, expires_at = datetime(expires_at, '+1 day') WHERE id = ?`)
              .run(`${obj.metadata.plan || ''}:${obj.metadata.billing || ''}`, id);
          }
          const off = Number(obj.metadata.ref_off);
          if (off > 0 && obj.subscription) {
            const c = await call('POST', '/v1/coupons', { percent_off: off, duration: 'once', name: `Referral ${off}% off` });
            await call('POST', `/v1/subscriptions/${encodeURIComponent(String(obj.subscription))}`, { discounts: { 0: { coupon: c.id } } });
          }
        }
      } else if (ev.type === 'invoice.paid') {
        await onInvoicePaid(obj);
      } else if (ev.type === 'customer.subscription.deleted') {
        // cancelled: nothing is cut off now, the licence runs to the end of what was paid
        const gone = db.prepare('SELECT id, plan, billing FROM users WHERE stripe_sub = ?').get(String(obj.id));
        if (gone) logSale(gone.id, 'cancel', { plan: gone.plan, billing: gone.billing, via: 'stripe' });
        db.prepare('UPDATE users SET stripe_sub = NULL WHERE stripe_sub = ?').run(String(obj.id));
      }
    } catch (e) {
      console.error('Stripe webhook', ev.type, e.message);
      return res.status(500).send('Error');   // Stripe retries later
    }
    db.prepare('INSERT OR IGNORE INTO stripe_events (id) VALUES (?)').run(ev.id);
    res.json({ received: true });
  });

  return { on, cardTrial, needsCardTrial, checkoutUrl, verify };
};

// also usable without the app (the members menu plan box)
module.exports.needsCardTrial = needsCardTrial;
