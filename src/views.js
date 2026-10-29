const SITE_NAME = process.env.SITE_NAME || '5ABI.FX';

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(s) {
  return s ? esc(String(s).slice(0, 16).replace('T', ' ')) : '-';
}

// Wordmark: the first "." in the name is drawn in the accent color (5ABI.FX → 5ABI<.>FX)
function brandMark() {
  const i = SITE_NAME.indexOf('.');
  const word = i > 0
    ? `${esc(SITE_NAME.slice(0, i))}<span class="dot">.</span>${esc(SITE_NAME.slice(i + 1))}`
    : esc(SITE_NAME);
  return `<span class="logo" aria-hidden="true">${esc(SITE_NAME.charAt(0))}</span><span class="word">${word}</span>`;
}

// opts.wide: full-width main for the landing page (sections bring their own .wrap)
function layout(req, title, body, opts = {}) {
  const u = req.user;
  const flash = req.session.flash;
  req.session.flash = null;
  const signup = process.env.SIGNUP_MODE !== 'closed';
  const nav = u
    ? `<a href="/dashboard">My EAs</a>
       ${req.hasJournal ? '<a href="/journal">Journal</a>' : ''}
       ${u.is_admin ? '<a href="/admin">Admin</a>' : ''}
       <a href="/password">Password</a>
       <form method="post" action="/logout" class="inline"><button class="link">Sign out</button></form>`
    : `<a href="/#how">How it works</a><a href="/#pricing">Pricing</a><a href="/login">Sign in</a>${signup ? '<a class="btn dark" href="/signup">Create account</a>' : ''}`;
  const flashHtml = flash ? `<div class="flash ${esc(flash.type)}">${esc(flash.msg)}</div>` : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(SITE_NAME)}</title>
<meta name="description" content="${esc(SITE_NAME)} Expert Advisors: download your EAs, register your MT5 accounts and manage your licenses.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap">
<link rel="stylesheet" href="/style.css">
</head><body>
<header><div class="wrap bar"><a class="brand" href="/">${brandMark()}</a><nav>${nav}</nav></div></header>
${opts.wide
    ? `<main class="wide">${flashHtml ? `<div class="wrap">${flashHtml}</div>` : ''}${body}</main>`
    : `<main class="wrap">${flashHtml}${body}</main>`}
<footer><div class="wrap foot">
<span class="brand">${brandMark()}</span>
<span class="muted">Trading forex and CFDs carries a high level of risk and may not be suitable for every investor. Past performance does not guarantee future results.</span>
</div></footer>
</body></html>`;
}

module.exports = { esc, fmtDate, layout, SITE_NAME };
