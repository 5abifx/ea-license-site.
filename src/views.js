const SITE_NAME = process.env.SITE_NAME || '5ABI.FX';
const BRAND = process.env.BRAND || '5ABI.FX';
// lowest plan price, e.g. "$12/month" (plans live in src/plans.js)
const PRICE_TEXT = `$${Math.min(...require('./plans').PLANS.map((p) => p.monthly))}/month`;
// Free trial for new sign ups (read on each request so it can be changed without code edits). 0 = no trial.
const trialDays = () => Math.max(0, Number(process.env.TRIAL_DAYS ?? 15) || 0);

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(s) {
  return s ? esc(String(s).slice(0, 16).replace('T', ' ')) : '-';
}

// Wordmark: orange chevron mark + 5ABI<b>.FX</b> (the last "." onwards in the accent color)
function brandMark() {
  const dot = BRAND.lastIndexOf('.');
  const word = dot > 0 ? `${esc(BRAND.slice(0, dot))}<b>${esc(BRAND.slice(dot))}</b>` : esc(BRAND);
  return `<span class="mark" aria-hidden="true"></span><span>${word}</span>`;
}

// opts.wide: full-width main for the landing page (sections bring their own .wrap)
function layout(req, title, body, opts = {}) {
  const u = req.user;
  const flash = req.session.flash;
  req.session.flash = null;
  const signup = process.env.SIGNUP_MODE !== 'closed';
  const link = (href, text) => `<a href="${href}"${req.path === href || req.path.startsWith(href + '/') ? ' class="on"' : ''}>${text}</a>`;
  const nav = u
    ? `${link('/dashboard', 'My EAs')}
       ${req.hasJournal ? link('/journal', 'Journal') : ''}
       ${u.is_admin ? link('/admin', 'Admin') : ''}
       ${u.google_sub ? '' : link('/password', 'Password')}
       <form method="post" action="/logout" class="inline"><button class="link">Sign out</button></form>`
    : `<a href="/#how">How it works</a>${link('/pricing', 'Pricing')}${link('/faq', 'FAQ')}${link('/login', 'Sign in')}${signup ? '<a class="btn small" href="/signup">Create account</a>' : ''}`;
  const origin = `${req.protocol}://${req.get('host')}`;
  const trial = trialDays();
  const desc = `Automated MT5 Expert Advisors that trade your rules 24/5.${trial ? ` ${trial}-day free trial, then plans from ${PRICE_TEXT}.` : ` Plans from ${PRICE_TEXT}.`}`;
  const flashHtml = flash ? `<div class="flash ${esc(flash.type)}">${esc(flash.msg)}</div>` : '';
  // the pill only shows when the site name differs from the brand (e.g. "EA Licensing")
  const pill = SITE_NAME !== BRAND ? `<span class="pill">${esc(SITE_NAME)}</span>` : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(SITE_NAME)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0a0a0b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(SITE_NAME)} · Activate. Bind. Trade.">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin + req.path)}">
<meta property="og:image" content="${esc(origin)}/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/style.css">
</head><body>
<header><div class="wrap bar"><a class="brand" href="/">${brandMark()}${pill}</a><nav>${nav}</nav></div></header>
${opts.wide
    ? `<main class="wide">${flashHtml ? `<div class="wrap">${flashHtml}</div>` : ''}${body}</main>`
    : `<main class="wrap">${flashHtml}${body}</main>`}
<footer><div class="wrap foot">
<span class="brand">${brandMark()}</span>
<span class="foot-links"><a href="/faq">FAQ</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
<span class="muted">Trading forex and CFDs carries a high level of risk and may not be suitable for every investor. Past performance does not guarantee future results.</span>
</div></footer>
</body></html>`;
}

// split sign-in / sign-up screen: brand pitch on the left, the form on the right
function authShell(eyebrow, title, sub, form) {
  return `<div class="auth">
  <section class="auth-hero">
    <h1>Trade with<br><em>discipline.</em></h1>
    <p>Risk management, licensed EAs and a trade journal for serious traders, in one place.</p>
    <div class="feats">
      <div class="feat"><i>⚔</i><b>KATANA risk manager</b><span>Daily loss, drawdown and position size, enforced.</span></div>
      <div class="feat"><i>▤</i><b>Trade Journal</b><span>Every MT5 trade logged by day and account.</span></div>
      <div class="feat"><i>◆</i><b>Share cards</b><span>Story-ready cards from your real trades.</span></div>
      <div class="feat"><i>⛨</i><b>Licensed per account</b><span>Your EAs run only on your accounts.</span></div>
    </div>
  </section>
  <section class="auth-form"><div class="card">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${esc(title)}</h1>
    <p class="muted" style="text-align:left;margin:0 0 18px">${esc(sub)}</p>
    ${form}
  </div></section>
</div>`;
}

module.exports = { esc, fmtDate, layout, authShell, SITE_NAME, PRICE_TEXT, trialDays };
