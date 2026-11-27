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
    function perNow() { return rows || (box.clientWidth < 700 ? 6 : 12); }
    var rows = 0; try { var sr = +localStorage.getItem('pcRows'); if ([12, 6, 2].indexOf(sr) >= 0) rows = sr; } catch (e) {}
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
      var q = Math.abs(v) / mx, a = q >= 0.6 ? 1 : q >= 0.3 ? 0.75 : q >= 0.1 ? 0.5 : 0.3;   // 4 clear steps each side
      // follows the member's own profit / loss colours (Appearance > Colours, or Accessibility)
      var cs = getComputedStyle(document.documentElement), okr = (cs.getPropertyValue('--ok-rgb') || '').trim() || '38,198,160', dnr = (cs.getPropertyValue('--danger-rgb') || '').trim() || '240,70,75';
      return v > 0 ? 'background:rgba(' + okr + ',' + a + ')' : v < 0 ? 'background:rgba(' + dnr + ',' + a + ')' : 'background:rgba(255,255,255,.14)';
    };
    var sum = function (a, b) { var t = 0, n = 0, g = 0, d = 0; for (var x = a; x < b; x += DAY) { var r = D[iso(x)]; if (r) { t += r[0]; n += r[1]; d++; if (r[0] > 0) g++; } } return { t: t, n: n, g: g, d: d }; };
    var monday = function (t) { return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY; };
    var tip = function (t) { var r = D[iso(t)]; return new Date(t).getUTCDate() + ' ' + MON[new Date(t).getUTCMonth()] + (r ? ': ' + money(r[0]) + ', ' + r[1] + ' trade' + (r[1] > 1 ? 's' : '') : ': no trades'); };

    function draw() {
      var d = new Date(at), y = d.getUTCFullYear(), mo = d.getUTCMonth(), a0, a1, label, body = '';
      if (view === 0) {   // one continuous strip of weeks (Mon-Fri rows); phones split it into two halves so squares stay big
        var per = perNow(), halves = [], strips = '', maxWk = 0;   // months per row: 12 = one straight strip
        a0 = Date.UTC(y, 0, 1); a1 = Date.UTC(y + 1, 0, 1); label = String(y);
        if (per === 6) {   // 6 mo: one half on screen, the date arrows slide to the other half
          var h6 = mo < 6 ? 0 : 6; halves = [[h6, h6 + 6]]; a0 = Date.UTC(y, h6, 1); a1 = Date.UTC(y, h6 + 6, 1); label = MON[h6] + '–' + MON[h6 + 5] + ' ' + y;
        } else for (var hs = 0; hs < 12; hs += per) halves.push([hs, hs + per]);
        halves.forEach(function (hv) {
          var h0 = Date.UTC(y, hv[0], 1), h1 = Date.UTC(y, hv[1], 1), cols = '', last = -1, nc = 0;
          for (var w = monday(h0); w < h1; w += 7 * DAY) {
            var cells = '', lab = '';
            for (var i = 0; i < 5; i++) {
              var t = w + i * DAY, inY = t >= h0 && t < h1, r = D[iso(t)];
              cells += inY ? '<i title="' + tip(t) + '"' + (r ? ' style="' + tint(r[0]) + '"' : iso(t) > today ? ' class="f"' : '') + (iso(t) === today ? ' data-now' : '') + '></i>' : '<i class="x"></i>';
              var m = new Date(t).getUTCMonth();
              if (inY && m !== last) { last = m; var SM = sum(Date.UTC(y, m, 1), Date.UTC(y, m + 1, 1)); lab = '<button type="button" data-m="' + m + '" title="Open ' + MON[m] + '">' + MON[m] + (SM.d ? ' <small class="' + cls(SM.t) + '">' + money(SM.t).replace(/\.\d+/, '') + '</small>' : '') + '</button>'; }
            }
            cols += '<div class="pc-wk' + (lab ? ' ms' : '') + '"><b>' + lab + '</b>' + cells + '</div>'; nc++;
          }
          strips += '<div class="pc-yr" style="--wk:@WK@">' + cols + '</div>'; maxWk = Math.max(maxWk, nc);
        });
        body = '<div class="pc-yrs n' + per + '">' + strips.replace(/@WK@/g, maxWk) + '</div><div class="pc-key"><span>Loss</span><i style="' + tint(-mx) + '"></i><i style="' + tint(-mx * 0.15) + '"></i><i></i><i style="' + tint(mx * 0.15) + '"></i><i style="' + tint(mx) + '"></i><span>Profit</span><span class="pc-kh">Tap a month to open it</span><span class="pc-rows" role="group" aria-label="Months per row">' + [12, 6, 2].map(function (n) { return '<button type="button" data-rows="' + n + '"' + (n === per ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + n + ' mo</button>'; }).join('') + '</span></div>';
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
      if (view === 0) at = perNow() === 6 ? Date.UTC(y, (m < 6 ? 0 : 6) + 6 * dir, 1) : Date.UTC(y + dir, m, dd);
      else if (view === 1) at = Date.UTC(y, m + 3 * dir, dd);
      else if (view === 2) at = Date.UTC(y, m + dir, dd);
      else if (view === 3) at += 7 * dir * DAY;
      else { do { at += dir * DAY; } while (!wd(at)); }
      while (!wd(at)) at += DAY;
    }
    box.addEventListener('click', function (e) {
      var rb = e.target.closest('[data-rows]');
      if (rb) { rows = +rb.dataset.rows; try { localStorage.setItem('pcRows', rows); } catch (x) {} draw(); return; }
      var ym = e.target.closest('[data-m]');
      if (ym) { at = Date.UTC(new Date(at).getUTCFullYear(), +ym.dataset.m, 1); while (!wd(at)) at += DAY; view = 2; draw(); return; }
      var b = e.target.closest('[data-v],[data-s]'); if (!b) return;
      if (b.dataset.v) { view = Math.max(0, Math.min(4, view + Number(b.dataset.v))); try { localStorage.setItem('pcView', view); } catch (x) {} }
      else step(Number(b.dataset.s));
      draw();
      if (b.dataset.s) { var fc = box.querySelector('.pc-body').firstElementChild; if (fc) fc.classList.add(+b.dataset.s > 0 ? 'sl-n' : 'sl-p'); }   // slide in from the side it came from
    });
    draw();
  });
})();
