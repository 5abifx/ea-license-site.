// Public "with vs without" showcase at /why (Apple-style): what changes for a trader with KATANA + Journal.
// Body in src/why.html with {{SLOTS}}; CSS/JS in public/why.css and public/why.js.
// Facts on the page are sourced (ESMA, US Senate, peer-reviewed studies) and linked; never add made-up figures.
const fs = require('fs');
const path = require('path');
const { esc, SITE_NAME } = require('./views');

const BODY = fs.readFileSync(path.join(__dirname, 'why.html'), 'utf8');
const DESC = 'Same trader, same losses, smaller damage. See what changes with KATANA risk manager and the Trade Journal, with sourced facts on why risk limits matter.';
const RISK = 'Trading forex and CFDs carries a high level of risk and may not be suitable for every investor. Past performance does not guarantee future results.';

module.exports = function why(app, { trialDays, signupOpen }) {
  app.get('/why', (req, res) => {
    const u = req.user;
    const trial = trialDays();
    const join = trial ? 'Start free trial' : 'Create account';
    const href = u ? '/pricing' : signupOpen() ? '/signup' : '/login';
    const label = u ? 'See plans' : signupOpen() ? join : 'Sign in';
    const slots = {
      TOPBTN: `<a class="btn w" href="${href}">${label}</a>`,
      ENDBTN: `<a class="btn w" href="${href}">${label} →</a>`,
      ENDLINE: trial ? `KATANA + Journal. ${trial}-day free trial, cancel any time.` : 'KATANA + Journal. Cancel any time.',
    };
    const body = BODY.replace(/\{\{([A-Z]+)\}\}/g, (m, k) => slots[k] || '');
    const origin = `${req.protocol}://${req.get('host')}`;
    const v = process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.slice(0, 8) : String(STARTED);
    res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>With vs without KATANA · ${esc(SITE_NAME)}</title>
<meta name="description" content="${esc(DESC)}">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="Same trader. Same losses. Smaller damage.">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:url" content="${esc(origin)}/why">
<meta property="og:image" content="${esc(origin)}/og.png?v=3">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/why.css?v=${v}">
</head><body>
${body}
<p class="risk g">${RISK}</p>
<script src="/why.js?v=${v}"></script>
${require('./support').supportWidget(req)}
</body></html>`);
  });
};
const STARTED = Date.now();
