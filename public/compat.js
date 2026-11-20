// Older iPads/iPhones (Safari 14.0 and earlier) ignore flex `gap` and `aspect-ratio`, so links run together and
// boxes collapse. This adds both back with margins/heights, only on those browsers. Modern browsers return at once.
(function () {
  var root = document.documentElement;
  function hasFlexGap() {
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    d.appendChild(document.createElement('div')); d.appendChild(document.createElement('div'));
    root.appendChild(d); var ok = d.scrollHeight === 1; root.removeChild(d); return ok;
  }
  var noGap = !hasFlexGap();
  var noAR = !(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1 / 1'));
  if (!noGap && !noAR) return;
  root.className += ' old-safari';
  var AR = [['.gauge', 1], ['.ring', 1], ['.tm-gauge', 1], ['.ov-heat i', 1], ['.ov-heat a', 1], ['.jg i', 1.5], ['.jc-grid span', 1.5],
    ['.hw i', 1.3], ['.win-body', 1.6], ['.win.phone .win-body', 540 / 1170], ['.phc', 9 / 16], ['.sc', 9 / 16], ['.pf-card', 9 / 16],
    ['.so-tile', 3 / 4], ['.ap-tile .th', 1.6]];
  var px = function (v) { return parseFloat(v) || 0; };
  function gaps() {
    var all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i], cs = getComputedStyle(el);
      if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
      var cg = px(cs.columnGap), rg = px(cs.rowGap); if (!cg && !rg) continue;
      var col = cs.flexDirection.indexOf('column') === 0, wrap = cs.flexWrap !== 'nowrap', first = true;
      for (var k = el.firstElementChild; k; k = k.nextElementSibling) {
        var ks = getComputedStyle(k);
        if (ks.display === 'none' || ks.position === 'absolute' || ks.position === 'fixed') continue;
        if (col) { if (!first && rg) k.style.marginTop = rg + 'px'; }
        else {
          if (!first && cg && ks.marginLeft === '0px') k.style.marginLeft = cg + 'px';
          if (wrap && rg) k.style.marginBottom = rg + 'px';
        }
        first = false;
      }
    }
  }
  function ratios() {
    AR.forEach(function (a) {
      var els = document.querySelectorAll(a[0]);
      for (var i = 0; i < els.length; i++) { var w = els[i].getBoundingClientRect().width; if (w) els[i].style.height = (w / a[1]) + 'px'; }
    });
  }
  var t = 0;
  function run() { clearTimeout(t); t = setTimeout(function () { if (noGap) gaps(); if (noAR) ratios(); }, 120); }
  document.addEventListener('DOMContentLoaded', function () {
    run(); addEventListener('load', run); addEventListener('resize', run);
    if (window.MutationObserver) new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  });
})();
