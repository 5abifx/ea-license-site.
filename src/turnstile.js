// Bot check with Cloudflare Turnstile (free, no ad tracking; most people only see a tick).
// Turned on by two Render settings from Cloudflare > Turnstile:
//   TURNSTILE_SITE_KEY   (public, shown in the page)
//   TURNSTILE_SECRET_KEY (private, used to check the answer)
// Without them the site works exactly as before. Used on sign-up, and on sign-in after 3 wrong passwords.
const API = () => process.env.TURNSTILE_API || 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const on = () => !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

function widget() {
  if (!on()) return '';
  const key = String(process.env.TURNSTILE_SITE_KEY).replace(/[^\w-]/g, '');
  return `<div class="bot-check"><div class="cf-turnstile" data-sitekey="${key}" data-theme="dark" data-size="flexible"></div></div>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
}

// true when the visitor passed (or the check is off). If Cloudflare cannot be reached, people are let
// through (logged) so a Cloudflare outage never locks customers out; the rate limits still apply.
async function passed(req) {
  if (!on()) return true;
  const token = String(req.body['cf-turnstile-response'] || '');
  if (!token) return false;
  try {
    const r = await fetch(API(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: req.ip || '' }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    return !!j.success;
  } catch (e) {
    console.error('Turnstile check failed, letting the visitor through:', e.message);
    return true;
  }
}

module.exports = { on, widget, passed };
