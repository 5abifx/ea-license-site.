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
  return `<img class="mark" src="/logo.png" alt="" width="34" height="21"><span>${word}</span>`;
}

// small stroke icons for the members menu
const ICONS = {
  desk: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4M6 13l3-3 3 2 5-5"/>',
  eas: '<path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16"/>',
  journal: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  insights: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  plan: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  plans: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  gift: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7C10 3 7 3 7 5s5 2 5 2 5 0 5-2-3-2-5 2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  upload: '<path d="M12 21V9m0 0l-5 5m5-5l5 5M4 3h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 2-2.5 2-2.5 4M12 17h.01"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/><path d="M8.5 11h7M8.5 14h4"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

// plan box at the top of the members menu
function planBox(u) {
  const expired = u.expires_at && new Date(u.expires_at + 'Z') < new Date();
  const plan = require('./plans').getPlan(u.plan);
  const name = u.is_admin && !u.plan ? 'Owner' : u.trial ? 'Free trial' : plan ? `${plan.name} · ${u.billing === 'annual' ? 'annual' : 'monthly'}` : 'Member';
  // signed up but no card yet: the free trial has not started (same rule as stripe.needsCardTrial, loaded late to avoid a require loop)
  const noCard = require('./stripe').needsCardTrial(u);
  const state = u.status === 'pending' ? ['warn', 'Waiting'] : noCard ? ['warn', 'Add card'] : expired ? ['bad', 'Expired'] : ['ok', 'Active'];
  return `<a class="plan-box" href="/pricing"><span>Plan</span><b>${esc(name)}</b><i class="${state[0]}">${state[1]}</i></a>`;
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
    : `<a href="/#katana">KATANA</a><a href="/#journal">Journal</a>${link('/mentorship', 'Mentorship')}${link('/pricing', 'Pricing')}${link('/faq', 'FAQ')}${link('/login', 'Sign in')}${signup ? `<a class="btn small" href="/signup">${trialDays() ? 'Start free trial' : 'Create account'}</a>` : ''}`;
  const origin = `${req.protocol}://${req.get('host')}`;
  const og = opts.og || {}; // link preview (Discord, iMessage, WhatsApp): { title, desc, image }
  const trial = trialDays();
  const desc = `KATANA risk manager, trade journal and live mentorship for MT5 traders.${trial ? ` ${trial}-day free trial, then plans from ${PRICE_TEXT}.` : ` Plans from ${PRICE_TEXT}.`}`;
  const flashHtml = flash ? `<div class="flash ${esc(flash.type)}">${esc(flash.msg)}</div>` : '';
  // the pill only shows when the site name differs from the brand (e.g. "EA Licensing")
  const pill = SITE_NAME !== BRAND ? `<span class="pill">${esc(SITE_NAME)}</span>` : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(SITE_NAME)}</title>
<meta name="description" content="${esc(og.desc || desc)}">
<meta name="theme-color" content="#0a0a0b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(og.title || `${SITE_NAME} · Your rules. Enforced on every trade.`)}">
<meta property="og:description" content="${esc(og.desc || desc)}">
<meta property="og:url" content="${esc(origin + req.path)}">
<meta property="og:image" content="${esc(origin)}/${og.image || 'og.png'}?v=3">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Sora:wght@200;300;400;600&family=Manrope:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/style.css">
</head><body>
${u && !opts.wide ? appShell(req, u, flashHtml, body, title) : `<header><div class="wrap bar"><a class="brand" href="/">${brandMark()}${pill}</a><button type="button" class="menu-btn" data-menu aria-controls="site-nav" aria-expanded="false" aria-label="Menu"><i></i><i></i><i></i></button><nav id="site-nav">${nav}</nav></div></header>
${opts.wide
    ? `<main class="wide">${flashHtml ? `<div class="wrap">${flashHtml}</div>` : ''}${body}</main>`
    : `<main class="wrap">${flashHtml}${body}</main>`}
<footer><div class="wrap foot">
<span class="brand">${brandMark()}</span>
<span class="foot-links"><a href="/faq">FAQ</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
<span class="muted">${RISK}</span>
</div></footer>`}
<script src="/menu.js"></script>
${u && !opts.wide ? '<script src="/ignite.js"></script>' : ''}
${require('./support').supportWidget(req)}
</body></html>`;
}

const RISK = 'Trading forex and CFDs carries a high level of risk and may not be suitable for every investor. Past performance does not guarantee future results.';

// signed-in pages: side menu on the left (a top bar on phones), the page fills the rest of the screen
function appShell(req, u, flashHtml, body, title) {
  const on = (href) => req.path === href || req.path.startsWith(href + '/');
  const item = (href, ic, text, active = on(href)) => `<a href="${href}"${active ? ' class="on" aria-current="page"' : ''}>${icon(ic)}<span>${text}</span></a>`;
  const group = (label, items) => (items.trim() ? `<div class="side-group"><div class="side-label">${label}</div>${items}</div>` : '');
  const adminPage = req.path.startsWith('/admin');
  return `<div class="app">
<aside class="side">
  <div class="side-top">
    <a class="brand" href="/dashboard">${brandMark()}</a>
    ${planBox(u)}
    <button type="button" class="menu-btn" data-menu aria-controls="side-nav" aria-expanded="false" aria-label="Menu"><i></i><i></i><i></i></button>
  </div>
  <nav class="side-nav" id="side-nav" aria-label="Members menu">
    ${group('Main menu', `${item('/dashboard', 'eas', 'My EAs')}
      ${req.hasJournal ? item('/journal/desk', 'desk', 'Desk') + item('/journal', 'journal', 'Journal', on('/journal') && !on('/journal/insights') && !on('/journal/mentor') && !on('/journal/desk') && !on('/journal/plan')) + item('/journal/plan', 'plan', 'Plan a trade') + item('/journal/insights', 'insights', 'Insights') : ''}
      ${req.mentorEligible && (req.hasJournal || u.mentor_share) ? item('/journal/mentor', 'chat', `Mentor review${req.mentorNew ? `<em class="count">${req.mentorNew}</em>` : ''}`, on('/journal/mentor')) : ''}`)}
    ${group('Account', `${item('/mentorship', 'cap', 'Mentorship')}${item('/pricing', 'plans', 'Plans')}
      ${u.google_sub ? '' : item('/password', 'lock', 'Password')}`)}
    ${u.is_admin ? group('Owner', `${item('/admin/sales', 'insights', 'Sales')}${item('/admin', 'shield', 'Admin', adminPage && !on('/admin/eas') && !on('/admin/sales'))}${item('/admin/eas', 'upload', 'EAs')}${item('/mentor', 'cap', `Mentor${req.mentorWaiting ? `<em class="count">${req.mentorWaiting}</em>` : ''}`)}`) : ''}
    <div class="side-group side-end">
      ${item('/faq', 'help', 'Help &amp; FAQ')}
      <form method="post" action="/logout"><button class="link">${icon('out')}<span>Sign out</span></button></form>
    </div>
  </nav>
</aside>
<div class="app-main">
  <div class="app-top"><span class="crumb"><a href="/dashboard">Home</a><i>›</i><b>${esc(title)}</b></span>${u.name ? `<span class="who priv-hide">${esc(u.name)}</span>` : ''}</div>
  <main class="app-body">${flashHtml}${body}</main>
  ${(u.student || u.mentor_plan || u.is_admin) && (u.intro_welcome !== 0 || (req.path === '/journal' && req.hasJournal && u.intro_reveal !== 'never'))
    ? `<script src="/intro.js" defer data-w="${u.intro_welcome === 0 ? 0 : 1}" data-ws="${process.env.WELCOME_STYLE === 'boot' ? 'boot' : 'name'}" data-r="${req.path === '/journal' && req.hasJournal ? esc(u.intro_reveal || 'always') : ''}"></script>` : ''}
  <footer class="app-foot"><span class="foot-links"><a href="/faq">FAQ</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span><span class="muted">${RISK}</span></footer>
</div>
</div>
<script src="/privacy.js"></script>`;
}

// split sign-in / sign-up screen: brand pitch on the left, the form on the right
function authShell(eyebrow, title, sub, form) {
  return `<div class="auth">
  <section class="auth-hero">
    <h1>Trade with<br><em>discipline.</em></h1>
    <p>Risk management, licensed EAs and a trade journal for serious traders, in one place.</p>
    <div class="feats">
      <div class="feat"><i>⚔</i><b>KATANA risk manager</b><span>Lot size, news lock and a Shield that closes all and locks at your limit.</span></div>
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
