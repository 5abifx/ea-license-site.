// Public info pages: FAQ, terms, privacy, robots.txt and the 404 page
const { esc, SITE_NAME } = require('./views');

module.exports = function pages(app, { page, trialDays, PRICE_TEXT, PAID_DAYS, TRIAL_ACCOUNTS, MAX_ACCOUNTS_DEFAULT }) {
  const CONTACT_URL = process.env.CONTACT_URL || process.env.PAYMENT_URL || '';
  const contact = (text) => (CONTACT_URL ? `<a href="${esc(CONTACT_URL)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
  const updated = '29 October 2026';
  const name = esc(SITE_NAME);

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nAllow: /$\nAllow: /faq\nAllow: /terms\nAllow: /privacy\nDisallow: /\n');
  });

  app.get('/faq', (req, res) => {
    const trial = trialDays();
    const qa = [
      ...(trial ? [
        ['How does the free trial work?', `Create an account and you get ${trial} days of full access to every ${name} EA straight away. No payment details are needed to start.`],
        ['What happens when the trial ends?', `The EA stops opening trades on your account. To keep using it, subscribe for ${esc(PRICE_TEXT)} and we reactivate your license.`],
        ['Can I get a second free trial?', 'No. Each MT5 account number can only be used for one free trial, even with a different email.'],
      ] : []),
      ['How do I pay?', `Use the Subscribe button in your dashboard, or ${contact('contact us')}. Once your payment is confirmed we extend your license by ${PAID_DAYS} days.`],
      ['How many MT5 accounts can I use?', `${trial ? `${TRIAL_ACCOUNTS} during the trial and ` : ''}up to ${MAX_ACCOUNTS_DEFAULT} on a paid plan. Add and remove account numbers yourself in the dashboard.`],
      ['Can I change broker or account?', 'Yes. Remove the old account number in your dashboard and add the new one. The EA works on the new account within the hour.'],
      ['Which platform does it run on?', 'MetaTrader 5 (MT5). The EA needs MT5 to stay open, so most traders run it on a VPS.'],
      ['How do I install the EA?', 'Download it from your dashboard, copy it into MT5 (File → Open Data Folder → MQL5 → Experts), allow WebRequest for this website under Tools → Options → Expert Advisors, then attach it to a chart. The dashboard shows the exact URL to allow.'],
      ['Do I get updates?', 'Yes. New versions appear in your dashboard as soon as they are released, at no extra cost.'],
      ['Can I cancel?', 'Yes, anytime. There is no contract. If you do not renew, your license simply ends at the end of the period you paid for.'],
      ['Is profit guaranteed?', 'No. Trading forex and CFDs is risky and you can lose money. An EA follows fixed rules, but no strategy wins every trade. Only trade money you can afford to lose.'],
    ];
    page(req, res, 'FAQ', `
    <div class="prose">
      <h1>Frequently asked questions</h1>
      ${qa.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}
      <p class="muted">Still stuck? ${contact('Get in touch')}${CONTACT_URL ? '' : ' with us'} and we will help.</p>
    </div>`);
  });

  app.get('/terms', (req, res) => page(req, res, 'Terms of service', `
    <div class="prose">
      <h1>Terms of service</h1>
      <p class="muted">Last updated ${updated}</p>
      <p>These terms apply when you create an account on this website or use any ${name} Expert Advisor ("EA"). By signing up you agree to them.</p>
      <h2>1. What you get</h2>
      <p>A personal, non-transferable license to run the ${name} EAs assigned to your account on the MT5 account numbers you register, for as long as your license is active. You may not share, resell, copy, decompile or modify the EA files.</p>
      <h2>2. Free trial</h2>
      <p>New accounts may receive a free trial for a limited number of days. One trial is allowed per person and per MT5 account number. We may end a trial early if we see abuse, such as multiple accounts.</p>
      <h2>3. Price and payment</h2>
      <p>After any trial, access costs ${esc(PRICE_TEXT)}, paid in advance. Each payment extends your license by ${PAID_DAYS} days. Prices may change; a change applies from your next payment.</p>
      <h2>4. Cancellation and refunds</h2>
      <p>You can stop paying at any time and your license ends when the paid period runs out. Because you can test the EA during the free trial, payments are not refundable unless the law requires otherwise.</p>
      <h2>5. Trading risk</h2>
      <p>Trading forex, CFDs and other leveraged products carries a high level of risk and may not be suitable for you. You can lose some or all of your money. ${name} provides software, not financial advice. Past or simulated performance does not guarantee future results. You alone decide whether and how to use the EA and you are responsible for all trades on your accounts.</p>
      <h2>6. Availability</h2>
      <p>We work to keep the website and license check running, but we do not guarantee uninterrupted service. We are not liable for losses caused by outages, broker or platform problems, internet issues or settings on your side.</p>
      <h2>7. Limitation of liability</h2>
      <p>To the extent the law allows, our total liability to you is limited to the amount you paid us in the last 30 days, and we are not liable for any trading losses or lost profits.</p>
      <h2>8. Suspension</h2>
      <p>We may suspend or close accounts that break these terms, share licenses or try to bypass the license check.</p>
      <h2>9. Changes</h2>
      <p>We may update these terms. The date at the top shows the latest version. Continuing to use the service means you accept the updated terms.</p>
      <h2>10. Contact</h2>
      <p>Questions about these terms? ${contact('Contact us')}.</p>
    </div>`));

  app.get('/privacy', (req, res) => page(req, res, 'Privacy policy', `
    <div class="prose">
      <h1>Privacy policy</h1>
      <p class="muted">Last updated ${updated}</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address and a securely hashed password.</li>
        <li><strong>License data:</strong> the MT5 account numbers you register and when the EA last checked its license.</li>
        <li><strong>Trade journal</strong> (only if you use it): the trade details the Trade Journal EA sends.</li>
        <li><strong>Technical data:</strong> IP addresses in server logs and for rate limiting sign-in attempts.</li>
      </ul>
      <h2>Why we use it</h2>
      <p>To run your account, check your license, match payments to your account, prevent abuse of free trials and contact you about your account. We do not sell your data or use it for advertising.</p>
      <h2>Cookies</h2>
      <p>We use a single cookie to keep you signed in. It is required for the site to work, so there is no cookie banner. We do not use tracking or advertising cookies.</p>
      <h2>Payments</h2>
      <p>Payments are handled by the payment provider you choose at checkout, under their own privacy policy. We do not see or store your card details.</p>
      <h2>How long we keep it</h2>
      <p>While your account exists. Records of MT5 accounts that used a free trial are kept to prevent repeat trials.</p>
      <h2>Your rights</h2>
      <p>You can ask us for a copy of your data, to correct it or to delete your account. ${contact('Contact us')} to do so.</p>
      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows the latest version.</p>
    </div>`));

  // Anything not matched above
  app.use((req, res) => {
    res.status(404);
    page(req, res, 'Page not found', `
    <div class="prose center">
      <p class="big404">404</p>
      <h1>This page doesn't exist</h1>
      <p class="muted">The link may be old or mistyped.</p>
      <p><a class="btn" href="/">Go to the homepage</a></p>
    </div>`);
  });
};
