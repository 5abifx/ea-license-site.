// Study room (src/study.js): full-screen PC workbench. Chart Ink (hand-drawn marks on screenshots) sits in the middle.
// LIVE when the page carries a trade (#sr-data from src/study.js): real candles, saved marks, screenshots, setups.
// With no trades yet it shows a sample trade so the member can see how it works (nothing is saved then).
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('sr-app')) return;
  const H = document.documentElement; H.classList.add('sr-full');
  addEventListener('swap:leave', () => H.classList.remove('sr-full'), { once: true });
  const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const uid = () => Math.random().toString(36).slice(2, 9), seedNew = () => (Math.random() * 1e9) | 0;
  const R = (v) => (Math.abs(v) < 0.05 ? '' : v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + 'R';
  const ROOM = $('sr-app').dataset.room || 'flow';
  // each room: its setup names, pen labels, sample notes and the four questions (only words change; the flow is the same)
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
  const RC = RM[ROOM] || RM.flow;
  let D = {}; try { D = JSON.parse($('sr-data').textContent) || {}; } catch (e) { D = {}; }
  const LIVE = Boolean(D.trade), TR = D.trade || {};
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tDate = (v) => { const d = new Date(String(v || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d; };
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  const fDay = (v) => { const d = tDate(v); return d ? d.getUTCDate() + ' ' + MN[d.getUTCMonth()] : ''; };
  const fWhen = (v) => { const d = tDate(v); return d ? `${DN[d.getUTCDay()]} ${fDay(v)} · ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : ''; };
  const money = (v) => (v < 0 ? '−' : '+') + '$' + Math.abs(Math.round(v || 0)).toLocaleString('en-US');
  const api = (url, body, raw) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': raw ? 'image/jpeg' : 'application/json' }, body: raw ? body : JSON.stringify(body || {}) })
    .then((r) => r.json().catch(() => ({})).then((j) => (r.ok ? j : Promise.reject(new Error(j.error || 'Could not save. Check your connection.')))));
  const DPR = () => Math.min(devicePixelRatio || 1, 2);
  function fitCv(cv) { const d = DPR(), w = cv.clientWidth, h = cv.clientHeight; cv.width = w * d; cv.height = h * d; const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return [x, w, h]; }
  function spark(cv, pts, col) {
    const [x, w, h] = fitCv(cv); if (!w) return; let s = 0; const c = [0, ...pts.map((v) => (s += v))], lo = Math.min(...c), hi = Math.max(...c), Y = (v) => h - 3 - (v - lo) / ((hi - lo) || 1) * (h - 6), X = (i) => i / (c.length - 1) * w;
    x.strokeStyle = col; x.lineWidth = 1.6; x.lineJoin = 'round'; x.beginPath(); c.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.stroke();
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col + '33'); g.addColorStop(1, col + '00'); x.lineTo(w, h); x.lineTo(0, h); x.fillStyle = g; x.fill();
  }

  /* ---------- sample data ---------- */
  const RS = [[1.6, -1, 2.1, 1.4, -1, 1.8, -1, '20 Nov'], [0.8, -1, 1.2, -1, 2, 0.9, -1, 1.1, 0.6, '19 Nov'], [2.2, 1.9, -1, 2.6, '14 Nov'], [1.5, -1, -1, 0.9, -1, 1.2, -0.6, '12 Nov'], [-1, 1.4, -1, -1, 0.8, -1, -1, 1.2, '6 Nov']];
  const SETS = LIVE ? (D.setups || []).map((s) => ({ id: s.id, n: s.n, rule: s.rule || '', c: '#f2f2f4', r: s.r || [], last: fDay(s.last) || '–', trades: s.trades || [] }))
    : RC.sets.map(([n, rule], i) => ({ n, rule, c: '#f2f2f4', r: RS[i].slice(0, -1), last: RS[i][RS[i].length - 1], trades: [] }));
  SETS.forEach((s) => { const w = s.r.filter((v) => v > 0), l = s.r.filter((v) => v <= 0), gw = w.reduce((a, b) => a + b, 0), gl = -l.reduce((a, b) => a + b, 0), n = s.r.length || 1;
    s.won = Math.round(w.length / n * 100); s.exp = (gw - gl) / n; s.pf = gl ? gw / gl : gw; s.tot = gw - gl; });
  const INBOX = [['XAUUSD', 'sell', 'Thu 20 Nov · 09:42', -184, -1, 'No screenshot yet'], ['NAS100', 'buy', 'Wed 19 Nov · 10:05', 612, 2.4, '2 pictures, no setup'],
    ['XAUUSD', 'buy', 'Wed 19 Nov · 15:22', 203, 1.1, 'No notes yet'], ['EURUSD', 'sell', 'Tue 18 Nov · 08:31', -96, -0.6, 'No screenshot yet']];
  const PAST = [['14 Nov', 2.1, 'Sold the 3rd tap, half off at 1R, rest ran to the POC.'], ['12 Nov', 1.4, 'Two taps only, but big sellers on the footprint.'], ['6 Nov', -1, '1st tap. Too early, no absorption yet.'], ['3 Nov', 1.8, 'Heatmap wall above held all morning.'], ['29 Oct', 1.6, 'Clean 3 taps in the New York open.'], ['27 Oct', -1, 'Against my bias on a trend day.']];

  /* ---------- quotes ---------- */
  const Q = [['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'], ['We suffer more often in imagination than in reality.', 'Seneca'],
    ['No man is free who is not master of himself.', 'Epictetus'], ['We are what we repeatedly do.', 'Will Durant'], ['Lost the battle, not the war.', '5ABI.FX']];
  let qi = 0; const qe = $('sr-q');
  const showQ = () => { qe.classList.add('out'); setTimeout(() => { qe.innerHTML = '“' + Q[qi][0] + '”<small>' + Q[qi][1] + '</small>'; qe.classList.remove('out'); qi = (qi + 1) % Q.length; }, qe.innerHTML ? 700 : 0); };
  showQ(); setInterval(showQ, 11000);

  /* ---------- sample pictures (drawn, so the preview needs no images) ---------- */
  function mt5(W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), r = rng(7);
    g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, W, H);
    const ax = W - 110, lo = 3994, hi = 4026, Y = (v) => 60 + (hi - v) / (hi - lo) * (H - 120);
    g.strokeStyle = '#15151b'; g.lineWidth = 1; g.font = '17px Manrope, sans-serif'; g.fillStyle = '#6b6b75';
    for (let p = 3996; p <= 4024; p += 4) { g.beginPath(); g.moveTo(0, Y(p)); g.lineTo(ax, Y(p)); g.stroke(); g.fillText(p.toFixed(1), ax + 14, Y(p) + 6); }
    g.fillStyle = '#c9c9d0'; g.font = '600 20px Manrope, sans-serif'; g.fillText('XAUUSD · M1 · MT5', 24, 36);
    g.fillStyle = '#6b6b75'; g.font = '15px Manrope, sans-serif'; g.fillText('Sample chart, not real data', 230, 36);
    const N = 90, C = []; let p = 4003;
    for (let i = 0; i < N; i++) { const t = i < 26 ? 4003 + i * 0.36 : i < 34 ? 4012.6 : i < 40 ? 4011 : i < 46 ? 4012.8 : i < 62 ? 4012 - (i - 46) * 0.55 : 4003.5 + (i - 62) * 0.62;
      const o = p, cl = o + (t - o) * 0.6 + (r() - 0.5) * 1.4; C.push([o, Math.max(o, cl) + r() * 1.1, Math.min(o, cl) - r() * 1.1, cl]); p = cl; }
    const cw = (ax - 30) / N, X = (i) => 15 + i * cw + cw / 2;
    const zone = (a, b, col) => { g.fillStyle = col; g.fillRect(X(44), Math.min(Y(a), Y(b)), X(80) - X(44), Math.abs(Y(a) - Y(b))); };
    zone(4012.4, 4000, 'rgba(38,198,160,.12)'); zone(4012.4, 4018.6, 'rgba(240,70,75,.14)');
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(0, Y(4013.2)); g.lineTo(ax, Y(4013.2)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#8a8a94'; g.font = '15px Manrope, sans-serif'; g.fillText(ROOM === 'flow' ? 'VAH 4013.2' : ROOM === 'ict' ? 'Equal highs 4013.2' : 'Resistance 4013.2', 24, Y(4013.2) - 8);
    C.forEach((k, i) => { const up = k[3] >= k[0]; g.strokeStyle = up ? '#e8e8ec' : '#7a7a84'; g.fillStyle = up ? '#e8e8ec' : '#25252b'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(X(i), Y(k[1])); g.lineTo(X(i), Y(k[2])); g.stroke(); const y1 = Y(Math.max(k[0], k[3])); g.fillRect(X(i) - cw * 0.32, y1, cw * 0.64, Math.max(2, Y(Math.min(k[0], k[3])) - y1));
      if (!up) { g.strokeStyle = '#7a7a84'; g.strokeRect(X(i) - cw * 0.32, y1, cw * 0.64, Math.max(2, Y(Math.min(k[0], k[3])) - y1)); } });
    [[4000, 'TP 4000.0', '#26c6a0', '#03130e'], [4018.6, 'SL 4018.6', '#f0464b', '#fff'], [4012.4, 'Sell 4012.4', '#fff', '#000']].forEach(([v, t, bg, fg]) => { g.fillStyle = bg; g.fillRect(ax + 2, Y(v) - 13, 106, 26); g.fillStyle = fg; g.font = '600 14px Manrope, sans-serif'; g.fillText(t, ax + 8, Y(v) + 5); });
    g.fillStyle = '#6b6b75'; g.font = '15px Manrope, sans-serif'; ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15'].forEach((t, i) => g.fillText(t, 20 + i * (ax - 60) / 5, H - 22));
    return { c, tap: [[X(28), Y(4013.6)], [X(37), Y(4013.4)], [X(44), Y(4013.9)]], entry: [X(46), Y(4012.4)], stop: [X(64), Y(4004)], Y, ax };
  }
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
  function shot(kind, seed, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), r = rng(seed); x.fillStyle = '#09090c'; x.fillRect(0, 0, W, H);
    if (kind === 'heat') {
      for (let i = 0; i < 120; i++) { const y = r() * H, h = 3 + r() * H * 0.012, a = r(); x.fillStyle = a > 0.88 ? `rgba(255,${130 + r() * 90 | 0},40,${0.55 + r() * 0.4})` : `rgba(${30 + r() * 50 | 0},${60 + r() * 90 | 0},${130 + r() * 110 | 0},${0.2 + r() * 0.35})`; x.fillRect(0, y, W, h); }
      x.fillStyle = 'rgba(255,170,60,.85)'; x.fillRect(W * 0.35, H * 0.28, W * 0.62, H * 0.022);
      x.strokeStyle = '#fff'; x.lineWidth = Math.max(1.5, W / 600); x.beginPath(); let p = H * 0.55; for (let i = 0; i <= W; i += W / 260) { p += (r() - 0.5) * H * 0.018; p = Math.max(H * 0.31, Math.min(H * 0.8, p)); i ? x.lineTo(i, p) : x.moveTo(i, p); } x.stroke();
      for (let i = 0; i < 16; i++) { x.fillStyle = r() > 0.4 ? 'rgba(240,70,75,.6)' : 'rgba(38,198,160,.6)'; x.beginPath(); x.arc(W * 0.3 + r() * W * 0.65, H * 0.3 + r() * H * 0.12, (3 + r() * 16) * W / 900, 0, 7); x.fill(); }
    } else if (kind === 'fp') {
      const cols = 7, rows = 16, cw = W / cols, rh = H / rows;
      for (let cI = 0; cI < cols; cI++) { const mid = (rows * (0.32 + r() * 0.2)) | 0;
        for (let k = 0; k < rows; k++) { if (Math.abs(k - mid) > 4 + r() * 2) continue; const v = r(), bid = r() > 0.45; x.fillStyle = bid ? `rgba(240,70,75,${0.12 + v * 0.45})` : `rgba(38,198,160,${0.12 + v * 0.45})`; x.fillRect(cI * cw + 6, k * rh + 1, cw - 12, rh - 2);
          if (W > 300) { x.fillStyle = 'rgba(255,255,255,.8)'; x.font = `${Math.max(9, rh * 0.5)}px Manrope, sans-serif`; x.fillText((v * 900 | 0) + ' x ' + (r() * 900 | 0), cI * cw + 12, k * rh + rh * 0.7); } }
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1; x.strokeRect(cI * cw + 4, (mid - 4) * rh, cw - 8, rh * 9); }
      if (W > 300) { x.fillStyle = '#c9c9d0'; x.font = `600 ${H * 0.028}px Manrope, sans-serif`; x.fillText('Footprint · GC · 1 min · sample', 14, H - 14); }
    } else {
      let p = H * 0.55; const n = 40; for (let i = 0; i < n; i++) { const o = p, cl = o + (r() - 0.5) * H * 0.07, xx = 8 + i * (W - 16) / n, bw = (W - 16) / n * 0.55;
        x.strokeStyle = cl < o ? '#ddd' : '#777'; x.fillStyle = cl < o ? '#ddd' : '#2a2a30'; x.lineWidth = Math.max(1, W / 900); x.beginPath(); x.moveTo(xx + bw / 2, Math.min(o, cl) - r() * H * 0.02); x.lineTo(xx + bw / 2, Math.max(o, cl) + r() * H * 0.02); x.stroke(); x.fillRect(xx, Math.min(o, cl), bw, Math.max(1, Math.abs(cl - o))); p = cl; }
      if (kind !== 'tv') for (let k = 0; k < 24; k++) { x.fillStyle = k === 9 ? 'rgba(255,90,31,.45)' : 'rgba(255,255,255,.14)'; x.fillRect(W - 4 - r() * W * 0.24, k * H / 24 + 1, W, H / 24 - 2); }
      if (W > 300) { x.fillStyle = '#c9c9d0'; x.font = `600 ${H * 0.028}px Manrope, sans-serif`; x.fillText(kind === 'tv' ? 'XAUUSD · 15 min · sample' : 'Volume profile · GC · 5 min · sample', 14, H - 14); }
    }
    return c;
  }

  /* ---------- Chart Ink engine (hand-drawn marks) ---------- */
  const cv = $('ci-cv'), ctx = cv.getContext('2d'), stage = $('ci-stage'), typer = $('ci-type');
  const COLORS = [['#ffffff', 'White'], ['#ff5a1f', 'Orange'], ['#26c6a0', 'Teal'], ['#f0464b', 'Red']];
  const FONTS = [['Architects Daughter', 'Print caps'], ['Caveat', 'Marker'], ['Kalam', 'Felt tip'], ['Patrick Hand', 'Neat'], ['Permanent Marker', 'Bold']];
  const LABELS = RC.labels;
  const S = { tool: 'select', color: '#ffffff', size: 4, font: 'Architects Daughter', fs: 40, sel: null, drag: null };
  let B = null; // current board {bg, objs, hist}

  function wobble(poly, seed, amp, step = 6) { const r = rng(seed), out = []; let o = 0;
    for (let i = 1; i < poly.length; i++) { const [ax, ay] = poly[i - 1], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, n = Math.max(1, Math.ceil(L / step));
      for (let k = (i === 1 ? 0 : 1); k <= n; k++) { const t = k / n; o = o * 0.86 + (r() - 0.5) * amp; out.push([ax + dx * t + nx * o, ay + dy * t + ny * o]); } } return out; }
  function ink(c, pts, size, color, seed, dashed) { c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    if (dashed) { c.lineWidth = size; c.setLineDash([size * 3.2, size * 2.6]); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]); return; }
    const r = rng(seed + 101); let w = 1; for (let i = 1; i < pts.length; i++) { w += (r() - 0.5) * 0.14; w = Math.min(1.18, Math.max(0.78, w)); c.lineWidth = size * w; c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); } }
  function handLine(c, x1, y1, x2, y2, size, color, seed, dashed) { const r = rng(seed), L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, a = r() * size * 0.8, b = r() * size * 1.6;
    ink(c, wobble([[x1 - ux * a, y1 - uy * a], [x2 + ux * b, y2 + uy * b]], seed + 3, Math.min(1.4 + size * 0.18, 3.2)), size, color, seed, dashed); }
  function handEllipse(c, o) { const r = rng(o.seed), cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = Math.abs(o.w / 2), ry = Math.abs(o.h / 2), st = r() * Math.PI * 2, sw = Math.PI * 2 * (1.07 + r() * 0.1), tl = (r() - 0.5) * 0.14, pts = [];
    for (let i = 0; i <= 72; i++) { const t = i / 72, a = st + sw * t, k = 0.96 + 0.08 * t, ex = Math.cos(a) * rx * k, ey = Math.sin(a) * ry * k; pts.push([cx + ex * Math.cos(tl) - ey * Math.sin(tl), cy + ex * Math.sin(tl) + ey * Math.cos(tl)]); }
    ink(c, wobble(pts, o.seed + 5, Math.min(0.9 + o.size * 0.1, 2), 5), o.size, o.color, o.seed); }
  function handRect(c, x, y, w, h, size, color, seed) { const r = rng(seed), j = () => (r() - 0.5) * size * 1.4;
    handLine(c, x + j(), y + j(), x + w + j(), y + j(), size, color, seed + 11); handLine(c, x + w + j(), y + j(), x + w + j(), y + h + j(), size, color, seed + 22);
    handLine(c, x + w + j(), y + h + j(), x + j(), y + h + j(), size, color, seed + 33); handLine(c, x + j(), y + h + j(), x + j(), y + j(), size, color, seed + 44); }
  function handArrow(c, o) { const r = rng(o.seed), { x1, y1, x2, y2 } = o, L = Math.hypot(x2 - x1, y2 - y1) || 1, bend = (r() - 0.5) * 0.22 * L, mx = (x1 + x2) / 2 + (-(y2 - y1) / L) * bend, my = (y1 + y2) / 2 + ((x2 - x1) / L) * bend, pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push([u * u * x1 + 2 * u * t * mx + t * t * x2, u * u * y1 + 2 * u * t * my + t * t * y2]); }
    ink(c, wobble(pts, o.seed + 3, Math.min(1 + o.size * 0.15, 2.6)), o.size, o.color, o.seed);
    const ang = Math.atan2(y2 - my, x2 - mx), hl = Math.max(16, o.size * 5.5) * (0.9 + r() * 0.25);
    for (const s of [-1, 1]) { const a = ang + Math.PI + s * (0.5 + (r() - 0.5) * 0.15); handLine(c, x2, y2, x2 + Math.cos(a) * hl, y2 + Math.sin(a) * hl, o.size, o.color, o.seed + (s > 0 ? 71 : 83)); } }
  const fontStr = (o) => `${o.fs}px "${o.font}", "Comic Sans MS", cursive`;
  function textBox(o) { ctx.save(); ctx.font = fontStr(o); const lines = String(o.text || ' ').split('\n'), lh = o.fs * 1.12, w = Math.max(...lines.map((l) => ctx.measureText(l || ' ').width)); ctx.restore(); return { lines, lh, w, h: lines.length * lh }; }
  function drawText(c, o) { const m = textBox(o); c.save(); c.translate(o.x, o.y); c.rotate(o.rot || 0); c.font = fontStr(o); c.fillStyle = o.color; c.textBaseline = 'top';
    m.lines.forEach((l, i) => c.fillText(l, 0, i * m.lh + o.fs * 0.04)); const sw = Math.max(2, o.fs / 18);
    if (o.box) { const p = o.fs * 0.22; handRect(c, -p, -p * 0.7, m.w + p * 2, m.h + p * 1.2, sw, o.color, o.seed + 13); if (o.box === 2) handRect(c, -p * 1.55, -p * 1.2, m.w + p * 3.1, m.h + p * 2.2, sw, o.color, o.seed + 29); }
    if (o.ul) handLine(c, -o.fs * 0.05, m.h + o.fs * 0.06, m.w + o.fs * 0.08, m.h + o.fs * 0.02, sw, o.color, o.seed + 9); c.restore(); }
  function bbox(o) {
    if (o.type === 'text') { const m = textBox(o), p = o.box ? o.fs * 0.36 : o.fs * 0.06; return { x: o.x - p, y: o.y - p, w: m.w + p * 2, h: m.h + p * 2 }; }
    if (o.type === 'ellipse' || o.type === 'rect') return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
    if (o.type === 'arrow' || o.type === 'line') return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    const xs = o.pts.map((p) => p[0]), ys = o.pts.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  const segD = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
  function hit(o, x, y, tol) { if (o.type === 'arrow' || o.type === 'line') return segD(x, y, o.x1, o.y1, o.x2, o.y2) < tol + o.size;
    if (o.type === 'pen') { for (let i = 1; i < o.pts.length; i++) if (segD(x, y, ...o.pts[i - 1], ...o.pts[i]) < tol + o.size) return true; return false; }
    const b = bbox(o); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol; }
  function handles(o) { if (!o || o.type === 'pen') return []; if (o.type === 'arrow' || o.type === 'line') return [['p1', o.x1, o.y1], ['p2', o.x2, o.y2]]; const b = bbox(o); return [['se', b.x + b.w, b.y + b.h]]; }
  const uiScale = () => cv.width / (cv.getBoundingClientRect().width || cv.width);
  function drawObj(c, o) { switch (o.type) {
    case 'text': drawText(c, o); break; case 'arrow': handArrow(c, o); break; case 'line': handLine(c, o.x1, o.y1, o.x2, o.y2, o.size, o.color, o.seed, o.dashed); break;
    case 'ellipse': handEllipse(c, o); break; case 'rect': handRect(c, Math.min(o.x, o.x + o.w), Math.min(o.y, o.y + o.h), Math.abs(o.w), Math.abs(o.h), o.size, o.color, o.seed); break;
    case 'pen': ink(c, o.pts, o.size, o.color, o.seed); break; } }
  function paint(c, b, W, Hh, sel) { c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh); if (!b) return; if (b.bg) c.drawImage(b.bg, 0, 0, W, Hh);
    const k = W / 1600; c.save(); c.scale(k, k); for (const o of b.objs) drawObj(c, o);
    const o = sel && b.objs.find((q) => q.id === sel);
    if (o) { const u = uiScale(), bb = bbox(o), p = 6 * u; c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.5 * u; c.setLineDash([6 * u, 5 * u]); c.strokeRect(bb.x - p, bb.y - p, bb.w + p * 2, bb.h + p * 2); c.setLineDash([]);
      for (const [, hx, hy] of handles(o)) { c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.beginPath(); c.arc(hx, hy, 7 * u, 0, 7); c.fill(); c.stroke(); } }
    c.restore(); }
  let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(ctx, B, cv.width, cv.height, S.sel); if (typer.hidden === false) placeTyper(); }); };
  function sizeCanvas() { const r = stage.getBoundingClientRect(), mw = r.width - 24, mh = r.height - 24; if (mw <= 0) return; const w = Math.min(mw, mh * 16 / 9); cv.style.width = w + 'px'; cv.style.height = w * 9 / 16 + 'px'; redraw(); }
  // board space is always 1600 x 900; the canvas pixel size is fixed at that too
  const snap = () => { B.hist.push(JSON.stringify(B.objs)); if (B.hist.length > 80) B.hist.shift(); };
  function undo() { if (!B.hist.length) return; B.objs = JSON.parse(B.hist.pop()); if (!B.objs.find((o) => o.id === S.sel)) S.sel = null; endType(); redraw(); thumbs(); }
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 1600 / r.width, (e.clientY - r.top) * 900 / r.height]; };
  const selObj = () => B.objs.find((o) => o.id === S.sel);
  const pick = (x, y) => { const t = 8 * uiScale(); for (let i = B.objs.length - 1; i >= 0; i--) if (hit(B.objs[i], x, y, t)) return B.objs[i]; return null; };

  // inline handwriting: a see-through text box sits over the note while you type
  let typing = null;
  function placeTyper() { const o = typing && B.objs.find((q) => q.id === typing); if (!o) return endType(); const r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = r.width / 1600, m = textBox(o);
    Object.assign(typer.style, { left: (r.left - sr.left + o.x * k - 4) + 'px', top: (r.top - sr.top + o.y * k - 2) + 'px', width: (m.w * k + 40) + 'px', height: (m.h * k + 8) + 'px', font: `${o.fs * k}px "${o.font}", cursive` }); }
  function startType(o) { typing = o.id; typer.hidden = false; typer.value = o.text; placeTyper(); setTimeout(() => { typer.focus(); typer.select(); }, 30); }
  function endType() { if (!typing) return; const o = B.objs.find((q) => q.id === typing); if (o && !o.text.trim()) B.objs = B.objs.filter((q) => q !== o); typing = null; typer.hidden = true; redraw(); thumbs(); }
  let tSnap = false;
  typer.addEventListener('input', () => { const o = B.objs.find((q) => q.id === typing); if (!o) return; if (!tSnap) { snap(); tSnap = true; } o.text = typer.value; redraw(); });
  typer.addEventListener('blur', () => { tSnap = false; endType(); });
  typer.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); typer.blur(); } });

  cv.addEventListener('pointerdown', (e) => {
    if (!B) return; cv.setPointerCapture(e.pointerId); const [x, y] = pt(e), base = { color: S.color, size: S.size, seed: seedNew(), id: uid() };
    if (S.tool === 'select') { const o = selObj(), k = uiScale();
      for (const [h, hx, hy] of handles(o)) if (Math.hypot(x - hx, y - hy) < 14 * k) { snap(); S.drag = { mode: h, x, y, orig: JSON.parse(JSON.stringify(o)), bw: bbox(o).w }; return; }
      const t = pick(x, y); if (t) { snap(); S.sel = t.id; S.drag = { mode: 'move', x, y, orig: JSON.parse(JSON.stringify(t)), moved: false }; syncBar(); } else S.sel = null; redraw(); return; }
    snap(); let o;
    if (S.tool === 'text') { o = { ...base, type: 'text', x, y: y - S.fs * 0.5, text: '', fs: S.fs, font: S.font, box: 0, ul: false, rot: 0 }; B.objs.push(o); S.sel = o.id; redraw(); startType(o); return; }
    if (S.tool === 'arrow' || S.tool === 'line') o = { ...base, type: S.tool, x1: x, y1: y, x2: x, y2: y, dashed: S.tool === 'line' };
    else if (S.tool === 'ellipse' || S.tool === 'rect') o = { ...base, type: S.tool, x, y, w: 0, h: 0 };
    else o = { ...base, type: 'pen', pts: [[x, y]] };
    B.objs.push(o); S.sel = o.id; S.drag = { mode: 'create', x, y }; redraw(); });
  cv.addEventListener('pointermove', (e) => { const d = S.drag; if (!d) return; const [x, y] = pt(e), dx = x - d.x, dy = y - d.y, o = selObj(); if (!o) return;
    if (d.mode === 'create') { if (o.type === 'arrow' || o.type === 'line') { o.x2 = x; o.y2 = e.shiftKey && o.type === 'line' ? o.y1 : y; }
      else if (o.type === 'pen') { const l = o.pts[o.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 2) o.pts.push([x, y]); }
      else { o.w = dx; o.h = dy; if (e.shiftKey) { const m = Math.max(Math.abs(dx), Math.abs(dy)); o.w = Math.sign(dx || 1) * m; o.h = Math.sign(dy || 1) * m; } } }
    else if (d.mode === 'move') { const g = d.orig; d.moved = true; if ('x1' in o) { o.x1 = g.x1 + dx; o.y1 = g.y1 + dy; o.x2 = g.x2 + dx; o.y2 = g.y2 + dy; } else if (o.type === 'pen') o.pts = g.pts.map((p) => [p[0] + dx, p[1] + dy]); else { o.x = g.x + dx; o.y = g.y + dy; } }
    else if (d.mode === 'p1') { o.x1 = x; o.y1 = y; } else if (d.mode === 'p2') { o.x2 = x; o.y2 = y; }
    else if (d.mode === 'se') { const g = d.orig; if (o.type === 'text') o.fs = Math.max(12, g.fs * (1 + dx / Math.max(20, d.bw))); else { o.w = Math.max(8, Math.abs(g.w) + dx) * Math.sign(g.w || 1); o.h = Math.max(8, Math.abs(g.h) + dy) * Math.sign(g.h || 1); } }
    redraw(); });
  const endDrag = () => { const d = S.drag; S.drag = null; if (!d) return; const o = selObj(); if (d.mode === 'move' && !d.moved) B.hist.pop();
    if (d.mode === 'create' && o) { const b = bbox(o); if (b.w < 4 && b.h < 4 && o.type !== 'pen') { B.objs = B.objs.filter((q) => q !== o); S.sel = null; B.hist.pop(); }
      else if (o.type === 'pen' && o.pts.length > 2) { const p = o.pts; o.pts = p.map((q, i) => (i === 0 || i === p.length - 1 ? q : [(p[i - 1][0] + q[0] * 2 + p[i + 1][0]) / 4, (p[i - 1][1] + q[1] * 2 + p[i + 1][1]) / 4])); } }
    redraw(); thumbs(); };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('dblclick', (e) => { const t = pick(...pt(e)); if (t && t.type === 'text') { S.sel = t.id; redraw(); startType(t); } });

  function setTool(t) { S.tool = t; document.querySelectorAll('.ci-tool[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t)); cv.style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair'; }
  document.querySelectorAll('.ci-tool[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('ci-undo').onclick = undo;
  const sws = $('ci-sws'); sws.innerHTML = COLORS.map(([c, n]) => `<button type="button" class="ci-sw" style="background:${c}" data-c="${c}" title="${n}" aria-label="${n} ink"></button>`).join('');
  sws.querySelectorAll('.ci-sw').forEach((b) => (b.onclick = () => setProp('color', b.dataset.c)));
  const bar = $('ci-bar');
  bar.innerHTML = `<div class="ci-chips">${LABELS.map((l) => `<button type="button" class="ci-chip">${l}</button>`).join('')}</div>
    <select id="ci-font" aria-label="Handwriting">${FONTS.map(([f, d]) => `<option value="${f}" style="font-family:'${f}'">${d}</option>`).join('')}</select>
    <div class="ci-seg" id="ci-size" aria-label="Pen size">${[['S', 3, 30], ['M', 4, 40], ['L', 6, 58]].map(([l, s, f]) => `<button type="button" data-s="${s}" data-f="${f}">${l}</button>`).join('')}</div>
    <span id="ci-swslot"></span><button type="button" class="ci-act" id="ci-copy" title="Copy the marked-up picture">Copy</button><button type="button" class="ci-act" id="ci-png" title="Save as PNG">Save PNG</button>`;
  bar.querySelectorAll('.ci-chip').forEach((b) => (b.onclick = () => { snap(); const o = { id: uid(), type: 'text', text: b.textContent, fs: S.fs, font: S.font, color: S.color, box: 0, ul: false, seed: seedNew(), rot: 0, x: 0, y: 0 };
    const m = textBox(o); o.x = 800 - m.w / 2 + (Math.random() - 0.5) * 200; o.y = 430 + (Math.random() - 0.5) * 200; B.objs.push(o); S.sel = o.id; setTool('select'); redraw(); thumbs(); }));
  $('ci-swslot').replaceWith(sws);
  $('ci-font').onchange = (e) => setProp('font', e.target.value);
  bar.querySelectorAll('#ci-size button').forEach((b) => (b.onclick = () => { setProp('size', +b.dataset.s); setProp('fs', +b.dataset.f); }));
  function setProp(k, v) { S[k] = v; const o = selObj();
    if (o && ((k === 'color') || (k === 'size' && o.type !== 'text') || ((k === 'font' || k === 'fs') && o.type === 'text'))) { snap(); o[k] = v; }
    syncBar(); redraw(); thumbs(); }
  function syncBar() { const o = selObj(); if (o) { S.color = o.color; if (o.type === 'text') { S.font = o.font; } }
    sws.querySelectorAll('.ci-sw').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === S.color)); $('ci-font').value = S.font;
    bar.querySelectorAll('#ci-size button').forEach((b) => b.classList.toggle('on', +b.dataset.s === S.size)); }
  const exportCv = () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; paint(c.getContext('2d'), B, 1600, 900, null); return c; };
  $('ci-png').onclick = () => exportCv().toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'study-' + tabs[cur].name.replace(/\W+/g, '-').toLowerCase() + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
  $('ci-copy').onclick = () => exportCv().toBlob(async (b) => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Copied. Paste it in Discord or send it to your mentor.'); } catch (e) { toast('Copy is blocked here. Use Save PNG.'); } });
  let toastT; function toast(m) { let t = stage.querySelector('.ci-toast'); if (!t) { t = document.createElement('div'); t.className = 'ci-toast'; t.setAttribute('role', 'status'); stage.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3000); }

  document.addEventListener('keydown', (e) => {
    if (!$('v-study').classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); snap(); B.objs = B.objs.filter((o) => o.id !== S.sel); S.sel = null; redraw(); thumbs(); return; }
    if (e.key === 'Escape') { S.sel = null; redraw(); return; }
    const m = { v: 'select', t: 'text', a: 'arrow', o: 'ellipse', r: 'rect', l: 'line', p: 'pen' }[e.key.toLowerCase()]; if (m && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(m); });

  /* ---------- picture tabs (one board per picture) ---------- */
  const T = (x, y, text, fs, extra) => ({ id: uid(), type: 'text', x, y, text, fs, font: 'Architects Daughter', color: '#ffffff', box: 0, ul: false, seed: seedNew(), rot: 0, ...extra });
  const m5 = LIVE ? null : mt5(1600, 900);
  const tabs = LIVE ? [{ name: 'MT5 chart', sub: 'from the Journal EA', bg: realChart(TR, 1600, 900), objs: Array.isArray(TR.marks) ? TR.marks : [], mt5: 1 },
    ...(TR.shots || []).map((x) => shotTab(x))] : [
    { name: 'MT5 chart', sub: 'from the Journal EA', bg: m5.c, objs: [
      ...m5.tap.map(([x, y], i) => ({ id: uid(), type: 'ellipse', x: x - 26, y: y - 26, w: 52, h: 46, color: i === 2 ? '#ff5a1f' : '#ffffff', size: 4, seed: seedNew() })),
      T(m5.tap[0][0] - 70, m5.tap[0][1] - 110, '3 taps,\nno break', 40),
      { id: uid(), type: 'arrow', x1: m5.entry[0] + 150, y1: m5.entry[1] - 150, x2: m5.entry[0] + 22, y2: m5.entry[1] - 14, color: '#ffffff', size: 4, seed: seedNew() },
      T(m5.entry[0] + 160, m5.entry[1] - 200, 'Sold the 3rd tap', 40),
      { id: uid(), type: 'line', x1: m5.entry[0], y1: m5.Y(4006.2), x2: m5.ax - 20, y2: m5.Y(4006.2), color: '#ffffff', size: 3, seed: seedNew(), dashed: true },
      T(m5.ax - 330, m5.Y(4006.2) + 14, '1R: take half here', 36),
      T(70, 640, 'LESSON', 84, { rot: -0.02 }), T(74, 740, 'Took nothing at 1R.\nIt came back for my stop.', 36),
      T(1120, 760, '−1.0R', 64, { box: 2, rot: 0.015 })] },
    ...RC.tabs.map(([name, sub, kind], i) => ({ name, sub, bg: shot(kind, [11, 5, 21][i], 1600, 900), objs: ({
      fp: [{ id: uid(), type: 'rect', x: 680, y: 190, w: 250, h: 300, color: '#ff5a1f', size: 4, seed: seedNew() }, T(960, 200, 'Big sellers\nsat here', 44), T(120, 70, 'ABSORPTION', 70, { ul: true })],
      heat: [{ id: uid(), type: 'ellipse', x: 520, y: 210, w: 900, h: 100, color: '#ffffff', size: 4, seed: seedNew() }, T(560, 120, 'Wall above held all morning', 42)],
      tv: ROOM === 'ict' ? [{ id: uid(), type: 'rect', x: 820, y: 300, w: 300, h: 90, color: '#ff5a1f', size: 4, seed: seedNew() }, T(1140, 300, 'FVG', 56), { id: uid(), type: 'line', x1: 300, y1: 560, x2: 1300, y2: 560, color: '#ffffff', size: 3, seed: seedNew(), dashed: true }, T(320, 580, 'BOS', 48), T(100, 70, 'SWEEP THEN FVG', 64, { ul: true })]
        : ROOM === 'pa' ? [{ id: uid(), type: 'line', x1: 120, y1: 760, x2: 1300, y2: 330, color: '#ffffff', size: 4, seed: seedNew() }, T(980, 300, 'Trend line,\n3rd touch', 44), { id: uid(), type: 'ellipse', x: 1140, y: 330, w: 90, h: 90, color: '#ff5a1f', size: 4, seed: seedNew() }, T(100, 70, 'RESISTANCE', 70, { ul: true })]
        : [T(100, 70, 'Mark it your way', 64, { ul: true })] }[kind] || []) }))];
  tabs.forEach((t) => (t.hist = []));
  let cur = 0, used = (D.shots || {}).used || 0;
  const CAP = (D.shots || {}).cap || 150, PER = (D.shots || {}).perTrade || 6;
  function shotTab(x) { const t = { name: x.name || 'Screenshot', sub: 'screenshot', bg: null, objs: Array.isArray(x.marks) ? x.marks : [], hist: [], shot: x.id };
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1600, 900);
      const s = Math.min(1600 / im.width, 900 / im.height), w = im.width * s, h = im.height * s; g.drawImage(im, (1600 - w) / 2, (900 - h) / 2, w, h); t.bg = c; if (B === t) { $('ci-hint').hidden = true; redraw(); } thumbs(); };
    im.src = '/journal/study/shot/' + x.id + '.jpg'; return t; }
  // saving: marks on a screenshot save to that screenshot; marks on the MT5 chart save with the trade's study
  const dirtyB = new Set(); let saveT = 0, booted = false;
  function dirty() { if (!LIVE || !booted || !B) return; dirtyB.add(B); clearTimeout(saveT); saveT = setTimeout(flush, 1200); }
  function flush() { const list = [...dirtyB]; dirtyB.clear();
    list.forEach((b) => { if (b.shot) api('/journal/study/shot/' + b.shot + '/marks', { marks: b.objs }).catch((e) => toast(e.message)); else saveStudy(false).catch((e) => toast(e.message)); }); }
  addEventListener('beforeunload', () => { if (dirtyB.size) flush(); });
  function renderTabs() {
    const capTxt = LIVE ? `${used} of ${CAP} used` : 'paste, drop or choose';
    $('sr-tabs').innerHTML = tabs.map((t, i) => `<button type="button" class="sr-tab${i === cur ? ' on' : ''}" data-i="${i}"><canvas width="108" height="64"></canvas><span><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span>${t.objs.length ? `<em>${t.objs.length}</em>` : ''}${t.shot ? '<s class="sr-del" title="Delete this screenshot" aria-label="Delete this screenshot">×</s>' : ''}</button>`).join('')
      + `<button type="button" class="sr-tab add" id="sr-addpic" title="Paste (Ctrl+V), drop or choose a screenshot"><span>+</span><span><b>Add a screenshot</b><small>${capTxt}</small></span></button><input type="file" id="sr-file" accept="image/*" hidden>`;
    $('sr-tabs').querySelectorAll('.sr-tab[data-i]').forEach((b) => (b.onclick = (e) => { const d = e.target.closest('.sr-del'); if (d) return delShot(+b.dataset.i, d); openTab(+b.dataset.i); }));
    $('sr-addpic').onclick = () => $('sr-file').click(); $('sr-file').onchange = (e) => { addPic(e.target.files[0]); e.target.value = ''; };
    thumbs(); }
  function thumbs() { dirty(); document.querySelectorAll('#sr-tabs .sr-tab[data-i]').forEach((b) => { const t = tabs[b.dataset.i], c = b.querySelector('canvas'); paint(c.getContext('2d'), t, 108, 64, null);
    let em = b.querySelector('em'); if (t.objs.length) { if (!em) { em = document.createElement('em'); b.appendChild(em); } em.textContent = t.objs.length; } else if (em) em.remove(); }); }
  function openTab(i) { endType(); cur = i; B = tabs[i]; S.sel = null; document.querySelectorAll('#sr-tabs .sr-tab[data-i]').forEach((b) => b.classList.toggle('on', +b.dataset.i === i)); $('ci-hint').hidden = !!B.bg; redraw(); }
  function addPic(f) { if (!f || !/^image\//.test(f.type)) return toast('That is not a picture. Use a PNG or JPG screenshot.');
    if (LIVE && used >= CAP) return toast(`You have used all ${CAP} screenshots. Delete old ones to add more.`);
    if (LIVE && tabs.filter((t) => t.shot).length >= PER) return toast(`Up to ${PER} screenshots per trade.`);
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1600, 900);
      const s = Math.min(1600 / im.width, 900 / im.height), w = im.width * s, h = im.height * s; g.drawImage(im, (1600 - w) / 2, (900 - h) / 2, w, h);
      const name = 'Screenshot ' + (tabs.filter((t) => t.shot || t.local).length + 1), t = { name, sub: 'added just now', bg: c, objs: [], hist: [], local: !LIVE };
      const show = () => { tabs.push(t); renderTabs(); openTab(tabs.length - 1); };
      if (!LIVE) { show(); return toast('Added. In your own trades it saves with the trade.'); }
      // shrink to a JPEG (picture only, max 1600 x 900) and store it with this trade
      const q = (k) => new Promise((ok) => c.toBlob(ok, 'image/jpeg', k));
      toast('Saving the screenshot…');
      q(0.82).then((b) => (b && b.size > 650000 ? q(0.6) : b)).then((b) => api('/journal/study/' + TR.id + '/shot?name=' + encodeURIComponent(name), b, true))
        .then((j) => { t.shot = j.id; t.sub = 'screenshot'; used = j.used; show(); toast(`Saved with this trade. ${used} of ${CAP} screenshots used.`); })
        .catch((e) => toast(e.message)); };
    im.onerror = () => toast('Could not read that picture.'); im.src = URL.createObjectURL(f); }
  function delShot(i, d) { const t = tabs[i]; if (!t || !t.shot) return;
    if (!d.classList.contains('arm')) { d.classList.add('arm'); d.textContent = 'Delete?'; setTimeout(() => { d.classList.remove('arm'); d.textContent = '×'; }, 3000); return; }
    api('/journal/study/shot/' + t.shot + '/delete').then((j) => { used = j.used; dirtyB.delete(t); tabs.splice(i, 1); if (cur >= tabs.length || cur === i) cur = 0; renderTabs(); openTab(cur); toast('Screenshot deleted.'); }).catch((e) => toast(e.message)); }
  ['dragenter', 'dragover'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.add('drop'); }));
  ['dragleave', 'drop'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.remove('drop'); }));
  stage.addEventListener('drop', (e) => addPic(e.dataTransfer.files[0]));
  document.addEventListener('paste', (e) => { if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/')); if (it) { e.preventDefault(); go('study'); addPic(it.getAsFile()); } });

  document.querySelectorAll('.sr-paper textarea').forEach((t, i) => { t.value = LIVE ? (TR.notes || [])[i] || '' : RC.notes[i] || '';
    t.addEventListener('input', () => { if (LIVE) { dirtyB.add(tabs[0]); clearTimeout(saveT); saveT = setTimeout(flush, 1500); } }); });
  /* ---------- left: inbox and setups ---------- */
  if (LIVE) {
    const ib = D.inbox || [];
    $('sr-inbox').innerHTML = ib.length ? ib.map((t) => `<a class="sr-it${t.id === TR.id ? ' on' : ''}" href="?t=${t.id}"><div><b><span class="sr-dot"></span>${esc(t.symbol)} ${esc(String(t.side).toLowerCase())}</b></div><div class="v ${t.net < 0 ? 'neg' : 'pos'}">${money(t.net)}<small>${R(t.r || 0)}</small></div><small>${fWhen(t.close_time).slice(4)} · <span class="hint">${t.shots ? t.shots + ' screenshot' + (t.shots > 1 ? 's' : '') : 'No screenshot yet'}</span></small></a>`).join('')
      : '<p class="sr-empty">All caught up. New trades from the Journal EA land here.</p>';
  } else $('sr-inbox').innerHTML = INBOX.map((t, k) => `<div class="sr-it${k ? '' : ' on'}"><div><b><span class="sr-dot"></span>${t[0]} ${t[1]}</b></div><div class="v ${t[3] < 0 ? 'neg' : 'pos'}">${t[3] < 0 ? '−' : '+'}$${Math.abs(t[3])}<small>${R(t[4])}</small></div><small>${t[2].slice(4)} · <span class="hint">${t[5]}</span></small></div>`).join('');
  if (!LIVE) document.querySelectorAll('#sr-inbox .sr-it').forEach((r) => (r.onclick = () => document.querySelectorAll('#sr-inbox .sr-it').forEach((x) => x.classList.toggle('on', x === r))));
  let setI = Math.max(0, SETS.findIndex((s) => s.id && s.id === TR.setup));
  $('sr-sets').innerHTML = !SETS.length ? '<p class="sr-empty">Your setups show up here. Answer the questions on the right and save your first trade.</p>' : SETS.map((s, i) => `<div class="sr-set${i ? '' : ' on'}" data-i="${i}"><i style="background:${s.c}"></i><b>${esc(s.n)}</b><canvas></canvas><small>${s.r.length} trade${s.r.length === 1 ? '' : 's'} · <span class="${s.exp < -0.04 ? 'neg' : s.exp > 0.04 ? 'pos' : ''}">${R(s.exp)}</span> each</small></div>`).join('');
  const setsSpark = () => document.querySelectorAll('#sr-sets .sr-set').forEach((d) => { const s = SETS[d.dataset.i]; spark(d.querySelector('canvas'), s.r, +d.dataset.i === setI ? '#f2f2f4' : '#5a5a64'); });
  document.querySelectorAll('#sr-sets .sr-set').forEach((d) => (d.onclick = () => pickSet(+d.dataset.i)));
  let picked = false;
  function pickSet(i) { setI = i; picked = true; document.querySelectorAll('#sr-sets .sr-set').forEach((d) => d.classList.toggle('on', +d.dataset.i === i)); if (LIVE) { cmpI = 0; liveStrip(); } head(); setsSpark(); }
  function head() { const s = SETS[setI];
    if (LIVE && (!s || (!TR.setup && !picked))) { $('sr-setname').textContent = TR.setup && s ? s.n : `${TR.symbol} ${String(TR.side).toLowerCase()}`; $('sr-done').firstChild.textContent = setName() ? 'Save to “' + setName() + '”' : 'Save to my playbook';
      $('sr-nums').innerHTML = `<div><span class="sr-k">Closed</span><b>${fWhen(TR.close)}</b></div><div><span class="sr-k">Result</span><b class="${(TR.r || TR.net) < 0 ? 'neg' : 'pos'}">${TR.r ? R(TR.r) : money(TR.net)}</b></div><div><span class="sr-k">Setup</span><b>${s && TR.setup ? esc(s.n) : 'Not saved yet'}</b></div>`; return; }
    $('sr-setname').textContent = s.n; $('sr-done').firstChild.textContent = 'Save to “' + (LIVE ? setName() || s.n : s.n) + '”';
    $('sr-nums').innerHTML = `<div><span class="sr-k">Seen</span><b>${s.r.length}×</b></div><div><span class="sr-k">Won</span><b>${s.won}%</b></div><div><span class="sr-k">Per trade</span><b class="${s.exp < 0 ? 'neg' : 'pos'}">${R(s.exp)}</b></div><div><span class="sr-k">Profit factor</span><b>${s.pf.toFixed(2)}</b></div><div><span class="sr-k">Last</span><b>${s.last}</b></div><canvas id="sr-hs"></canvas>`;
    spark($('sr-hs'), s.r, s.c); }

  /* ---------- right: inspector tabs (Share Studio style) ---------- */
  document.querySelectorAll('.sr-itabs button').forEach((b) => (b.onclick = () => { document.querySelectorAll('.sr-itabs button').forEach((x) => x.setAttribute('aria-selected', x === b)); document.querySelectorAll('.sr-pane').forEach((p) => p.classList.toggle('on', p.id === 'p-' + b.dataset.p)); }));

  /* ---------- environment: one question at a time (same feel as sign-up) ---------- */
  const IC = { up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6', dot: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 9a3 3 0 100 6 3 3 0 000-6z', out: 'M4 12h16M14 6l6 6-6 6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z', bars: 'M5 20V10M12 20V4M19 20v-7', wall: 'M3 7h18M3 12h18M3 17h18', wave: 'M3 12c3-6 6 6 9 0s6 6 9 0',
    flat: 'M3 9h18M3 15h18', trend: 'M3 17l6-6 4 4 8-8', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', news: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5', moon: 'M20 14A8 8 0 019 3a8 8 0 1011 11z',
    sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M12 8a4 4 0 100 8 4 4 0 000-8z', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2' };
  const ENV = [...RC.q.map((g) => ({ ...g, o: g.o.slice() })),
    { k: 'Day', q: 'What kind of <em>day</em>?', o: [['Balance', 'flat', 'Price rotated inside a range'], ['Trend', 'trend', 'One direction most of the day'], ['Open drive', 'bolt', 'Strong move straight from the open'], ['News', 'news', 'A big report moved it']] },
    { k: 'Session', q: 'Which <em>session</em>?', o: [['Asia', 'moon', 'Quiet hours'], ['London', 'sun', 'Europe opens'], ['NY open', 'clock', 'First hours of New York'], ['NY PM', 'clock', 'New York afternoon']] }];
  ENV.forEach((g) => (g.multi = g.multi || 0));
  (D.words || []).forEach((w) => { const g = ENV.find((q) => q.k === w.qk); if (g && !g.o.some((o) => o[0].toLowerCase() === String(w.word).toLowerCase())) g.o.push([w.word, 'dot', 'Your own word.']); });
  const tEnv = Array.isArray(TR.env) ? TR.env : [];
  // answers saved earlier that are not in the list any more still show (as own words)
  if (LIVE) ENV.forEach((g, i) => (tEnv[i] || []).forEach((w) => { if (!g.o.some((o) => o[0] === w)) g.o.push([w, 'dot', 'Your own word.']); }));
  const env = LIVE ? ENV.map((g, i) => new Set(tEnv[i] || [])) : [new Set([RC.pick[0]]), new Set(), new Set(), new Set()];
  let qn = LIVE ? (TR.studied ? ENV.length : Math.max(0, env.findIndex((s) => !s.size))) : 1, hintT = '';
  if (qn < 0) qn = ENV.length;
  let nameTyped = TR.setup && SETS[setI] ? SETS[setI].n : '';
  const autoName = () => { const w = [...env[1]][0], a = [...env[0]][0]; return w && a ? `${w} at ${a.toLowerCase()}` : w || a || ''; };
  function setName() { return (nameTyped || autoName()).trim().slice(0, 70); }
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[k]}"/></svg>`;
  function step() {
    const el = $('sr-step'); el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade');
    if (qn >= ENV.length && LIVE) {
      const nm = setName(), m = SETS.find((s) => s.n.toLowerCase() === nm.toLowerCase());
      el.innerHTML = `<div class="sr-sbar"><i style="width:100%"></i></div><div class="sr-sk">${m && m.r.length ? 'You have seen this before' : 'Name this setup'}</div>
        <input class="sr-own-in sr-name" id="sr-name" list="sr-names" maxlength="70" value="${esc(nm)}" placeholder="e.g. ${esc(RC.sets[0][0])}" aria-label="Setup name"><datalist id="sr-names">${SETS.map((s) => `<option value="${esc(s.n)}">`).join('')}</datalist>
        ${m && m.r.length ? `<div class="sr-match hit"><div class="sr-ring" style="--p:${m.won}"><b>${m.won}%</b><small>won</small></div><div><span class="ln"><b>${m.r.length} time${m.r.length > 1 ? 's' : ''}</b> before · <b class="${m.exp < 0 ? 'neg' : 'pos'}">${R(m.exp)}</b> a trade · last ${m.last}</span><div class="sr-mini">${m.r.map((v) => `<i class="${v > 0 ? 'w' : ''}"></i>`).join('')}</div>${m.rule ? `<span class="ln">${esc(m.rule)}</span>` : ''}</div></div>`
          : '<p class="sr-hint">Same name = same setup. Saving adds this trade to it in your playbook.</p>'}
        <div class="sr-act"><button type="button" class="sr-ghost" data-back>Change answers</button>${m && m.r.length ? '<button type="button" class="sr-ghost" data-go="compare">Compare with past trades →</button>' : ''}</div>`;
      const ni = $('sr-name'); ni.oninput = () => { nameTyped = ni.value; head(); }; ni.onchange = () => step();
    } else if (qn >= ENV.length) {
      const a = env[0].has(RC.pick[0]), w = RC.pick[1] ? env[1].has(RC.pick[1]) : false, s = SETS[0], name = `${[...env[1]][0] || 'Something'} at ${([...env[0]][0] || 'somewhere').toLowerCase()}`;
      el.innerHTML = `<div class="sr-sbar"><i style="width:100%"></i></div><div class="sr-sk">${w && a ? 'You have seen this before' : 'A new environment'}</div><h3 class="sr-qh">${w && a ? s.n.replace(/(\S+ \S+)$/, '<em>$1</em>') : name}</h3>
        ${w && a ? `<div class="sr-match hit"><div class="sr-ring" style="--p:${s.won}"><b>${s.won}%</b><small>won</small></div><div><span class="ln"><b>${s.r.length} times</b> before · <b class="${s.exp < 0 ? 'neg' : 'pos'}">${R(s.exp)}</b> a trade · last ${s.last}</span><div class="sr-mini">${s.r.map((v) => `<i class="${v > 0 ? 'w' : ''}"></i>`).join('')}</div><span class="ln">Best when: half off at 1R, NY open.</span></div></div>`
          : '<p class="sr-hint">Saving starts a new setup page in your playbook.</p>'}
        <div class="sr-act"><button type="button" class="sr-ghost" data-back>Change answers</button><button type="button" class="sr-ghost" data-go="compare">Compare with past trades →</button></div>`;
    } else {
      const g = ENV[qn], sel = env[qn];
      el.innerHTML = `<div class="sr-sbar"><i style="width:${qn / ENV.length * 100}%"></i></div><div class="sr-sk">Question ${qn + 1} of ${ENV.length}${g.multi ? ' · pick all that fit' : ''}</div><h3 class="sr-qh">${g.q}</h3>
        <div class="sr-chips2">${g.o.map(([t, i, h]) => `<button type="button" class="sr-chip${sel.has(t) ? ' on' : ''}" data-t="${esc(t)}" data-h="${esc(h)}">${svg(i)}${esc(t)}</button>`).join('')}<button type="button" class="sr-chip add" data-own>+ Own word</button></div>
        <p class="sr-hint" id="sr-hn">${hintT || (g.own && !g.o.length ? 'Add the words you use, like FVG or order block. They stay in your list.' : g.multi ? 'Tap all that fit, then Continue.' : 'Tap one. It moves on by itself.')}</p>
        <div class="sr-act">${qn ? '<button type="button" class="sr-ghost" data-back>← Back</button>' : '<span></span>'}<button type="button" class="sr-cta" data-next ${sel.size ? '' : 'disabled'}>Continue<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>`;
      el.querySelectorAll('.sr-chip[data-t]').forEach((b) => { b.onmouseenter = () => ($('sr-hn').textContent = b.dataset.h);
        b.onclick = () => { const t = b.dataset.t; if (g.multi) sel.has(t) ? sel.delete(t) : sel.add(t); else { sel.clear(); sel.add(t); } hintT = b.dataset.h; rec();
          if (!g.multi) { setTimeout(() => { qn++; hintT = ''; step(); rec(); }, 260); el.querySelectorAll('.sr-chip').forEach((x) => x.classList.toggle('on', x === b)); } else { b.classList.toggle('on'); el.querySelector('[data-next]').disabled = !sel.size; } }; });
      el.querySelector('[data-own]').onclick = (e) => { const b = e.currentTarget, inp = document.createElement('input'); inp.className = 'sr-own-in'; inp.placeholder = ROOM === 'flow' ? 'Your word' : 'e.g. FVG, order block'; inp.maxLength = 28; b.replaceWith(inp); inp.focus();
        const add = () => { const v = inp.value.trim().replace(/[<>]/g, '').slice(0, 28); if (v && !g.o.some((o) => o[0].toLowerCase() === v.toLowerCase())) { g.o.push([v, 'dot', 'Your own word. It stays in your list.']); if (!g.multi) sel.clear(); sel.add(v); rec();
          if (LIVE) api('/journal/study/word', { room: ROOM, qk: g.k, word: v }).catch((e) => toast(e.message)); } step(); };
        inp.onkeydown = (k) => { if (k.key === 'Enter') add(); if (k.key === 'Escape') step(); }; inp.onblur = add; };
      const nx = el.querySelector('[data-next]'); if (nx) nx.onclick = () => { qn++; hintT = ''; step(); rec(); };
    }
    const bk = el.querySelector('[data-back]'); if (bk) bk.onclick = () => { qn = qn >= ENV.length ? 0 : Math.max(0, qn - 1); hintT = ''; step(); rec(); };
    const gc = el.querySelector('[data-go]'); if (gc) gc.onclick = () => go('compare');
  }
  function rec() { if (LIVE) head(); $('sr-rec').innerHTML = '<h6>The record</h6>' + ENV.map((g, i) => `<button type="button" class="r${i === qn ? ' on' : ''}" data-i="${i}"><small>${g.k}</small><span>${esc([...env[i]].join(', '))}</span></button>`).join('');
    $('sr-rec').querySelectorAll('.r').forEach((r) => (r.onclick = () => { qn = +r.dataset.i; hintT = ''; step(); rec(); })); }
  step(); rec();
  const gradeEls = [...document.querySelectorAll('#sr-grade .sr-chip')];
  if (LIVE) { gradeEls.forEach((x) => x.classList.toggle('on', x.textContent.trim() === TR.grade)); const g = gradeEls.find((x) => x.classList.contains('on')); $('sr-gh').textContent = g ? g.dataset.h : 'Pick one. Be honest, only you see it.'; }
  gradeEls.forEach((b) => (b.onclick = () => { gradeEls.forEach((x) => x.classList.toggle('on', x === b)); $('sr-gh').textContent = b.dataset.h; if (LIVE) { dirtyB.add(tabs[0]); clearTimeout(saveT); saveT = setTimeout(flush, 800); } }));
  function saveStudy(done) { const g = gradeEls.find((x) => x.classList.contains('on'));
    return api('/journal/study/' + TR.id + '/save', { room: ROOM, env: env.map((s) => [...s]), notes: [...document.querySelectorAll('.sr-paper textarea')].map((t) => t.value), grade: g ? g.textContent.trim() : '',
      marks: tabs[0].objs, setup: done ? setName() : '', done: done ? 1 : 0, fix: $('sr-fix').checked ? 1 : 0 }); }
  $('sr-done').onclick = () => {
    if (!LIVE) { $('sr-done').firstChild.textContent = 'Saved to your playbook ✓'; const d = document.querySelector('#sr-inbox .sr-it.on .sr-dot'); if (d) d.classList.add('done'); return; }
    if (!setName()) { document.querySelector('.sr-itabs [data-p="env"]').click(); qn = env.findIndex((s) => !s.size); if (qn < 0) qn = ENV.length; step(); rec(); return toast('Answer the questions first, or give the setup a name.'); }
    clearTimeout(saveT); dirtyB.forEach((b) => b.shot && api('/journal/study/shot/' + b.shot + '/marks', { marks: b.objs }).catch(() => {})); dirtyB.clear();
    const btn = $('sr-done'); btn.disabled = true; btn.firstChild.textContent = 'Saving…';
    saveStudy(true).then((j) => { btn.firstChild.textContent = 'Saved to “' + setName() + '” ✓'; toast(j.fixed ? 'Saved. “Next time” is now a fix in your Focus panel.' : 'Saved to your playbook.');
      const d = document.querySelector('#sr-inbox .sr-it.on .sr-dot'); if (d) d.classList.add('done');
      const nx = (D.inbox || []).find((t) => t.id !== TR.id); setTimeout(() => { location.href = nx ? '?t=' + nx.id : location.pathname; }, 1100); })
      .catch((e) => { btn.disabled = false; head(); toast(e.message); }); };

  /* ---------- bottom strip: same setup before ---------- */
  const pastCache = {};
  const getPast = (id) => pastCache[id] || (pastCache[id] = fetch('/journal/study/trade/' + id + '.json', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load that trade.')))));
  const pastList = () => { const s = SETS[setI]; return s && LIVE ? s.trades.filter((t) => t.id !== TR.id).slice(-8).reverse() : []; };
  function liveStrip() { const L = pastList();
    $('sr-past').innerHTML = L.length ? L.map((p, i) => `<button type="button" class="sr-pt" data-i="${i}"><canvas width="92" height="56"></canvas><span>${fDay(p.close)}<b class="${p.r < 0 ? 'neg' : 'pos'}">${R(p.r || 0)}</b></span></button>`).join('') : '<p class="sr-empty">No other trades of this setup yet.</p>';
    $('sr-past').querySelectorAll('.sr-pt').forEach((b) => { const p = L[b.dataset.i]; b.onclick = () => { cmpI = +b.dataset.i; go('compare'); };
      getPast(p.id).then((t) => { const c = b.querySelector('canvas'); paint(c.getContext('2d'), { bg: realChart(t, 1600, 900), objs: t.marks || [] }, 92, 56, null); }).catch(() => {}); }); }
  const pastPics = LIVE ? [] : PAST.map((p, i) => shot(ROOM !== 'flow' ? 'tv' : i % 2 ? 'heat' : 'fp', 40 + i * 7, 1600, 900));
  if (!LIVE) $('sr-past').innerHTML = PAST.map((p, i) => `<button type="button" class="sr-pt" data-i="${i}"><canvas width="92" height="56"></canvas><span>${p[0]}<b class="${p[1] < 0 ? 'neg' : 'pos'}">${R(p[1])}</b></span></button>`).join('');
  if (!LIVE) document.querySelectorAll('#sr-past .sr-pt').forEach((b) => { b.querySelector('canvas').getContext('2d').drawImage(pastPics[b.dataset.i], 0, 0, 92, 56); b.onclick = () => { cmpI = +b.dataset.i; go('compare'); }; });

  /* ---------- compare ---------- */
  let cmpI = 0;
  const pastMarks = (i) => [{ id: uid(), type: 'rect', x: 600 + i * 20, y: 160, w: 320, h: 340, color: '#ffffff', size: 9, seed: 900 + i }, T(960, 560, PAST[i][1] > 0 ? 'Sellers held,\n3rd tap' : 'Too early', 84, { seed: 950 + i })];
  function liveCompare() { const L = pastList(), el = $('sr-cmp');
    if (!L.length) { el.innerHTML = '<p class="sr-empty big">Compare shows this trade next to past trades of the same setup. Save a few trades to a setup first.</p>'; return; }
    if (cmpI >= L.length) cmpI = 0; const p = L[cmpI];
    el.innerHTML = `<div class="sr-cpick"><span class="sr-k" style="margin-right:6px">Compare with</span>${L.map((q, i) => `<button type="button" data-i="${i}" class="${i === cmpI ? 'on' : ''}">${fDay(q.close)} · ${R(q.r || 0)}</button>`).join('')}</div>
      <div class="sr-cside"><canvas width="1600" height="900"></canvas><div class="b"><h3>This trade · ${fDay(TR.close)} <span class="${(TR.r || 0) < 0 ? 'neg' : 'pos'}">${R(TR.r || 0)}</span></h3><p>${esc([...document.querySelectorAll('.sr-paper textarea')][1].value || 'No notes yet.')}</p></div></div>
      <div class="sr-cside" id="sr-cpast"><canvas width="1600" height="900"></canvas><div class="b"><h3>${fDay(p.close)} <span class="${p.r < 0 ? 'neg' : 'pos'}">${R(p.r || 0)}</span></h3><p class="muted">Loading…</p></div></div>
      <div class="sr-diff" id="sr-cdiff"><span class="sr-k">What was different</span></div>`;
    const cs = el.querySelectorAll('.sr-cside canvas'); paint(cs[0].getContext('2d'), tabs[0], 1600, 900, null);
    el.querySelectorAll('.sr-cpick button').forEach((b) => (b.onclick = () => { cmpI = +b.dataset.i; compare(); }));
    getPast(p.id).then((t) => { if (L[cmpI] !== p) return; paint(cs[1].getContext('2d'), { bg: realChart(t, 1600, 900), objs: t.marks || [] }, 1600, 900, null);
      $('sr-cpast').querySelector('p').textContent = (t.notes || [])[1] || (t.notes || [])[0] || 'No notes on this one.'; $('sr-cpast').querySelector('p').className = '';
      let diff = 0; const rows = ENV.map((g, i) => { const a = [...env[i]].join(', ') || '–', b = (t.env[i] || []).join(', ') || '–', x = a !== b; diff += x; return `<div class="sr-drow${x ? ' x' : ''}"><span>${esc(g.k)}</span><span>${esc(a)}</span><span>${esc(b)}</span></div>`; }).join('');
      $('sr-cdiff').innerHTML = `<span class="sr-k">What was different</span>${rows}<p class="sr-lesson">${diff ? `${diff} thing${diff > 1 ? 's were' : ' was'} different. Look there first.` : 'Same picture both times. The difference is in how you traded it: check the notes.'}</p>`; })
      .catch((e) => toast(e.message)); }
  function compare() { if (LIVE) return liveCompare();
    const p = PAST[cmpI], took = p[2].includes('half');
    $('sr-cmp').innerHTML = `<div class="sr-cpick"><span class="sr-k" style="margin-right:6px">Compare with</span>${PAST.map((q, i) => `<button type="button" data-i="${i}" class="${i === cmpI ? 'on' : ''}">${q[0]} · ${R(q[1])}</button>`).join('')}</div>
      <div class="sr-cside"><canvas width="1600" height="900"></canvas><div class="b"><h3>This trade · 20 Nov <span class="neg">−1.0R</span></h3><p>Sold the 3rd tap. Took nothing at 1R. It turned and took my stop.</p></div></div>
      <div class="sr-cside"><canvas width="1600" height="900"></canvas><div class="b"><h3>${p[0]} <span class="${p[1] < 0 ? 'neg' : 'pos'}">${R(p[1])}</span></h3><p>${p[2]}</p></div></div>
      <div class="sr-diff"><span class="sr-k">What was different</span>
        <div class="sr-drow"><span>Tap</span><span>3rd</span><span>${p[2].includes('1st') ? '1st' : p[2].includes('Two') ? '2nd' : '3rd'}</span></div>
        <div class="sr-drow x"><span>Half off at 1R</span><span>No</span><span>${took ? 'Yes' : 'No'}</span></div>
        <div class="sr-drow"><span>Session</span><span>NY open</span><span>NY open</span></div>
        ${ROOM === 'flow' ? `<div class="sr-drow"><span>Heatmap wall</span><span>Held</span><span>${p[2].includes('wall') ? 'Held' : 'None'}</span></div>` : ''}

        <p class="sr-lesson">${took ? 'Same picture. The only change was taking half at 1R.' : 'Look at the tap and the footprint before the entry.'}</p></div>`;
    const cs = $('sr-cmp').querySelectorAll('.sr-cside canvas');
    paint(cs[0].getContext('2d'), tabs[0], 1600, 900, null); paint(cs[1].getContext('2d'), { bg: pastPics[cmpI], objs: pastMarks(cmpI) }, 1600, 900, null);
    $('sr-cmp').querySelectorAll('.sr-cpick button').forEach((b) => (b.onclick = () => { cmpI = +b.dataset.i; compare(); })); }

  /* ---------- playbook ---------- */
  let flt = 'All';
  function curves() { const cvs = $('sr-curves'), [x, w, h] = fitCv(cvs); if (!w) return;
    if (!SETS.some((s) => s.r.length)) { x.fillStyle = '#6b6b75'; x.font = '13px Manrope, sans-serif'; x.fillText('Each setup gets a curve here once you save trades to it.', 0, h / 2); $('sr-leg').innerHTML = ''; return; }
    const series = SETS.map((s) => { let c = 0; return [0, ...s.r.filter((v) => (flt === 'Wins' ? v > 0 : flt === 'Losses' ? v <= 0 : true)).map((v) => (c += v))]; });
    const all = series.flat(), lo = Math.min(0, ...all), hi = Math.max(1, ...all), n = Math.max(1, ...series.map((s) => s.length)) - 1 || 1, P = 34, Y = (v) => 10 + (hi - v) / (hi - lo) * (h - 30), X = (i) => P + i / n * (w - P - 8);
    x.font = '10px Manrope, sans-serif'; x.fillStyle = '#6b6b75'; x.strokeStyle = 'rgba(255,255,255,.05)';
    for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) { x.beginPath(); x.moveTo(P, Y(v)); x.lineTo(w, Y(v)); x.stroke(); x.fillText((v > 0 ? '+' : '') + v + 'R', 0, Y(v) + 3); }
    x.strokeStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.moveTo(P, Y(0)); x.lineTo(w, Y(0)); x.stroke();
    series.map((s, k) => [s, k]).sort((a, b) => (a[1] === setI) - (b[1] === setI)).forEach(([s, k]) => { x.strokeStyle = k === setI ? '#f2f2f4' : '#4a4a54'; x.lineWidth = k === setI ? 2.4 : 1.4; x.globalAlpha = 1; x.beginPath(); s.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.stroke();
      x.fillStyle = k === setI ? '#f2f2f4' : '#4a4a54'; x.beginPath(); x.arc(X(s.length - 1), Y(s[s.length - 1]), 3, 0, 7); x.fill(); }); x.globalAlpha = 1;
    x.fillStyle = '#6b6b75'; x.fillText('trade 1', P, h - 4); x.fillText('trade ' + n, w - 44, h - 4);
    $('sr-leg').innerHTML = SETS.map((s, k) => `<span class="${k === setI ? 'on' : ''}"><i style="background:${k === setI ? '#f2f2f4' : '#4a4a54'}"></i>${esc(s.n)} <b class="${series[k][series[k].length - 1] < 0 ? 'neg' : 'pos'}">${R(series[k][series[k].length - 1])}</b></span>`).join(''); }
  document.querySelectorAll('#sr-flt button').forEach((b) => (b.onclick = () => { flt = b.textContent; document.querySelectorAll('#sr-flt button').forEach((x) => x.classList.toggle('on', x === b)); curves(); }));
  const PAIRS = LIVE ? D.pairs || [] : RC.pairs;
  $('sr-pairs').innerHTML = !PAIRS.length ? '<p class="sr-empty">Shows up once two things line up on 2 or more trades.</p>' : PAIRS.map((p, i) => `<div class="sr-pair"><em>${i + 1}</em><span>${esc(p[0])} <b>+</b> ${esc(p[1])}</span><b class="v ${p[3] < 0 ? 'neg' : 'pos'}">${R(p[3])}</b><small>${p[2]} trades together</small></div>`).join('');
  $('sr-cards').innerHTML = !SETS.length ? '<p class="sr-empty">No setups yet.</p>' : SETS.map((s, i) => `<button type="button" class="sr-tr sr-card" data-i="${i}"><span><b>${esc(s.n)}</b><small>${esc(s.rule) || (LIVE ? 'No rule yet' : '')}</small></span><canvas></canvas><span class="${s.exp < -0.04 ? 'neg' : s.exp > 0.04 ? 'pos' : ''}">${R(s.exp)}</span><span>${s.pf.toFixed(2)}</span><span>${s.won}%</span><span>${s.r.length}</span><span class="mu">${s.last}</span></button>`).join('');
  document.querySelectorAll('.sr-card').forEach((c) => (c.onclick = () => { const s = SETS[+c.dataset.i]; if (LIVE && s.trades.length) { location.href = '?t=' + s.trades[s.trades.length - 1].id; return; } pickSet(+c.dataset.i); go('study'); }));
  const book = () => { curves(); document.querySelectorAll('.sr-card').forEach((c) => { const s = SETS[c.dataset.i]; spark(c.querySelector('canvas'), s.r, +c.dataset.i === setI ? '#f2f2f4' : '#6a6a74'); }); };

  /* ---------- modes ---------- */
  function go(m) { document.querySelectorAll('.sr-modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); document.querySelectorAll('.sr-view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + m));
    if (m === 'study') requestAnimationFrame(sizeCanvas); if (m === 'compare') compare(); if (m === 'book') requestAnimationFrame(book); }
  document.querySelectorAll('.sr-modes button').forEach((b) => (b.onclick = () => go(b.dataset.m)));
  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));

  /* ---------- boot ---------- */
  if (LIVE) { const dg = Number.isFinite(TR.digits) ? Math.min(TR.digits, 5) : 2, f = (v) => (Number.isFinite(v) && v > 0 ? v.toFixed(dg) : '–'), tc = document.querySelector('.sr-tcard');
    const o = tDate(TR.open), c = tDate(TR.close), mins = o && c ? Math.round((c - o) / 60000) : null, hold = mins == null ? '' : mins < 60 ? mins + ' min' : mins < 1440 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : Math.round(mins / 1440) + ' days';
    tc.querySelector('.sr-trow').innerHTML = `<b>${esc(TR.symbol)}</b><span class="sr-side">${String(TR.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy'}</span><span class="sr-when">${fWhen(TR.open)}</span>`;
    tc.querySelector('.sr-big').innerHTML = TR.r ? `<span class="${TR.r < 0 ? 'neg' : 'pos'}">${R(TR.r)}</span><small>${money(TR.net)}</small>` : `<span class="${TR.net < 0 ? 'neg' : 'pos'}">${money(TR.net)}</span><small>no stop, so no R</small>`;
    const lad = tc.querySelector('.sr-ladder'); lad.setAttribute('aria-label', `Target ${f(TR.tp)}, entry ${f(TR.entry)}, stop ${f(TR.sl)}`); if (!(TR.tp > 0)) lad.querySelector('.tp').style.opacity = 0.2; if (!(TR.sl > 0)) lad.querySelector('.sl').style.opacity = 0.2;
    tc.querySelector('.sr-lv').innerHTML = `<span>Target<b>${f(TR.tp)}</b></span><span>Entry<b>${f(TR.entry)}</b></span><span>Stop<b>${f(TR.sl)}</b></span>`;
    tc.querySelector('.sr-meta').textContent = (hold ? 'Held ' + hold + ' · ' : '') + (TR.lots ? TR.lots + ' lots · ' : '') + 'recorded by the Journal EA'; }
  renderTabs(); openTab(0); setTool('select'); syncBar(); head(); setsSpark(); if (LIVE) liveStrip();
  const start = { '#compare': 'compare', '#playbook': 'book' }[location.hash]; go(start || 'study');
  addEventListener('resize', () => { sizeCanvas(); setsSpark(); head(); if ($('v-book').classList.contains('on')) book(); });
  booted = true;
  Promise.all(FONTS.map((f) => document.fonts.load(`40px "${f[0]}"`).catch(() => {}))).then(() => { booted = false; redraw(); thumbs(); booted = true; });
})();
