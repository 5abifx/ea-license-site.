// 5ABI.FX "Install as an app": registers the (cache-free) service worker, offers a small
// corner card to members, and opens a glass sheet with install steps for iPhone, Android and PC.
// Remove this file + /sw.js + /manifest.webmanifest to undo the whole feature.
(function () {
  'use strict';
  var d = document, w = window;
  var standalone = (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || w.navigator.standalone === true
    || (w.matchMedia && w.matchMedia('(display-mode: window-controls-overlay)').matches);
  if ('serviceWorker' in navigator) w.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  if (standalone) { d.documentElement.classList.add('is-app'); return; }

  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var dev = ios ? 'iphone' : android ? 'android' : 'pc';
  var prompt = null;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  var I = {
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V3m0 0L8 7m4-4l4 4"/><path d="M8 11H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2v-6a2 2 0 00-2-2h-2"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
    inst: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 7v6m0 0l-3-3m3 3l3-3"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 17v5M5 17h14l-2-4V5h1V3H6v2h1v8z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14m-5-5l5 5-5 5"/></svg>',
  };
  var STEPS = {
    iphone: {
      title: 'Put 5ABI.FX on your <em>home screen</em>',
      steps: [
        ['Open <b>5abifx.com</b> in Safari.', ''],
        ['Tap the <b>Share</b> button at the bottom of the screen.', 'share'],
        ['Scroll down and tap <b>Add to Home Screen</b>.', 'plus'],
        ['Tap <b>Add</b>. 5ABI.FX now opens from its own icon, full screen.', ''],
      ],
      note: 'In Chrome on iPhone the Share button is at the top right, next to the address bar.',
    },
    android: {
      title: 'Put 5ABI.FX on your <em>home screen</em>',
      steps: [
        ['Open <b>5abifx.com</b> in Chrome.', ''],
        ['Tap <b>Install now</b> below if you see it.', 'inst'],
        ['No button? Tap the <b>three dots</b> at the top right, then <b>Add to Home screen</b> and choose <b>Install</b>.', 'dots'],
        ['5ABI.FX now opens from its own icon, with no address bar.', ''],
      ],
      note: 'Samsung Internet works too: Menu, then Add page to, then Home screen.',
    },
    pc: {
      title: 'Put 5ABI.FX on your <em>desktop</em>',
      steps: [
        ['Open <b>5abifx.com</b> in Chrome or Edge.', ''],
        ['Click <b>Install now</b> below, or the install icon at the right of the address bar.', 'inst'],
        ['No icon? Open the <b>three dots</b> menu. Chrome: <b>Cast, save and share</b>, then <b>Install</b>. Edge: <b>Apps</b>, then <b>Install this site as an app</b>.', 'dots'],
        ['Right-click its icon in the taskbar and choose <b>Pin to taskbar</b>.', 'pin'],
      ],
      note: 'On a Mac in Safari: File, then Add to Dock.',
    },
  };

  var css = '\
.ia-card{position:fixed;right:max(18px,env(safe-area-inset-right,0px));bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 72px);z-index:44;width:min(330px,calc(100vw - 104px));padding:16px 16px 14px;border-radius:20px;color:#f2f2f4;font:14px/1.45 Manrope,system-ui,sans-serif;\
background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 45%),rgba(16,16,19,.8);-webkit-backdrop-filter:blur(26px) saturate(170%);backdrop-filter:blur(26px) saturate(170%);\
box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 0 0 1px rgba(255,255,255,.06),0 24px 60px -20px rgba(0,0,0,.8);opacity:0;transform:translateY(14px);transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1)}\
.ia-card.on{opacity:1;transform:none}\
.ia-card .ia-row{display:flex;gap:12px;align-items:center;padding-right:22px}\
.ia-card img{width:42px;height:42px;border-radius:11px;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 6px 20px -6px rgba(255,90,31,.45);flex:none}\
.ia-card b{display:block;font:600 15px/1.25 Sora,system-ui,sans-serif;letter-spacing:-.01em}\
.ia-card p{margin:2px 0 0;color:#8a8a94;font-size:12.5px}\
.ia-card .ia-go{margin-top:12px;width:100%;justify-content:center}\
.ia-x{position:absolute;top:10px;right:10px;width:26px;height:26px;border-radius:50%;border:0;background:transparent;color:#8a8a94;cursor:pointer;display:grid;place-items:center}\
.ia-x:hover{background:rgba(255,255,255,.08);color:#fff}\
.ia-x svg,.ia-pill svg,.ia-step i svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}\
.ia-card button,.ia-veil button{text-transform:none;letter-spacing:normal;font-family:Manrope,system-ui,sans-serif;min-height:0;box-shadow:none}\
.ia-pill{display:inline-flex;align-items:center;gap:9px;border:0;border-radius:999px;background:#fff;color:#000;font:700 14px Manrope,system-ui,sans-serif;padding:10px 20px;cursor:pointer;transition:transform .15s,box-shadow .2s}\
.ia-pill:hover{transform:translateY(-1px);box-shadow:0 8px 26px -8px rgba(255,255,255,.5)}\
.ia-ghost{background:rgba(255,255,255,.07);color:#f2f2f4}.ia-ghost:hover{box-shadow:none;background:rgba(255,255,255,.12)}\
.ia-veil{position:fixed;inset:0;z-index:2147483000;background:rgba(3,3,5,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .3s}\
.ia-veil.on{opacity:1}\
.ia-sheet{position:relative;width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:28px;padding:30px 30px 24px;color:#f2f2f4;font:15px/1.5 Manrope,system-ui,sans-serif;\
background:radial-gradient(120% 60% at 50% -10%,rgba(255,90,31,.16),transparent 60%),linear-gradient(165deg,rgba(255,255,255,.10),rgba(255,255,255,.02) 40%),rgba(14,14,17,.72);\
-webkit-backdrop-filter:blur(34px) saturate(180%);backdrop-filter:blur(34px) saturate(180%);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 0 0 1px rgba(255,255,255,.07),0 40px 120px -30px #000;\
transform:translateY(18px) scale(.98);transition:transform .45s cubic-bezier(.2,.8,.2,1)}\
.ia-veil.on .ia-sheet{transform:none}\
.ia-sheet .ia-x{top:16px;right:16px;width:34px;height:34px;background:rgba(255,255,255,.06)}\
.ia-hero{display:flex;align-items:center;gap:14px;margin-bottom:22px}\
.ia-hero img{width:64px;height:64px;border-radius:17px;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 14px 40px -10px rgba(255,90,31,.55)}\
.ia-hero b{display:block;font:600 16px Sora,system-ui,sans-serif}.ia-hero span{color:#8a8a94;font-size:13px}\
.ia-k{font-size:13px;color:#8a8a94;font-weight:600;margin-bottom:6px}\
.ia-sheet h2{margin:0 0 18px;font:700 clamp(24px,4vw,32px)/1.08 Sora,system-ui,sans-serif;letter-spacing:-.035em}\
.ia-sheet h2 em{font-style:normal;color:#ff5a1f}\
.ia-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);margin-bottom:16px}\
.ia-tabs button{border:0;background:transparent;color:#a9a9b3;font:600 13.5px Manrope,system-ui,sans-serif;padding:8px 16px;border-radius:999px;cursor:pointer;transition:.2s}\
.ia-tabs button:hover{color:#fff}.ia-tabs button.on{background:#fff;color:#000}\
.ia-steps{list-style:none;margin:0;padding:0;display:grid;gap:8px}\
.ia-step{display:flex;gap:14px;align-items:center;padding:13px 14px;border-radius:14px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);font-size:14px;color:#d9d9df;animation:iaIn .4s both}\
.ia-step b{color:#fff;font-weight:700}\
.ia-step s{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;text-decoration:none;font:700 12px Sora,system-ui,sans-serif;background:rgba(255,255,255,.08);color:#fff}\
.ia-step span{flex:1}\
.ia-step i{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(255,255,255,.06);color:#fff}\
.ia-step i svg{width:17px;height:17px}\
@keyframes iaIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}\
.ia-note{color:#8a8a94;font-size:12.5px;margin:12px 2px 0}\
.ia-act{display:flex;align-items:center;gap:14px;margin-top:20px;flex-wrap:wrap}\
.ia-act small{color:#8a8a94;font-size:12.5px}\
@media(max-width:640px){.ia-card{left:max(16px,env(safe-area-inset-left,0px));width:auto}.ia-veil{align-items:flex-end;padding:0}.ia-sheet{border-radius:26px 26px 0 0;padding:26px 18px max(22px,env(safe-area-inset-bottom,0px));max-height:92vh;transform:translateY(40px)}\
.ia-sheet:before{content:"";position:absolute;top:9px;left:50%;width:40px;height:4px;margin-left:-20px;border-radius:4px;background:rgba(255,255,255,.18)}\
.ia-tabs{display:flex}.ia-tabs button{flex:1;padding:8px 6px}}';

  function el(html) { var t = d.createElement('div'); t.innerHTML = html; return t.firstElementChild; }
  function addCss() { if (d.getElementById('ia-css')) return; var s = d.createElement('style'); s.id = 'ia-css'; s.textContent = css; d.head.appendChild(s); }

  function stepsHtml(k) {
    var s = STEPS[k];
    return s.steps.map(function (st, i) {
      return '<li class="ia-step" style="animation-delay:' + (i * 50) + 'ms"><s>' + (i + 1) + '</s><span>' + st[0] + '</span>' + (st[1] ? '<i>' + I[st[1]] + '</i>' : '') + '</li>';
    }).join('');
  }
  function open(tab) {
    addCss(); hideCard();
    var k = tab || dev;
    var v = el('<div class="ia-veil" role="dialog" aria-modal="true" aria-labelledby="ia-h"><div class="ia-sheet">\
<button class="ia-x" aria-label="Close">' + I.x + '</button>\
<div class="ia-hero"><img src="/app/icon-192.png" alt=""><div><b>5ABI.FX</b><span>5abifx.com</span></div></div>\
<div class="ia-k">Install the app</div><h2 id="ia-h"></h2>\
<div class="ia-tabs" role="tablist"><button data-t="iphone">iPhone</button><button data-t="android">Android</button><button data-t="pc">PC &amp; Mac</button></div>\
<ol class="ia-steps"></ol><p class="ia-note"></p>\
<div class="ia-act"></div></div></div>');
    function show(t) {
      k = t;
      v.querySelector('h2').innerHTML = STEPS[t].title;
      v.querySelector('.ia-steps').innerHTML = stepsHtml(t);
      v.querySelector('.ia-note').textContent = STEPS[t].note;
      [].forEach.call(v.querySelectorAll('.ia-tabs button'), function (b) { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); });
      var act = v.querySelector('.ia-act');
      act.innerHTML = prompt && t === dev
        ? '<button class="ia-pill" data-go>Install now ' + I.arrow + '</button><small>Nothing to download. Same account, its own window.</small>'
        : '<button class="ia-pill ia-ghost" data-close>Got it</button><small>Nothing to download. Same account, its own window.</small>';
    }
    v.addEventListener('click', function (e) {
      var t = e.target.closest('[data-t]'); if (t) return show(t.dataset.t);
      if (e.target === v || e.target.closest('.ia-x') || e.target.closest('[data-close]')) return close();
      if (e.target.closest('[data-go]')) install();
    });
    function close() { v.classList.remove('on'); setTimeout(function () { v.remove(); }, 300); d.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    d.addEventListener('keydown', esc);
    show(k);
    d.body.appendChild(v);
    requestAnimationFrame(function () { requestAnimationFrame(function () { v.classList.add('on'); }); });
    v.querySelector('.ia-x').focus({ preventScroll: true });
    open.close = close;
  }
  function install() {
    if (!prompt) return open();
    prompt.prompt();
    prompt.userChoice.then(function (c) { if (c && c.outcome === 'accepted') { store.set('appTipOff', '1'); if (open.close) open.close(); } prompt = null; });
  }

  var card = null;
  function hideCard() { if (card) { card.classList.remove('on'); var c = card; card = null; setTimeout(function () { c.remove(); }, 450); } }
  function showCard() {
    if (card || store.get('appTipOff') || !d.querySelector('.app')) return;
    if (d.documentElement.classList.contains('intro-on') || d.body.classList.contains('intro-on')) return setTimeout(showCard, 1500);
    addCss();
    var phone = dev !== 'pc';
    card = el('<div class="ia-card" role="complementary" aria-label="Install the app"><button class="ia-x" aria-label="Not now">' + I.x + '</button>\
<div class="ia-row"><img src="/app/icon-192.png" alt=""><div><b>' + (phone ? 'Add 5ABI.FX to your home screen' : 'Keep 5ABI.FX on your taskbar') + '</b>\
<p>Its own icon, its own window, no address bar. Takes ten seconds.</p></div></div>\
<button class="ia-pill ia-go">Install app ' + I.arrow + '</button></div>');
    card.querySelector('.ia-x').onclick = function () { store.set('appTipOff', '1'); hideCard(); };
    card.querySelector('.ia-go').onclick = function () { if (prompt) install(); else open(); };
    d.body.appendChild(card);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (card) card.classList.add('on'); }); });
  }

  w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); prompt = e; });
  w.addEventListener('appinstalled', function () { store.set('appTipOff', '1'); hideCard(); });
  d.addEventListener('click', function (e) {
    var a = e.target.closest('[data-install]'); if (!a) return;
    e.preventDefault(); open();
  });
  function ready() {
    [].forEach.call(d.querySelectorAll('[data-install]'), function (a) { a.style.display = ''; });
    if (/[?&]install=1/.test(location.search)) open();
    else setTimeout(showCard, 4000);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', ready); else ready();
  w.fiveInstall = open;
})();
