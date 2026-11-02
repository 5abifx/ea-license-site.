const SITE_NAME = process.env.SITE_NAME || 'EA Licensing';
const BRAND = process.env.BRAND || '5ABI.FX';

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(s) {
  return s ? esc(String(s).slice(0, 16).replace('T', ' ')) : '-';
}

function layout(req, title, body) {
  const u = req.user;
  const flash = req.session.flash;
  req.session.flash = null;
  const link = (href, text) => `<a href="${href}"${req.path === href || req.path.startsWith(href + '/') ? ' class="on"' : ''}>${text}</a>`;
  const nav = u
    ? `${link('/dashboard', 'My EAs')}
       ${req.hasJournal ? link('/journal', 'Journal') : ''}
       ${u.is_admin ? link('/admin', 'Admin') : ''}
       ${link('/password', 'Password')}
       <form method="post" action="/logout" class="inline"><button class="link">Sign out</button></form>`
    : `${link('/login', 'Sign in')}${process.env.SIGNUP_MODE !== 'closed' ? link('/signup', 'Create account') : ''}`;
  // "5ABI.FX" -> 5ABI<b>.FX</b>
  const dot = BRAND.lastIndexOf('.');
  const brand = dot > 0 ? `${esc(BRAND.slice(0, dot))}<b>${esc(BRAND.slice(dot))}</b>` : esc(BRAND);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(SITE_NAME)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/style.css">
</head><body>
<header><div class="wrap bar"><a class="brand" href="/"><span class="mark"></span><span>${brand}</span><span class="pill">${esc(SITE_NAME)}</span></a><nav>${nav}</nav></div></header>
<main class="wrap">
${flash ? `<div class="flash ${esc(flash.type)}">${esc(flash.msg)}</div>` : ''}
${body}
</main>
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

module.exports = { esc, fmtDate, layout, authShell, SITE_NAME };
