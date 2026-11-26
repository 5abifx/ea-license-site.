// My EAs page: setup steps (one panel at a time), "I did this" ticks, copy buttons
(function () {
  var box = document.querySelector('[data-setup]');
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  if (box) {
    var tabs = [].slice.call(box.querySelectorAll('[data-step]'));
    // ticked by hand earlier (only steps the site cannot see)
    tabs.forEach(function (t) { if (t.hasAttribute('data-manual') && store.get('mx-did-' + t.dataset.step) === '1' && !t.classList.contains('done')) { t.classList.add('done'); t.querySelector('i').textContent = '✓'; } });
    var show = function (key, anim) {
      tabs.forEach(function (t) { var on = t.dataset.step === key; t.classList.toggle('cur', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
      box.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== key; if (!p.hidden && anim) { p.classList.remove('in'); void p.offsetWidth; p.classList.add('in'); } });
    };
    var next = function () { var t = tabs.filter(function (x) { return !x.classList.contains('done'); })[0] || tabs[0]; return t.dataset.step; };
    tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.dataset.step, true); }); });
    box.querySelectorAll('[data-did]').forEach(function (b) { b.addEventListener('click', function () {
      var k = b.dataset.did, t = tabs.filter(function (x) { return x.dataset.step === k; })[0];
      store.set('mx-did-' + k, '1'); if (t) { t.classList.add('done'); t.querySelector('i').textContent = '✓'; }
      show(next(), true); }); });
    show(next(), false);
    var open = document.querySelector('[data-open-setup]');
    if (open) open.addEventListener('click', function () { box.hidden = !box.hidden; });
  }
  // platform tabs (MT5 / NinjaTrader 8 / Quantower): remembered on this browser unless the link names one
  var pf = document.querySelector('[data-pf]');
  if (pf) {
    var ptabs = [].slice.call(pf.querySelectorAll('[data-pf-tab]'));
    var pick = function (k, save) {
      ptabs.forEach(function (t) { var on = t.dataset.pfTab === k; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
      pf.querySelectorAll('[data-pf-panel]').forEach(function (p) { p.hidden = p.dataset.pfPanel !== k; });
      pf.dataset.pf = k; if (save) store.set('mx-pf', k);
    };
    ptabs.forEach(function (t) { t.addEventListener('click', function () { pick(t.dataset.pfTab, true); }); });
    var saved = store.get('mx-pf');
    if (!/[?&]p=/.test(location.search) && saved && pf.querySelector('[data-pf-tab="' + saved + '"]')) pick(saved, false);
  }
  document.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () {
    var t = b.dataset.copy, done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {}); }); });
})();
