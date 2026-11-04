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

const API = () => (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
const on = () => Boolean(process.env.STRIPE_SECRET_KEY);
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

module.exports = function stripeSetup(app, { db, flash, requireUser, applyPaid }) {
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('stripe_customer')) db.exec('ALTER TABLE users ADD COLUMN stripe_customer TEXT');
  if (!cols.includes('stripe_sub')) db.exec('ALTER TABLE users ADD COLUMN stripe_sub TEXT');

  const siteUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  // Called by POST /subscribe when Stripe is on. Returns the Checkout URL to send the customer to.
  async function checkoutUrl(req, u, plan, billing, discountPct) {
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
    };
    if (u.stripe_customer) params.customer = u.stripe_customer;
    else params.customer_email = u.email;
    if (discountPct) {
      // referral discount: a one-time coupon for the first payment only
      const c = await call('POST', '/v1/coupons', { percent_off: discountPct, duration: 'once', name: `Referral ${discountPct}% off` });
      params.discounts = { 0: { coupon: c.id } };
    } else {
      params.allow_promotion_codes = 'true';
    }
    const s = await call('POST', '/v1/checkout/sessions', params);
    return s.url;
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
    applyPaid(u, plan, billing, end ? sqlTime(Number(end) + GRACE_SECONDS) : null);
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
      if (ev.type === 'checkout.session.completed') {
        const id = Number(obj.client_reference_id || (obj.metadata && obj.metadata.user_id));
        if (id && obj.customer) db.prepare('UPDATE users SET stripe_customer = ?, stripe_sub = COALESCE(?, stripe_sub) WHERE id = ?').run(String(obj.customer), obj.subscription ? String(obj.subscription) : null, id);
      } else if (ev.type === 'invoice.paid') {
        await onInvoicePaid(obj);
      } else if (ev.type === 'customer.subscription.deleted') {
        // cancelled: nothing is cut off now, the licence runs to the end of what was paid
        db.prepare('UPDATE users SET stripe_sub = NULL WHERE stripe_sub = ?').run(String(obj.id));
      }
    } catch (e) {
      console.error('Stripe webhook', ev.type, e.message);
      return res.status(500).send('Error');   // Stripe retries later
    }
    db.prepare('INSERT OR IGNORE INTO stripe_events (id) VALUES (?)').run(ev.id);
    res.json({ received: true });
  });

  return { on, checkoutUrl, verify };
};
