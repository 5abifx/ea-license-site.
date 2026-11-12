// Trade replay on the trade page: TradingView Lightweight Charts with the candles the Journal EA saved.
// Entry, stop, target and exit are drawn on the chart. Replay plays the trade candle by candle, and each new
// candle forms tick by tick (open, wicks, close) like TradingView's Bar Replay. ?replay=1 starts it on load.
(function () {
  const box = document.getElementById('tv-chart'), dataEl = document.getElementById('tv-data');
  if (!box || !dataEl || !window.LightweightCharts) return;
  const D = JSON.parse(dataEl.textContent);
  const LW = window.LightweightCharts;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || undefined;
  const OK = css('--ok') || '#2fd3b4', BAD = css('--danger') || '#f04a4a', ACC = css('--accent') || '#ff5a1f', MUT = css('--muted') || '#8b8b93';
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const toS = (iso) => (iso ? Date.parse(String(iso).replace(' ', 'T') + 'Z') / 1000 : null);
  const bars = (D.candles || []).filter((k) => Array.isArray(k) && k.length >= 5)
    .map((k) => ({ time: k[0], open: k[1], high: k[2], low: k[3], close: k[4] }))
    .sort((a, b) => a.time - b.time).filter((b, i, l) => !i || b.time > l[i - 1].time);
  const play = document.getElementById('tv-play'), pos = document.getElementById('tv-pos'), story = document.getElementById('tv-story'), spdBox = document.getElementById('tv-spd');
  if (bars.length < 3) { box.innerHTML = '<p class="muted tv-none">No candles were saved for this trade. Trades logged by Journal EA 1.10 or newer have them.</p>'; document.getElementById('tv-ctrl').hidden = true; return; }

  const dg = Math.min(5, Math.max(0, Number(D.digits) || 2));
  const entry = num(D.entry), exit = num(D.exit), sl = num(D.sl), tp = num(D.tp), dir = D.side === 'SELL' ? -1 : 1;
  const idx = (ts) => { if (ts === null) return -1; let j = bars.findIndex((b) => b.time > ts); j = j < 0 ? bars.length : j; return Math.max(0, j - 1); };
  const E = idx(toS(D.open)), X = Math.max(E, idx(toS(D.close)));
  const fmt = (v) => Number(v).toFixed(dg);
  const R = (v) => (entry !== null && sl !== null && sl !== entry ? ((v - entry) * dir) / Math.abs(entry - sl) : null);

  const chart = LW.createChart(box, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: MUT, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 },
    grid: { vertLines: { color: 'rgba(255,255,255,.035)' }, horzLines: { color: 'rgba(255,255,255,.035)' } },
    rightPriceScale: { borderColor: 'rgba(255,255,255,.08)' },
    timeScale: { borderColor: 'rgba(255,255,255,.08)', timeVisible: true, secondsVisible: false, rightOffset: 6 },
    crosshair: { mode: LW.CrosshairMode.Normal },
    localization: { priceFormatter: fmt },
  });
  const ser = chart.addCandlestickSeries({ upColor: OK, downColor: BAD, wickUpColor: OK, wickDownColor: BAD, borderVisible: false, priceLineVisible: false, lastValueVisible: false,
    priceFormat: { type: 'price', precision: dg, minMove: Math.pow(10, -dg) } });
  const line = (price, color, title) => price !== null && ser.createPriceLine({ price, color, title, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true });
  line(entry, ACC, 'Entry'); line(sl, BAD, 'SL'); line(tp, OK, 'TP');

  const partials = (D.partials || []).map((p) => ({ i: idx(toS(p.time)), price: num(p.price) })).filter((p) => p.i >= 0 && p.price !== null);
  const rTxt = (v) => (v === null ? '' : ` ${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}R`);
  function marks(n) {
    const m = [];
    if (E >= 0 && n > E) m.push({ time: bars[E].time, position: dir < 0 ? 'aboveBar' : 'belowBar', color: ACC, shape: dir < 0 ? 'arrowDown' : 'arrowUp', text: `${D.side === 'SELL' ? 'Sell' : 'Buy'}${entry !== null ? ' ' + fmt(entry) : ''}` });
    partials.forEach((p) => { if (n > p.i) m.push({ time: bars[p.i].time, position: dir < 0 ? 'belowBar' : 'aboveBar', color: MUT, shape: 'circle', text: 'Partial' }); });
    if (n > X) m.push({ time: bars[X].time, position: dir < 0 ? 'belowBar' : 'aboveBar', color: '#fff', shape: dir < 0 ? 'arrowUp' : 'arrowDown', text: `Exit${exit !== null ? rTxt(R(exit)) : ''}` });
    ser.setMarkers(m.sort((a, b) => a.time - b.time));
  }
  // what the trader saw at each step: worst and best move so far while in the trade
  function say(n) {
    if (n <= E) return 'Before the trade. Watch what price did before your entry.';
    const inTrade = bars.slice(E, Math.min(n, X + 1));
    const worst = inTrade.reduce((w, b) => Math.min(w, (dir < 0 ? entry - b.high : b.low - entry)), 0);
    const best = inTrade.reduce((w, b) => Math.max(w, (dir < 0 ? entry - b.low : b.high - entry)), 0);
    const rw = sl !== null && entry !== null && sl !== entry ? Math.abs(entry - sl) : null;
    const asR = (v) => (rw ? (Math.abs(v / rw) < 0.05 ? '0R' : `${v >= 0 ? '+' : '−'}${Math.abs(v / rw).toFixed(1)}R`) : fmt(Math.abs(v)));
    if (n <= X) return `In the trade. Best so far ${asR(best)}, worst so far ${asR(worst)}.`;
    return `Closed at ${exit !== null ? fmt(exit) : 'exit'}${exit !== null && R(exit) !== null ? ` for${rTxt(R(exit))}` : ''}. Best move during the trade ${asR(best)}, worst ${asR(worst)}. After the exit: what price did next.`;
  }
  const full = () => { ser.setData(bars); marks(bars.length); pos.value = bars.length; story.textContent = 'Full trade shown. Press Replay to watch it form candle by candle.'; };
  pos.max = bars.length; full(); chart.timeScale().fitContent();

  // a believable path inside one candle: open, then the nearer wick, the other wick, then close
  const pathOf = (b) => { const upFirst = Math.abs(b.high - b.open) < Math.abs(b.open - b.low); const a = upFirst ? b.high : b.low, c = upFirst ? b.low : b.high;
    const pts = [b.open], seg = [[b.open, a, 4], [a, c, 6], [c, b.close, 4]];
    seg.forEach(([p, q, k]) => { for (let i = 1; i <= k; i++) pts.push(p + ((q - p) * i) / k + (i < k ? (Math.random() - 0.5) * Math.abs(q - p) * 0.15 : 0)); });
    return pts; };
  let upto = bars.length, timer = null, spd = 4, tick = 0, path = null;
  const stop = () => { cancelAnimationFrame(timer); timer = null; play.textContent = '▶ Replay'; play.setAttribute('aria-pressed', 'false'); };
  const show = (n) => { ser.setData(bars.slice(0, n)); marks(n); pos.value = n; story.textContent = say(n); };
  function start() {
    if (upto >= bars.length) upto = Math.max(1, Math.min(E - 15, bars.length - 2));
    show(upto); chart.timeScale().fitContent();
    play.textContent = '❚❚ Pause'; play.setAttribute('aria-pressed', 'true'); tick = 0; path = null;
    let last = performance.now();
    const step = (now) => {
      tick += (now - last) / (560 / spd); last = now;
      while (tick >= 1) {
        tick -= 1; path = null; ser.update(bars[upto]); upto++; marks(upto); pos.value = upto; story.textContent = say(upto);
        if (upto >= bars.length) { stop(); full(); return; }
      }
      const b = bars[upto]; path = path || pathOf(b);
      const k = Math.min(path.length - 1, Math.floor(tick * path.length)), seen = path.slice(0, k + 1);
      ser.update({ time: b.time, open: b.open, high: Math.min(b.high, Math.max(...seen)), low: Math.max(b.low, Math.min(...seen)), close: seen[seen.length - 1] });
      timer = requestAnimationFrame(step);
    };
    timer = requestAnimationFrame(step);
  }
  play.addEventListener('click', () => { if (timer) { stop(); show(upto); } else start(); });
  pos.addEventListener('input', () => { if (timer) stop(); upto = Number(pos.value); if (upto >= bars.length) full(); else show(upto); });
  spdBox.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; spd = Number(b.dataset.s); spdBox.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  if (/[?&]replay=1/.test(location.search)) setTimeout(start, 400);
})();
