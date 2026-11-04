// Pricing page (/pricing), plan picker -> /subscribe. Until Stripe is set up, paying goes through PAYMENT_URL
// and the admin applies the plan with "Mark as paid"; the picked plan is saved on the user as plan_request.
const { esc } = require('./views');
const { PLANS, BILLING, getPlan, cleanBilling, perMonth, dueNow, maxSave } = require('./plans');
const { eaDiscountFor } = require('./mentorship');

const QUOTES = ['Every trade you don\'t journal is a lesson lost.', 'Protect the account first. Profits follow.', 'One bad day shouldn\'t cost you the challenge.'];

// plan cards; `billing` picks which price shows first (the page toggle switches them client-side)
function planCards({ billing = 'monthly', cta, selected = 'katana' }) {
  return `<div class="pl-grid">${PLANS.map((p) => `
    <label class="pl${p.id === selected ? ' on' : ''}" data-plan="${p.id}">
      <input type="radio" name="plan" value="${p.id}" ${p.id === selected ? 'checked' : ''}>
      ${p.popular ? '<span class="pl-pop">Most popular</span>' : ''}
      <div class="pl-head">
        <div><b class="pl-name">${esc(p.name)}</b><small>${esc(p.tagline)}</small></div>
        <div class="pl-price">
          <span data-billing="monthly"${billing === 'monthly' ? '' : ' hidden'}><b>$${p.monthly}</b><small>/mo</small></span>
          <span data-billing="annual"${billing === 'annual' ? '' : ' hidden'}><b>$${p.annual}</b><small>/mo</small><em>Save ${Math.floor((1 - p.annual / p.monthly) * 100)}% · $${p.annual * 12}/yr</em></span>
        </div>
      </div>
      ${cta ? cta(p) : ''}
      <div class="pl-feats${p.extrasTitle ? ' extra' : ''}">
        ${p.extrasTitle ? `<span class="pl-extra">+ ${esc(p.extrasTitle)}</span>` : ''}
        <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>
    </label>`).join('')}</div>`;
}

function billingToggle(billing) {
  return `<div class="pl-toggle" role="group" aria-label="Billing">
    <span class="pl-save">Save up to ${maxSave()}% on annual</span>
    <span class="seg">${Object.entries(BILLING).map(([k, b]) => `<button type="button" data-set-billing="${k}" aria-pressed="${k === billing}">${b.label}</button>`).join('')}</span>
  </div>`;
}

module.exports = function pricing(app, { db, page, requireUser, trialDays, PAYMENT_URL, CONTACT_URL, refs, stripe }) {
  app.get('/pricing', (req, res) => {
    const billing = cleanBilling(req.query.billing);
    const selected = getPlan(req.query.plan) ? req.query.plan : 'katana';
    const trial = trialDays();
    page(req, res, 'Pricing', `
    <form class="pl-page" method="get" action="/subscribe">
      <h1>Find the plan that fits your trading</h1>
      <div class="pl-bar">
        <p class="pl-quote">“${esc(QUOTES[new Date().getUTCDate() % QUOTES.length])}”</p>
        ${billingToggle(billing)}
      </div>
      ${eaDiscountFor(req.user) ? `<p class="pl-ref"><span class="pl-ref-tick">✓</span> Mentorship student: ${eaDiscountFor(req.user)}% off every payment on any plan.</p>` : refs.discountFor(req.user) ? `<p class="pl-ref"><span class="pl-ref-tick">✓</span> Your ${refs.discountFor(req.user)}% referral discount is applied to your first payment.</p>` : req.session.ref ? `<p class="pl-ref"><span class="pl-ref-tick">✓</span> Referral code ${esc(req.session.ref)}: create your account to get your discount on the first payment.</p>` : ''}
      <input type="hidden" name="billing" value="${billing}">
      ${planCards({ billing, selected })}
      <button class="pl-go">${req.user && !(stripe && stripe.needsCardTrial(req.user)) ? 'Continue' : trial ? `Start ${trial}-day free trial` : 'Continue'}</button>
      <p class="muted small center">${trial ? `Every plan starts with a ${trial}-day free trial of all EAs${stripe && stripe.cardTrial() ? '. Card needed, no charge until the trial ends' : ''}. ` : ''}Cancel anytime. Prices in USD.</p>
    </form>
    <script src="/pricing.js"></script>`);
  });

  // signed out: sign up first (the trial covers everything), then pick a plan when it ends
  app.get('/subscribe', (req, res) => {
    const plan = getPlan(req.query.plan) || getPlan('katana');
    const billing = cleanBilling(req.query.billing);
    if (!req.user) return res.redirect('/signup');
    const moff = eaDiscountFor(req.user);
    const off = moff || refs.discountFor(req.user);
    const total = dueNow(plan, billing), cut = Math.round(total * off) / 100;
    const cardTrial = stripe && stripe.on() && stripe.needsCardTrial(req.user) ? trialDays() : 0;
    const firstCharge = new Date(Date.now() + cardTrial * 86400000).toISOString().slice(0, 10);
    page(req, res, 'Subscribe', `
    <div class="sub">
      <p><a href="/pricing?plan=${plan.id}&amp;billing=${billing}">← Change plan</a></p>
      <div class="sub-grid">
        <section class="card sub-sum">
          <span class="lp-kicker">Your plan</span>
          <h1>${esc(plan.name)} · ${BILLING[billing].label}</h1>
          <ul class="ticks">${plan.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          <div class="sub-row"><span>${esc(plan.name)} plan, billed ${billing === 'annual' ? 'yearly' : 'monthly'}</span><b>$${dueNow(plan, billing)}</b></div>
          ${billing === 'annual' ? `<div class="sub-row muted"><span>Same as $${perMonth(plan, billing)}/month</span><span>you save $${(plan.monthly - plan.annual) * 12}</span></div>` : ''}
          ${off ? `<div class="sub-row"><span class="sub-badge">${off}% off ${moff ? 'every payment (mentorship student)' : 'first payment'}</span><b class="pos">−$${cut.toFixed(2)}</b></div>` : ''}
          ${cardTrial ? `<div class="sub-row"><span>${cardTrial}-day free trial</span><b class="pos">until ${firstCharge}</b></div>
          <div class="sub-row total"><span>Due today</span><b>$0 USD</b></div>
          <p class="muted small">First charge $${(total - cut).toFixed(off ? 2 : 0)} on ${firstCharge}${off ? `, then $${total}` : ''} per ${billing === 'annual' ? 'year' : 'month'}. Cancel before ${firstCharge} and you pay nothing.</p>` : `
          <div class="sub-row total"><span>Total due</span><b>$${(total - cut).toFixed(off ? 2 : 0)} USD</b></div>
          ${off && !moff ? `<p class="muted small">Then $${total} per ${billing === 'annual' ? 'year' : 'month'}.</p>` : ''}`}
        </section>
        <section class="card sub-pay">
          <h2>Pay</h2>
          ${stripe && stripe.on() ? (req.user.stripe_sub ? `
          <p>You already have an active subscription. Change plan, update your card or cancel in billing.</p>
          <form method="post" action="/billing"><button class="full">Manage billing</button></form>` : `
          <p>${cardTrial ? `Add your card securely with Stripe. Your ${cardTrial}-day free trial of every EA starts straight away, and nothing is charged until ${firstCharge}.` : `Pay securely by card with Stripe. Your plan switches on as soon as the payment goes through, and renews ${billing === 'annual' ? 'every year' : 'every month'} until you cancel.`}</p>
          <form method="post" action="/subscribe">
            <input type="hidden" name="plan" value="${plan.id}"><input type="hidden" name="billing" value="${billing}">
            <button class="full">${cardTrial ? 'Add card and start free trial' : `Pay $${(total - cut).toFixed(off ? 2 : 0)} by card`}</button>
          </form>
          <p class="muted small">Cancel anytime from your dashboard. You keep access until the end of the paid period.</p>`) : `
          <p>Card payments in the site are coming soon. For now, pay with the button below and we switch your plan on${req.user.email ? ` for <b>${esc(req.user.email)}</b>` : ''}, usually within a few hours.</p>
          <form method="post" action="/subscribe">
            <input type="hidden" name="plan" value="${plan.id}"><input type="hidden" name="billing" value="${billing}">
            <button class="full">${PAYMENT_URL ? 'Continue to payment' : 'Request this plan'}</button>
          </form>
          <p class="muted small">Mention your account email when you pay so we can match it.</p>`}
        </section>
      </div>
    </div>`);
  });

  app.post('/subscribe', requireUser, async (req, res) => {
    const plan = getPlan(req.body.plan);
    if (!plan) return res.redirect('/pricing');
    const billing = cleanBilling(req.body.billing);
    if (stripe && stripe.on() && req.user.stripe_sub) return res.redirect(307, '/billing');
    db.prepare('UPDATE users SET plan_request = ? WHERE id = ?').run(`${plan.id}:${billing}`, req.user.id);
    if (stripe && stripe.on()) {
      try {
        return res.redirect(303, await stripe.checkoutUrl(req, req.user, plan, billing, refs.discountFor(req.user), eaDiscountFor(req.user)));
      } catch (e) {
        console.error('Stripe checkout:', e.message);
        req.session.flash = { type: 'error', msg: 'Card payment could not start. Please try again in a minute or contact us.' };
        return res.redirect(`/subscribe?plan=${plan.id}&billing=${billing}`);
      }
    }
    if (PAYMENT_URL) return res.redirect(303, PAYMENT_URL);
    req.session.flash = { type: 'ok', msg: `Thanks! We got your request for ${plan.name} (${BILLING[billing].label.toLowerCase()}). ${CONTACT_URL ? 'Contact us to pay and we switch it on.' : 'We will contact you to finish payment.'}` };
    res.redirect('/dashboard');
  });
};

module.exports.planCards = planCards;
