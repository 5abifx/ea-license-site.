// 5ABI.FX app service worker.
// It caches NOTHING: every page, style and script still comes straight from the site,
// so a new deploy is never hidden behind an old copy. Its only jobs are to make the
// site installable and to show a calm "you're offline" page when there is no internet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // clear any cache a past version might have made
  for (const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
})()));
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050507"><title>Offline · 5ABI.FX</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050507;color:#f2f2f4;font:15px/1.5 Manrope,system-ui,sans-serif;text-align:center;padding:24px}
h1{font:700 28px/1.1 Sora,system-ui,sans-serif;letter-spacing:-.03em;margin:0 0 8px}p{color:#8a8a94;margin:0 0 22px}
button{background:#fff;color:#000;border:0;border-radius:999px;padding:11px 24px;font:700 14px Manrope,system-ui,sans-serif;cursor:pointer}</style></head>
<body><div><h1>You're offline</h1><p>Check your internet, then try again.</p><button onclick="location.reload()">Try again &rarr;</button></div></body></html>`;
self.addEventListener('fetch', (e) => {
  // only page loads are touched; styles, scripts, pictures and API calls go to the network untouched
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
