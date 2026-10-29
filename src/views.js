const SITE_NAME = process.env.SITE_NAME || 'EA Licensing';

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
  const nav = u
    ? `<a href="/dashboard">My EAs</a>
       ${req.hasJournal ? '<a href="/journal">Journal</a>' : ''}
       ${u.is_admin ? '<a href="/admin">Admin</a>' : ''}
       <a href="/password">Password</a>
       <form method="post" action="/logout" class="inline"><button class="link">Sign out</button></form>`
    : `<a href="/login">Sign in</a>${process.env.SIGNUP_MODE !== 'closed' ? '<a href="/signup">Create account</a>' : ''}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(SITE_NAME)}</title>
<link rel="stylesheet" href="/style.css">
</head><body>
<header><div class="wrap bar"><a class="brand" href="/">${esc(SITE_NAME)}</a><nav>${nav}</nav></div></header>
<main class="wrap">
${flash ? `<div class="flash ${esc(flash.type)}">${esc(flash.msg)}</div>` : ''}
${body}
</main>
</body></html>`;
}

module.exports = { esc, fmtDate, layout, SITE_NAME };
