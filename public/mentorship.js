// Mentorship page: mystery discount pop-up (once per browser, signed-out visitors only) and the live countdown to the real end date
(function () {
  var bar = document.querySelector('.promo-bar');
  var pop = document.getElementById('mystery');
  if (bar) {
    var ends = new Date(bar.getAttribute('data-ends'));
    var tick = function () {
      var s = Math.max(0, Math.floor((ends - Date.now()) / 1000));
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var t = s ? 'ends in ' + (d ? d + 'd ' : '') + pad(h) + 'h ' + pad(m) + 'm ' + pad(x) + 's' : 'ended';
      document.querySelectorAll('[data-countdown]').forEach(function (el) { el.textContent = t; });
    };
    tick(); setInterval(tick, 1000);
  }
  if (pop) {
    var seen = false;
    try { seen = localStorage.getItem('mystery-seen') === '1'; } catch (e) { /* storage blocked */ }
    var open = function () { pop.hidden = false; try { localStorage.setItem('mystery-seen', '1'); } catch (e) { /* ignore */ } };
    var close = function () { pop.hidden = true; };
    if (!seen) setTimeout(open, 1200);
    pop.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }
})();
