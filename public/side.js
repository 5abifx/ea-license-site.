// Side columns on PC (styles: public/side.css, data: GET /api/side, saves: POST /api/focus, POST /api/feature).
// Left: Focus (this week's fixes ticked each day, goals, notes, Activity-style rings) + market sessions on a globe.
// Right: a quote, the last session, "Watch out today" (repeat mistakes from Insights) and the 3D garage.
// PC screens >= 1600px keep both columns fixed on screen (the middle narrows to make room); smaller ones slide them in.
(function () {
  // version tag of this script (?v=build), passed on to the 3D garage so a new build never plays an old copy
  var sc0 = document.currentScript, VER = sc0 && sc0.src.indexOf('?') > -1 ? sc0.src.slice(sc0.src.indexOf('?')) : '';
  if (!matchMedia('(min-width: 1200px) and (pointer: fine)').matches) return;
  // while the page is scrolling the slow globe / garage spins pause, so the scroll itself stays smooth
  window.__scBusy = 0;
  ['scroll', 'wheel'].forEach(function (ev) { addEventListener(ev, function () { window.__scBusy = performance.now(); }, { passive: true, capture: true }); });
  var calm = function (now) { return now - window.__scBusy > 300; };
  var root = document.documentElement, host = document.querySelector('[data-sc]');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var wide = matchMedia('(min-width: 1280px)');   // owner: the side cards always stay on screen on a PC (was 2360px, then 1600px)
  // Appearance > Layout: 'pin' keeps the cards on screen, 'slide' gives the middle the full width and the cards slide in
  var sidePref = (window.__LOOK && window.__LOOK.side) || 'pin';
  // the middle column's own width drives the page layout (public/fit.css): mid-m < 1180px, mid-s < 900px
  function fit() {
    var b = document.querySelector('.app-main > .app-body'), w = b ? b.getBoundingClientRect().width : innerWidth;
    root.classList.toggle('mid-m', w > 0 && w < 1180); root.classList.toggle('mid-s', w > 0 && w < 900);
  }
  function mode() { root.classList.toggle('sc-wide', wide.matches && sidePref !== 'slide'); fit(); }
  mode(); wide.addEventListener && wide.addEventListener('change', mode);
  addEventListener('look:side', function (e) { sidePref = e.detail; mode(); });
  var fitT = 0; addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(fit, 80); });
  addEventListener('swap:load', fit);

  // ---------- request a feature (every members page) ----------
  var supList = document.querySelector('#sup-panel .sup-list');
  if (supList) {   // the help panel is on: "Request a feature" is one of its rows, no separate + button
    var rq = el('button', 'sup-req', '<span class="sup-ic">+</span><span><b>Request a feature</b><small>What would make your journal better?</small></span>'); rq.type = 'button';
    supList.appendChild(rq);
    rq.addEventListener('click', function (e) {
      e.stopPropagation();
      var f = el('div', 'sup-form', '<textarea maxlength="1000" placeholder="I wish I could…"></textarea><button type="button" class="sup-send">Send</button>');
      supList.replaceChild(f, rq);
      var ta = f.querySelector('textarea'), b = f.querySelector('button'); ta.focus();
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (ta.value.trim().length < 3) { ta.focus(); return; }
        b.disabled = true; b.textContent = 'Sending…';
        fetch('/api/feature', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: ta.value, page: location.pathname }) })
          .then(function (r) { return r.json(); }).then(function (j) {
            f.innerHTML = '<div class="sup-done"><b>' + (j.ok ? 'Thank you!' : esc(j.error || 'Could not send')) + '</b> ' + (j.ok ? 'We read every request.' : 'Try again later.') + '</div>';
            setTimeout(function () { if (f.parentNode) f.parentNode.replaceChild(rq, f); }, 2600);
          }).catch(function () { b.disabled = false; b.textContent = 'Send'; });
      });
    });
  }
  var fr = el('button', 'fr', '+'); fr.type = 'button'; fr.title = 'Request a feature'; fr.setAttribute('aria-label', 'Request a feature');
  if (!supList) document.body.appendChild(fr);
  var pop = null;
  fr.addEventListener('click', function () {
    if (pop) { pop.remove(); pop = null; return; }
    pop = el('div', 'fr-pop', '<b>Request a feature</b><div class="sc-sub">What would make your journal better?</div><textarea maxlength="1000" placeholder="I wish I could…"></textarea><button type="button">Send</button>');
    document.body.appendChild(pop);
    var ta = pop.querySelector('textarea'), b = pop.querySelector('button'); ta.focus();
    b.addEventListener('click', function () {
      if (ta.value.trim().length < 3) { ta.focus(); return; }
      b.disabled = true; b.textContent = 'Sending…';
      fetch('/api/feature', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: ta.value, page: location.pathname }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          pop.innerHTML = '<b>' + (j.ok ? 'Thank you!' : esc(j.error || 'Could not send')) + '</b><div class="sc-sub">' + (j.ok ? 'We read every request.' : 'Try again later.') + '</div>';
          setTimeout(function () { if (pop) { pop.remove(); pop = null; } }, 2200);
        }).catch(function () { b.disabled = false; b.textContent = 'Send'; });
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop) { pop.remove(); pop = null; } });

  if (!host) return;

  // ---------- columns ----------
  var L = el('aside', 'sc-col sc-l'), R = el('aside', 'sc-col sc-r');
  L.setAttribute('aria-label', 'Focus and sessions'); R.setAttribute('aria-label', 'Today');
  document.body.appendChild(L); document.body.appendChild(R);
  document.body.appendChild(el('span', 'sc-tab l')); document.body.appendChild(el('span', 'sc-tab r'));
  addEventListener('pointermove', function (e) {
    if (root.classList.contains('sc-wide')) return;
    var x = e.clientX, w = innerWidth;
    if (x <= 6) { R.classList.remove('open'); L.classList.add('open'); }
    else if (x >= w - 7) { L.classList.remove('open'); R.classList.add('open'); }
    if (x > 460) L.classList.remove('open');
    if (x < w - 460) R.classList.remove('open');
  }, { passive: true });

  var D = null, F = null;
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var dayStr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var today = dayStr(new Date());

  // ---------- focus ----------
  var saveT = null;
  var goalDirty = false;
  function refreshGoals() { goalDirty = true; save(); }
  function save(now) {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      F.saved = today;
      fetch('/api/focus', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(F) })
        .then(function (r) { return r.json(); }).then(function (j) {
          j.fixes.forEach(function (f, i) { if (F.fixes[i]) F.fixes[i].id = f.id; });
          if (goalDirty && j.goalAuto) { goalDirty = false; D.goalAuto = j.goalAuto; drawFocus(); }
          var b = L.querySelector('.sc-save'); if (b && now) { b.classList.add('ok'); b.textContent = 'Saved'; setTimeout(function () { b.classList.remove('ok'); b.textContent = 'Save today'; }, 1600); }
        }).catch(function () {});
    }, now ? 0 : 900);
  }
  function weekDays() {   // Monday .. today
    var d = new Date(), out = [], wd = (d.getDay() + 6) % 7;
    for (var i = wd; i >= 0; i--) out.push(dayStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)));
    return out;
  }
  function stats() {
    var fx = F.fixes, n = fx.length;
    if (!n) return { today: 0, week: 0, streak: 0, t: '0/0' };
    var kept = function (d) { return fx.filter(function (f) { return f.days[d]; }).length; };
    var t = kept(today), wk = weekDays(), wsum = wk.reduce(function (s, d) { return s + kept(d); }, 0);
    var streak = 0, d = new Date();
    if (t < n) d.setDate(d.getDate() - 1);   // today is not over yet
    for (var i = 0; i < 400; i++) { if (kept(dayStr(d)) >= n) { streak++; d.setDate(d.getDate() - 1); } else break; }
    return { today: t / n, week: wsum / (n * wk.length), streak: streak, t: t + '/' + n };
  }
  function ring(r, c, v) {
    var len = 2 * Math.PI * r;
    return '<circle cx="66" cy="66" r="' + r + '" stroke="' + c + '" stroke-opacity=".18" stroke-width="13"/>'
      + '<circle cx="66" cy="66" r="' + r + '" stroke="' + c + '" stroke-width="13" stroke-dasharray="' + len.toFixed(1) + '" stroke-dashoffset="' + (len * (1 - Math.min(1, v))).toFixed(1) + '"/>';
  }
  function last5() {   // the last 5 weekdays, oldest first
    var out = [], d = new Date();
    while (out.length < 5) { if (d.getDay() % 6) out.unshift(dayStr(d)); d.setDate(d.getDate() - 1); }
    return out;
  }
  function drawFocus() {
    var s = stats(), acc = 'var(--accent, #ff5a1f)', days5 = last5();
    var mon = new Date(); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    var c = L.querySelector('.sc-focus');
    c.innerHTML = '<div class="sc-lbl">Focus · week of ' + mon.getDate() + ' ' + mon.toLocaleString('en', { month: 'short' }) + '</div>'
      + '<div class="sc-h">' + (F.fixes.length ? 'Fix ' + F.fixes.length + ' thing' + (F.fixes.length > 1 ? 's' : '') + ' this week' : 'What will you fix this week?') + '</div>'
      + '<div class="sc-rings"><svg viewBox="0 0 132 132" aria-hidden="true"><g fill="none" stroke-linecap="round" transform="rotate(-90 66 66)">'
      + ring(58, acc, s.today) + ring(42, '#f4f4f5', s.week) + ring(26, '#ffb05a', Math.min(1, s.streak / 5)) + '</g></svg>'
      + '<div class="sc-leg"><div><i style="background:' + acc + '"></i><b>' + s.t + '</b> today</div><div><i style="background:#f4f4f5"></i><b>' + Math.round(s.week * 100) + '%</b> this week</div>'
      + '<div><i style="background:#ffb05a"></i><b>' + s.streak + '</b> day streak</div></div></div>'
      + '<div class="sc-lbl">Today\'s checklist</div>'
      + F.fixes.map(function (f, i) {
        return '<div class="sc-row"><button type="button" class="sc-ck" role="checkbox" aria-checked="' + !!f.days[today] + '" data-ck="' + i + '" aria-label="Kept today: ' + esc(f.text) + '"></button>'
          + '<span class="t">' + esc(f.text) + '</span><span class="sc-dots" title="Last 5 trading days">' + days5.map(function (d) { return '<span class="' + (f.days[d] ? 'y' : '') + '"></span>'; }).join('') + '</span>'
          + '<button type="button" class="sc-x" data-rm="' + i + '" aria-label="Remove">×</button></div>';
      }).join('')
      + (F.fixes.length < 6 ? '<form class="sc-add" data-add="fix"><input maxlength="80" placeholder="' + (D.watch[0] && !F.fixes.length ? esc(D.watch[0].fix || '+ Add a fix').slice(0, 70) : '+ Add a fix') + '"></form>' : '')
      + '<div class="sc-sec"><div class="sc-lbl">Goals</div>'
      + F.goals.map(function (g, i) {
        // goals the journal can measure fill up by themselves (src/side.js goalKind); the rest: tap the bar
        if (EG === i) return goalEditor(g, i);
        var a = (D.goalAuto || [])[i], pct = a ? a.pct : g.pct, line;
        if (a && a.split) {
          // money / R target: one line you flip with ‹ › between Today, This week, This month and Pace (owner: keep the card small)
          var vs = a.split.concat([{ lab: 'Pace', pace: 1, pct: a.split[2].pct }]);
          var v = GV[i] != null ? GV[i] : Math.max(0, vs.findIndex(function (r) { return r.main; })); GV[i] = v = (v + vs.length) % vs.length;
          var r = vs[v]; pct = r.pct;
          line = '<div class="sc-gv"><button type="button" data-gv="' + i + '" data-d="-1" aria-label="Previous view">‹</button>'
            + (r.pace ? '<span class="sc-pace ' + (a.ahead ? 'up' : 'dn') + '" title="' + esc(a.paceLong || a.pace) + '">' + esc(a.pace) + '</span>'
              : '<span><em>' + esc(r.lab) + '</em> <b class="' + (r.neg ? 'neg' : '') + '">' + esc(r.got) + '</b> / ' + esc(r.tgt) + '</span>')
            + '<button type="button" data-gv="' + i + '" data-d="1" aria-label="Next view">›</button></div>';
        } else line = '<div class="sc-gnow">' + (a ? esc(a.now) : 'Tap the bar to set progress') + '</div>';
        return '<div class="sc-goal' + (a ? ' auto' : '') + '"><div class="top"><span>' + esc(g.text) + '</span><span>' + pct + '% <button type="button" class="sc-x" data-edg="' + i + '" aria-label="Edit goal" title="Edit">✎</button><button type="button" class="sc-x" data-rmg="' + i + '" aria-label="Remove">×</button></span></div>'
          + '<div class="sc-bar"' + (a ? ' title="Fills from your journal"' : ' data-g="' + i + '" title="Tap the bar to set your progress"') + '><i style="width:' + pct + '%"></i></div>'
          + line + '</div>';
      }).join('')
      + (F.goals.length < 3 ? '<form class="sc-add" data-add="goal"><input maxlength="70" placeholder="+ Add a goal (e.g. $10k this month, 2R a day, 60% win rate)"></form>' : '') + '</div>'
      + '<div class="sc-sec"><div class="sc-lbl" style="margin-bottom:8px">Notes</div><textarea class="sc-note" maxlength="600" placeholder="What did today teach you?">' + esc(F.notes) + '</textarea></div>'
      + '<button type="button" class="sc-save">Save today</button>';
  }
  var GV = {};   // which view (Today / week / month / pace) each target goal shows
  var EG = null;   // goal open in the ✎ editor
  function goalEditor(g, i) {
    var opt = function (list, cur) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); };
    var accts = [['', 'All accounts']].concat((D.goalAccts || []).map(function (x) { return [x.n, (x.label ? x.label + ' ' : '') + '••' + String(x.n).slice(-2)]; }));
    return '<form class="sc-ged" data-ged="' + i + '">'
      + '<label>Name<input title="Auto reads the amount and period from the name" name="text" maxlength="70" value="' + esc(g.text) + '"></label>'
      + '<div class="r"><label>Counts<select name="kind">' + opt([['auto', 'Auto'], ['money', 'Money ($)'], ['r', 'R'], ['wr', 'Win rate %'], ['green', 'Green days'], ['prop', 'Prop target'], ['manual', 'By hand (tap bar)']], g.kind || 'auto') + '</select></label>'
      + '<label>Target<input name="target" type="number" min="0" step="any" inputmode="decimal" value="' + (g.target || '') + '" placeholder="10000"></label></div>'
      + '<div class="r"><label>Per<select name="per">' + opt([['', 'Auto'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']], g.per || '') + '</select></label>'
      + '<label>Trading days<select name="days">' + opt([[5, 'Mon–Fri'], [7, 'Every day']], g.days || 5) + '</select></label></div>'
      + '<label>Account<select name="acct">' + opt(accts, g.acct || '') + '</select></label>'
      + '<div class="b"><button type="button" data-egx="1">Cancel</button><button type="submit">Save goal</button></div></form>';
  }
  function focusEvents() {
    var c = L.querySelector('.sc-focus');
    c.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ck],[data-rm],[data-rmg],[data-g],[data-gv],[data-edg],[data-egx],.sc-save'); if (!t) return;
      if (t.dataset.edg != null) { EG = +t.dataset.edg; drawFocus(); var nm = c.querySelector('.sc-ged input'); if (nm) nm.focus(); return; }
      if (t.dataset.egx != null) { EG = null; drawFocus(); return; }
      if (t.dataset.gv != null) { GV[+t.dataset.gv] = (GV[+t.dataset.gv] || 0) + Number(t.dataset.d); drawFocus(); return; }
      if (t.dataset.ck != null) { var f = F.fixes[+t.dataset.ck]; if (f.days[today]) delete f.days[today]; else f.days[today] = 1; drawFocus(); save(); return; }
      if (t.dataset.rm != null) { F.fixes.splice(+t.dataset.rm, 1); drawFocus(); save(); return; }
      if (t.dataset.rmg != null) { GV = {}; EG = null; F.goals.splice(+t.dataset.rmg, 1); if (D.goalAuto) D.goalAuto.splice(+t.dataset.rmg, 1); drawFocus(); save(); return; }
      if (t.dataset.g != null) { var bb = t.getBoundingClientRect(); F.goals[+t.dataset.g].pct = Math.max(0, Math.min(100, Math.round((e.clientX - bb.left) / bb.width * 20) * 5)); drawFocus(); save(); return; }
      if (t.classList.contains('sc-save')) save(true);
    });
    c.addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.dataset.ged != null) {   // ✎ editor: keep the name, store how it is counted
        var gi = +e.target.dataset.ged, fd = new FormData(e.target), g = F.goals[gi], nm = String(fd.get('text') || '').trim();
        if (!g || !nm) return;
        g.text = nm; g.kind = fd.get('kind') === 'auto' ? undefined : fd.get('kind');
        g.target = Number(fd.get('target')) > 0 ? Number(fd.get('target')) : undefined; g.per = fd.get('per') || undefined;
        g.days = fd.get('days') === '7' ? 7 : undefined; g.acct = fd.get('acct') || undefined;
        EG = null; delete GV[gi]; drawFocus(); refreshGoals(); return;
      }
      var i = e.target.querySelector('input'), v = i.value.trim(); if (!v) return;
      if (e.target.dataset.add === 'fix') F.fixes.push({ id: '', text: v, days: {} }); else F.goals.push({ id: '', text: v, pct: 0 });
      drawFocus(); save(); var n = c.querySelector('[data-add="' + e.target.dataset.add + '"] input'); if (n) n.focus();
      if (e.target.dataset.add === 'goal') refreshGoals();
    });
    c.addEventListener('input', function (e) { if (e.target.classList.contains('sc-note')) { F.notes = e.target.value; save(); } });
  }

  // ---------- sessions globe ----------
  var SES = [['Sydney', 'Australia/Sydney', 7, 16, 151.2, -33.9], ['Tokyo', 'Asia/Tokyo', 9, 18, 139.7, 35.7], ['London', 'Europe/London', 8, 17, -0.1, 51.5], ['New York', 'America/New_York', 8, 17, -74, 40.7]];
  function sesNow() {
    return SES.map(function (s) {
      var d = new Date(new Date().toLocaleString('en-US', { timeZone: s[1] })), h = d.getHours() + d.getMinutes() / 60, wd = d.getDay();
      return { name: s[0], lon: s[4], lat: s[5], on: wd > 0 && wd < 6 && h >= s[2] && h < s[3], time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
    });
  }
  function sessions() {
    var c = L.querySelector('.sc-ses'), S = sesNow();
    c.innerHTML = S.map(function (s) { return '<div class="' + (s.on ? 'on' : '') + '"><span><i></i>' + s.name + '</span><small>' + s.time + '</small></div>'; }).join('');
    return S;
  }
  function globe() {
    var cv = L.querySelector('.sc-globe'), x = cv.getContext('2d'), R0 = 118, C = 125, dots = null, rot = -40, tilt = 25, drag = null, S = sessions();
    cv.width = cv.height = 500; x.scale(2, 2);
    fetch('/side/globe-dots.json').then(function (r) { return r.json(); }).then(function (a) { dots = a; });
    // center on the open session(s)
    var open = S.filter(function (s) { return s.on; });
    if (open.length) rot = -open.reduce(function (a, s) { return a + s.lon; }, 0) / open.length;
    var rad = Math.PI / 180;
    function sun() {   // where the sun is overhead right now
      var n = new Date(), doy = (Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - Date.UTC(n.getUTCFullYear(), 0, 0)) / 864e5;
      return [(12 - n.getUTCHours() - n.getUTCMinutes() / 60) * 15, 23.44 * Math.sin(2 * Math.PI * (doy - 81) / 365)];
    }
    function proj(lon, lat) {
      var l = (lon + rot) * rad, p = lat * rad, t = tilt * rad;
      var X = Math.cos(p) * Math.sin(l), Y = Math.sin(p), Z = Math.cos(p) * Math.cos(l);
      var y2 = Y * Math.cos(t) - Z * Math.sin(t), z2 = Y * Math.sin(t) + Z * Math.cos(t);
      return [C + X * R0, C - y2 * R0, z2];
    }
    // 20 frames a second is plenty for a slow spin; skip frames while the globe is off screen, the tab is hidden or the page scrolls
    var seen = true, lastF = 0, acc = '';
    if (window.IntersectionObserver) new IntersectionObserver(function (e) { seen = e[0].isIntersecting; }).observe(cv);
    function frame(now) {
      requestAnimationFrame(frame);
      if (!seen || document.hidden || (now && now - lastF < 50) || !calm(now)) return;
      lastF = now || 0;
      if (!acc) acc = getComputedStyle(root).getPropertyValue('--accent').trim() || '#ff5a1f';
      x.clearRect(0, 0, 250, 250);
      var g = x.createRadialGradient(C - 40, C - 50, 10, C, C, R0);
      g.addColorStop(0, '#26262c'); g.addColorStop(1, '#060608');
      x.fillStyle = g; x.beginPath(); x.arc(C, C, R0, 0, 7); x.fill();
      var sn = sun(), sl = sn[0] * rad, sp = sn[1] * rad, sv = [Math.cos(sp) * Math.sin(sl), Math.sin(sp), Math.cos(sp) * Math.cos(sl)];
      if (dots) for (var i = 0; i < dots.length; i += 2) {
        var q = proj(dots[i], dots[i + 1]); if (q[2] <= 0) continue;
        var l = dots[i] * rad, p = dots[i + 1] * rad, lit = Math.cos(p) * Math.sin(l) * sv[0] + Math.sin(p) * sv[1] + Math.cos(p) * Math.cos(l) * sv[2];
        x.fillStyle = 'rgba(255,255,255,' + ((lit > 0 ? 0.55 : 0.2) * (0.35 + 0.65 * q[2])).toFixed(3) + ')';
        x.fillRect(q[0] - 0.9, q[1] - 0.9, 1.8, 1.8);
      }
      var tnow = Date.now() / 600;
      S.forEach(function (s) {
        var q = proj(s.lon, s.lat); if (q[2] <= 0) return;
        if (s.on) { var rr = 10 + 6 * (0.5 + 0.5 * Math.sin(tnow)); x.globalAlpha = 0.35; x.fillStyle = acc; x.beginPath(); x.arc(q[0], q[1], rr, 0, 7); x.fill(); x.globalAlpha = 1; }
        x.fillStyle = s.on ? acc : '#71717a'; x.beginPath(); x.arc(q[0], q[1], s.on ? 3.6 : 2.6, 0, 7); x.fill();
      });
      x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 1; x.beginPath(); x.arc(C, C, R0, 0, 7); x.stroke();
      if (!drag) rot += 0.08;
    }
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, r: rot, t: tilt }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) { if (drag) { rot = drag.r + (e.clientX - drag.x) * 0.5; tilt = Math.max(-60, Math.min(60, drag.t + (e.clientY - drag.y) * 0.4)); } });
    cv.addEventListener('pointerup', function () { drag = null; });
    setInterval(function () { S = sessions(); acc = ''; }, 30000);
    frame();
  }

  // ---------- right column ----------
  function right() {
    var h = '<div class="sc-card"><div class="sc-lbl">Today\'s thought</div><div class="sc-quote">“' + D.quote + '”</div></div>';
    // the car sits right under the quote so it is on screen without scrolling the column (owner, 2026-11-22)
    h += '<div class="sc-card sc-garage"><canvas aria-label="3D car you can turn"></canvas><span class="sc-hint"></span></div>';
    if (D.last) {
      var dt = new Date(D.last.day + 'T12:00:00'), lab = dt.toLocaleString('en', { weekday: 'short' }) + ' ' + dt.getDate() + ' ' + dt.toLocaleString('en', { month: 'short' });
      var L0 = D.last, rr = L0.backR != null ? L0.backR : (L0.r != null && L0.r < 0 ? -L0.r : null);
      if (L0.net < 0) {
        // never a big red number: show the way back
        h += '<div class="sc-card"><div class="sc-lbl">Bounce back · after ' + lab + '</div>'
          + (rr != null ? '<div class="sc-pl">+' + rr + 'R</div><div class="sc-sub">is all it takes at 1% risk to win back ' + esc(L0.lost) + '.' + (rr > 1.5 ? ' Two clean ' + Math.round(rr / 2 * 10) / 10 + 'R trades do it too.' : ' One good trade.') + '</div>'
            : '<div class="sc-pl">One good trade</div><div class="sc-sub">Small size, your best setup only. ' + esc(L0.lost) + ' comes back one trade at a time.</div>')
          + '<div class="sc-sub" style="margin-top:10px;color:#d4d4d8">Lost the battle, not the war. Trade your plan today.</div></div>';
      } else {
        h += '<div class="sc-card"><div class="sc-lbl">Last session · ' + lab + '</div><div class="sc-pl sc-pos">' + esc(L0.text) + '</div>'
          + '<div class="sc-sub">' + L0.n + ' trade' + (L0.n > 1 ? 's' : '') + ' · ' + L0.wins + ' win' + (L0.wins === 1 ? '' : 's') + (L0.r != null ? ' · ' + (L0.r > 0 ? '+' : '') + L0.r + 'R' : '') + '</div>'
          + '<div class="sc-mini">' + L0.trades.map(function (t) { return '<span class="' + (t.net >= 0 ? 'sc-pos' : '') + '">' + (t.r != null ? (t.r > 0 ? '+' : '') + Math.round(t.r * 10) / 10 + 'R' : (t.net >= 0 ? 'Win' : 'Loss')) + '</span>'; }).join('') + '</div></div>';
      }
    }
    var w = D.watch || [];
    h += '<div class="sc-card"><div class="sc-lbl">Watch out today</div>' + (w.length
      ? '<div class="sc-wt"><div class="sc-lbl" style="color:#ffb08a">Your #1 repeat mistake</div><div class="sc-wt-h">' + esc(w[0].title) + '</div><p>' + esc(w[0].text) + '</p>' + (w[0].fix ? '<p class="sc-wt-fix">Today: ' + esc(w[0].fix) + '</p>' : '') + '</div>'
        + w.slice(1).map(function (m) { return '<div class="sc-mis"><span>' + esc(m.title) + (m.tag ? '<small>' + esc(m.tag) + '</small>' : '') + '</span>' + (m.cost ? '<b>' + esc(m.cost) + '</b>' : '') + '</div>'; }).join('')
      : '<p class="sc-sub" style="margin:10px 0 0">' + (D.watchNeed ? 'Log ' + D.watchNeed + ' more trades and your repeat mistakes show here.' : D.last ? 'No repeat mistakes in your last 90 days. Keep it that way.' : 'Connect your MT5 account and your repeat mistakes show here.') + '</p>') + '</div>';
    R.innerHTML = h;
    var g = R.querySelector('.sc-garage canvas');
    // the 3D car is the heaviest thing on the page: start it only after the page has loaded and gone quiet,
    // so switching pages stays smooth, then fade it in
    // wait while the journal intro (Night run) is on screen: two 3D scenes starting at once made the intro stutter
    var go = function () { if (document.querySelector('.plx')) { setTimeout(go, 400); return; } go2(); };
    var go2 = function () { import('/side/garage.js' + VER).then(function (m) { m.default(R.querySelector('.sc-garage')); }).catch(function () { R.querySelector('.sc-garage').remove(); }); };
    var idle = function () { setTimeout(function () { (window.requestIdleCallback || function (f) { setTimeout(f, 1); })(go, { timeout: 2500 }); }, 700); };
    var start = function () { if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true }); };
    if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }); io.observe(g); } else start();
  }

  // ---------- My gallery: the last cards saved in Share Studio, fanned out ----------
  function gallery() {
    var g = L.querySelector('.sc-gal'); if (!g) return;
    fetch('/journal/studio/gallery.json', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return;
      var c = (j.cards || []).filter(function (x) { return !x.w || x.h > x.w; }).slice(0, 3), n = (j.cards || []).length;
      var fan = c.length ? '<a class="sc-fan" href="/journal/studio#gallery" aria-label="Open my gallery">' + [c[1], c[0], c[2]].map(function (x, i) { return x ? '<img class="f' + i + '" src="' + esc(x.src) + '" alt="">' : ''; }).join('') + '</a>'
        + '<div class="sc-sub sc-gcap">' + esc(c[0].label || 'Latest card') + '</div>'
        : '<div class="sc-sub sc-gcap">Cards you save in Share Studio show up here.</div>';
      g.innerHTML = '<div class="sc-gh"><span class="sc-lbl">My gallery</span><span class="sc-lbl">' + (n ? n + (n === 1 ? ' card' : ' cards') : '') + '</span></div>' + fan
        + '<div class="sc-gb"><a class="sc-gadd" href="/journal/studio">+ Add a card</a>' + (n ? '<a class="sc-gall" href="/journal/studio#gallery">See all</a>' : '') + '</div>';
      g.hidden = false;
    }).catch(function () {});
  }

  fetch('/api/side', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
    D = d; F = d.focus || { fixes: [], goals: [], notes: '' };
    L.innerHTML = '<div class="sc-card sc-focus"></div><div class="sc-card sc-gal" hidden></div><div class="sc-card"><div class="sc-lbl">Sessions · live</div><canvas class="sc-globe" aria-label="World map of the market sessions"></canvas><div class="sc-ses"></div></div>';
    gallery(); addEventListener('gallery:change', gallery); drawFocus(); focusEvents(); (function g() { if (document.querySelector('.plx')) setTimeout(g, 400); else globe(); })(); right();
    window.dispatchEvent(new CustomEvent('side:ready'));
  }).catch(function () {});
})();
