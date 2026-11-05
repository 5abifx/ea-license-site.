// Floating "Need help?" button in the bottom-right corner of every page (public, cinematic and members area).
// Tapping it opens a small panel with direct links to the owner. Links come from env (read on each request,
// so they can be changed on Render without a code change):
//   SUPPORT_WHATSAPP  phone number in international format (e.g. 15551234567) or a wa.me link   (falls back to MENTOR_WHATSAPP)
//   SUPPORT_INSTAGRAM Instagram username or profile link (default 5abi.fx); opens a DM            (falls back to MENTOR_INSTAGRAM)
//   SUPPORT_DISCORD   Discord invite link                                                          (falls back to MENTOR_DISCORD)
//   SUPPORT_TELEGRAM  Telegram username or t.me link
//   SUPPORT_EMAIL     email address
//   SUPPORT_OFF=1     hides the button everywhere
// The button is left off the owner pages (/admin, /mentor) and off the printable agreement.
const { esc, SITE_NAME } = require('./views');

const ICON = {
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/><path d="M8.5 11h7M8.5 14h4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  whatsapp: '<path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.3-1.2z"/><path d="M9 8.6c.2-.4.5-.5.8-.5h.5l.9 2-.6.8c.5 1 1.3 1.8 2.3 2.3l.8-.6 2 .9v.5c0 .3-.1.6-.5.8-.8.5-2 .4-3.5-.6a8 8 0 01-2.3-2.3c-1-1.5-1-2.7-.4-3.3z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>',
  discord: '<path d="M8 6.5c-1.5.3-2.8.8-4 1.6C2.4 11 2 13.8 2.2 16.6c1.5 1.1 3 1.8 4.6 2.2l1-1.6M16 6.5c1.5.3 2.8.8 4 1.6 1.6 2.9 2 5.7 1.8 8.5-1.5 1.1-3 1.8-4.6 2.2l-1-1.6M7 16.5c3.2 1.5 6.8 1.5 10 0M8.5 6.6A12 12 0 0112 6c1.2 0 2.4.2 3.5.6"/><circle cx="9" cy="12.5" r="1.2"/><circle cx="15" cy="12.5" r="1.2"/>',
  telegram: '<path d="M21 4L3 11.2l6 2.3M21 4l-3 16-8.9-6.5M21 4L9.1 13.5V19l3.1-3.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 2-2.5 2-2.5 4M12 17h.01"/>',
};
const svg = (k, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

const env = (...keys) => keys.map((k) => String(process.env[k] || '').trim()).find(Boolean) || '';
const isUrl = (s) => /^https:\/\/[^\s"'<>]+$/.test(s);
const handle = (s) => s.replace(/^@/, '').replace(/[^\w.]/g, '');

// [{ key, name, hint, url }] for the channels that are set up, best first
function channels(req) {
  const page = `${(process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/^https?:\/\//, '').replace(/\/$/, '')}${req.path}`;
  const who = req.user ? ` (account: ${req.user.email})` : '';
  const hello = `Hi, I'm on ${page}${who} and I need help with: `;
  const out = [];

  const wa = env('SUPPORT_WHATSAPP', 'MENTOR_WHATSAPP');
  if (wa) {
    const digits = wa.replace(/[^\d]/g, '');
    const url = isUrl(wa) ? wa : digits.length >= 8 ? `https://wa.me/${digits}` : '';
    if (url) out.push({ key: 'whatsapp', name: 'WhatsApp', hint: 'Fastest reply', url: /wa\.me\/\d+\/?$/.test(url) ? `${url.replace(/\/$/, '')}?text=${encodeURIComponent(hello)}` : url });
  }

  const ig = env('SUPPORT_INSTAGRAM', 'MENTOR_INSTAGRAM') || '5abi.fx';
  const igUser = handle((/instagram\.com\/([^/?#]+)/.exec(ig) || [])[1] || (isUrl(ig) ? '' : ig));
  if (igUser) out.push({ key: 'instagram', name: 'Instagram', hint: `DM @${igUser}`, url: `https://ig.me/m/${igUser}` });
  else if (isUrl(ig)) out.push({ key: 'instagram', name: 'Instagram', hint: 'Send a DM', url: ig });

  const dc = env('SUPPORT_DISCORD', 'MENTOR_DISCORD');
  if (isUrl(dc)) out.push({ key: 'discord', name: 'Discord', hint: 'Join the server', url: dc });

  const tg = env('SUPPORT_TELEGRAM');
  if (tg) {
    const u = isUrl(tg) ? tg : handle(tg) ? `https://t.me/${handle(tg)}` : '';
    if (u) out.push({ key: 'telegram', name: 'Telegram', hint: 'Send a message', url: u });
  }

  const em = env('SUPPORT_EMAIL');
  if (/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(em)) {
    out.push({ key: 'mail', name: 'Email', hint: em, url: `mailto:${em}?subject=${encodeURIComponent(`Help with ${SITE_NAME}`)}&body=${encodeURIComponent(hello)}` });
  }
  return out;
}

function supportWidget(req) {
  if (/^(1|true|yes)$/i.test(process.env.SUPPORT_OFF || '')) return '';
  if (/^\/(admin|mentor)(\/|$)/.test(req.path) || req.path === '/mentorship/agreement') return '';
  const list = channels(req);
  if (!list.length) return '';
  const links = list.map((c) => `<a class="sup-ch sup-${c.key}" href="${esc(c.url)}"${c.url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"'}><span class="sup-ic">${svg(c.key)}</span><span><b>${esc(c.name)}</b><small>${esc(c.hint)}</small></span><i aria-hidden="true">›</i></a>`).join('');
  return `<link rel="stylesheet" href="/support.css?v=1">
<div class="sup" id="sup">
  <div class="sup-panel" id="sup-panel" role="dialog" aria-modal="false" aria-labelledby="sup-title" hidden>
    <div class="sup-head"><b id="sup-title">Need a hand?</b><p>Stuck or not sure how something works? Message me directly. A real person replies, not a bot.</p></div>
    <div class="sup-list">${links}</div>
    <div class="sup-foot">${svg('help', 15)}<span>Quick answers: <a href="/faq">FAQ</a> · <a href="/help/ea-blocked">EA blocked by broker?</a></span></div>
  </div>
  <button type="button" class="sup-btn" id="sup-btn" aria-controls="sup-panel" aria-expanded="false" aria-label="Help and contact"><span class="sup-o">${svg('chat', 24)}</span><span class="sup-x">${svg('close', 22)}</span><em>Need help?</em></button>
</div>
<script src="/support.js?v=1" defer></script>`;
}

module.exports = { supportWidget, channels };
