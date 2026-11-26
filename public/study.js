// Study room (src/study.js): an open canvas like a whiteboard. Boards (one per setup + free boards) hold trade frames,
// screenshots, sticky notes, handwriting and hand-drawn marks. The Trades panel lists trades by account; clicking a trade
// there opens it on its own board in a new tab (like a browser tab), dragging it adds it to this board. Clicking a trade
// on the board opens the one-question-at-a-time panel (environment, notes, grade) that saves it into a setup.
(function () {
  const $ = (id) => document.getElementById(id);
  const app = $('sr-app'); if (!app) return;
  const H = document.documentElement; H.classList.add('sr-full');
  addEventListener('swap:leave', () => H.classList.remove('sr-full'), { once: true });
  // if the page's styles failed to load once (slow internet), load them again
  if (getComputedStyle(app).position !== 'fixed' && innerWidth > 1023) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/study.css?r=' + Date.now(); document.head.appendChild(l); }
  let D = {}; try { D = JSON.parse($('sr-data').textContent) || {}; } catch (e) { D = {}; }
  const ROOM = D.room || 'own', BOARD = D.board || { id: 0, data: {} };
  const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const R = (v) => (Math.abs(v) < 0.05 ? '' : v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + 'R';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tDate = (v) => { const d = new Date(String(v || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d; };
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  const fDay = (v) => { const d = tDate(v); return d ? d.getUTCDate() + ' ' + MN[d.getUTCMonth()] : ''; };
  const fLong = (v) => { const d = tDate(v); return d ? `${DN[d.getUTCDay()]} ${fDay(v)}` : ''; };
  const fTime = (v) => { const d = tDate(v); return d ? p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) : ''; };
  const money = (v) => (v < 0 ? '−' : '+') + '$' + Math.abs(Math.round(v || 0)).toLocaleString('en-US');
  const api = (url, body, raw) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': raw ? 'image/jpeg' : 'application/json' }, body: raw ? body : JSON.stringify(body || {}) })
    .then((r) => r.json().catch(() => ({})).then((j) => (r.ok ? j : Promise.reject(new Error(j.error || 'Could not save. Check your connection.')))));
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  let toastT; const toast = (m) => { const t = $('sr-toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2800); };
  const acctName = (num) => { const a = (D.accts || []).find((x) => x.num === num); return a ? a.name : num ? '••' + String(num).slice(-3) : ''; };

  /* ---------- rooms: the words of the questions and pen labels ---------- */
  const RM = {
    flow: { sets: [['Absorption at value high', 'Sell the 3rd tap. Half off at 1R.'], ['Buy at value low', 'Only while the heatmap wall below holds.'], ['Exhaustion at poor high', 'Wait for delta to flip first.'], ['Open drive with trend', 'First pullback only. No chasing.'], ['Stacked imbalance retest', 'Needs work: 5 of 8 lost in Asia.']],
      labels: ['Absorption', 'Value high', 'Entry', 'Stop', 'Target', '1R', 'Big sellers', 'Heatmap wall', '3rd tap', 'Half off here'],
      notes: ['Sellers sat on the value high. Three taps, no break.', 'Sold the 3rd tap. Took nothing at 1R. It turned and took my stop.', 'Take half at 1R when the next level is close.'],
      pairs: [['Absorption at value high', 'Heatmap wall held', 5, 7.4], ['Buy at value low', 'NY open', 6, 5.1], ['Exhaustion at poor high', 'Delta flip', 3, 4.8], ['Absorption at value high', 'Balance day', 4, 3.2], ['Stacked imbalance retest', 'Asia', 5, -3.4]],
      tabs: [['DeepCharts', 'footprint', 'fp'], ['Heatmap', 'liquidity', 'heat'], ['NinjaTrader', 'volume profile', 'mp']],
      q: [{ k: 'Where', q: 'Where was <em>price</em>?', o: [['Value high', 'up', 'Top of the value area'], ['Value low', 'down', 'Bottom of the value area'], ['POC', 'dot', 'Where most volume traded'], ['Poor high', 'up', 'A flat, unfinished top'], ['Poor low', 'down', 'A flat, unfinished bottom'], ['Outside value', 'out', 'Away from the value area']] },
        { k: 'What happened', q: 'What did you <em>see</em>?', multi: 1, o: [['Absorption', 'wall', 'Big orders soaked up the push'], ['Exhaustion', 'wave', 'The push ran out of fuel'], ['Big trades', 'bars', 'Large prints at the level'], ['Stacked imbalance', 'bars', 'One side kept winning, level after level'], ['Delta flip', 'wave', 'Buyers and sellers swapped control'], ['Heatmap wall held', 'wall', 'Resting orders stayed put'], ['Heatmap wall pulled', 'wall', 'Resting orders vanished']] }],
      pick: ['Value high', 'Absorption'] },
    pa: { sets: [['Rejection at resistance', 'Wait for the close, not the wick.'], ['Break and retest', 'Enter on the retest, never the break.'], ['Trend line bounce', 'Third touch only.'], ['Double top', 'Neckline must break first.'], ['Range breakout', 'Needs work: fakeouts in Asia.']],
      labels: ['Support', 'Resistance', 'Trend line', 'Rejection', 'Breakout', 'Retest', 'Entry', 'Stop', 'Target', '1R'],
      notes: ['Price tapped resistance three times with long wicks.', 'Sold the 3rd rejection. Took nothing at 1R. It turned and took my stop.', 'Take half at 1R when support is close.'],
      pairs: [['Rejection at resistance', 'Pin bar', 5, 6.8], ['Break and retest', 'London', 6, 5.0], ['Trend line bounce', 'Trend day', 3, 4.1], ['Rejection at resistance', 'Range day', 4, 2.9], ['Range breakout', 'Asia', 5, -3.1]],
      tabs: [['TradingView', 'higher time frame', 'tv']],
      q: [{ k: 'Where', q: 'Where was <em>price</em>?', o: [['Resistance', 'up', 'A level price failed at before'], ['Support', 'down', 'A level price held before'], ['Trend line', 'trend', 'A line of higher lows or lower highs'], ['Range high', 'up', 'Top of a sideways box'], ['Range low', 'down', 'Bottom of a sideways box'], ['Round number', 'dot', 'Like 4000.0 or 1.1000']] },
        { k: 'What happened', q: 'What did the <em>candles</em> do?', multi: 1, o: [['Rejection wick', 'wave', 'Long wick, close back inside'], ['Pin bar', 'wave', 'Small body, one long tail'], ['Engulfing', 'bars', 'One candle swallowed the last'], ['Breakout', 'bolt', 'Closed through the level'], ['Retest', 'out', 'Came back to the broken level'], ['Double top / bottom', 'wall', 'Same level failed twice']] }],
      pick: ['Resistance', 'Rejection wick'] },
    ict: { sets: [['Sweep and FVG', 'Wait for displacement after the sweep.'], ['Order block in discount', 'Only with a BOS on the 5 min.'], ['Silver bullet FVG', 'NY 10 to 11 only.'], ['Breaker block', 'Needs a clean CHoCH.'], ['Asia range sweep', 'Needs work: chop days.']],
      labels: ['FVG', 'BOS', 'CHoCH', 'Sweep', 'Order block', 'Liquidity', 'Entry', 'Stop', 'Target', '1R'],
      notes: ['Price swept the equal highs and left a FVG.', 'Sold into the FVG. Took nothing at 1R. It ran back for my stop.', 'Take half at the first draw on liquidity.'],
      pairs: [['Sweep and FVG', 'NY kill zone', 5, 7.1], ['Order block in discount', 'BOS', 6, 4.9], ['Silver bullet FVG', 'Trend day', 3, 4.4], ['Sweep and FVG', 'London', 4, 2.6], ['Asia range sweep', 'Asia', 5, -2.8]],
      tabs: [['TradingView', '15 min structure', 'tv']],
      q: [{ k: 'Where', q: 'Where was <em>price</em>?', o: [['Premium', 'up', 'Above the middle of the range'], ['Discount', 'down', 'Below the middle of the range'], ['Order block', 'wall', 'Last candle before the move'], ['FVG', 'flat', 'A gap three candles left behind'], ['Equal highs / lows', 'flat', 'Resting liquidity'], ['Previous day high / low', 'out', 'Yesterday\'s extremes']] },
        { k: 'What happened', q: 'What did you <em>see</em>?', multi: 1, o: [['Liquidity sweep', 'wave', 'Took the stops, then turned'], ['BOS', 'bolt', 'Broke the last swing'], ['CHoCH', 'wave', 'First break the other way'], ['Displacement', 'bolt', 'Big, fast candles'], ['FVG filled', 'flat', 'Came back into the gap'], ['Order block tap', 'wall', 'Touched it and reacted']] }],
      pick: ['Premium', 'Liquidity sweep'] },
    own: { sets: [['My first setup', 'Write your rule here.'], ['Level rejection', 'Add your own words below.'], ['Breakout', ''], ['Pullback', ''], ['Reversal', '']],
      labels: ['Entry', 'Stop', 'Target', '1R', 'Level', 'Note'],
      notes: ['Price stalled at the level.', 'Sold. Took nothing at 1R. It turned and took my stop.', 'Take half at 1R.'],
      pairs: [['Level rejection', 'London', 3, 3.2], ['Breakout', 'NY open', 4, 2.1], ['Pullback', 'Trend day', 2, 1.4], ['Reversal', 'Asia', 3, -1.8]],
      tabs: [['Screenshot', 'any platform', 'tv']],
      q: [{ k: 'Where', q: 'Where was <em>price</em>?', own: 1, o: [['Support', 'down', 'Your words. Add more with + Own word'], ['Resistance', 'up', 'Your words. Add more with + Own word']] },
        { k: 'What happened', q: 'What did you <em>see</em>?', multi: 1, own: 1, o: [] }],
      pick: ['Resistance'] } };
  const RC = RM[ROOM] || RM.own;
  const IC = { up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6', dot: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 9a3 3 0 100 6 3 3 0 000-6z', out: 'M4 12h16M14 6l6 6-6 6',
    bars: 'M5 20V10M12 20V4M19 20v-7', wall: 'M3 7h18M3 12h18M3 17h18', wave: 'M3 12c3-6 6 6 9 0s6 6 9 0', flat: 'M3 9h18M3 15h18', trend: 'M3 17l6-6 4 4 8-8', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    news: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5', moon: 'M20 14A8 8 0 019 3a8 8 0 1011 11z', sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M12 8a4 4 0 100 8 4 4 0 000-8z', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2' };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[k] || IC.dot}"/></svg>`;
  const ENV = [...RC.q.map((g) => ({ ...g, o: g.o.slice() })),
    { k: 'Day', q: 'What kind of <em>day</em>?', o: [['Balance', 'flat', 'Price rotated inside a range'], ['Trend', 'trend', 'One direction most of the day'], ['Open drive', 'bolt', 'Strong move straight from the open'], ['News', 'news', 'A big report moved it']] },
    { k: 'Session', q: 'Which <em>session</em>?', o: [['Asia', 'moon', 'Quiet hours'], ['London', 'sun', 'Europe opens'], ['NY open', 'clock', 'First hours of New York'], ['NY PM', 'clock', 'New York afternoon']] }];
  (D.words || []).forEach((w) => { const g = ENV.find((q) => q.k === w.qk); if (g && !g.o.some((o) => o[0].toLowerCase() === String(w.word).toLowerCase())) g.o.push([w.word, 'dot', 'Your own word.']); });
  const SETS = (D.setups || []).map((s) => { const w = s.r.filter((v) => v > 0), l = s.r.filter((v) => v <= 0), gw = w.reduce((a, b) => a + b, 0), gl = -l.reduce((a, b) => a + b, 0), n = s.r.length || 1;
    return { ...s, won: Math.round(w.length / n * 100), exp: (gw - gl) / n, pf: gl ? gw / gl : gw }; });

  /* ---------- the trade's own MT5 candles ---------- */
  function realChart(t, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), dg = Number.isFinite(t.digits) ? Math.min(t.digits, 5) : 2;
    g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, W, H);
    const all = (t.candles || []).filter((k) => Array.isArray(k) && k.length >= 5), o = tDate(t.open), cl = tDate(t.close);
    const at = (d) => { if (!d) return -1; const ts = d / 1000; let b = 0; all.forEach((k, i) => { if (k[0] <= ts) b = i; }); return b; };
    let iE = at(o), iX = Math.max(at(cl), iE); const a0 = Math.max(0, iE - 40), a1 = Math.min(all.length, Math.max(iX + 20, a0 + 60)), K = all.slice(a0, Math.min(a1, a0 + 140)); iE -= a0; iX -= a0;
    const lv = [t.entry, t.exit, t.sl, t.tp].filter((v) => Number.isFinite(v) && v > 0), ps = [...lv, ...K.flatMap((k) => [k[2], k[3]])];
    let lo = Math.min(...ps), hi = Math.max(...ps); if (!Number.isFinite(lo)) { lo = 0; hi = 1; } const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const ax = W - 130, Y = (v) => 60 + (hi - v) / (hi - lo) * (H - 120);
    g.strokeStyle = '#15151b'; g.lineWidth = 1; g.font = '17px Manrope, sans-serif'; g.fillStyle = '#6b6b75';
    for (let i = 0; i <= 6; i++) { const v = lo + (hi - lo) * i / 6; g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(ax, Y(v)); g.stroke(); g.fillText(v.toFixed(dg), ax + 12, Y(v) + 6); }
    g.fillStyle = '#c9c9d0'; g.font = '600 20px Manrope, sans-serif'; g.fillText(`${t.symbol} · ${t.tf || 'M1'} · MT5`, 24, 36);
    const N = Math.max(K.length, 1), cw = (ax - 30) / N, X = (i) => 15 + i * cw + cw / 2;
    if (!K.length) { g.fillStyle = '#6b6b75'; g.font = '18px Manrope, sans-serif'; g.fillText('No candles were saved with this trade. Add a screenshot instead.', 24, 70); }
    if (K.length && iE >= 0) { const x1 = X(Math.max(0, iE)), x2 = X(Math.min(K.length - 1, Math.max(iX, iE + 1)));
      if (Number.isFinite(t.tp) && t.tp > 0) { g.fillStyle = 'rgba(38,198,160,.12)'; g.fillRect(x1, Math.min(Y(t.entry), Y(t.tp)), x2 - x1, Math.abs(Y(t.entry) - Y(t.tp))); }
      if (Number.isFinite(t.sl) && t.sl > 0) { g.fillStyle = 'rgba(240,70,75,.14)'; g.fillRect(x1, Math.min(Y(t.entry), Y(t.sl)), x2 - x1, Math.abs(Y(t.entry) - Y(t.sl))); } }
    K.forEach((k, i) => { const up = k[4] >= k[1], y1 = Y(Math.max(k[1], k[4])), bh = Math.max(2, Y(Math.min(k[1], k[4])) - y1); g.strokeStyle = up ? '#e8e8ec' : '#7a7a84'; g.fillStyle = up ? '#e8e8ec' : '#25252b'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(X(i), Y(k[2])); g.lineTo(X(i), Y(k[3])); g.stroke(); g.fillRect(X(i) - cw * 0.32, y1, cw * 0.64, bh); if (!up) g.strokeRect(X(i) - cw * 0.32, y1, cw * 0.64, bh); });
    const tag = (v, txt, bg, fg) => { if (!Number.isFinite(v) || v <= 0) return; g.strokeStyle = bg; g.globalAlpha = 0.5; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(ax, Y(v)); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      g.fillStyle = bg; g.fillRect(ax + 2, Y(v) - 13, 126, 26); g.fillStyle = fg; g.font = '600 14px Manrope, sans-serif'; g.fillText(txt + ' ' + v.toFixed(dg), ax + 8, Y(v) + 5); };
    tag(t.tp, 'TP', '#26c6a0', '#03130e'); tag(t.sl, 'SL', '#f0464b', '#fff'); tag(t.exit, 'Exit', '#8a8a94', '#000'); tag(t.entry, String(t.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy', '#fff', '#000');
    if (K.length) { g.fillStyle = '#6b6b75'; g.font = '15px Manrope, sans-serif'; for (let i = 0; i < 6; i++) { const k = K[Math.round(i / 5 * (K.length - 1))], d = new Date(k[0] * 1000); g.fillText(p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()), 20 + i * (ax - 60) / 5, H - 22); } }
    return c;
  }

  /* ---------- canvas state ---------- */
  const vp = $('sr-vp'), world = $('sr-world'), ink = $('sr-ink');
  const BD = BOARD.data || {};
  let items = Array.isArray(BD.items) ? BD.items : [], shapes = Array.isArray(BD.shapes) ? BD.shapes : [], hist = [];
  const V = BD.view && Number.isFinite(BD.view.z) ? { ...BD.view } : { x: 60, y: 90, z: 0.7 };
  const S = { tool: 'select', color: '#ffffff', width: 3, sel: null };
  const TD = {};      // trade data by id (fetched)
  const goneShots = new Set();
  let saveT = 0, dirtyB = false;
  function changed() { dirtyB = true; clearTimeout(saveT); saveT = setTimeout(saveBoard, 1200); }
  function saveBoard() { if (!dirtyB) return; dirtyB = false;
    api('/journal/study/board/' + BOARD.id, { data: { items, shapes, view: { x: Math.round(V.x), y: Math.round(V.y), z: +V.z.toFixed(3) } } }).then(() => saved(true)).catch((e) => { saved(false); toast(e.message); }); }
  const saved = (ok) => { const s = $('sr-saved'); if (s) { s.classList.toggle('bad', !ok); s.lastChild.textContent = ok ? 'Saved' : 'Not saved'; } };
  addEventListener('beforeunload', () => { if (dirtyB) navigator.sendBeacon && navigator.sendBeacon('/journal/study/board/' + BOARD.id, new Blob([JSON.stringify({ data: { items, shapes, view: V } })], { type: 'application/json' })); });
  addEventListener('swap:leave', () => { if (dirtyB) saveBoard(); }, { once: true });
  const snap = () => { hist.push(JSON.stringify({ items, shapes })); if (hist.length > 60) hist.shift(); };
  function undo() { if (!hist.length) return; const s = JSON.parse(hist.pop()); items = s.items.filter((o) => !(o.type === 'shot' && goneShots.has(o.sid))); shapes = s.shapes; S.sel = null; renderAll(); changed(); }
  const apply = () => { world.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.z})`; vp.style.backgroundPosition = `${V.x}px ${V.y}px`; vp.style.backgroundSize = `${24 * V.z}px ${24 * V.z}px`; const z = $('sr-zv'); if (z) z.textContent = Math.round(V.z * 100) + '%'; };
  const toWorld = (cx, cy) => { const r = vp.getBoundingClientRect(); return [(cx - r.left - V.x) / V.z, (cy - r.top - V.y) / V.z]; };
  const center = () => { const r = vp.getBoundingClientRect(), side = sideOpen() ? 350 : 0; return toWorld(r.left + (r.width - side) / 2, r.top + r.height / 2); };
  let viewT = 0; const viewMoved = () => { clearTimeout(viewT); viewT = setTimeout(() => { dirtyB = true; saveBoard(); }, 2500); };
  function zoomAt(cx, cy, nz) { nz = Math.max(0.12, Math.min(3, nz)); const [wx, wy] = toWorld(cx, cy), r = vp.getBoundingClientRect(); V.z = nz; V.x = cx - r.left - wx * nz; V.y = cy - r.top - wy * nz; apply(); viewMoved(); }
  function fit() { const r = vp.getBoundingClientRect(); if (!items.length) { V.x = 80; V.y = 100; V.z = 0.8; apply(); return; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; items.forEach((o) => { const n = world.querySelector(`.s-it[data-id="${o.id}"]`), h = n ? n.offsetHeight : 300; x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + h); });
    const side = sideOpen() ? 360 : 0, W = r.width - side - 80, Hh = r.height - 150; V.z = Math.max(0.12, Math.min(1.2, W / (x1 - x0), Hh / (y1 - y0))); V.x = 40 + (W - (x1 - x0) * V.z) / 2 - x0 * V.z; V.y = 80 + (Hh - (y1 - y0) * V.z) / 2 - y0 * V.z; apply(); viewMoved(); }

  /* ---------- hand-drawn marks ---------- */
  function wob(pts, seed, amp, step = 7) { const r = rng(seed), out = []; let o = 0;
    for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, n = Math.max(1, Math.ceil(L / step));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) { const t = k / n; o = o * 0.85 + (r() - 0.5) * amp; out.push([ax + dx * t + nx * o, ay + dy * t + ny * o]); } } return out; }
  const dd = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + (+p[0]).toFixed(1) + ' ' + (+p[1]).toFixed(1)).join('');
  function paths(s) {
    const a = Math.min(1.4 + s.width * 0.25, 3.2), r = rng(s.seed), out = [];
    if (s.type === 'pen') out.push(dd(s.pts || []));
    else if (s.type === 'line' || s.type === 'arrow') {
      const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, bend = s.type === 'arrow' ? (r() - 0.5) * 0.2 * L : 0, mx = (s.x1 + s.x2) / 2 - (s.y2 - s.y1) / L * bend, my = (s.y1 + s.y2) / 2 + (s.x2 - s.x1) / L * bend, pts = [];
      for (let i = 0; i <= 20; i++) { const t = i / 20, u = 1 - t; pts.push([u * u * s.x1 + 2 * u * t * mx + t * t * s.x2, u * u * s.y1 + 2 * u * t * my + t * t * s.y2]); }
      out.push(dd(wob(pts, s.seed, a)));
      if (s.type === 'arrow') { const ang = Math.atan2(s.y2 - my, s.x2 - mx), hl = Math.max(18, s.width * 6); [-1, 1].forEach((k) => { const g = ang + Math.PI + k * 0.5; out.push(dd(wob([[s.x2, s.y2], [s.x2 + Math.cos(g) * hl, s.y2 + Math.sin(g) * hl]], s.seed + k * 7, a * 0.6))); }); }
    } else if (s.type === 'rect') { const j = () => (r() - 0.5) * s.width * 1.6, x = s.x, y = s.y, w = s.w, h = s.h;
      [[[x, y], [x + w, y]], [[x + w, y], [x + w, y + h]], [[x + w, y + h], [x, y + h]], [[x, y + h], [x, y]]].forEach((e, i) => out.push(dd(wob([[e[0][0] + j(), e[0][1] + j()], [e[1][0] + j(), e[1][1] + j()]], s.seed + i * 11, a)))); }
    else if (s.type === 'ellipse') { const cx = s.x + s.w / 2, cy = s.y + s.h / 2, st = r() * 6.28, sw = 6.28 * (1.07 + r() * 0.1), pts = [];
      for (let i = 0; i <= 64; i++) { const t = st + sw * i / 64, k = 0.96 + 0.08 * i / 64; pts.push([cx + Math.cos(t) * s.w / 2 * k, cy + Math.sin(t) * s.h / 2 * k]); } out.push(dd(wob(pts, s.seed, a * 0.7, 6))); }
    return out; }
  const COLOK = /^#[0-9a-f]{6}$/i;
  function renderInk() {
    ink.innerHTML = shapes.map((s) => { const P = paths(s), c = COLOK.test(s.color) ? s.color : '#ffffff', w = Math.min(12, Math.max(1, +s.width || 3));
      return `<g data-id="${esc(s.id)}" class="${S.sel === s.id ? 'sel' : ''}" transform="translate(${+s.dx || 0} ${+s.dy || 0})">${P.map((p) => `<path d="${p}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${w * 3} ${w * 3}"` : ''}/>`).join('')}<path d="${P.join('')}" fill="none" stroke="transparent" stroke-width="18"/></g>`; }).join(''); }

  /* ---------- things on the board ---------- */
  function tradeFrame(n, o) {
    const t = TD[o.tid];
    if (!t) { n.innerHTML = '<div class="s-fh"><b>Loading…</b></div><div class="s-ph"></div>'; getTrade(o.tid).then(() => { const m = world.querySelector(`.s-it[data-id="${o.id}"]`); if (m) tradeFrame(m, o); }).catch(() => { n.innerHTML = '<div class="s-fh"><b>Trade not found</b><span class="s-tag">It may have been deleted. Select it and press Delete.</span></div>'; }); return; }
    const env = (t.env || []).flat(), setup = SETS.find((s) => s.id === t.setup);
    n.innerHTML = `<div class="s-fh"><b>${esc(t.symbol)} ${String(t.side).toLowerCase() === 'sell' ? 'sell' : 'buy'}</b><span class="s-tag">${esc(acctName(t.acct))}</span><span class="s-tag">${fLong(t.open)} · ${fTime(t.open)}</span>${setup ? `<span class="s-tag">${esc(setup.n)}</span>` : ''}<span class="s-r ${(t.r || t.net) < 0 ? 'neg' : 'pos'}">${t.r ? R(t.r) : money(t.net)}</span></div><canvas></canvas>
      <div class="s-ff">${env.map((w) => `<span>${esc(w)}</span>`).join('') || '<span class="mu">Click to answer: where, what happened, day, session</span>'}${t.grade ? `<span class="g">${esc(t.grade)}</span>` : ''}</div>`;
    const c = n.querySelector('canvas'), W = Math.round(o.w * 2), Hh = Math.round(o.w); const src = realChart(t, W, Hh); c.width = W; c.height = Hh; c.getContext('2d').drawImage(src, 0, 0); c.style.height = (o.w / 2) + 'px';
    if (BOARD.trade === o.tid && !BD.view && !fitOnce) { fitOnce = true; requestAnimationFrame(fit); } }
  let fitOnce = false;
  const getTrade = (id) => (TD[id] ? Promise.resolve(TD[id]) : fetch('/journal/study/trade/' + id + '.json', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('gone')))).then((t) => (TD[id] = t)));
  function setupCard(n, o) { const s = SETS.find((x) => x.id === o.setup) || SETS.find((x) => x.id === BOARD.setup);
    if (!s) { n.innerHTML = '<div class="s-k">Setup</div><h3>No trades yet</h3>'; return; }
    n.innerHTML = `<div class="s-k">Setup</div><h3>${esc(s.n)}</h3><div class="s-nums"><div><b>${s.r.length}×</b><span>seen</span></div><div><b>${s.won}%</b><span>won</span></div><div><b class="${s.exp < -0.04 ? 'neg' : s.exp > 0.04 ? 'pos' : ''}">${R(s.exp)}</b><span>per trade</span></div><div><b>${s.pf.toFixed(2)}</b><span>profit factor</span></div></div><canvas></canvas><p class="s-rule" title="Click to write the rule">${esc(s.rule) || 'Click to write your rule for this setup'}</p>`;
    const c = n.querySelector('canvas'), W = o.w - 40, Hh = 70; c.width = W * 2; c.height = Hh * 2; c.style.height = Hh + 'px'; const g = c.getContext('2d'); g.scale(2, 2); let sum = 0; const pts = [0, ...s.r.map((v) => (sum += v))], hi = Math.max(1, ...pts), lo = Math.min(0, ...pts);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, Hh - 4 - (0 - lo) / (hi - lo) * (Hh - 8)); g.lineTo(W, Hh - 4 - (0 - lo) / (hi - lo) * (Hh - 8)); g.stroke();
    g.strokeStyle = '#f2f2f4'; g.lineWidth = 2; g.beginPath(); pts.forEach((v, i) => { const x = i / Math.max(1, pts.length - 1) * W, y = Hh - 4 - (v - lo) / (hi - lo) * (Hh - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    const rl = n.querySelector('.s-rule'); rl.onclick = (e) => { e.stopPropagation(); rl.contentEditable = 'true'; rl.focus(); if (!s.rule) rl.textContent = '';
      rl.onblur = () => { rl.contentEditable = 'false'; s.rule = rl.innerText.trim().slice(0, 120); rl.textContent = s.rule || 'Click to write your rule for this setup'; api('/journal/study/setup/' + s.id + '/rule', { rule: s.rule }).catch((er) => toast(er.message)); };
      rl.onkeydown = (k) => { if (k.key === 'Enter') { k.preventDefault(); rl.blur(); } }; }; rl.onpointerdown = (e) => e.stopPropagation(); }
  function renderItems() {
    world.querySelectorAll('.s-it').forEach((n) => n.remove());
    items.forEach((o) => {
      const n = document.createElement('div'); n.className = 's-it ' + ({ trade: 's-frame', shot: 's-frame s-shot', note: 's-note' + (o.orange ? ' o' : ''), text: 's-txt', setup: 's-setup' }[o.type] || 's-txt') + (S.sel === o.id ? ' sel' : '');
      n.dataset.id = o.id; Object.assign(n.style, { left: o.x + 'px', top: o.y + 'px', width: o.w + 'px' }); if (o.rot) n.style.setProperty('--rot', o.rot + 'deg'); if (o.color && o.type === 'text' && COLOK.test(o.color)) n.style.color = o.color;
      world.insertBefore(n, ink);
      if (o.type === 'trade') tradeFrame(n, o);
      else if (o.type === 'shot') { n.innerHTML = `<div class="s-fh"><b>${esc(o.name || 'Screenshot')}</b></div><img alt="" draggable="false" src="/journal/study/shot/${+o.sid}.jpg">`; n.querySelector('img').onerror = function () { this.replaceWith(Object.assign(document.createElement('div'), { className: 's-ph', textContent: 'Picture not found' })); }; }
      else if (o.type === 'setup') setupCard(n, o);
      else n.textContent = o.text || '';
    });
    renderInsp(); }
  const renderAll = () => { renderItems(); renderInk(); };

  /* ---------- top-left: boards ---------- */
  const isSetupBoard = Boolean(BOARD.setup);
  $('sr-tl').innerHTML = `<button type="button" class="s-ib" id="sr-menu" title="Boards" aria-label="Boards"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <button type="button" class="sr-board" id="sr-bbtn"><span>${esc(BOARD.name)}</span><small>${BOARD.trade ? 'trade' : isSetupBoard ? 'setup board' : 'board'}</small><svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></button>
    <span class="sr-saved" id="sr-saved"><i></i><span>Saved</span></span>`;
  function boardsMenu() {
    const el = $('sr-boards'), sb = (D.boards || []).filter((b) => b.setup), fb = (D.boards || []).filter((b) => !b.setup);
    const row = (b) => { const s = SETS.find((x) => x.id === b.setup); return `<a href="?b=${b.id}" class="${b.id === BOARD.id ? 'on' : ''}" data-b="${b.id}"><span>${esc(b.name)}</span><small>${s ? `${s.r.length} trade${s.r.length === 1 ? '' : 's'} · <span class="${s.exp < -0.04 ? 'neg' : s.exp > 0.04 ? 'pos' : ''}">${R(s.exp)}</span>` : ''}</small></a>`; };
    el.innerHTML = `<h6>Setup boards</h6>${sb.map(row).join('') || '<p class="mu">Save a trade to a setup and its board shows up here.</p>'}<h6>My boards</h6>${fb.map(row).join('')}
      <button type="button" id="sr-newb">+ New board</button>${!isSetupBoard ? `<div class="s-bact"><button type="button" id="sr-renb">Rename this board</button>${fb.length > 1 ? '<button type="button" id="sr-delb">Delete this board</button>' : ''}</div>` : ''}
      ${(D.rooms || []).length > 1 ? `<h6>Room</h6><div class="s-rooms">${D.rooms.map(([r, n]) => `<a href="?room=${r}" class="s-chip${r === ROOM ? ' on' : ''}">${n}</a>`).join('')}</div>` : ''}`;
    const ask = (btn, ph, val, go) => { const i = document.createElement('input'); i.className = 'sr-in'; i.placeholder = ph; i.value = val || ''; i.maxLength = 50; btn.replaceWith(i); i.focus(); i.select();
      i.onkeydown = (k) => { if (k.key === 'Enter' && i.value.trim()) go(i.value.trim()); if (k.key === 'Escape') boardsMenu(); }; };
    $('sr-newb').onclick = (e) => ask(e.currentTarget, 'Board name, e.g. This week', '', (name) => api('/journal/study/boards/new', { name }).then((j) => { location.href = '?b=' + j.id; }).catch((er) => toast(er.message)));
    if ($('sr-renb')) $('sr-renb').onclick = (e) => ask(e.currentTarget, 'New name', BOARD.name, (name) => api('/journal/study/board/' + BOARD.id + '/rename', { name }).then(() => { BOARD.name = name; $('sr-bbtn').firstChild.textContent = name; (D.boards.find((b) => b.id === BOARD.id) || {}).name = name; boardsMenu(); }).catch((er) => toast(er.message)));
    const del = $('sr-delb'); if (del) del.onclick = () => { if (!del.classList.contains('arm')) { del.classList.add('arm'); del.textContent = 'Click again to delete it'; return; } api('/journal/study/board/' + BOARD.id + '/delete').then(() => { location.href = location.pathname; }).catch((er) => toast(er.message)); }; }
  $('sr-menu').onclick = $('sr-bbtn').onclick = () => { const el = $('sr-boards'); if (el.hidden) boardsMenu(); el.hidden = !el.hidden; $('sr-props').hidden = true; };

  /* ---------- tabs: every trade opened from the list gets its own tab ---------- */
  const TABS = D.tabs || [];
  const nav = (href) => { const a = document.createElement('a'); a.href = href; a.hidden = true; app.appendChild(a); a.click(); a.remove(); };
  if (!BOARD.trade) store.set('srBoard', String(BOARD.id));
  function renderTabs() {
    const el = $('sr-tabs'); if (!el) return;
    if (!TABS.length) { el.hidden = true; return; }
    const lb = +store.get('srBoard', 0), home = (D.boards || []).find((b) => b.id === (BOARD.trade ? lb : BOARD.id)) || (D.boards || [])[0];
    el.hidden = false;
    el.innerHTML = (home ? `<a class="sr-tt home${BOARD.trade ? '' : ' on'}" href="?b=${home.id}" title="${esc(home.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg><span><b>${esc(home.name)}</b></span></a>` : '')
      + TABS.map((t) => { const v = t.r || t.net; return `<a class="sr-tt${t.id === BOARD.id ? ' on' : ''}" href="?b=${t.id}" data-tab="${t.id}" title="${esc(t.name)}"><i class="${v < 0 ? 'neg' : 'pos'}"></i><span><b>${esc(t.name)}</b><small>${fDay(t.close)} · <span class="${v < 0 ? 'neg' : 'pos'}">${t.r ? R(t.r) : money(t.net)}</span></small></span><button type="button" class="sr-tx" data-x="${t.id}" title="Close this tab" aria-label="Close this tab">×</button></a>`; }).join('');
    el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); closeTab(+b.dataset.x); }));
    const on = el.querySelector('.sr-tt.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  function closeTab(id) {
    const i = TABS.findIndex((t) => t.id === id); if (i < 0) return;
    api('/journal/study/board/' + id + '/close').then(() => {
      TABS.splice(i, 1);
      if (id !== BOARD.id) { renderTabs(); list(); return; }
      const nx = TABS[i] || TABS[i - 1], lb = +store.get('srBoard', 0);
      if (dirtyB) saveBoard();
      nav(nx ? '?b=' + nx.id : (D.boards || []).some((b) => b.id === lb) ? '?b=' + lb : location.pathname);
    }).catch((er) => toast(er.message)); }
  function openTrade(id, e) {
    const has = TABS.find((t) => t.trade === id);
    if (has && has.id === BOARD.id) { const o = items.find((q) => q.type === 'trade' && q.tid === id); if (o) { S.sel = o.id; renderAll(); } return; }
    const href = has ? '?b=' + has.id : '?t=' + id;
    if (e && (e.ctrlKey || e.metaKey || e.button === 1)) { window.open(href, '_blank'); return; }
    if (dirtyB) saveBoard();
    nav(href); }

  /* ---------- toolbar and ink options ---------- */
  const TOOLS = [['hand', 'H', 'Move around', 'M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V5.5a1.5 1.5 0 013 0V11M16 11V8a1.5 1.5 0 013 0v6a7 7 0 01-7 7h-1a6 6 0 01-5-2.7L4 14.5a1.6 1.6 0 012.5-2L8 14'],
    ['select', 'V', 'Select and move', 'M5 3l14 8-6 2-3 6z'], ['rect', 'R', 'Box', 'M4 6h16v12H4z'], ['ellipse', 'O', 'Circle', 'M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z'],
    ['arrow', 'A', 'Arrow', 'M5 19L19 5M11 5h8v8'], ['line', 'L', 'Level line', 'M4 14c5-.6 11-.4 16 .2'], ['pen', 'P', 'Pen', 'M3 17c3-6 5 2 8-3s4-7 6-4 2 6 4 4'],
    ['text', 'T', 'Handwriting', 'M5 6h14M12 6v13'], ['note', 'N', 'Sticky note', 'M5 4h14v10l-5 5H5zM14 19v-5h5'], ['image', 'I', 'Add a screenshot (or paste it)', 'M4 5h16v14H4zM4 15l5-5 5 5 2-2 4 4M15 9h.01']];
  $('sr-tools').innerHTML = TOOLS.map(([t, k, n, p], i) => (i === 2 || i === 7 ? '<span class="s-sep"></span>' : '') + `<button type="button" class="s-ib" data-tool="${t}"${t === 'image' ? ' id="sr-addpic"' : ''} title="${n} (${k})" aria-label="${n}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg><kbd>${k}</kbd></button>`).join('');
  $('sr-tools').querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  const COLS = [['#ffffff', 'White'], ['#ff5a1f', 'Orange'], ['#26c6a0', 'Teal'], ['#f0464b', 'Red'], ['#f5a524', 'Amber'], ['#8a8a94', 'Grey']];
  function setTool(t) {
    if (t === 'image') { $('sr-file').click(); t = 'select'; }
    S.tool = t; $('sr-tools').querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t));
    vp.className = 'sr-vp' + (t === 'hand' ? ' hand' : t === 'text' || t === 'note' ? ' type' : t === 'select' ? '' : ' draw');
    const draw = ['rect', 'ellipse', 'arrow', 'line', 'pen', 'text'].includes(t) || (t === 'select' && shapes.some((s) => s.id === S.sel)); $('sr-props').hidden = !draw; $('sr-boards').hidden = true; if (draw) renderProps(); }
  function renderProps() {
    $('sr-props').innerHTML = `<div><h6>Ink</h6><div class="s-row">${COLS.map(([c, n]) => `<button type="button" class="s-sw" style="background:${c}" data-c="${c}" aria-pressed="${c === S.color}" title="${n}" aria-label="${n} ink"></button>`).join('')}</div></div>
      <div><h6>Stroke</h6><div class="s-seg">${[['Thin', 2], ['Bold', 3], ['Extra bold', 5]].map(([l, w]) => `<button type="button" data-w="${w}" aria-pressed="${w === S.width}">${l}</button>`).join('')}</div></div>
      <div><h6>Labels</h6><div class="s-row">${RC.labels.slice(0, 8).map((l) => `<button type="button" class="s-chip" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>`;
    $('sr-props').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { S.color = b.dataset.c; const s = shapes.find((q) => q.id === S.sel), o = items.find((q) => q.id === S.sel && q.type === 'text'); if (s || o) { snap(); (s || o).color = S.color; renderAll(); changed(); } renderProps(); }));
    $('sr-props').querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { S.width = +b.dataset.w; const s = shapes.find((q) => q.id === S.sel); if (s) { snap(); s.width = S.width; renderInk(); changed(); } renderProps(); }));
    $('sr-props').querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { snap(); const [x, y] = center(); const o = { id: uid(), type: 'text', x: x - 80 + (Math.random() - 0.5) * 120, y: y - 20 + (Math.random() - 0.5) * 120, w: 320, text: b.dataset.l, color: S.color }; items.push(o); S.sel = o.id; renderItems(); changed(); })); }

  /* ---------- pointer: pan, draw, move ---------- */
  let drag = null, space = false;
  vp.addEventListener('pointerdown', (e) => {
    $('sr-boards').hidden = true;
    if (e.target.closest('[contenteditable="true"]')) return;
    const [x, y] = toWorld(e.clientX, e.clientY);
    if (S.tool === 'hand' || space || e.button === 1) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: V.x, vy: V.y }; vp.classList.add('panning'); vp.setPointerCapture(e.pointerId); return; }
    if (S.tool === 'select') {
      const it = e.target.closest('.s-it'), g = e.target.closest('.sr-ink g');
      if (it) { const o = items.find((q) => q.id === it.dataset.id); if (!o) return; const was = S.sel === o.id; S.sel = o.id; snap(); drag = { mode: 'move', o, sx: x, sy: y, ox: o.x, oy: o.y, moved: false, was }; if (e.shiftKey && o.type !== 'setup') drag.mode = 'resize'; }
      else if (g) { const s = shapes.find((q) => q.id === g.dataset.id); S.sel = s.id; S.color = s.color; S.width = s.width; snap(); drag = { mode: 'moveS', s, sx: x, sy: y, ox: s.dx || 0, oy: s.dy || 0, moved: false }; }
      else { S.sel = null; drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: V.x, vy: V.y }; vp.classList.add('panning'); }
      vp.setPointerCapture(e.pointerId); world.querySelectorAll('.s-it').forEach((n) => n.classList.toggle('sel', n.dataset.id === S.sel)); renderInk(); renderInsp(); setTool('select'); return; }
    if (S.tool === 'note' || S.tool === 'text') { snap(); const o = S.tool === 'note' ? { id: uid(), type: 'note', x: x - 20, y: y - 20, w: 260, text: '', rot: Math.round((Math.random() - 0.5) * 4) } : { id: uid(), type: 'text', x, y: y - 20, w: 360, text: '', color: S.color }; items.push(o); S.sel = o.id; renderItems(); e.preventDefault(); setTimeout(() => editItem(o), 30); setTool('select'); return; }
    snap(); const base = { id: uid(), color: S.color, width: S.width, seed: (Math.random() * 1e9) | 0 };
    const s = S.tool === 'pen' ? { ...base, type: 'pen', pts: [[x, y]] } : S.tool === 'arrow' || S.tool === 'line' ? { ...base, type: S.tool, x1: x, y1: y, x2: x, y2: y, dash: S.tool === 'line' } : { ...base, type: S.tool, x, y, w: 0, h: 0 };
    shapes.push(s); S.sel = s.id; drag = { mode: 'draw', s, sx: x, sy: y }; vp.setPointerCapture(e.pointerId); renderInk(); });
  vp.addEventListener('pointermove', (e) => { if (!drag) return; const [x, y] = toWorld(e.clientX, e.clientY);
    if (drag.mode === 'pan') { V.x = drag.vx + e.clientX - drag.sx; V.y = drag.vy + e.clientY - drag.sy; apply(); return; }
    if (drag.mode === 'move') { drag.moved = true; drag.o.x = Math.round(drag.ox + x - drag.sx); drag.o.y = Math.round(drag.oy + y - drag.sy); const n = world.querySelector(`.s-it[data-id="${drag.o.id}"]`); n.style.left = drag.o.x + 'px'; n.style.top = drag.o.y + 'px'; return; }
    if (drag.mode === 'resize') { drag.moved = true; drag.o.w = Math.max(160, Math.round(x - drag.o.x)); drag.resized = true; const n = world.querySelector(`.s-it[data-id="${drag.o.id}"]`); n.style.width = drag.o.w + 'px'; return; }
    if (drag.mode === 'moveS') { drag.moved = true; drag.s.dx = Math.round(drag.ox + x - drag.sx); drag.s.dy = Math.round(drag.oy + y - drag.sy); renderInk(); return; }
    const s = drag.s; if (s.type === 'pen') { const l = s.pts[s.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 2 / V.z) s.pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]); } else if ('x1' in s) { s.x2 = x; s.y2 = e.shiftKey ? s.y1 : y; } else { s.w = Math.abs(x - drag.sx); s.h = Math.abs(y - drag.sy); s.x = Math.min(x, drag.sx); s.y = Math.min(y, drag.sy); }
    renderInk(); });
  const up = () => { if (!drag) return; const d = drag; drag = null; vp.classList.remove('panning');
    if (d.mode === 'pan') { viewMoved(); return; }
    if ((d.mode === 'move' || d.mode === 'moveS' || d.mode === 'resize') && !d.moved) { hist.pop(); if (d.mode === 'move' && d.was && (d.o.type === 'note' || d.o.type === 'text')) editItem(d.o); return; }
    if (d.mode === 'resize') renderItems();
    if (d.mode === 'draw') { const s = d.s, tiny = s.type === 'pen' ? s.pts.length < 2 : 'x1' in s ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 6 : s.w < 6 && s.h < 6; if (tiny) { shapes = shapes.filter((q) => q !== s); hist.pop(); renderInk(); return; } renderInk(); }
    changed(); };
  vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  vp.addEventListener('dblclick', (e) => { const it = e.target.closest('.s-it'); if (!it) return; const o = items.find((q) => q.id === it.dataset.id); if (o && (o.type === 'note' || o.type === 'text')) editItem(o); });
  function editItem(o) { const n = world.querySelector(`.s-it[data-id="${o.id}"]`); if (!n) return; n.contentEditable = 'true'; n.focus(); const r = document.createRange(); r.selectNodeContents(n); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    n.onblur = () => { n.contentEditable = 'false'; const t = n.innerText.replace(/\n$/, '').slice(0, 600); if (t !== o.text) { o.text = t; changed(); } if (!o.text.trim()) { items = items.filter((q) => q !== o); renderItems(); changed(); } };
    n.onkeydown = (k) => { if (k.key === 'Escape' || (k.key === 'Enter' && (k.ctrlKey || k.metaKey))) n.blur(); }; }
  vp.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, V.z * Math.exp(-e.deltaY * 0.0022)); else { V.x -= e.deltaX; V.y -= e.deltaY; apply(); viewMoved(); } }, { passive: false });
  $('sr-zoom').innerHTML = `<button type="button" class="s-ib" id="sr-zo" aria-label="Zoom out" title="Zoom out (−)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg></button><output id="sr-zv">100%</output>
    <button type="button" class="s-ib" id="sr-zi" aria-label="Zoom in" title="Zoom in (+)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
    <button type="button" class="s-ib" id="sr-zf" aria-label="Fit everything" title="Fit everything (Shift+1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button><span class="s-sep"></span>
    <button type="button" class="s-ib" id="sr-undo" aria-label="Undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg></button><span class="s-sep"></span>
    <button type="button" class="sr-exp" id="sr-exp" title="Save a sharp PNG: the selected picture or trade at full quality, or the whole board when nothing is selected"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><span>Export</span></button>`;
  const vc = () => { const r = vp.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  $('sr-zi').onclick = () => zoomAt(...vc(), V.z * 1.2); $('sr-zo').onclick = () => zoomAt(...vc(), V.z / 1.2); $('sr-zf').onclick = fit; $('sr-undo').onclick = undo;
  function delSel() { if (!S.sel) return; const o = items.find((q) => q.id === S.sel);
    if (o && o.type === 'shot') { const del = () => api('/journal/study/shot/' + o.sid + '/delete').then((j) => { goneShots.add(o.sid); D.shots.used = j.used; drawer(); }).catch(() => {}); del(); }
    snap(); items = items.filter((q) => q.id !== S.sel); shapes = shapes.filter((q) => q.id !== S.sel); S.sel = null; renderAll(); changed(); }
  addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
    if (e.code === 'Space') { space = true; vp.classList.add('pan'); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); delSel(); return; }
    if (e.shiftKey && e.code === 'Digit1') { fit(); return; }
    if (e.key === '+' || e.key === '=') zoomAt(...vc(), V.z * 1.2); if (e.key === '-') zoomAt(...vc(), V.z / 1.2);
    if (e.key === 'Escape') { S.sel = null; setTool('select'); renderAll(); return; }
    const t = TOOLS.find((q) => q[1].toLowerCase() === e.key.toLowerCase()); if (t && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(t[0]); });
  addEventListener('keyup', (e) => { if (e.code === 'Space') { space = false; vp.classList.remove('pan'); } });

  /* ---------- screenshots: choose, paste or drop; shrunk to a JPEG and kept with the board ---------- */
  function addPic(f, at) { if (!f || !/^image\//.test(f.type)) return toast('That is not a picture. Use a PNG or JPG screenshot.');
    if (D.shots.used >= D.shots.cap) return toast(`You have used all ${D.shots.cap} screenshots. Delete old ones to add more.`);
    const im = new Image(); im.onload = () => { const s = Math.min(1, 3840 / im.width, 2400 / im.height), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      const q = (k) => new Promise((ok) => c.toBlob(ok, 'image/jpeg', k)), name = (f.name && !/^image\.\w+$/.test(f.name) ? f.name.replace(/\.\w+$/, '') : 'Screenshot').slice(0, 30); toast('Saving the screenshot…');
      q(0.93).then((b) => (b && b.size > 3800000 ? q(0.86) : b)).then((b) => (b && b.size > 3800000 ? q(0.75) : b)).then((b) => api('/journal/study/board/' + BOARD.id + '/shot?name=' + encodeURIComponent(name), b, true))
        .then((j) => { D.shots.used = j.used; snap(); const [x, y] = at || center(), w = 420; const o = { id: uid(), type: 'shot', sid: j.id, name, x: Math.round(x - w / 2), y: Math.round(y - w * c.height / c.width / 2), w }; items.push(o); S.sel = o.id; renderItems(); changed(); drawer(); toast(`Saved. ${D.shots.used} of ${D.shots.cap} screenshots used.`); })
        .catch((er) => toast(er.message)); };
    im.onerror = () => toast('Could not read that picture.'); im.src = URL.createObjectURL(f); }
  $('sr-file').onchange = (e) => { addPic(e.target.files[0]); e.target.value = ''; };
  document.addEventListener('paste', (e) => { if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return; const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/')); if (it) { e.preventDefault(); addPic(it.getAsFile()); } });
  vp.addEventListener('dragover', (e) => { e.preventDefault(); vp.classList.add('drop'); });
  vp.addEventListener('dragleave', () => vp.classList.remove('drop'));
  vp.addEventListener('drop', (e) => { e.preventDefault(); vp.classList.remove('drop'); const at = toWorld(e.clientX, e.clientY), tid = e.dataTransfer.getData('text/x-trade');
    if (tid) return dropTrade(+tid, at[0] - 60, at[1] - 30); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) addPic(f, at); });

  /* ---------- side panel: trades by account (hide button folds it away) ---------- */
  const F = { acct: store.get('srAcct', ''), st: 'todo', res: 'all', q: '', off: 0 };
  if (F.acct && !(D.accts || []).some((a) => a.num === F.acct)) F.acct = '';
  let rows = [], more = false, total = 0, listT = 0;
  let hidden = store.get('srSide', '') === 'hide';
  const sideOpen = () => !hidden;
  function drawer() {
    const el = $('sr-drawer'), A = D.accts || [], all = { num: '', name: 'All accounts', n: A.reduce((a, x) => a + x.n, 0), todo: A.reduce((a, x) => a + x.todo, 0) };
    el.innerHTML = `<header><h2>Trades <button type="button" class="s-hide" id="sr-hide" title="Hide this panel" aria-label="Hide this panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 6l6 6-6 6M5 6l6 6-6 6"/></svg></button></h2>
      ${A.length > 1 ? `<div class="s-accts">${[all, ...A].map((a) => `<button type="button" class="s-acct" data-a="${esc(a.num)}" aria-pressed="${a.num === F.acct}"><b>${esc(a.name)}</b><small>${a.todo.toLocaleString('en-US')} to study · ${a.n.toLocaleString('en-US')}</small></button>`).join('')}</div>` : ''}
      <label class="s-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="sr-q" placeholder="Search symbol or setup" aria-label="Search trades" value="${esc(F.q)}"></label>
      <div class="s-chips">${[['todo', 'To study'], ['done', 'Studied'], ['all', 'All']].map(([k, n]) => `<button type="button" class="s-chip" data-st="${k}" aria-pressed="${F.st === k}">${n}</button>`).join('')}<span class="gap"></span>${[['all', 'All'], ['win', 'Wins'], ['loss', 'Losses']].map(([k, n]) => `<button type="button" class="s-chip" data-res="${k}" aria-pressed="${F.res === k}">${n}</button>`).join('')}</div></header>
      <div class="s-list" id="sr-list"></div>
      <footer>Click a trade to open it in its own tab. Drag it onto the board to compare. <span>${D.shots.used} of ${D.shots.cap} screenshots used</span></footer>`;
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { F.acct = b.dataset.a; store.set('srAcct', F.acct); el.querySelectorAll('[data-a]').forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); }));
    el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { F.st = b.dataset.st; el.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); }));
    el.querySelectorAll('[data-res]').forEach((b) => (b.onclick = () => { F.res = b.dataset.res; el.querySelectorAll('[data-res]').forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); }));
    $('sr-q').oninput = (e) => { F.q = e.target.value; clearTimeout(listT); listT = setTimeout(load, 300); };
    $('sr-hide').onclick = () => side(false);
    list(); }
  function load(append) { if (!append) F.off = 0;
    fetch(`/journal/study/trades.json?acct=${encodeURIComponent(F.acct)}&st=${F.st}&res=${F.res}&q=${encodeURIComponent(F.q)}&off=${F.off}`, { credentials: 'same-origin' }).then((r) => r.json())
      .then((j) => { rows = append ? rows.concat(j.rows) : j.rows; more = j.more; total = j.total; F.off = rows.length; list(); }).catch(() => { const l = $('sr-list'); if (l) l.innerHTML = '<p class="s-empty">Could not load your trades. Check your connection.</p>'; }); }
  function list() { const l = $('sr-list'); if (!l) return;
    if (!rows.length) { l.innerHTML = `<p class="s-empty">${(D.accts || []).length ? 'No trades match. Try another account or filter.' : 'Your trades show up here once the Journal EA records them.'}</p>`; return; }
    const on = new Set(items.filter((o) => o.type === 'trade').map((o) => o.tid)), tabbed = new Set(TABS.map((t) => t.trade)); let html = `<div class="s-cnt">${total.toLocaleString('en-US')} trade${total === 1 ? '' : 's'}</div>`, day = '';
    rows.forEach((t) => { const dy = fLong(t.close); if (dy !== day) { day = dy; html += `<div class="s-day">${dy}</div>`; }
      html += `<div class="s-tr${t.done ? ' done' : ''}${on.has(t.id) ? ' on-board' : ''}${tabbed.has(t.id) ? ' on-tab' : ''}" draggable="true" data-id="${t.id}" tabindex="0" role="button" title="Click to open in its own tab. Drag onto the board to compare."><b><span class="dot"></span>${esc(t.symbol)} <span class="s-side">${esc(String(t.side).toLowerCase())}</span></b><span class="v ${(t.r || t.net) < 0 ? 'neg' : 'pos'}">${t.r ? R(t.r) : money(t.net)}</span><small>${fTime(t.close)} · ${esc(t.setup || (F.acct ? 'No setup yet' : acctName(t.acct)))}</small><small class="s-r">${money(t.net)}</small></div>`; });
    if (more) html += '<button type="button" class="s-more" id="sr-more">Show more</button>';
    l.innerHTML = html;
    l.querySelectorAll('.s-tr').forEach((r) => { r.ondragstart = (e) => { e.dataTransfer.setData('text/x-trade', r.dataset.id); e.dataTransfer.effectAllowed = 'copy'; };
      r.onclick = (e) => openTrade(+r.dataset.id, e); r.onauxclick = (e) => { if (e.button === 1) openTrade(+r.dataset.id, e); }; r.onkeydown = (k) => { if (k.key === 'Enter') openTrade(+r.dataset.id, k); }; });
    if ($('sr-more')) $('sr-more').onclick = () => load(true); }
  function dropTrade(id, x, y) { const has = items.find((o) => o.type === 'trade' && o.tid === id); if (has) { S.sel = has.id; renderAll(); return toast('That trade is already on this board.'); }
    snap(); const o = { id: uid(), type: 'trade', tid: id, x: Math.round(x), y: Math.round(y), w: 600 }; items.push(o); S.sel = o.id; renderAll(); changed(); list(); }
  function side(open) { hidden = !open; store.set('srSide', hidden ? 'hide' : ''); layoutSide(); }
  function layoutSide() { const tr = items.find((q) => q.id === S.sel && q.type === 'trade');
    $('sr-drawer').hidden = hidden || Boolean(tr); $('sr-insp').hidden = hidden || !tr;
    const tab = $('sr-tab'); tab.hidden = !hidden; tab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/></svg><span>${tr ? 'This trade' : 'Trades'}</span>`; tab.onclick = () => side(true);
    app.classList.toggle('side-off', hidden); }

  /* ---------- this trade: the same one-question-at-a-time panel as sign-up ---------- */
  let pane = 'env', hintT = '', saveT2 = 0;
  const GR = [['A+', 'Perfect, by the plan'], ['A', 'Good, small slip'], ['B', 'Right idea, poor exit'], ['C', 'Forced it'], ['F', 'Broke my rules']];
  const st = {};   // per trade: answers (Sets), question number, name typed
  function stOf(t) { if (!st[t.id]) { const env = ENV.map((g, i) => new Set((t.env || [])[i] || [])); ENV.forEach((g, i) => env[i].forEach((w) => { if (!g.o.some((o) => o[0] === w)) g.o.push([w, 'dot', 'Your own word.']); }));
    let qn = t.studied ? ENV.length : env.findIndex((x) => !x.size); if (qn < 0) qn = ENV.length; const s = SETS.find((x) => x.id === t.setup); st[t.id] = { env, qn, name: s ? s.n : '' }; } return st[t.id]; }
  const autoName = (E) => { const w = [...E.env[1]][0], a = [...E.env[0]][0]; return w && a ? `${w} at ${a.toLowerCase()}` : w || a || ''; };
  const nameOf = (E) => (E.name || autoName(E)).trim().slice(0, 70);
  function saveStudy(t, done) { const E = stOf(t); t.env = E.env.map((x) => [...x]);
    return api('/journal/study/' + t.id + '/save', { room: ROOM, env: t.env, notes: t.notes || [], grade: t.grade || '', marks: [], setup: done ? nameOf(E) : '', done: done ? 1 : 0, fix: t.fix === false ? 0 : 1 }); }
  const soon = (t) => { clearTimeout(saveT2); saveT2 = setTimeout(() => saveStudy(t, false).catch((e) => toast(e.message)), 1200); };
  function renderInsp() {
    layoutSide(); const o = items.find((q) => q.id === S.sel && q.type === 'trade'), el = $('sr-insp');
    if (!o) return; const t = TD[o.tid]; if (!t) { el.innerHTML = '<p class="s-empty">Loading…</p>'; getTrade(o.tid).then(renderInsp).catch(() => {}); return; }
    const E = stOf(t), dg = Number.isFinite(t.digits) ? Math.min(t.digits, 5) : 2, f = (v) => (Number.isFinite(v) && v > 0 ? v.toFixed(dg) : '–');
    el.innerHTML = `<button type="button" class="s-hide" id="sr-hide2" title="Hide this panel" aria-label="Hide this panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 6l6 6-6 6M5 6l6 6-6 6"/></svg></button>
      <button type="button" class="s-back" id="sr-back">← Trades</button>
      <div class="s-tc"><div class="s-trow"><b>${esc(t.symbol)}</b><span class="s-side2">${String(t.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy'}</span><span class="s-when">${fLong(t.open)} · ${fTime(t.open)}</span></div>
        <div class="s-big"><span class="${(t.r || t.net) < 0 ? 'neg' : 'pos'}">${t.r ? R(t.r) : money(t.net)}</span><small>${t.r ? money(t.net) : 'no stop, so no R'}</small></div>
        <div class="s-meta">${esc(acctName(t.acct))} · entry ${f(t.entry)} · stop ${f(t.sl)} · target ${f(t.tp)}</div></div>
      <div class="s-itabs" role="tablist">${[['env', 'Environment'], ['notes', 'Notes'], ['review', 'Review']].map(([k, n]) => `<button type="button" role="tab" data-p="${k}" aria-selected="${pane === k}">${n}</button>`).join('')}</div>
      <div id="sr-pb"></div>
      <button type="button" class="s-cta-big" id="sr-done"><span>${nameOf(E) ? 'Save to “' + esc(nameOf(E)) + '”' : 'Save to my playbook'}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
    $('sr-hide2').onclick = () => side(false); $('sr-back').onclick = () => { S.sel = null; renderAll(); };
    el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { pane = b.dataset.p; renderInsp(); }));
    $('sr-done').onclick = () => { if (!nameOf(E)) { pane = 'env'; E.qn = Math.max(0, E.env.findIndex((x) => !x.size)); renderInsp(); return toast('Answer the questions first, or give the setup a name.'); }
      const b = $('sr-done'); b.disabled = true; b.firstChild.textContent = 'Saving…'; clearTimeout(saveT2);
      saveStudy(t, true).then((j) => { t.studied = true; t.setup = j.setup; const nm = nameOf(E); if (!SETS.some((s) => s.id === j.setup)) { SETS.push({ id: j.setup, n: nm, rule: '', r: [], won: 0, exp: 0, pf: 0 }); if (!D.boards.some((x) => x.setup === j.setup) && j.board) D.boards.push({ id: j.board, name: nm, setup: j.setup }); }
        b.firstChild.textContent = 'Saved to “' + nm + '” ✓'; toast(j.fixed ? 'Saved. “Next time” is now a fix in your Focus panel.' : 'Saved. It is on the “' + nm + '” board too.'); renderItems(); load(); })
        .catch((er) => { b.disabled = false; b.firstChild.textContent = 'Save to “' + nameOf(E) + '”'; toast(er.message); }); };
    const pb = $('sr-pb');
    if (pane === 'notes') { t.notes = [0, 1, 2].map((i) => (t.notes || [])[i] || ''); pb.innerHTML = `<p class="s-pk">Write it like you'd tell a friend. Short is fine.</p>${['What I saw', 'What I did', 'Next time'].map((l, i) => `<label class="s-pl">${l}<textarea rows="3" data-n="${i}">${esc(t.notes[i])}</textarea></label>`).join('')}`;
      pb.querySelectorAll('textarea').forEach((x) => (x.oninput = () => { t.notes[+x.dataset.n] = x.value; soon(t); })); return; }
    if (pane === 'review') { pb.innerHTML = `<h3 class="s-qh">How did you <em>trade</em> it?</h3><div class="s-chips2">${GR.map(([g, h]) => `<button type="button" class="s-qc gr${t.grade === g ? ' on' : ''}" data-g="${g}" data-h="${h}"><b>${g}</b></button>`).join('')}</div><p class="s-qhint" id="sr-gh">${(GR.find((g) => g[0] === t.grade) || [0, 'Pick one. Only you see it.'])[1]}</p>
        <label class="s-tog"><input type="checkbox" id="sr-fix"${t.fix === false ? '' : ' checked'}><i></i><span>Add “Next time” to my Focus panel</span></label>${D.mentor ? `<a class="s-lnk" href="/journal/${t.id}">Ask my mentor about this trade →</a>` : ''}`;
      pb.querySelectorAll('[data-g]').forEach((b) => { b.onmouseenter = () => ($('sr-gh').textContent = b.dataset.h); b.onclick = () => { t.grade = b.dataset.g; soon(t); renderItems(); }; });
      $('sr-fix').onchange = (e) => (t.fix = e.target.checked); return; }
    if (E.qn >= ENV.length) {
      const nm = nameOf(E), m = SETS.find((s) => s.n.toLowerCase() === nm.toLowerCase()), seen = m && m.r.length;
      pb.innerHTML = `<div class="s-step fade"><div class="s-sbar"><i style="width:100%"></i></div><div class="s-sk">${seen ? 'You have seen this before' : 'Name this setup'}</div>
        <input class="sr-in sr-name" id="sr-name" list="sr-names" maxlength="70" value="${esc(nm)}" placeholder="e.g. ${esc(RC.sets[0][0])}" aria-label="Setup name"><datalist id="sr-names">${SETS.map((s) => `<option value="${esc(s.n)}">`).join('')}</datalist>
        ${seen ? `<div class="s-match"><div class="s-ring" style="--p:${m.won}"><b>${m.won}%</b><small>won</small></div><div><span class="s-ln"><b>${m.r.length} time${m.r.length > 1 ? 's' : ''}</b> · <b class="${m.exp < 0 ? 'neg' : 'pos'}">${R(m.exp)}</b> a trade${m.last ? ' · last ' + fDay(m.last) : ''}</span><div class="s-mini">${m.r.slice(-20).map((v) => `<i class="${v > 0 ? 'w' : ''}"></i>`).join('')}</div>${m.rule ? `<span class="s-ln">${esc(m.rule)}</span>` : ''}</div></div>`
          : '<p class="s-qhint">Same name = same setup. Saving adds this trade to it and to its board.</p>'}
        <div class="s-act"><button type="button" class="s-ghost" data-back>Change answers</button><span></span></div></div>`;
      const ni = $('sr-name'); ni.oninput = () => { E.name = ni.value; $('sr-done').firstChild.textContent = ni.value.trim() ? 'Save to “' + ni.value.trim() + '”' : 'Save to my playbook'; }; ni.onchange = () => renderInsp();
    } else {
      const g = ENV[E.qn], sel = E.env[E.qn];
      pb.innerHTML = `<div class="s-step fade"><div class="s-sbar"><i style="width:${E.qn / ENV.length * 100}%"></i></div><div class="s-sk">Question ${E.qn + 1} of ${ENV.length}${g.multi ? ' · pick all that fit' : ''}</div><h3 class="s-qh">${g.q}</h3>
        <div class="s-chips2">${g.o.map(([w, ic, h]) => `<button type="button" class="s-qc${sel.has(w) ? ' on' : ''}" data-t="${esc(w)}" data-h="${esc(h)}">${svg(ic)}${esc(w)}</button>`).join('')}<button type="button" class="s-qc add" data-own>+ Own word</button></div>
        <p class="s-qhint" id="sr-qh">${hintT || (g.own && !g.o.length ? 'Add the words you use, like FVG or order block. They stay in your list.' : g.multi ? 'Tap all that fit, then Continue.' : 'Tap one. It moves on by itself.')}</p>
        <div class="s-act">${E.qn ? '<button type="button" class="s-ghost" data-back>← Back</button>' : '<span></span>'}<button type="button" class="s-cta" data-next ${sel.size ? '' : 'disabled'}>Continue<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div></div>`;
      pb.querySelectorAll('[data-t]').forEach((b) => { b.onmouseenter = () => ($('sr-qh').textContent = b.dataset.h);
        b.onclick = () => { const w = b.dataset.t; if (g.multi) { sel.has(w) ? sel.delete(w) : sel.add(w); } else { sel.clear(); sel.add(w); } hintT = b.dataset.h; t.env = E.env.map((x) => [...x]); soon(t); refreshFrame(o);
          if (!g.multi) { pb.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); setTimeout(() => { E.qn++; hintT = ''; renderInsp(); }, 260); } else renderInsp(); }; });
      pb.querySelector('[data-own]').onclick = (e) => { const i = document.createElement('input'); i.className = 's-qc own'; i.placeholder = ROOM === 'flow' ? 'Your word' : 'e.g. FVG'; i.maxLength = 28; e.currentTarget.replaceWith(i); i.focus();
        let done = false; const add = () => { if (done) return; done = true; const v = i.value.trim().replace(/[<>]/g, ''); if (v && !g.o.some((x) => x[0].toLowerCase() === v.toLowerCase())) { g.o.push([v, 'dot', 'Your own word. It stays in your list.']); if (!g.multi) sel.clear(); sel.add(v); t.env = E.env.map((x) => [...x]); soon(t); refreshFrame(o);
          api('/journal/study/word', { room: ROOM, qk: g.k, word: v }).catch((er) => toast(er.message)); } renderInsp(); };
        i.onkeydown = (k) => { if (k.key === 'Enter') add(); if (k.key === 'Escape') { done = true; renderInsp(); } }; i.onblur = add; };
      pb.querySelector('[data-next]').onclick = () => { E.qn++; hintT = ''; renderInsp(); };
    }
    const bk = pb.querySelector('[data-back]'); if (bk) bk.onclick = () => { E.qn = E.qn >= ENV.length ? 0 : Math.max(0, E.qn - 1); hintT = ''; renderInsp(); };
    pb.insertAdjacentHTML('beforeend', '<div class="s-rec"><h6>The record</h6>' + ENV.map((g, i) => `<button type="button" class="s-r${i === E.qn ? ' on' : ''}" data-i="${i}"><small>${esc(g.k)}</small><span>${esc([...E.env[i]].join(', '))}</span></button>`).join('') + '</div>');
    pb.querySelectorAll('.s-rec .s-r').forEach((r) => (r.onclick = () => { E.qn = +r.dataset.i; hintT = ''; renderInsp(); }));
  }
  function refreshFrame(o) { const n = world.querySelector(`.s-it[data-id="${o.id}"]`); if (n) tradeFrame(n, o); }

  /* ---------- export: a sharp PNG to share (selected item at its full size, or the whole board) ---------- */
  function exportPng() {
    const sel = items.find((o) => o.id === S.sel), list = sel ? [sel] : items.slice();
    if (!list.length && !shapes.length) return toast('Nothing on this board to export yet.');
    const box = [1e9, 1e9, -1e9, -1e9], grow = (x0, y0, x1, y1) => { box[0] = Math.min(box[0], x0); box[1] = Math.min(box[1], y0); box[2] = Math.max(box[2], x1); box[3] = Math.max(box[3], y1); };
    const hOf = (o) => { const n = world.querySelector(`.s-it[data-id="${o.id}"]`); return n ? n.offsetHeight : 200; };
    list.forEach((o) => grow(o.x, o.y, o.x + o.w, o.y + hOf(o)));
    const bb = (sh) => { const pts = sh.type === 'pen' ? (sh.pts || []) : sh.type === 'line' || sh.type === 'arrow' ? [[sh.x1, sh.y1], [sh.x2, sh.y2]] : [[sh.x, sh.y], [sh.x + sh.w, sh.y + sh.h]];
      const xs = pts.map((p) => p[0] + (+sh.dx || 0)), ys = pts.map((p) => p[1] + (+sh.dy || 0)); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
    // marks drawn on the selected item come with it; with nothing selected, every mark
    const inks = shapes.filter((sh) => { const b = bb(sh); return !sel || (b[2] > box[0] && b[0] < box[2] && b[3] > box[1] && b[1] < box[3]); });
    if (!sel) inks.forEach((sh) => { const b = bb(sh), m = (+sh.width || 3) * 3 + 20; grow(b[0] - m, b[1] - m, b[2] + m, b[3] + m); });
    const pad = sel ? 0 : 40, W = box[2] - box[0] + pad * 2, Hh = box[3] - box[1] + pad * 2;
    // scale: as sharp as the sharpest picture on it (screenshots keep their own pixels), at least 2x, within browser limits
    let want = 2; list.forEach((o) => { const im = o.type === 'shot' && world.querySelector(`.s-it[data-id="${o.id}"] img`); if (im && im.naturalWidth) want = Math.max(want, im.naturalWidth / (o.w - 2)); });
    const k = Math.max(1, Math.min(want, sel ? 10 : 6, 16000 / Math.max(W, Hh), Math.sqrt((sel ? 60e6 : 36e6) / (W * Hh))));
    const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(Hh * k);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.fillStyle = '#08080a'; g.fillRect(0, 0, c.width, c.height);
    g.scale(k, k); g.translate(pad - box[0], pad - box[1]);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const hand = '"Architects Daughter", Caveat, cursive';
    const wrap = (txt, x, y, maxW, lh) => { String(txt || '').split('\n').forEach((para) => { let line = ''; para.split(' ').forEach((w) => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; }); g.fillText(line, x, y); y += lh; }); };
    list.forEach((o) => { const n = world.querySelector(`.s-it[data-id="${o.id}"]`); if (!n) return; const h = n.offsetHeight, x = o.x, y = o.y;
      g.save();
      if (o.type === 'trade' || o.type === 'shot') {
        rr(x, y, o.w, h, 12); g.fillStyle = '#0c0c0f'; g.fill(); g.clip();
        const fh = n.querySelector('.s-fh'), media = n.querySelector('canvas, img');
        if (fh) { g.fillStyle = '#f2f2f4'; g.font = o.type === 'shot' ? '600 12.5px Manrope, sans-serif' : '600 14px Sora, Manrope, sans-serif'; g.textBaseline = 'middle';
          const tb = fh.querySelector('b'); g.fillText(tb ? tb.textContent : '', x + 14, y + fh.offsetHeight / 2);
          const r = fh.querySelector('.s-r'); if (r) { g.font = '700 16px Sora, sans-serif'; g.fillStyle = r.classList.contains('neg') ? '#f0464b' : '#26c6a0'; g.textAlign = 'right'; g.fillText(r.textContent, x + o.w - 14, y + fh.offsetHeight / 2); g.textAlign = 'left'; }
          g.fillStyle = '#18181d'; g.fillRect(x, y + fh.offsetHeight - 1, o.w, 1); }
        if (media) { const my = y + media.offsetTop, mh = media.offsetHeight;
          if (o.type === 'trade' && TD[o.tid]) g.drawImage(realChart(TD[o.tid], Math.round(o.w * k), Math.round(mh * k)), x, my, o.w, mh);
          else if (media.tagName === 'IMG' && media.complete && media.naturalWidth) g.drawImage(media, x, my, o.w, mh);
          else if (media.tagName === 'CANVAS') g.drawImage(media, x, my, o.w, mh);
          const ff = n.querySelector('.s-ff'); if (ff) { g.fillStyle = '#c9c9d0'; g.font = '11.5px Manrope, sans-serif'; g.textBaseline = 'middle'; g.fillText([...ff.children].map((e) => e.textContent).join('  ·  '), x + 14, my + mh + (h - (media.offsetTop + mh)) / 2); } }
        g.restore(); g.save(); rr(x + 0.5, y + 0.5, o.w - 1, h - 1, 12); g.strokeStyle = '#1f1f24'; g.lineWidth = 1; g.stroke();
      } else if (o.type === 'note') {
        g.translate(x + o.w / 2, y + h / 2); g.rotate((o.rot || -1) * Math.PI / 180); g.translate(-o.w / 2, -h / 2);
        rr(0, 0, o.w, h, 6); g.fillStyle = o.orange ? '#ff5a1f' : '#f2f2f4'; g.fill(); g.fillStyle = o.orange ? '#160600' : '#111'; g.font = '22px ' + hand; g.textBaseline = 'top'; wrap(o.text, 16, 14, o.w - 32, 27.5);
      } else if (o.type === 'text') {
        g.fillStyle = COLOK.test(o.color) ? o.color : '#f2f2f4'; g.font = '34px ' + hand; g.textBaseline = 'top'; wrap(o.text, x, y, o.w, 39);
      } else if (o.type === 'setup') {
        rr(x, y, o.w, h, 14); g.fillStyle = '#101013'; g.fill(); g.fillStyle = '#f2f2f4'; g.font = '600 22px Sora, sans-serif'; g.textBaseline = 'top'; const h3 = n.querySelector('h3'); g.fillText(h3 ? h3.textContent : 'Setup', x + 20, y + 40);
        const cv = n.querySelector('canvas'); if (cv) g.drawImage(cv, x + cv.offsetLeft, y + cv.offsetTop, cv.offsetWidth, cv.offsetHeight);
      }
      g.restore(); });
    inks.forEach((sh) => { const col = COLOK.test(sh.color) ? sh.color : '#ffffff', w = Math.min(12, Math.max(1, +sh.width || 3));
      g.save(); g.translate(+sh.dx || 0, +sh.dy || 0); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; if (sh.dash) g.setLineDash([w * 3, w * 3]);
      paths(sh).forEach((d) => g.stroke(new Path2D(d))); g.restore(); });
    const nm = (sel && sel.type === 'shot' ? sel.name : sel && sel.type === 'trade' && TD[sel.tid] ? TD[sel.tid].symbol + '-' + TD[sel.tid].side : BOARD.name) || 'study';
    c.toBlob((b) => { if (!b) return toast('Could not make the picture. Try a smaller part of the board.');
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'study-' + String(nm).replace(/\W+/g, '-').toLowerCase().replace(/^-|-$/g, '') + '.png'; a.setAttribute('data-no-swap', ''); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`Saved a ${c.width} × ${c.height} PNG.`); }, 'image/png'); }
  $('sr-exp').onclick = () => document.fonts.ready.then(exportPng);

  /* ---------- boot ---------- */
  // a setup board always has its setup card
  if (isSetupBoard && !items.some((o) => o.type === 'setup')) items.unshift({ id: uid(), type: 'setup', setup: BOARD.setup, x: -560, y: 0, w: 480 });
  $('sr-hint').textContent = items.length ? 'Scroll to move around · Ctrl + scroll to zoom · Shift + drag a frame to resize it' : 'Empty board. Drag trades here from the right (a click opens a trade in its own tab), paste a screenshot, or draw anywhere.';
  if (BOARD.trade) { const o = items.find((q) => q.type === 'trade' && q.tid === BOARD.trade); if (o) S.sel = o.id; }
  setTool('select'); renderTabs(); drawer(); load(); renderAll(); apply();
  if (!BD.view) requestAnimationFrame(fit);
  Promise.all(['Architects Daughter', 'Caveat'].map((f) => document.fonts.load(`30px "${f}"`).catch(() => {}))).then(() => renderItems());
})();
