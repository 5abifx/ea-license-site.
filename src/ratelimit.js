// Site-wide request limit per network, so one visitor or bot sending thousands of requests
// cannot slow the site down for everyone. Files in public/ (pictures, styles, scripts) are
// served before this and never count.
//   RATE_LIMIT_PER_MIN      pages and forms per network per minute (default 100, 0 = off)
//   RATE_LIMIT_API_PER_MIN  EA licence checks + journal uploads per network per minute (default 600):
//                           higher because one VPS can run many MT5 terminals
// Also works out the visitor's real address when the site sits behind Cloudflare (orange cloud):
// CF-Connecting-IP is only believed when the request really came from a Cloudflare server.
const net = require('net');

const CF_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CF_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];
const cloudflare = new net.BlockList();
for (const c of CF_V4) { const [a, b] = c.split('/'); cloudflare.addSubnet(a, Number(b), 'ipv4'); }
for (const c of CF_V6) { const [a, b] = c.split('/'); cloudflare.addSubnet(a, Number(b), 'ipv6'); }
const plain = (ip) => String(ip || '').replace(/^::ffff:(?=\d+\.)/, '');
function fromCloudflare(ip) {
  const v = net.isIP(ip);
  return v ? cloudflare.check(ip, v === 4 ? 'ipv4' : 'ipv6') : false;
}

// req.ip = the visitor, not Cloudflare (so the sign-in limits keep working per person too)
function realIp(req, res, next) {
  const peer = plain(req.ip);
  const cf = plain(req.get('cf-connecting-ip'));
  const ip = cf && net.isIP(cf) && fromCloudflare(peer) ? cf : peer;
  Object.defineProperty(req, 'ip', { value: ip, configurable: true });
  next();
}

const windows = new Map();   // key -> { n, reset }
setInterval(() => { const now = Date.now(); for (const [k, w] of windows) if (w.reset <= now) windows.delete(k); }, 60 * 1000).unref();
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== '' ? n : d; };

function limiter(req, res, next) {
  if (req.path === '/api/stripe/webhook') return next();   // Stripe retries from many servers; signed anyway
  const api = req.path.startsWith('/api/');
  const max = api ? num(process.env.RATE_LIMIT_API_PER_MIN, 600) : num(process.env.RATE_LIMIT_PER_MIN, 100);
  if (!max) return next();
  const key = `${api ? 'a' : 'p'}:${req.ip}`;
  const now = Date.now();
  let w = windows.get(key);
  if (!w || w.reset <= now) { w = { n: 0, reset: now + 60 * 1000 }; windows.set(key, w); }
  w.n += 1;
  if (w.n <= max) return next();
  const wait = Math.max(1, Math.ceil((w.reset - now) / 1000));
  res.set('Retry-After', String(wait));
  if (w.n === max + 1) console.warn(`Rate limit: ${req.ip} went over ${max} ${api ? 'API' : 'page'} requests/min`);
  if (api) return res.status(429).json({ ok: false, error: 'too_many_requests', retry_after: wait });
  res.status(429).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slow down</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#e9e9ee;font:16px system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-weight:600">Too many requests</h1><p style="color:#9a9aa5">Please wait ${wait} seconds and try again.</p><p><a href="/" style="color:#ff5a1f">Back to the home page</a></p></div></body>`);
}

module.exports = { realIp, limiter, fromCloudflare };
