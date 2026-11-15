// Feature usage: counts a tap on any button the owner tagged in src/features.js (the list arrives in window.__FT).
// Sends only the feature name; the server adds the member and the day. Custom code can call window.ft('key').
(function () {
  var map = window.__FT || [], last = {};
  function ft(key) {
    var t = Date.now();
    if (!key || t - (last[key] || 0) < 1500) return;
    last[key] = t;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/ft', new Blob([key], { type: 'text/plain' }));
      else fetch('/api/ft', { method: 'POST', body: key, keepalive: true, credentials: 'same-origin' });
    } catch (e) { /* never break the page */ }
  }
  function hit(e) {
    var el = e.target && e.target.closest ? e.target : e.target && e.target.parentElement;
    if (!el) return;
    for (var i = 0; i < map.length; i++) {
      try { if (el.closest(map[i][1])) ft(map[i][0]); } catch (x) { /* bad selector: skip */ }
    }
  }
  document.addEventListener('click', function (e) { if (!(e.target.matches && e.target.matches('select'))) hit(e); }, true);
  document.addEventListener('change', hit, true);
  window.ft = ft;
}());
