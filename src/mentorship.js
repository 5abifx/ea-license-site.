// Mentorship page. DRAFT: the bracketed text is placeholder copy until the owner confirms
// what members get and the price.
module.exports = function mentorship(app, { page, esc }) {
  const PRICE = process.env.MENTOR_PRICE || '[price]';
  const PERIOD = process.env.MENTOR_PERIOD || 'month';

  app.get('/mentorship', (req, res) => page(req, res, 'Mentorship', `
  <section class="mt-hero">
    <div class="wrap mt-hero-in">
      <div>
        <h1>Learn to trade with a plan you can repeat.</h1>
        <p class="lp-lead">The 5ABI.FX mentorship: how we read the market, how we size and manage every trade, and the tools we use to stay inside the rules.</p>
        <div class="lp-cta">
          <a class="btn big" href="${req.user ? '/subscribe?plan=mentorship' : '/signup?next=mentorship'}">Join the mentorship</a>
          <a class="btn big ghost" href="#inside">What's inside</a>
        </div>
      </div>
      <ol class="mt-path" aria-label="How the mentorship works">
        <li><b>Join</b><span>Create your account and choose the mentorship plan.</span></li>
        <li><b>Get access</b><span>[Discord invite, course access, first call]</span></li>
        <li><b>Trade the plan</b><span>KATANA keeps your risk fixed while you practise.</span></li>
        <li><b>Review</b><span>Your journal shows what to fix next week.</span></li>
      </ol>
    </div>
  </section>

  <section id="inside" class="wrap lp-sec">
    <div class="lp-head"><h2>What members get</h2><p>[Confirm each item. Remove what you don't offer.]</p></div>
    <div class="lp-grid">
      <div><h3>Private community</h3><p>[Discord access with trade ideas, Q&amp;A and accountability.]</p></div>
      <div><h3>Live sessions</h3><p>[How often, and what you cover.]</p></div>
      <div><h3>The strategy</h3><p>[Lessons or recordings on how 5ABI.FX trades.]</p></div>
      <div><h3>KATANA risk manager</h3><p>Exact lot size, a real stop on every trade, daily loss and drawdown guards.</p></div>
      <div><h3>Trade Journal</h3><p>Every closed trade logged by day and account, with weekly insights.</p></div>
      <div><h3>Prop-firm help</h3><p>Rules, risk settings and a ready support email if your firm blocks EAs.</p></div>
    </div>
  </section>

  <section class="lp-band">
    <div class="wrap mt-price">
      <div>
        <h2>One plan, everything included.</h2>
        <p>Cancel any time. Your journal history stays on your account.</p>
      </div>
      <div class="mt-card">
        <span class="mt-name">Mentorship</span>
        <div class="mt-amt"><b>${esc(PRICE.startsWith('[') ? PRICE : '$' + PRICE)}</b><span>/ ${esc(PERIOD)}</span></div>
        <ul class="ticks"><li>Community and live sessions</li><li>KATANA on up to 3 accounts</li><li>Trade Journal and insights</li></ul>
        <a class="btn full" href="${req.user ? '/subscribe?plan=mentorship' : '/signup?next=mentorship'}">Join the mentorship</a>
      </div>
    </div>
  </section>
`, { wide: true }));
};
