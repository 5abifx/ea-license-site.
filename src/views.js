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
  paint: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="16" cy="10" r="1.3"/><path d="M12 21a3 3 0 010-6h2a3 3 0 003-3"/>',
  desk: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4M6 13l3-3 3 2 5-5"/>',
  eas: '<path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16"/>',
  journal: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  insights: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  studio: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  plan: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  plans: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  gift: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7C10 3 7 3 7 5s5 2 5 2 5 0 5-2-3-2-5 2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  upload: '<path d="M12 21V9m0 0l-5 5m5-5l5 5M4 3h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 2-2.5 2-2.5 4M12 17h.01"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/><path d="M8.5 11h7M8.5 14h4"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  app: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7m0 0l-3-3m3 3l3-3M10 18h4"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
  star: '<path d="M12 3l2.5 6 6.5.5-5 4 1.5 6.5L12 16l-5.5 4 1.5-6.5-5-4 6.5-.5z"/>',
  tour: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  study: '<path d="M4 19V6a2 2 0 012-2h5v15H6a2 2 0 00-2 2zM20 19V6a2 2 0 00-2-2h-5v15h5a2 2 0 012 2z"/>',
  a11y: '<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M12 14.5l-3.2 6M12 14.5l3.2 6"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

// the plan as a small pill in the top bar
function planPill(u) {
  const expired = u.expires_at && new Date(u.expires_at + 'Z') < new Date();
  const plan = require('./plans').getPlan(u.plan);
  const name = u.is_admin && !u.plan ? 'Owner' : u.trial ? 'Free trial' : plan ? plan.name : 'Member';
  const noCard = require('./stripe').needsCardTrial(u);
  const state = u.status === 'pending' ? ['warn', 'Waiting'] : noCard ? ['warn', 'Add card'] : expired ? ['bad', 'Expired'] : ['ok', 'Active'];
  return `<a class="tb-plan" href="/pricing" title="Your plan">${esc(name)} <i class="${state[0]}">${state[1]}</i></a>`;
}

// Members pages switch without a full reload (public/swap.js). Scripts that declare top-level const/let/class can't
// run twice on one page, so swap.js loads those only once; the list is read from public/ at start-up.
const SWAP_ONCE = (() => {
  const fs = require('fs'), dir = require('path').join(__dirname, '..', 'public');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.js') && /^(const|let|class) /m.test(fs.readFileSync(require('path').join(dir, f), 'utf8'))).map((f) => '/' + f);
  } catch (e) { return []; }
})();
const swapHead = () => `<script>window.__SWAP_ONCE=${JSON.stringify(SWAP_ONCE)}</script><script src="/swap.js"></script>`;

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
  const seoMeta = u ? null : require('./seo').metaFor(req.path);
  const flashHtml = flash ? `<div class="flash ${esc(flash.type)}">${esc(flash.msg)}</div>` : '';
  // the pill only shows when the site name differs from the brand (e.g. "EA Licensing")
  const pill = SITE_NAME !== BRAND ? `<span class="pill">${esc(SITE_NAME)}</span>` : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/compat.js"></script>
<title>${esc((seoMeta && seoMeta.title) || `${title} · ${SITE_NAME}`)}</title>
<meta name="description" content="${esc((seoMeta && seoMeta.desc) || og.desc || desc)}">
${require('./seo').headTags(req, opts)}
<meta name="theme-color" content="#0a0a0b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(og.title || `${SITE_NAME} · Your rules. Enforced on every trade.`)}">
<meta property="og:description" content="${esc(og.desc || desc)}">
<meta property="og:url" content="${esc(origin + req.path)}">
<meta property="og:image" content="${esc(origin)}/${og.image || 'og.png'}?v=3">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="5ABI.FX"><meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Sora:wght@200;300;400;600&family=Manrope:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/style.css">
${u && !opts.wide ? swapHead() : ''}
${u && !opts.wide ? '<link rel="stylesheet" href="/look.css"><link rel="stylesheet" href="/topbar.css"><link rel="stylesheet" href="/compact.css"><link rel="stylesheet" href="/dock.css"><link rel="stylesheet" href="/side.css"><link rel="stylesheet" href="/fit.css"><script src="/side.js" defer></script><link rel="stylesheet" href="/select-ui.css"><script src="/select-ui.js" defer></script>' : ''}
<link rel="stylesheet" href="/guards.css">
${require('./look').a11yHead(u)}
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
<script src="/app/install.js" defer></script>
${u && !opts.wide ? '<script src="/ignite.js"></script><script src="/topbar.js"></script>' : ''}
${require('./support').supportWidget(req)}
</body></html>`;
}

const RISK = 'Trading forex and CFDs carries a high level of risk and may not be suitable for every investor. Past performance does not guarantee future results.';

// signed-in pages: a floating glass bar on top (Journal / Account / Owner open 3D panels), a slim bar + menu panel on phones
function appShell(req, u, flashHtml, body, title) {
  const on = (href) => req.path === href || req.path.startsWith(href + '/');
  const cap = (ic, n) => `<span class="tb-key">${icon(ic)}${n ? `<em class="tb-n count">${n}</em>` : ''}</span>`;
  // one page as a 3D tile (PC panels and the phone menu)
  const tile = (href, ic, text, desc, active, n) => `<a class="tb-tile${active ? ' on' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>${cap(ic, n)}<b>${text}</b>${desc ? `<small>${desc}</small>` : ''}</a>`;
  const sect = (label, tiles) => (tiles.trim() ? `<div class="tb-sect"><div class="tb-label">${label}</div><div class="tb-grid">${tiles}</div></div>` : '');
  const adminPage = req.path.startsWith('/admin');
  const wnNew = require('./whatsnew').count(u);   // What's new lines this member has not seen (orange dot)
  const wnDot = wnNew ? '<em class="wn-dot" aria-label="new"></em>' : '';
  const jOn = { desk: on('/journal/desk'), plan: on('/journal/plan'), ins: on('/journal/insights'), studio: on('/journal/studio'), mentor: on('/journal/mentor'), study: on('/journal/study') };
  const journalOn = on('/journal') && !jOn.desk && !jOn.plan && !jOn.ins && !jOn.studio && !jOn.mentor && !jOn.study;
  const mentor = req.mentorEligible && (req.hasJournal || u.mentor_share);
  const journalTiles = req.hasJournal ? `${tile('/journal/desk', 'desk', 'Desk', 'Today: plan, live trades, clock', jOn.desk)}
      ${tile('/journal', 'journal', 'Journal', 'Calendar and every trade', journalOn)}
      ${tile('/journal/plan', 'plan', 'Plan a trade', 'Entry, stop and size before you click', jOn.plan)}
      ${tile('/journal/insights', 'insights', 'Insights', 'Edge score, leaks, what works', jOn.ins)}
      ${tile('/journal/studio', 'studio', 'Share Studio', 'Cards and clips for socials', jOn.studio)}
      ${mentor ? tile('/journal/mentor', 'chat', 'Mentor review', 'Questions on your trades', jOn.mentor, req.mentorNew) : ''}` : '';
  const accountTiles = `${tile('/settings', 'user', 'Trading profile', 'Accounts and prop firm rules', on('/settings'))}
      ${tile('/appearance', 'paint', 'Appearance', 'Background, panels, accent', on('/appearance'))}
      ${tile('/mentorship', 'cap', 'Mentorship', 'The live programme', on('/mentorship'))}
      ${tile('/pricing', 'plans', 'Plans', 'Your plan and billing', on('/pricing'))}
      ${tile('/profile', 'user', 'My page', 'Your public trader page', on('/profile'))}
      ${tile('/affiliate', 'gift', 'Affiliate', 'Share and earn', on('/affiliate'))}
      ${u.google_sub ? '' : tile('/password', 'lock', 'Password', 'Change your password', on('/password'))}
      <a class="tb-tile" href="#accessibility" data-a11y-open>${cap('a11y')}<b>Accessibility</b><small>Colour-blind colours, text, cursor</small></a>`;
  const helpTiles = `<a class="tb-tile" href="/?install=1" data-install style="display:none">${cap('app')}<b>Get the app</b><small>Add 5ABI.FX to your phone</small></a>
      <a class="tb-tile${on('/whats-new') ? ' on' : ''}" href="/whats-new" data-wn-open>${cap('star', wnNew)}<b>What's new</b><small>${wnNew ? `${wnNew} new for you` : 'Latest updates'}</small></a>
      ${tile('/faq', 'help', 'Help &amp; FAQ', 'Answers and guides', on('/faq'))}
      <a class="tb-tile" href="#tour" data-tour-open>${cap('tour')}<b>Show me around</b><small>A quick tour</small></a>
      <form method="post" action="/logout" class="tb-out"><button class="tb-tile">${cap('out')}<b>Sign out</b></button></form>`;
  const ownerTiles = u.is_admin ? `${tile('/admin/sales', 'insights', 'Sales', 'Revenue and sign-ups', on('/admin/sales'))}
      ${tile('/admin/usage', 'pulse', 'Feature usage', 'What members use', on('/admin/usage'))}
      ${tile('/admin', 'shield', 'Admin', 'Members and licences', adminPage && !on('/admin/eas') && !on('/admin/sales') && !on('/admin/affiliates') && !on('/admin/usage') && !on('/admin/whatsnew') && !on('/admin/requests'))}
      ${tile('/admin/eas', 'upload', 'EAs', 'Upload builds', on('/admin/eas'))}
      ${tile('/admin/whatsnew', 'star', "What's new", 'Post updates', on('/admin/whatsnew'))}
      ${tile('/admin/requests', 'chat', 'Requests', 'Features members asked for', on('/admin/requests'))}
      ${tile('/admin/affiliates', 'gift', 'Affiliates', 'Partners and payouts', on('/admin/affiliates'))}
      ${tile('/mentor', 'cap', 'Mentor', 'Student questions', on('/mentor'), req.mentorWaiting)}` : '';
  const studyTile = req.hasJournal ? tile('/journal/study', 'study', 'Study room', 'Screenshots, setups, your playbook', jOn.study) : '';
  const acctOn = ['/settings', '/appearance', '/mentorship', '/pricing', '/profile', '/affiliate', '/password', '/faq', '/whats-new'].some(on);
  const ownOn = adminPage || on('/mentor');
  // phone dock tab (iPhone style): icon over a short label
  const dock = (href, ic, text, active) => `<a class="tb-dk${active ? ' on' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>${icon(ic)}<span>${text}</span></a>`;
  const btn = (k, ic, text, active) => `<button type="button" class="tb-it${active ? ' on' : ''}" data-tbp="${k}" aria-expanded="false" aria-controls="tbp-${k}">${icon(ic)}<span>${text}</span><i class="tb-cv" aria-hidden="true"></i></button>`;
  const link = (href, ic, text, active, n) => `<a class="tb-it${active ? ' on' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>${icon(ic)}<span>${text}</span>${n ? `<em class="tb-c count">${n}</em>` : ''}</a>`;
  return `${require('./look').tags(u)}
<div class="app tb-app">
<header class="tb" id="tb">
  <nav class="tb-bar tb-glass" aria-label="Members menu">
    <a class="tb-orb" href="/" aria-label="5ABI.FX home"><img src="/logo.png" alt="" width="30" height="18"></a>
    ${link('/dashboard', 'eas', 'My EAs', on('/dashboard'))}
    ${req.hasJournal ? btn('j', 'journal', 'Journal', on('/journal') && !jOn.study) : ''}
    ${req.hasJournal ? link('/journal/study', 'study', 'Study room', jOn.study) : ''}
    ${btn('a', 'user', 'Account', acctOn)}
    ${u.is_admin ? btn('o', 'shield', 'Owner', ownOn) : ''}
  </nav>
  <div class="tb-side tb-glass">
    ${planPill(u)}
    <a class="tb-round wn-top${wnNew ? ' on' : ''}" href="/whats-new" data-wn-open aria-label="What's new" title="What's new">${icon('star')}${wnDot}</a>
    <span class="tb-av" title="Signed in">${esc(((u.name || u.email || 'M').trim()[0] || 'M').toUpperCase())}</span>
  </div>
  <div class="tb-m tb-glass">
    <a class="tb-orb" href="/" aria-label="5ABI.FX home"><img src="/logo.png" alt="" width="30" height="18"></a>
    <b class="tb-title">${esc(title)}</b>
    <a class="tb-round wn-top${wnNew ? ' on' : ''}" href="/whats-new" data-wn-open aria-label="What's new">${icon('star')}${wnDot}</a>
    <button type="button" class="tb-av tb-avb" data-tbp="m" aria-expanded="false" aria-controls="tbp-m" aria-label="Menu">${esc(((u.name || u.email || 'M').trim()[0] || 'M').toUpperCase())}</button>
  </div>
  ${req.hasJournal ? `<div class="tb-panel tb-glass tb-p-j" id="tbp-j"><div class="tb-grid">${journalTiles}</div></div>` : ''}
  <div class="tb-panel tb-glass tb-p-a" id="tbp-a">${sect('Account', accountTiles)}${sect('Help', helpTiles)}</div>
  ${u.is_admin ? `<div class="tb-panel tb-glass tb-p-o" id="tbp-o">${sect('Owner', ownerTiles)}</div>` : ''}
  <div class="tb-panel tb-glass tb-p-m" id="tbp-m">
    ${planPill(u)}
    ${sect('Trading', `${tile('/dashboard', 'eas', 'My EAs', 'Downloads', on('/dashboard'))}${studyTile}${journalTiles}`)}
    ${sect('Account', accountTiles)}${sect('Help', helpTiles)}${sect('Owner', ownerTiles)}
  </div>
  <nav class="tb-dock tb-glass" aria-label="Phone menu">
    ${req.hasJournal ? `${dock('/journal', 'journal', 'Journal', journalOn && !on('/journal/log'))}${dock('/journal/insights', 'insights', 'Insights', jOn.ins)}
    <a class="tb-plus${on('/journal/log') ? ' on' : ''}" href="/journal/log" aria-label="Log a trade"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></a>
    ${dock('/journal/desk', 'desk', 'Desk', jOn.desk)}` : `${dock('/dashboard', 'eas', 'My EAs', on('/dashboard'))}${dock('/appearance', 'paint', 'Appearance', on('/appearance'))}`}
    <button type="button" class="tb-dk" data-tbp="m" aria-expanded="false" aria-controls="tbp-m"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg><span>More</span></button>
  </nav>
  <div class="tb-scrim" data-tb-close></div>
  ${req.hasJournal ? '<div class="sc" data-sc hidden></div>' : ''}
</header>
<div class="app-main">
  <main class="app-body">${flashHtml}${body}</main>
  ${(u.student || u.mentor_plan || u.is_admin) && (u.intro_welcome !== 0 || (req.path === '/journal' && req.hasJournal && u.intro_reveal !== 'never'))
    ? `<script src="/intro.js" defer data-w="${u.intro_welcome === 0 || req.path === '/journal' ? 0 : 1}" data-ws="${process.env.WELCOME_STYLE === 'boot' ? 'boot' : 'name'}" data-r="${req.path === '/journal' && req.hasJournal ? esc(u.intro_reveal || 'always') : ''}"></script>` : ''}
</div>
</div>
<script src="/privacy.js"></script>
${require('./features').clientTag()}
${require('./tour').script(req, u)}
${require('./whatsnew').script(req, u)}`;
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
