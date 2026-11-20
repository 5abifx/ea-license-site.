// Desk overview: tap a day pill to move the glowing point and the tooltip on the month P&L chart.
(function () {
  document.querySelectorAll('[data-ov-chart]').forEach(function (box) {
    var data; try { data = JSON.parse(box.querySelector('[data-ov-tips]').textContent); } catch (e) { return; }
    var svg = box.querySelector('svg'), W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height;
    var dot = box.querySelector('[data-dot]'), halo = box.querySelector('[data-halo]'), drop = box.querySelector('[data-drop]'), tip = box.querySelector('[data-tip]');
    function show(d) {
      var p = data[d]; if (!p) return;
      [dot, halo].forEach(function (c) { c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); });
      drop.setAttribute('x1', p.x); drop.setAttribute('x2', p.x); drop.setAttribute('y1', p.y);
      tip.style.left = (p.x / W * 100) + '%'; tip.style.top = (p.y / H * 100) + '%';
      tip.innerHTML = '<small>' + p.date + '</small><b>' + p.v + '</b><small>' + p.dn + (p.r ? ' · ' + p.r : '') + '</small>';
      box.querySelectorAll('.ov-days button').forEach(function (b) { b.classList.toggle('on', +b.dataset.d === d); });
    }
    box.querySelectorAll('.ov-days button').forEach(function (b) { b.addEventListener('click', function () { show(+b.dataset.d); }); });
    // keep the picked pill in view on phones
    var on = box.querySelector('.ov-days .on'); if (on && on.scrollIntoView) { var row = on.parentNode; row.scrollLeft = on.offsetLeft - row.clientWidth / 2; }
  });
})();
