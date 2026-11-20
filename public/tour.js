/* Guided tour of the members area.
   First visit after sign-up asks "How should we show you around?" (Beginner = a few cards, Advanced = full walkthrough).
   Replay any time from the Account menu ("Show me around"). Server side: src/tour.js. */
(function () {
  var me = document.currentScript || document.querySelector('script[data-tour]');
  var D = (me && me.dataset) || {};
  var DEMO = !!window.TOUR_DEMO;   // the design sample: no page changes, no saving
  var has = { j: D.j === '1', m: D.m === '1' };
  var KEY = 'tour5';

  // sel = what to light up (first visible match); path = page it lives on; need = only for members who have it
  var BEGIN = [
    { t: 'Welcome to your desk', p: 'Five quick cards and you know where everything is. Takes under a minute.' },
    { sel: '.tb-bar a[href="/dashboard"], .tb-mbtn', path: '/dashboard', t: 'My EAs', p: 'Download KATANA and the Journal EA here, then add your MT5 account number so they unlock on it.' },
    { need: 'j', sel: '.tb-bar [data-tbp="j"], .tb-mbtn', t: 'Journal', p: 'Every MT5 trade lands here by itself, day by day and account by account. Tap a day to see its trades.' },
    { need: 'j', sel: '.tb-bar [data-tbp="j"], .tb-mbtn', t: 'Plan a trade', p: 'Write the plan before you click. We match it to the real trade and show you where you followed it and where you did not.' },
    { need: 'j', sel: '.tb-bar [data-tbp="j"], .tb-mbtn', t: 'Insights', p: 'Your edge score and the habits that cost you money, each with one line on how to fix it.' },
    { sel: '.tb-bar [data-tbp="a"], .tb-mbtn, .sup-btn, [data-support]', t: 'Stuck? Ask us', p: 'Help & FAQ answers the common questions. The chat button opens a message to us.' },
    { end: 1, t: 'You are set', p: 'Connect your first account and your trades start filling in.' }
  ];
  var ADV = [
    { t: 'The full walkthrough', p: 'We will move page by page and point at each part. Use the arrow keys or the buttons. You can stop any time.' },
    { path: '/dashboard', sel: '.tb-side .tb-plan, .tb-mbtn', t: 'Your plan', p: 'Shows your plan and whether it is active. Tap it to change plan or manage billing.' },
    { path: '/dashboard', sel: 'form[action="/accounts"]', t: 'Add your MT5 accounts', p: 'Type the account number here. Your EAs only run on accounts in this list.' },
    { path: '/dashboard', sel: '.ea-cards', t: 'Download your EAs', p: 'Each EA you own has its download here. Put the file in MT5 > File > Open data folder > MQL5 > Experts.', tip: 'Run the Journal EA on its own chart, next to KATANA. One EA per chart.' },
    { path: '/dashboard', sel: 'a[href*="/templates/"]', t: 'Chart themes', p: 'Our MT5 chart templates. Load one and your charts match the site.' },
    { need: 'j', path: '/journal/desk', sel: '.app-body h1', t: 'Desk', p: 'Your trading day on one screen: today so far, your rules, and the news that can move price.' },
    { need: 'j', path: '/journal', sel: '#cal, .cal-split', t: 'The calendar', p: 'Green and red days at a glance. Tap a day to open its trades.' },
    { need: 'j', path: '/journal', sel: '.accts', t: 'One tab per account', p: 'Each MT5 account has its own tab. Removed accounts keep their trades in the Removed tab.' },
    { need: 'j', path: '/journal', sel: '.priv-toggle', t: 'Hide private info', p: 'Masks account numbers, broker and your name, so you can screenshot and post safely.' },
    { need: 'j', path: '/journal', sel: '.cal-list a[href^="/journal/"], #cal a[href^="/journal/"]', t: 'Open a trade', p: 'Every trade has its own page: notes, the original stop, the real candles and share cards for your story.' },
    { need: 'j', path: '/journal/plan', sel: '.app-body form', t: 'Plan before you click', p: 'Entry, stop, target and why. Plans match the real trade within a few hours on the same symbol.' },
    { need: 'j', path: '/journal/insights', sel: '.ins-score, .app-body h1', t: 'Edge score', p: 'One number for how you trade, built from win rate, reward to risk, consistency and discipline.' },
    { need: 'j', path: '/journal/insights', sel: '.ins-grid', t: 'Leaks and fixes', p: 'What costs you the most, in money, with one fix for each.' },
    { need: 'j', path: '/journal/insights', sel: '.prop-form, .prop-rows', t: 'Prop firm guard', p: 'Enter your firm\'s daily and max loss once. We show how close you are and suggest a KATANA daily limit.' },
    { need: 'm', path: '/journal/mentor', sel: '.app-body h1', t: 'Mentor review', p: 'Share your journal with your mentor and ask about any trade. Replies show up here.' },
    { sel: '.tb-bar [data-tbp="a"], .tb-mbtn', t: 'Rewatch any time', p: 'This tour lives in the Account menu at the top. Pick Beginner or Advanced again whenever you like.' },
    { end: 1, t: 'That is everything', p: 'Start with one account and a few days of trades. Insights get sharper with every trade.' }
  ];
  var LIST = { beginner: BEGIN, advanced: ADV };
  var count = function (L) { return L.filter(ok).length; };
  function ok(s) { return !s.need || has[s.need]; }

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function save(choice) {
    if (DEMO) return;
    try { fetch('/api/tour', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choice: choice }) }); } catch (e) {}
  }
  function st(v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (v === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { return null; } }

  var scrim, hole, card, pick, cur;
  function clear() { [scrim, hole, card, pick].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); }); scrim = hole = card = pick = null; document.removeEventListener('keydown', keys); }

  // ---------- the question ----------
  function ask() {
    clear();
    scrim = el('div', 'tr-scrim', '<div class="tr-amb"><i></i><i></i><i></i></div>'); document.body.appendChild(scrim);
    var j = has.j;
    pick = el('div', 'tr-pick tr-glass');
    pick.setAttribute('role', 'dialog'); pick.setAttribute('aria-label', 'Choose a tour');
    pick.innerHTML = '<button class="tr-x" data-x aria-label="Close">×</button>' +
      '<div class="tr-k">Welcome to 5ABI.FX</div><h2>How should we <em>show you around?</em></h2>' +
      '<p class="tr-sub">Pick one. You can switch or watch it again any time from the Account menu.</p>' +
      '<div class="tr-opts">' +
      '<div class="tr-opt"><h3>Beginner</h3><div class="tr-n">' + count(BEGIN) + ' cards, the basics</div><ul>' +
        '<li>Get your EAs and add your MT5 account</li>' + (j ? '<li>Your journal and calendar</li><li>Plan a trade before you click</li><li>Insights in one line</li>' : '') + '<li>Where to get help</li></ul>' +
        '<button class="tr-pill" data-go="beginner">Start Beginner</button></div>' +
      '<div class="tr-opt adv"><h3>Advanced <small>Full</small></h3><div class="tr-n">' + count(ADV) + ' cards, every feature</div><ul>' +
        '<li>Everything in Beginner</li><li>Downloads and chart themes</li>' + (j ? '<li>Desk, account tabs, hide private info</li><li>Trade pages and share cards</li><li>Edge score, leaks, prop firm guard</li>' : '') + (has.m ? '<li>Mentor review</li>' : '') + '</ul>' +
        '<button class="tr-pill" data-go="advanced">Start Advanced</button></div>' +
      '</div><div class="tr-later"><span>Find this again: Account menu, Show me around.</span><button data-x>Not now</button></div>';
    document.body.appendChild(pick);
    requestAnimationFrame(function () { scrim.classList.add('in'); pick.classList.add('in'); });
    pick.addEventListener('click', function (e) {
      var g = e.target.closest('[data-go]'); if (g) { save(g.dataset.go); begin(g.dataset.go); return; }
      if (e.target.closest('[data-x]')) { save('skip'); clear(); }
    });
    document.addEventListener('keydown', keys);
  }

  // ---------- the cards ----------
  function begin(mode) { st({ m: mode, i: 0 }); show(); }
  function steps(mode) { return LIST[mode].filter(ok); }
  function find(sel) {
    if (!sel) return null;
    var all = document.querySelectorAll(sel);
    for (var i = 0; i < all.length; i++) { var r = all[i].getBoundingClientRect(); if (r.width > 0 && r.height > 0) return all[i]; }
    return null;
  }
  function show() {
    var s0 = st(); if (!s0 || !LIST[s0.m]) return;
    var L = steps(s0.m), i = Math.max(0, Math.min(s0.i, L.length - 1)), s = L[i];
    cur = { m: s0.m, i: i, n: L.length };
    // a step on another page: go there and pick up again on load
    if (!DEMO && s.path && location.pathname !== s.path) { location.href = s.path; return; }
    if (!scrim) { scrim = el('div', 'tr-scrim', '<div class="tr-amb"><i></i><i></i><i></i></div>'); document.body.appendChild(scrim); requestAnimationFrame(function () { scrim && scrim.classList.add('in'); }); }
    if (pick) { pick.parentNode.removeChild(pick); pick = null; }
    var target = find(s.sel);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    }
    if (!card) { card = el('div', 'tr-card tr-glass'); card.setAttribute('role', 'dialog'); document.body.appendChild(card); card.addEventListener('click', onCard); }
    card.classList.remove('in');
    var last = i === L.length - 1;
    card.innerHTML = '<button class="tr-x" data-a="stop" aria-label="Close tour">×</button>' +
      '<div class="tr-step"><b>' + (cur.m === 'beginner' ? 'Beginner' : 'Advanced') + '</b>' + (i + 1) + ' of ' + L.length + '</div>' +
      '<h3>' + s.t + '</h3><p>' + s.p + '</p>' + (s.tip ? '<div class="tr-tip">' + s.tip + '</div>' : '') +
      '<div class="tr-bar"><i style="width:' + Math.round(((i + 1) / L.length) * 100) + '%"></i></div>' +
      '<div class="tr-nav">' + (last ? '' : '<button class="tr-skip" data-a="stop">Skip tour</button>') +
      (i > 0 ? '<button class="tr-back" data-a="back">Back</button>' : (last ? '' : '')) +
      '<button class="tr-pill" data-a="' + (last ? 'stop' : 'next') + '">' + (last ? (cur.m === 'beginner' && !DEMO ? 'Done' : 'Finish') : (i === 0 ? 'Show me' : 'Next')) + ' →</button></div>' +
      (last && cur.m === 'beginner' ? '<div class="tr-later" style="margin-top:12px"><span>Want every feature?</span><button data-a="adv">Take the Advanced tour</button></div>' : '');
    place(target);
    setTimeout(function () { card && card.classList.add('in'); }, 60);
    document.removeEventListener('keydown', keys); document.addEventListener('keydown', keys);
  }
  function place(target) {
    if (!target) {
      if (hole) { hole.parentNode.removeChild(hole); hole = null; }
      scrim.classList.remove('clear'); card.classList.add('center'); card.style.left = card.style.top = ''; return;
    }
    scrim.classList.add('clear'); card.classList.remove('center');
    var r = target.getBoundingClientRect(), pad = 6;
    // headings: hug the words, centred (the element box has extra space under the text)
    if (/^H[1-3]$/.test(target.tagName)) {
      try {
        var rg = document.createRange(); rg.selectNodeContents(target); var t = rg.getBoundingClientRect();
        var fs = parseFloat(getComputedStyle(target).fontSize) || 20, mid = t.top + t.height / 2, h = fs * 1.1;
        r = { left: t.left, right: t.right, width: t.width, top: mid - h / 2, bottom: mid + h / 2, height: h }; pad = 10;
      } catch (e) {}
    }
    if (!hole) { hole = el('div', 'tr-hole'); document.body.appendChild(hole); }
    hole.style.left = (r.left - pad) + 'px'; hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px';
    if (innerWidth <= 760) return;   // phones: card sits at the bottom (CSS)
    var cw = card.offsetWidth || 360, ch = card.offsetHeight || 220, gap = 18, x, y;
    if (r.right + gap + cw < innerWidth - 16) { x = r.right + gap; y = r.top; }
    else if (r.left - gap - cw > 16) { x = r.left - gap - cw; y = r.top; }
    else { x = r.left; y = r.bottom + gap + ch < innerHeight - 16 ? r.bottom + gap : r.top - gap - ch; }
    card.style.left = Math.max(16, Math.min(x, innerWidth - cw - 16)) + 'px';
    card.style.top = Math.max(16, Math.min(y, innerHeight - ch - 16)) + 'px';
  }
  function go(d) { var s = st(); if (!s) return; s.i = Math.max(0, s.i + d); st(s); show(); }
  function stop() { st(null); clear(); }
  function onCard(e) {
    var a = e.target.closest('[data-a]'); if (!a) return;
    var k = a.dataset.a;
    if (k === 'next') go(1); else if (k === 'back') go(-1); else if (k === 'adv') { save('advanced'); begin('advanced'); } else stop();
  }
  function keys(e) {
    if (e.key === 'Escape') { if (pick) save('skip'); stop(); }
    else if (card && (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.target.closest('button,a,input,textarea,select')))) { if (cur && cur.i < cur.n - 1) go(1); }
    else if (card && e.key === 'ArrowLeft') go(-1);
  }
  addEventListener('resize', function () { if (card && cur) { var s = steps(cur.m)[cur.i]; place(find(s.sel)); } });

  window.Tour = { ask: ask, start: begin, stop: stop };
  document.addEventListener('click', function (e) { var t = e.target.closest('[data-tour-open]'); if (t) { e.preventDefault(); ask(); } });

  // wait for the welcome animation (public/intro.js) to finish first
  function later(f, ms) { setTimeout(function w() { if (document.querySelector('.intro, #inw')) setTimeout(w, 400); else f(); }, ms); }
  function boot() {
    if (st()) later(show, 250);              // carrying on after a page change
    else if (D.offer === '1') later(ask, 700);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
