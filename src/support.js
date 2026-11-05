// Floating "Need help?" button in the bottom-right corner of every page (public, cinematic and members area).
// Tapping it opens a small panel with a direct Telegram link to the owner (owner's choice: Telegram only).
// Set on Render (read on each request, no code change needed):
//   SUPPORT_TELEGRAM  Telegram username (e.g. 5abifx or @5abifx) or a t.me link. Not set = no button.
//   SUPPORT_OFF=1     hides the button everywhere
// The button is left off the owner pages (/admin, /mentor) and off the printable agreement.
const { esc } = require('./views');

const ICON = {
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/><path d="M8.5 11h7M8.5 14h4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  telegram: '<path d="M21 4L3 11.2l6 2.3M21 4l-3 16-8.9-6.5M21 4L9.1 13.5V19l3.1-3.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 2-2.5 2-2.5 4M12 17h.01"/>',
};
const svg = (k, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// [{ key, name, hint, url }]: Telegram only, or nothing when SUPPORT_TELEGRAM is not set
function channels() {
  const tg = String(process.env.SUPPORT_TELEGRAM || '').trim();
  const user = (/^https:\/\/t\.me\/([\w]{3,})\/?$/.exec(tg) || [])[1] || (/^@?([\w]{3,})$/.exec(tg) || [])[1];
  return user ? [{ key: 'telegram', name: 'Telegram', hint: `Message @${user}`, url: `https://t.me/${user}` }] : [];
}

function supportWidget(req) {
  if (/^(1|true|yes)$/i.test(process.env.SUPPORT_OFF || '')) return '';
  if (/^\/(admin|mentor)(\/|$)/.test(req.path) || req.path === '/mentorship/agreement') return '';
  const list = channels();
  if (!list.length) return '';
  const links = list.map((c) => `<a class="sup-ch sup-${c.key}" href="${esc(c.url)}" target="_blank" rel="noopener"><span class="sup-ic">${svg(c.key)}</span><span><b>${esc(c.name)}</b><small>${esc(c.hint)}</small></span><i aria-hidden="true">›</i></a>`).join('');
  return `<link rel="stylesheet" href="/support.css?v=1">
<div class="sup" id="sup">
  <div class="sup-panel" id="sup-panel" role="dialog" aria-modal="false" aria-labelledby="sup-title" hidden>
    <div class="sup-head"><b id="sup-title">Need a hand?</b><p>Stuck or not sure how something works? Message me directly on Telegram. A real person replies, not a bot.</p></div>
    <div class="sup-list">${links}</div>
    <div class="sup-foot">${svg('help', 15)}<span>Quick answers: <a href="/faq">FAQ</a> · <a href="/help/ea-blocked">EA blocked by broker?</a></span></div>
  </div>
  <button type="button" class="sup-btn" id="sup-btn" aria-controls="sup-panel" aria-expanded="false" aria-label="Help and contact"><span class="sup-o">${svg('chat', 24)}</span><span class="sup-x">${svg('close', 22)}</span><em>Need help?</em></button>
</div>
<script src="/support.js?v=1" defer></script>`;
}

module.exports = { supportWidget, channels };
