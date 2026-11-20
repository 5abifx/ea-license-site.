// Edge cards on wide PC screens: touch the left or right screen edge with the mouse and a card slides in.
(function () {
  var L = document.querySelector('.edge-l'), R = document.querySelector('.edge-r');
  if (!L || !matchMedia('(min-width: 1800px) and (pointer: fine)').matches) return;
  var SES = [['Sydney', 'Australia/Sydney', 7, 16], ['Tokyo', 'Asia/Tokyo', 9, 18], ['London', 'Europe/London', 8, 17], ['New York', 'America/New_York', 8, 17]];
  function clock() {
    var box = R.querySelector('.edge-ses'); if (!box) return;
    box.innerHTML = SES.map(function (s) {
      var d = new Date(new Date().toLocaleString('en-US', { timeZone: s[1] })), h = d.getHours() + d.getMinutes() / 60, wd = d.getDay();
      var on = wd > 0 && wd < 6 && h >= s[2] && h < s[3];
      return '<div class="' + (on ? 'on' : '') + '"><span><i></i>' + s[0] + '</span><small>' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + (on ? ' open' : '') + '</small></div>';
    }).join('');
  }
  clock(); setInterval(clock, 30000);
  // open when the pointer touches an edge, close once it moves well away from the card
  addEventListener('pointermove', function (e) {
    var x = e.clientX, w = innerWidth;
    if (x <= 6) { R.classList.remove('open'); L.classList.add('open'); }
    else if (x >= w - 7) { L.classList.remove('open'); R.classList.add('open'); }
    if (x > 280) L.classList.remove('open');
    if (x < w - 280) R.classList.remove('open');
  }, { passive: true });
})();
