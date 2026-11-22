// App-style page switching for the members area: a click on a members link fetches the next page and swaps only
// the middle (.app-main). The top bar, side columns, background and phone dock stay on screen, so nothing blinks.
// Loaded in <head> (before any page script) on signed-in pages only (src/views.js).
// Anything unusual (a public page, a download, an error, a new deploy, no fetch support) falls back to a normal load.
//
// Page scripts run again after each swap. So an old page can't keep working in the background, everything a page
// script starts is tied to its page and stopped on leave: window/document/body listeners, timers, intervals,
// animation frames, and boxes it appended to <body>. Libraries that must load only once (top-level const/let/class)
// come from window.__SWAP_ONCE. Page code can listen for 'swap:leave' / 'swap:load' on window.
(function () {
  if (!window.fetch || !window.DOMParser || !history.pushState || !window.Promise) return;
  var W = window, D = document;

  // ---------- page ownership (runs before any page script) ----------
  var GEN = 0;          // current page generation (bumped on every swap)
  var ctx = null;       // generation of the page callback running right now (null = shell code)
  var owned = [];       // what the current page started: { ev: [target, type, fn, opts] } | { iv: id } | { node }
  function pageScript(s) { return !!s && (s.__swap === true || (s.closest && !!s.closest('.app-main'))); }
  function owner() {
    if (ctx !== null) return ctx;
    return pageScript(D.currentScript) ? GEN : null;
  }
  function tie(fn, g) {
    if (typeof fn !== 'function') return fn;
    return function () {
      if (g !== GEN) return;   // the page that made it is gone
      var p = ctx; ctx = g;
      try { return fn.apply(this, arguments); } finally { ctx = p; }
    };
  }
  var nST = W.setTimeout, nSI = W.setInterval, nCI = W.clearInterval, nRAF = W.requestAnimationFrame;
  W.setTimeout = function (fn) {
    var g = owner(), a = [].slice.call(arguments);
    if (g !== null) a[0] = tie(fn, g);
    return nST.apply(W, a);
  };
  W.setInterval = function (fn) {
    var g = owner(), a = [].slice.call(arguments);
    if (g === null) return nSI.apply(W, a);
    a[0] = tie(fn, g);
    var id = nSI.apply(W, a); owned.push({ iv: id }); return id;
  };
  if (nRAF) W.requestAnimationFrame = function (fn) { var g = owner(); return nRAF.call(W, g === null ? fn : tie(fn, g)); };
  // listeners on things that outlive a page (window, document, <html>, <body>)
  function patchAdd(proto, keep) {
    var add = proto.addEventListener;
    if (!add) return;
    proto.addEventListener = function (type, fn, opts) {
      if (owner() !== null && keep(this)) owned.push({ ev: [this, type, fn, opts] });
      return add.call(this, type, fn, opts);
    };
  }
  var lasting = function (t) { return t === W || t === D || t === D.documentElement || t === D.body; };
  patchAdd(W, lasting);
  patchAdd(Document.prototype, lasting);
  patchAdd(Element.prototype, lasting);
  // pop-ups a page script adds straight to <body>
  ['appendChild', 'insertBefore', 'append', 'prepend'].forEach(function (k) {
    var B = W.HTMLBodyElement && HTMLBodyElement.prototype, f = B && (B[k] || Element.prototype[k] || Node.prototype[k]);
    if (!f) return;
    B[k] = function (n) {
      if (owner() !== null) [].forEach.call(arguments, function (x) { if (x && x.nodeType === 1) owned.push({ node: x }); });
      return f.apply(this, arguments);
    };
  });
  function leave() {
    try { W.dispatchEvent(new CustomEvent('swap:leave')); } catch (e) { /* ignore */ }
    owned.forEach(function (o) {
      try {
        if (o.ev) o.ev[0].removeEventListener(o.ev[1], o.ev[2], o.ev[3]);
        else if (o.iv) nCI.call(W, o.iv);
        else if (o.node && o.node.parentNode === D.body) o.node.remove();
      } catch (e) { /* ignore */ }
    });
    owned = []; GEN++;
    if (!D.querySelector('.intro')) D.documentElement.classList.remove('intro-on');
  }

  // ---------- navigation ----------
  var ONCE = {};
  (W.__SWAP_ONCE || []).forEach(function (p) { ONCE[p] = 1; });
  var ran = {};   // external scripts already run once (path without ?v)
  var path = function (u) { try { return new URL(u, location.href).pathname; } catch (e) { return u; } };
  var ver = function (d) { var s = d.querySelector('script[src*="/swap.js"]'); return s ? (s.getAttribute('src').split('?')[1] || '') : ''; };
  var MY_VER = '';
  var count = 0, busy = null, pre = {}, shown = location.pathname + location.search;
  var SKIP = /^\/(api|auth|download|logout|vendor|templates|app\/|admin\/backup)|\.[a-z0-9]{2,5}$/i;

  function eligible(a, e) {
    if (!a || !a.href || a.hasAttribute('download') || a.hasAttribute('data-no-swap')) return null;
    if (a.target && a.target !== '_self') return null;
    if (e && (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return null;
    var u; try { u = new URL(a.href, location.href); } catch (x) { return null; }
    if (u.origin !== location.origin || u.pathname === '/' || SKIP.test(u.pathname)) return null;
    if (u.hash && u.pathname === location.pathname && u.search === location.search) return null;   // same-page jump
    if (a.getAttribute('href').charAt(0) === '#') return null;
    return u;
  }
  function get(url) {
    var k = url.href.split('#')[0], hit = pre[k];
    delete pre[k];
    if (hit && Date.now() - hit.t < 8000) return hit.p;
    return fetch(k, { credentials: 'same-origin', headers: { 'X-Swap': '1' } });
  }

  function bar(on) {
    var b = D.getElementById('swap-bar');
    if (!b) {
      b = D.createElement('i'); b.id = 'swap-bar';
      Node.prototype.appendChild.call(D.body, b);
      var st = D.createElement('style');
      st.textContent = '#swap-bar{position:fixed;left:0;top:0;height:2px;width:100%;z-index:2147483000;pointer-events:none;'
        + 'background:linear-gradient(90deg,transparent,#ff5a1f 40%,#ffb38f);transform:scaleX(0);transform-origin:0 50%;opacity:0;'
        + 'transition:transform 1.6s cubic-bezier(.1,.7,.2,1),opacity .25s}'
        + '#swap-bar.on{opacity:1;transform:scaleX(.8)}#swap-bar.done{opacity:0;transform:scaleX(1);transition:transform .2s,opacity .35s .15s}'
        + '.app-main.swap-out{opacity:.55;transition:opacity .15s}'
        + '.app-main.swap-in{animation:swapIn .28s cubic-bezier(.2,.7,.2,1)}'
        + '.app-main h1[tabindex="-1"]:focus{outline:none}'
        + '@keyframes swapIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}';
      D.head.appendChild(st);
      void b.offsetWidth;
    }
    b.className = on ? 'on' : 'done';
  }

  function loadCss(href) {
    return new Promise(function (res) {
      var l = D.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-swap-css', '');
      l.onload = l.onerror = res; nST.call(W, res, 2500);
      D.head.appendChild(l);
    });
  }
  // scripts made by DOMParser never run: make a fresh copy of each, in order, waiting for each file
  function runScripts(nodes, page) {
    return nodes.reduce(function (chain, old) {
      return chain.then(function () {
        if (!old.parentNode) return;
        var src = old.getAttribute('src'), type = (old.getAttribute('type') || '').trim();
        if (type && !/(java|ecma)script|^module$/i.test(type)) return;   // JSON data blocks etc. stay as they are
        if (src) {
          var p = path(src);
          if (/^https?:/i.test(src) && new URL(src, location.href).origin !== location.origin && ran[src]) { old.remove(); return; }
          if ((ONCE[p] || /^\/vendor\//.test(p)) && ran[p]) { old.remove(); return; }
          ran[p] = 1;
        }
        var s = D.createElement('script');
        for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
        s.removeAttribute('defer'); s.removeAttribute('async');
        if (page || /\/ignite\.js$/.test(path(src || ''))) s.__swap = true;
        // top-level copies (shell scripts) are dropped once run, so <body> doesn't fill up with them
        var tidy = function () { if (!page) s.remove(); };
        if (!src) { s.textContent = old.textContent; old.replaceWith(s); tidy(); return; }
        return new Promise(function (res) { s.async = false; s.onload = s.onerror = function () { tidy(); res(); }; old.replaceWith(s); });
      });
    }, Promise.resolve());
  }

  function swapTo(url, push, y) {
    if (busy) busy.abort = true;
    var me = busy = { abort: false };
    var main = D.querySelector('.app-main');
    if (!main) { location.assign(url.href); return; }
    var full = function () { location.assign(url.href); };
    bar(true); main.classList.add('swap-out');
    get(url).then(function (r) {
      var type = r.headers.get('content-type') || '';
      if (!/text\/html/.test(type) || (r.status >= 400 && r.status !== 404)) throw new Error('not a page');
      var final = new URL(r.url || url.href);
      if (final.origin !== location.origin) throw new Error('left the site');
      return r.text().then(function (html) { return { html: html, final: final }; });
    }).then(function (x) {
      if (me.abort) return;
      var doc = new DOMParser().parseFromString(x.html, 'text/html');
      var nMain = doc.querySelector('.app-main'), nTb = doc.getElementById('tb'), tb = D.getElementById('tb');
      // not a members page, or a new deploy (new script versions): load it the normal way
      if (!nMain || !nTb || !tb || ver(doc) !== MY_VER) throw new Error('full load');
      var finalUrl = x.final.href + (url.hash && !x.final.hash ? url.hash : '');
      // styles first, so the new page never shows unstyled
      var have = {};
      D.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) { have[path(l.href)] = l; });
      var need = [], keepCss = {};
      [].forEach.call(doc.querySelectorAll('head link[rel="stylesheet"], .app-main link[rel="stylesheet"]'), function (l) {
        var h = l.getAttribute('href'), p = path(h);
        keepCss[p] = 1;
        if (l.closest('.app-main')) l.remove();
        if (!have[p]) need.push(loadCss(h));
      });
      return Promise.all(need).then(function () {
        if (me.abort) return;
        if (push) {
          try { history.replaceState(Object.assign({}, history.state, { swap: 1, y: W.scrollY }), ''); } catch (e) { /* ignore */ }
          history.pushState({ swap: 1, y: 0 }, '', finalUrl);
        } else if (x.final.href !== location.href.split('#')[0]) history.replaceState({ swap: 1, y: y || 0 }, '', finalUrl);
        leave();
        // page styles of the old page that the new one doesn't use
        D.querySelectorAll('link[data-swap-css]').forEach(function (l) { if (!keepCss[path(l.href)]) l.remove(); });
        D.title = doc.title;
        shown = location.pathname + location.search;
        // top bar: swap the parts that changed (active page, counts); the side columns ([data-sc]) stay as they are
        tb.classList.remove('open');
        [].forEach.call(nTb.children, function (n) {
          if (n.hasAttribute('data-sc')) return;
          var cls = (n.className || '').split(' ')[0], old = cls && tb.querySelector(':scope > .' + cls.replace(/[^\w-]/g, '') + (n.id ? '#' + n.id : ''));
          if (old && !old.hasAttribute('data-sc') && old.outerHTML !== n.outerHTML) old.replaceWith(D.importNode(n, true));
          if (old) old.classList.remove('open');
        });
        // the middle
        var fresh = D.importNode(nMain, true);
        fresh.classList.add('swap-in');
        main.replaceWith(fresh);
        nST.call(W, function () { fresh.classList.remove('swap-in'); }, 400);
        if (push) {
          if (url.hash) { var t = D.getElementById(decodeURIComponent(url.hash.slice(1))); if (t) t.scrollIntoView(); else W.scrollTo(0, 0); }
          else W.scrollTo(0, 0);
        } else W.scrollTo(0, y || 0);
        // shell scripts the new page has but this one doesn't (tour, what's new...), then the page's own scripts
        var seenInline = {};
        D.querySelectorAll('body > script:not([src])').forEach(function (s) { seenInline[s.textContent] = 1; });
        var shell = [];
        [].forEach.call(doc.querySelectorAll('body > script'), function (s) {
          var src = s.getAttribute('src');
          if (src ? (ran[path(src)] && !/\/ignite\.js$/.test(path(src))) : seenInline[s.textContent]) return;
          if (src && /\/ignite\.js$/.test(path(src))) { delete ran[path(src)]; }
          var c = D.importNode(s, true); Node.prototype.appendChild.call(D.body, c); shell.push(c);
        });
        var pageScripts = [].slice.call(fresh.querySelectorAll('script'));
        return runScripts(pageScripts, true).then(function () { return runScripts(shell, false); }).then(function () {
          // a script that waits for DOMContentLoaded/load without checking readyState gets its event again
          try { W.dispatchEvent(new CustomEvent('swap:load', { detail: { url: finalUrl } })); } catch (e) { /* ignore */ }
          if (me === busy) { busy = null; bar(false); }
          // keyboard and screen reader users land on the new content
          var h = fresh.querySelector('h1'); if (h && !h.hasAttribute('tabindex')) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
        });
      });
    }).catch(function () { if (!me.abort) full(); });
  }

  function start() {
    if (!D.querySelector('.tb-app .app-main')) return;
    MY_VER = ver(D);
    D.querySelectorAll('script[src]').forEach(function (s) { ran[path(s.getAttribute('src'))] = 1; var a = s.getAttribute('src'); if (/^https?:/i.test(a)) ran[a] = 1; });
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    try { history.replaceState(Object.assign({}, history.state, { swap: 1, y: W.scrollY }), ''); } catch (e) { /* ignore */ }
    D.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      var u = eligible(a, e);
      if (!u) return;
      // after many switches, a normal load clears anything an old page left behind
      if (++count > 30) return;
      e.preventDefault();
      swapTo(u, true);
    });
    // start loading on press, before the click lands (saves ~100 ms on phones). Never on hover: some pages mark things read.
    var early = function (e) {
      var a = e.target.closest && e.target.closest('a[href]'), u = eligible(a, null);
      if (!u || e.button > 0) return;
      var k = u.href.split('#')[0];
      if (!pre[k]) pre[k] = { t: Date.now(), p: fetch(k, { credentials: 'same-origin', headers: { 'X-Swap': '1' } }) };
    };
    D.addEventListener('pointerdown', early, { passive: true });
    // GET forms (filters) swap too
    D.addEventListener('submit', function (e) {
      var f = e.target;
      if (e.defaultPrevented || (f.method || 'get').toLowerCase() !== 'get' || (f.target && f.target !== '_self') || f.hasAttribute('data-no-swap')) return;
      var u; try { u = new URL(f.getAttribute('action') || location.pathname, location.href); } catch (x) { return; }
      if (u.origin !== location.origin || u.pathname === '/' || SKIP.test(u.pathname) || ++count > 30) return;
      var q = new URLSearchParams(new FormData(f, e.submitter || undefined));
      u.search = q.toString();
      e.preventDefault();
      swapTo(u, true);
    });
    addEventListener('popstate', function (e) {
      var here = location.pathname + location.search;
      if (here === shown) return;   // only the #part changed
      swapTo(new URL(location.href), false, e.state && e.state.y);
    });
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
