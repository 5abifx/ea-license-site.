// Full-screen "cinematic" pages (signed-out home and /mentorship): their own loader, nav, scroll motion
// and canvas graphics. The page bodies live in src/cine-pages/*.html with {{NAME}} slots filled per request;
// their CSS/JS is in public/cine/.
const fs = require('fs');
const path = require('path');
const { esc, SITE_NAME, PRICE_TEXT, trialDays } = require('./views');

const cache = {};
function tpl(name) {
  if (!cache[name] || process.env.NODE_ENV === 'development') cache[name] = fs.readFileSync(path.join(__dirname, 'cine-pages', `${name}.html`), 'utf8');
  return cache[name];
}
const fill = (s, slots) => s.replace(/\{\{([A-Z]+)\}\}/g, (m, k) => (k in slots ? slots[k] : ''));

const RISK = 'Trading forex and CFDs carries a high level of risk and may not be suitable for every investor. Past performance does not guarantee future results.';
const FOOT = '<span><a href="/faq">FAQ</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></span>';

// name: 'home' | 'mentorship'; slots: { NAME: html }; opts: { title, og: { title, desc, image } }
function cinePage(req, name, slots, opts = {}) {
  const flash = req.session.flash;
  req.session.flash = null;
  const origin = `${req.protocol}://${req.get('host')}`;
  const og = opts.og || {};
  const trial = trialDays();
  const desc = og.desc || `KATANA risk manager, trade journal and live mentorship for MT5 traders.${trial ? ` ${trial}-day free trial, then plans from ${PRICE_TEXT}.` : ` Plans from ${PRICE_TEXT}.`}`;
  const v = process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.slice(0, 8) : String(STARTED);
  const body = fill(tpl(name), {
    FLASH: flash ? `<div class="flash-c ${esc(flash.type)}" role="status">${esc(flash.msg)}</div>` : '',
    FOOT,
    ...slots,
  });
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(opts.title || SITE_NAME)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#050507">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(og.title || `${SITE_NAME} · Your rules. Enforced on every trade.`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin + req.path)}">
<meta property="og:image" content="${esc(origin)}/${og.image || 'og.png'}?v=3">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400&family=Manrope:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/cine/${name}.css?v=${v}">
</head><body>
${body}
<p class="risk">${RISK}</p>
<script src="/cine/${name}.js?v=${v}"></script>
</body></html>`;
}
const STARTED = Date.now();

module.exports = { cinePage };
