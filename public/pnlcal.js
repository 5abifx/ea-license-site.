// Desk P&L calendar (owner picked the "arrows" design, 2026-11-22): one card that shows the whole year as day squares,
// and ‹ Year › flips to Quarter, Month, Week and Day (sessions); ‹ 2026 › moves back and forward in time.
// Data: data-days on .pc = { "YYYY-MM-DD": [net, trades, asia, london, newYork] } (broker close day, src/journal.js).
(function () {
  document.querySelectorAll('.pc:not([data-on])').forEach(function (box) {
    box.setAttribute('data-on', '1');
    var D = {}; try { D = JSON.parse(box.getAttribute('data-days') || '{}'); } catch (e) { return; }
    var cur = box.getAttribute('data-cur') || 'USD', today = box.getAttribute('data-today');
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    var VIEWS = ['Year', 'Quarter', 'Month', 'Week', 'Day'], DAY = 864e5;
    var view = 0, at = Date.parse(today + 'T00:00:00Z');
    try { var sv = +localStorage.getItem('pcView'); if (sv >= 0 && sv < 5) view = sv; } catch (e) {}
    if (!localStorageHas() && box.clientWidth < 560) view = 2;   // phones open on the month
    function localStorageHas() { try { return localStorage.getItem('pcView') != null; } catch (e) { return false; } }
    // the last trading day with data is a better "today" on weekends
    var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
    var wd = function (t) { var g = new Date(t).getUTCDay(); return g > 0 && g < 6; };
    while (!wd(at)) at -= DAY;
    var money = function (v) {
      var s = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
      return (v < 0 ? '−' : '+') + (cur === 'USD' ? '$' : '') + s + (cur !== 'USD' ? ' ' + cur : '');
    };
    var cls = function (v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; };
    var mx = 1; Object.keys(D).forEach(function (k) { mx = Math.max(mx, Math.abs(D[k][0])); });
    var tint = function (v) {   // stronger colour for bigger days, scaled to this member's own biggest day
      if (v == null) return '';
      var a = (0.28 + Math.min(1, Math.abs(v) / (mx * 0.6)) * 0.67).toFixed(2);
      return v > 0 ? 'background:rgba(38,198,160,' + a + ')' : v < 0 ? 'background:rgba(240,70,75,' + a + ')' : 'background:rgba(255,255,255,.14)';
    };
    var sum = function (a, b) { var t = 0, n = 0, g = 0, d = 0; for (var x = a; x < b; x += DAY) { var r = D[iso(x)]; if (r) { t += r[0]; n += r[1]; d++; if (r[0] > 0) g++; } } return { t: t, n: n, g: g, d: d }; };
    var monday = function (t) { return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY; };
    var tip = function (t) { var r = D[iso(t)]; return new Date(t).getUTCDate() + ' ' + MON[new Date(t).getUTCMonth()] + (r ? ': ' + money(r[0]) + ', ' + r[1] + ' trade' + (r[1] > 1 ? 's' : '') : ': no trades'); };

    function draw() {
      var d = new Date(at), y = d.getUTCFullYear(), mo = d.getUTCMonth(), a0, a1, label, body = '';
      if (view === 0) {
        a0 = Date.UTC(y, 0, 1); a1 = Date.UTC(y + 1, 0, 1); label = String(y);
        var cols = [], last = -1;
        for (var w = monday(a0); w < a1; w += 7 * DAY) {
          var cells = '', lab = '';
          for (var i = 0; i < 5; i++) {
            var t = w + i * DAY, inY = t >= a0 && t < a1, r = D[iso(t)];
            cells += '<i' + (inY ? ' title="' + tip(t) + '" style="' + tint(r ? r[0] : null) + '"' : ' class="x"') + (iso(t) === today ? ' data-now' : '') + '></i>';
            var m = new Date(t).getUTCMonth(); if (inY && m !== last && new Date(t).getUTCDate() <= 7) { last = m; lab = MON[m]; }
          }
          cols.push('<div class="pc-wk"><b>' + lab + '</b>' + cells + '</div>');
        }
        body = '<div class="pc-yr">' + cols.join('') + '</div><div class="pc-key"><span>Loss</span><i style="background:rgba(240,70,75,.9)"></i><i style="background:rgba(240,70,75,.35)"></i><i></i><i style="background:rgba(38,198,160,.35)"></i><i style="background:rgba(38,198,160,.9)"></i><span>Profit</span></div>';
      } else if (view === 1 || view === 2) {
        var n = view === 1 ? 3 : 1, m0 = view === 1 ? Math.floor(mo / 3) * 3 : mo;
        a0 = Date.UTC(y, m0, 1); a1 = Date.UTC(y, m0 + n, 1); label = view === 1 ? 'Q' + (m0 / 3 + 1) + ' ' + y : MON[mo] + ' ' + y;
        for (var k = 0; k < n; k++) {
          var ms = Date.UTC(y, m0 + k, 1), me = Date.UTC(y, m0 + k + 1, 1), S = sum(ms, me), lead = (new Date(ms).getUTCDay() + 6) % 7, g = '';
          if (lead < 5) for (var p = 0; p < lead; p++) g += '<span class="x"></span>';
          for (var t2 = ms; t2 < me; t2 += DAY) {
            if (!wd(t2)) continue;
            var r2 = D[iso(t2)];
            g += view === 1 ? '<span title="' + tip(t2) + '" style="' + tint(r2 ? r2[0] : null) + '"' + (iso(t2) === today ? ' data-now' : '') + '>' + new Date(t2).getUTCDate() + '</span>'
              : '<span class="' + (r2 ? (r2[0] >= 0 ? 'g' : 'r') : '') + '"' + (iso(t2) === today ? ' data-now' : '') + '><small>' + new Date(t2).getUTCDate() + '</small>' + (r2 ? '<b class="' + cls(r2[0]) + '">' + money(r2[0]) + '</b><em>' + r2[1] + ' trade' + (r2[1] > 1 ? 's' : '') + '</em>' : '') + '</span>';
          }
          body += '<div class="pc-mo">' + (view === 1 ? '<div class="pc-mh"><b>' + MON[m0 + k] + '</b><b class="' + cls(S.t) + '">' + (S.d ? money(S.t) : '–') + '</b></div>' : '<div class="pc-dw">' + DOW.map(function (x) { return '<small>' + x + '</small>'; }).join('') + '</div>')
            + '<div class="pc-g' + (view === 2 ? ' big' : '') + '">' + g + '</div></div>';
        }
        body = '<div class="pc-mos n' + n + '">' + body + '</div>';
      } else if (view === 3) {
        a0 = monday(at); a1 = a0 + 7 * DAY; label = 'Week of ' + new Date(a0).getUTCDate() + ' ' + MON[new Date(a0).getUTCMonth()];
        var wm = 1; for (var q = 0; q < 5; q++) { var rq = D[iso(a0 + q * DAY)]; if (rq) wm = Math.max(wm, Math.abs(rq[0])); }
        for (var j = 0; j < 5; j++) {
          var tj = a0 + j * DAY, rj = D[iso(tj)];
          body += '<div class="pc-bar"><b class="' + (rj ? cls(rj[0]) : '') + '">' + (rj ? money(rj[0]) : 'No trades') + '</b><i class="' + (rj ? (rj[0] >= 0 ? 'g' : 'r') : '') + '" style="height:' + (rj ? Math.max(6, Math.round(Math.abs(rj[0]) / wm * 100)) : 4) + '%"></i><small' + (iso(tj) === today ? ' class="on"' : '') + '>' + DOW[j] + ' ' + new Date(tj).getUTCDate() + '</small></div>';
        }
        body = '<div class="pc-week">' + body + '</div>';
      } else {
        a0 = at; a1 = at + DAY; label = DOW[(d.getUTCDay() + 6) % 7] + ' ' + d.getUTCDate() + ' ' + MON[mo];
        var rd = D[iso(at)], names = ['Asia', 'London', 'New York'], sm = 1;
        if (rd) for (var s = 2; s < 5; s++) sm = Math.max(sm, Math.abs(rd[s]));
        body = '<div class="pc-day">' + names.map(function (nm, i) {
          var v = rd ? rd[i + 2] : 0;
          return '<div class="pc-ses"><span>' + nm + '</span><div class="pc-tr"><i class="' + (v >= 0 ? 'g' : 'r') + '" style="width:' + (rd && v ? Math.max(3, Math.round(Math.abs(v) / sm * 100)) : 0) + '%"></i></div><b class="' + cls(v) + '">' + (rd && v ? money(v) : '–') + '</b></div>';
        }).join('') + (rd ? '' : '<p class="pc-none">No trades this day.</p>') + '</div>';
      }
      var T = sum(a0, a1);
      box.querySelector('.pc-body').innerHTML = body;
      box.querySelector('.pc-lbl').textContent = 'P&L · ' + label;
      box.querySelector('.pc-tot').className = 'pc-tot ' + cls(T.t);
      box.querySelector('.pc-tot').textContent = T.d ? money(T.t) : '–';
      box.querySelector('.pc-sub').textContent = T.d ? T.g + ' of ' + T.d + ' days green · ' + T.n + ' trades' : 'No trades';
      box.querySelector('.pc-vn').textContent = VIEWS[view];
      box.querySelector('.pc-dn').textContent = label;
      box.querySelector('[data-v="-1"]').disabled = view === 0; box.querySelector('[data-v="1"]').disabled = view === 4;
    }
    function step(dir) {
      var d = new Date(at), y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = Math.min(28, d.getUTCDate());
      if (view === 0) at = Date.UTC(y + dir, m, dd);
      else if (view === 1) at = Date.UTC(y, m + 3 * dir, dd);
      else if (view === 2) at = Date.UTC(y, m + dir, dd);
      else if (view === 3) at += 7 * dir * DAY;
      else { do { at += dir * DAY; } while (!wd(at)); }
      while (!wd(at)) at += DAY;
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v],[data-s]'); if (!b) return;
      if (b.dataset.v) { view = Math.max(0, Math.min(4, view + Number(b.dataset.v))); try { localStorage.setItem('pcView', view); } catch (x) {} }
      else step(Number(b.dataset.s));
      draw();
    });
    draw();
  });
})();
