// Study room page (src/study.js). PREVIEW: sample trades, screenshots and setups so the owner can try how it works.
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('sr-ws') && !$('v-study')) return;
  const rnd = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
  const money = (v) => (v < 0 ? '−$' : '+$') + Math.abs(v).toLocaleString();

  // quotes
  const Q = [['The impediment to action advances action. What stands in the way <em>becomes the way</em>.', 'Marcus Aurelius'], ['We suffer more often in <em>imagination</em> than in reality.', 'Seneca'],
    ['No man is free who is not <em>master of himself</em>.', 'Epictetus'], ['Difficulties strengthen the mind, as <em>labour does the body</em>.', 'Seneca'],
    ['We are what we <em>repeatedly do</em>.', 'Will Durant'], ['Lost the battle, <em>not the war</em>.', '5ABI.FX']];
  let qi = 0; const qe = $('sr-q');
  const showQ = () => { qe.classList.add('out'); setTimeout(() => { qe.innerHTML = '“' + Q[qi][0] + '”'; $('sr-qa').textContent = '— ' + Q[qi][1]; qe.classList.remove('out'); qi = (qi + 1) % Q.length; }, qe.innerHTML ? 600 : 0); };
  showQ(); setInterval(showQ, 9000);

  // tabs (#study / #playbook / #goals)
  const tabs = document.querySelectorAll('.sr-tabs a');
  const go = (v) => { tabs.forEach((a) => a.classList.toggle('on', a.dataset.v === v)); document.querySelectorAll('.sr-view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v)); if (v === 'book') drawPB(); if (v === 'study') chart(); };
  tabs.forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.v); history.replaceState(null, '', a.getAttribute('href')); }));
  document.addEventListener('click', (e) => { const a = e.target.closest('a[href="#playbook"],a[href="#study"]'); if (a && !a.closest('.sr-tabs')) { e.preventDefault(); go(a.getAttribute('href') === '#playbook' ? 'book' : 'study'); } });
  const start = { '#playbook': 'book', '#goals': 'goals' }[location.hash]; if (start) setTimeout(() => go(start));

  // statue: a real 3D head scan drawn as white stone with an orange rim light
  (function () {
    const cv = $('sr-bust'), gl = cv && cv.getContext('webgl', { antialias: true, alpha: true }); if (!gl) return;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec3 n;uniform mat3 R;uniform float A;varying vec3 vn;varying float vy;void main(){vec3 q=R*p;vn=R*n;vy=p.y;float z=3.2-q.z;gl_Position=vec4(q.x*2.35/A/z,(q.y*2.35-0.1)/z,(z-2.)/3.,1.);}'));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec3 vn;varying float vy;void main(){vec3 N=normalize(vn);float d=max(dot(N,normalize(vec3(.55,.35,.9))),0.);float rim=pow(1.-abs(N.z),2.5);float a=smoothstep(-.95,-.45,vy);vec3 c=vec3(.88,.86,.83)*(.10+.85*d)+vec3(1.,.4,.15)*rim*.55+vec3(.9)*pow(d,18.)*.25;gl_FragColor=vec4(c,a);}'));
    gl.linkProgram(p);
    fetch('/study/head.bin').then((r) => r.arrayBuffer()).then((B) => {
      const dv = new DataView(B), nv = dv.getUint32(0, true), ni = dv.getUint32(4, true); let o = 8;
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3);
      for (let k = 0; k < nv * 3; k++) { P[k] = dv.getInt16(o, true) / 32767; o += 2; }
      for (let k = 0; k < nv * 3; k++) { N[k] = dv.getInt8(o) / 127; o++; }
      if (o % 2) o++;
      const I = new Uint16Array(B.slice(o, o + ni * 2));
      const buf = (d, t = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(t, b); gl.bufferData(t, d, gl.STATIC_DRAW); return b; };
      const bp = buf(P), bn = buf(N); buf(I, gl.ELEMENT_ARRAY_BUFFER);
      let mx = 0, my = 0, tx = 0, ty = 0;
      addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; });
      const at = (name, b) => { const l = gl.getAttribLocation(p, name); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0); };
      const draw = (t) => {
        t /= 1000; const D = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
        if (cv.width !== Math.round(w * D) || cv.height !== Math.round(h * D)) { cv.width = Math.round(w * D); cv.height = Math.round(h * D); }
        gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
        mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
        const yaw = -0.55 + Math.sin(t * 0.18) * 0.55 + mx * 0.7, pit = 0.05 + my * 0.25, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
        gl.useProgram(p); gl.uniformMatrix3fv(gl.getUniformLocation(p, 'R'), false, new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]));
        gl.uniform1f(gl.getUniformLocation(p, 'A'), w / Math.max(1, h)); at('p', bp); at('n', bn);
        gl.drawElements(gl.TRIANGLES, ni, gl.UNSIGNED_SHORT, 0); requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    }).catch(() => {});
  })();

  // sample screenshots from other platforms (drawn, so the preview needs no images)
  function fakeShot(cv, kind, seed, W, H) {
    const r = rnd(seed); cv.width = W; cv.height = H; const x = cv.getContext('2d'); x.fillStyle = '#0b0b0e'; x.fillRect(0, 0, W, H);
    if (kind === 'heat') {
      for (let i = 0; i < 70; i++) { const y = r() * H, h = 2 + r() * 6, a = r(); x.fillStyle = a > 0.85 ? `rgba(255,${120 + r() * 80 | 0},40,${0.5 + r() * 0.4})` : `rgba(${40 + r() * 60 | 0},${60 + r() * 80 | 0},${120 + r() * 100 | 0},${0.25 + r() * 0.3})`; x.fillRect(0, y, W, h); }
      x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); let p = H * 0.5; for (let i = 0; i <= W; i += 4) { p += (r() - 0.5) * 7; p = Math.max(H * 0.2, Math.min(H * 0.8, p)); i ? x.lineTo(i, p) : x.moveTo(i, p); } x.stroke();
      for (let i = 0; i < 9; i++) { x.fillStyle = r() > 0.5 ? 'rgba(38,198,160,.55)' : 'rgba(240,70,75,.55)'; x.beginPath(); x.arc(W * 0.3 + r() * W * 0.6, H * 0.25 + r() * H * 0.5, 3 + r() * 11, 0, 7); x.fill(); }
    } else if (kind === 'fp') {
      const cols = 6, rows = 12, cw = W / cols, rh = H / rows;
      for (let c = 0; c < cols; c++) {
        const mid = rows * (0.3 + r() * 0.4) | 0;
        for (let k = 0; k < rows; k++) { const v = r(), bid = r() > 0.5; if (Math.abs(k - mid) > 4 + r() * 2) continue; x.fillStyle = bid ? `rgba(240,70,75,${v * 0.5})` : `rgba(38,198,160,${v * 0.5})`; x.fillRect(c * cw + 4, k * rh + 1, cw - 8, rh - 2);
          if (W > 200) { x.fillStyle = 'rgba(255,255,255,.75)'; x.font = `${Math.max(8, rh * 0.55)}px Manrope, sans-serif`; x.fillText((v * 900 | 0) + ' x ' + (r() * 900 | 0), c * cw + 8, k * rh + rh * 0.72); } }
        x.strokeStyle = 'rgba(255,90,31,.9)'; x.lineWidth = 2; x.strokeRect(c * cw + 3, (mid - 1) * rh, cw - 6, rh * 2);
      }
    } else {
      let p = H * 0.55; for (let i = 0; i < 34; i++) { const o = p, c = o + (r() - 0.5) * H * 0.08, hi = Math.min(o, c) - r() * 6, lo = Math.max(o, c) + r() * 6, xx = 6 + i * (W - 12) / 34;
        x.strokeStyle = c < o ? '#ddd' : '#777'; x.fillStyle = c < o ? '#ddd' : '#2a2a30'; x.beginPath(); x.moveTo(xx + 2, hi); x.lineTo(xx + 2, lo); x.stroke(); x.fillRect(xx, Math.min(o, c), 4, Math.max(1, Math.abs(c - o))); p = c; }
      for (let k = 0; k < 16; k++) { x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(W - 4 - r() * W * 0.3, k * H / 16 + 1, W, H / 16 - 2); }
      x.strokeStyle = 'rgba(255,90,31,.8)'; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(0, H * 0.3); x.lineTo(W, H * 0.3); x.stroke(); x.setLineDash([]);
    }
  }

  // screenshot strip: paste, drop or pick a file; click one to mark it up
  const strip = $('sr-shots'), drop = $('sr-drop');
  function addShot(o) {
    const d = document.createElement('div'); d.className = 'sr-shot'; const c = document.createElement('canvas');
    if (o.img) { c.width = 320; c.height = 188; const s = Math.max(320 / o.img.width, 188 / o.img.height); c.getContext('2d').drawImage(o.img, (320 - o.img.width * s) / 2, (188 - o.img.height * s) / 2, o.img.width * s, o.img.height * s); } else fakeShot(c, o.k, o.s, 320, 188);
    d.append(c); d.insertAdjacentHTML('beforeend', `<span>${o.l}<small>${o.p}</small></span>`); d.onclick = () => openV(o); strip.insertBefore(d, drop);
  }
  [{ k: 'fp', p: 'DeepCharts', l: 'At entry', s: 3 }, { k: 'heat', p: 'Heatmap', l: 'Before entry', s: 9 }, { k: 'mp', p: 'NinjaTrader', l: 'After exit', s: 21 }].forEach(addShot);
  const take = (f) => { if (!f || !/^image\//.test(f.type)) return; const im = new Image(); im.onload = () => addShot({ img: im, p: 'Your picture', l: 'Added now' }); im.src = URL.createObjectURL(f); };
  $('sr-fin').onchange = (e) => [...e.target.files].forEach(take);
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('hot'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('hot'); }));
  drop.addEventListener('drop', (e) => [...e.dataTransfer.files].forEach(take));
  addEventListener('paste', (e) => { if (e.target.closest && e.target.closest('textarea,input')) return; [...((e.clipboardData || {}).files || [])].forEach(take); });

  const vw = $('sr-vw'), vi = $('sr-vimg'), vd = $('sr-vdraw'); let tool = 'arrow', marks = [], cur = null;
  function openV(o) {
    vw.hidden = false;
    if (o.img) { vi.width = o.img.width; vi.height = o.img.height; vi.getContext('2d').drawImage(o.img, 0, 0); } else fakeShot(vi, o.k, o.s, 1100, 620);
    vd.width = vi.width; vd.height = vi.height;
    marks = o.k === 'fp' ? [{ t: 'box', a: [vi.width * 0.5, vi.height * 0.25], b: [vi.width * 0.67, vi.height * 0.45] }, { t: 'text', a: [vi.width * 0.5, vi.height * 0.22], s: 'Sellers held here' }] : [];
    $('sr-vlab').textContent = o.p + ' · ' + o.l; redraw();
  }
  $('sr-vclose').onclick = () => { vw.hidden = true; }; vw.onclick = (e) => { if (e.target === vw) vw.hidden = true; };
  document.querySelectorAll('[data-tl]').forEach((b) => (b.onclick = () => { tool = b.dataset.tl; document.querySelectorAll('[data-tl]').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('sr-clr').onclick = () => { marks = []; redraw(); };
  const pt = (e) => { const r = vd.getBoundingClientRect(); return [(e.clientX - r.left) * vd.width / r.width, (e.clientY - r.top) * vd.height / r.height]; };
  vd.onpointerdown = (e) => { const p = pt(e); if (tool === 'text') { marks.push({ t: 'text', a: p, s: 'Note' }); redraw(); return; } cur = { t: tool, a: p, b: p }; vd.setPointerCapture(e.pointerId); };
  vd.onpointermove = (e) => { if (cur) { cur.b = pt(e); redraw(); } };
  vd.onpointerup = () => { if (cur) { marks.push(cur); cur = null; redraw(); } };
  function redraw() {
    const x = vd.getContext('2d'), s = vd.width / 1100; x.clearRect(0, 0, vd.width, vd.height); x.strokeStyle = '#ff7a3d'; x.fillStyle = '#ff7a3d'; x.lineWidth = 3 * s; x.font = `600 ${20 * s}px Manrope, sans-serif`;
    [...marks, ...(cur ? [cur] : [])].forEach((m) => {
      if (m.t === 'box') { x.fillStyle = 'rgba(255,90,31,.12)'; x.fillRect(m.a[0], m.a[1], m.b[0] - m.a[0], m.b[1] - m.a[1]); x.strokeRect(m.a[0], m.a[1], m.b[0] - m.a[0], m.b[1] - m.a[1]); x.fillStyle = '#ff7a3d'; }
      else if (m.t === 'line') { x.setLineDash([10 * s, 6 * s]); x.beginPath(); x.moveTo(0, m.b[1]); x.lineTo(vd.width, m.b[1]); x.stroke(); x.setLineDash([]); }
      else if (m.t === 'arrow') { const [a, b] = [m.a, m.b], an = Math.atan2(b[1] - a[1], b[0] - a[0]); x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); x.beginPath(); x.moveTo(...b); x.lineTo(b[0] - 16 * s * Math.cos(an - 0.45), b[1] - 16 * s * Math.sin(an - 0.45)); x.lineTo(b[0] - 16 * s * Math.cos(an + 0.45), b[1] - 16 * s * Math.sin(an + 0.45)); x.fill(); }
      else if (m.t === 'text') { const w = x.measureText(m.s).width; x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(m.a[0] - 6 * s, m.a[1] - 22 * s, w + 12 * s, 30 * s); x.fillStyle = '#fff'; x.fillText(m.s, m.a[0], m.a[1]); x.fillStyle = '#ff7a3d'; }
    });
  }

  // environment chips -> one setup name; same name = same playbook page
  const ENV = [['Where', ['Value high', 'Value low', 'Point of control', 'Inside value', 'Outside value', 'Poor high', 'Poor low', 'Yesterday high / low'], ['Value high']],
    ['What happened', ['Absorption', 'Exhaustion', 'Stacked imbalance', 'Big trades', 'Delta divergence', 'Heatmap wall held', 'Heatmap wall pulled'], ['Absorption']],
    ['Day', ['Balance day', 'Trend day', 'Open drive', 'News day'], ['Balance day']],
    ['Session', ['Asia', 'London', 'New York open', 'New York PM'], ['New York open']],
    ['With my bias?', ['With bias', 'Against bias', 'No bias'], ['With bias']]];
  const sel = ENV.map((g) => new Set(g[2]));
  $('sr-envg').innerHTML = ENV.map((g, i) => `<div class="sr-grp"><span class="sr-k">${g[0]}</span><div class="sr-envc">${g[1].map((c) => `<button type="button" class="${sel[i].has(c) ? 'on' : ''}" data-g="${i}">${c}</button>`).join('')}</div></div>`).join('');
  document.querySelectorAll('.sr-envc button').forEach((b) => (b.onclick = () => { const s = sel[b.dataset.g]; s.has(b.textContent) ? s.delete(b.textContent) : s.add(b.textContent); b.classList.toggle('on'); fp(); }));
  function fp() {
    const w = [...sel[1]][0] || 'Something', a = [...sel[0]][0] || 'somewhere';
    $('sr-fp').textContent = w + ' at ' + a.toLowerCase();
    $('sr-fpm').textContent = [...sel[2], ...sel[3], ...sel[4]].join(' · ') || 'Add the day and session';
    $('sr-seen').innerHTML = w === 'Absorption' && a === 'Value high'
      ? `You saved this environment <b>6 times</b> before: <span class="pos">4 won</span>, <span class="neg">2 lost</span>, average <b>+1.1R</b>.<div class="sr-mini">${'wwlwlw'.split('').map((c) => `<i class="${c}"></i>`).join('')}</div><div class="sr-row"><a class="btn small secondary" href="#playbook">Open this setup →</a></div>`
      : 'New environment. Saving this trade starts a new setup page in your playbook.';
  }
  fp();

  // inbox
  const TR = [['XAUUSD', 'sell', '20 Nov · 09:42', -184, -1, 0, 'No screenshot yet'], ['NAS100', 'buy', '19 Nov · 10:05', 612, 2.4, 0, '2 screenshots, no setup'], ['XAUUSD', 'buy', '19 Nov · 15:22', 203, 1.1, 0, 'No notes yet'], ['EURUSD', 'sell', '18 Nov · 08:31', -96, -0.6, 0, 'No screenshot yet'], ['XAUUSD', 'sell', '17 Nov · 16:02', 388, 1.9, 1, 'Studied']];
  $('sr-trs').innerHTML = TR.map((t, k) => `<div class="sr-tr${k ? '' : ' on'}"><div><b><span class="sr-dot${t[5] ? ' done' : ''}"></span>${t[0]} ${t[1]}</b><small>${t[2]}</small>${t[5] ? '' : `<span class="hint">${t[6]}</span>`}</div><div class="v ${t[3] < 0 ? 'neg' : 'pos'}">${money(t[3])}<small>${t[4] > 0 ? '+' : ''}${t[4].toFixed(1)}R</small></div></div>`).join('');
  document.querySelectorAll('.sr-tr').forEach((r) => (r.onclick = () => document.querySelectorAll('.sr-tr').forEach((x) => x.classList.toggle('on', x === r))));
  document.querySelectorAll('.sr-grade button').forEach((b) => (b.onclick = () => document.querySelectorAll('.sr-grade button').forEach((x) => x.classList.toggle('on', x === b))));
  $('sr-done').onclick = (e) => { e.target.textContent = 'Saved to your playbook ✓'; const d = document.querySelector('.sr-tr.on .sr-dot'); if (d) d.classList.add('done'); };

  // the trade's own candles (sample)
  function chart() {
    const cv = $('sr-ch'), D = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight; if (!w) return; cv.width = w * D; cv.height = h * D;
    const x = cv.getContext('2d'); x.scale(D, D); const r = rnd(7), C = []; let p = 4004;
    for (let i = 0; i < 64; i++) { const t = i < 20 ? 4004 + i * 0.42 : i < 24 ? 4012 : i < 36 ? 4012 - (i - 24) * 0.85 : i < 48 ? 4002 + (i - 36) * 1.45 : 4019 + (i - 48) * 0.1; const o = p, c = o + (t - o) * 0.55 + (r() - 0.5) * 1.6; C.push([o, Math.max(o, c) + r() * 1.4, Math.min(o, c) - r() * 1.4, c]); p = c; }
    const lo = 3996, hi = 4024, Y = (v) => 8 + (hi - v) / (hi - lo) * (h - 16), cw = (w - 60) / 64, X = (i) => 6 + i * cw + cw / 2;
    const z = (a, b, col) => { const g = x.createLinearGradient(0, Y(a), 0, Y(b)); g.addColorStop(0, `rgba(${col},.04)`); g.addColorStop(1, `rgba(${col},.3)`); x.fillStyle = g; x.fillRect(X(24), Math.min(Y(a), Y(b)), X(50) - X(24), Math.abs(Y(a) - Y(b))); };
    z(4012.4, 4000, '38,198,160'); z(4012.4, 4018.6, '240,70,75');
    C.forEach((c, i) => { const up = c[3] >= c[0]; x.strokeStyle = up ? '#e8e8ec' : '#80808a'; x.fillStyle = up ? '#e8e8ec' : '#2a2a30'; x.beginPath(); x.moveTo(X(i), Y(c[1])); x.lineTo(X(i), Y(c[2])); x.stroke(); x.fillRect(X(i) - cw * 0.3, Math.min(Y(c[0]), Y(c[3])), cw * 0.6, Math.max(1, Math.abs(Y(c[0]) - Y(c[3])))); });
    [[4000, 'Target', '#26c6a0', '#04140f'], [4018.6, 'Stop', '#c9373c', '#fff'], [4012.4, 'Entry', '#fff', '#000']].forEach(([v, t, bg, fg]) => { x.fillStyle = bg; x.fillRect(w - 52, Y(v) - 9, 48, 18); x.fillStyle = fg; x.font = '600 11px Manrope, sans-serif'; x.fillText(t, w - 46, Y(v) + 4); });
    x.fillStyle = 'rgba(255,122,61,.95)'; x.font = '600 11px Manrope, sans-serif'; x.fillText('Value high (your mark)', X(8), Y(4013.2) - 5);
    x.strokeStyle = 'rgba(255,90,31,.6)'; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(X(0), Y(4013.2)); x.lineTo(w - 56, Y(4013.2)); x.stroke(); x.setLineDash([]);
  }
  chart(); addEventListener('resize', chart);

  // playbook
  const PB = [['Absorption at value high', 'Sell the 3rd tap. Half off at 1R.', 6, 67, 1.1, 'fp', 3], ['Buy at value low', 'Only with the heatmap wall below holding.', 9, 56, 0.8, 'heat', 9],
    ['Exhaustion at poor high', 'Wait for the delta to flip first.', 4, 75, 1.9, 'fp', 13], ['Open drive with trend', 'First pullback only. No chasing.', 7, 43, 0.2, 'mp', 21], ['Stacked imbalance retest', 'Needs work: 5 of 8 lost in Asia.', 8, 38, -0.4, 'fp', 31]];
  let pbDone = 0;
  function drawPB() {
    if (pbDone) return; pbDone = 1; const el = $('sr-pb');
    el.innerHTML = PB.map((p, i) => `<div class="card" data-i="${i}"><canvas></canvas><div class="b"><h3>${p[0]}</h3><div class="sr-rule">“${p[1]}”</div><div class="sr-kv"><div><span class="sr-k">Seen</span><b>${p[2]}</b></div><div><span class="sr-k">Won</span><b>${p[3]}%</b></div><div><span class="sr-k">Average</span><b class="${p[4] < 0 ? 'neg' : 'pos'}">${p[4] > 0 ? '+' : ''}${p[4]}R</b></div></div></div></div>`).join('');
    el.querySelectorAll('.card').forEach((c) => { const p = PB[c.dataset.i]; fakeShot(c.querySelector('canvas'), p[5], p[6], 560, 260); c.onclick = () => openPB(p); });
  }
  function openPB(p) {
    const d = $('sr-pbd'); d.hidden = false; const ex = 'wwlwlw'.split('').slice(0, Math.min(6, p[2]));
    d.innerHTML = `<div class="sr-row" style="margin:0"><div><h3 style="font-size:18px;margin:0">${p[0]}</h3><p class="muted small" style="margin:2px 0 0">${p[2]} trades · ${p[3]}% won · average ${p[4] > 0 ? '+' : ''}${p[4]}R · last seen 20 Nov</p></div><span class="sr-grow"></span><a class="btn small secondary" href="/journal/plan">Plan a trade with this setup</a></div>
      <div class="sr-ex">${ex.map((c, k) => `<div class="sr-shot"><canvas></canvas><span>${['20 Nov', '14 Nov', '12 Nov', '6 Nov', '3 Nov', '29 Oct'][k]} · <b class="${c === 'w' ? 'pos' : 'neg'}">${c === 'w' ? '+1.6R' : '−1.0R'}</b><small>DeepCharts · at entry</small></span></div>`).join('')}</div>
      <div class="sr-cl"><div><span class="sr-k">My rules for this setup</span><div style="margin-top:6px"><div class="sr-ck"><i></i>Price taps the level at least twice</div><div class="sr-ck"><i></i>Sellers show up on the footprint at the level</div><div class="sr-ck"><i></i>Not in the first 5 minutes</div><div class="sr-ck"><i></i>Half off at 1R</div></div></div>
      <div><span class="sr-k">What my trades say</span><p style="font-size:13.5px;line-height:1.6;margin:8px 0 0">Wins came in the New York open (4 of 4). Both losses were the 1st tap, not the 3rd. Your winners went 2.1R on average before turning, so half off at 1R would have kept +0.6R on both losers.</p></div></div>`;
    d.querySelectorAll('canvas').forEach((c, k) => fakeShot(c, k % 2 ? 'heat' : p[5], p[6] + k * 5, 380, 224));
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
