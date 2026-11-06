/* Account report: two 9:16 share cards plus one big 4:3 (iPad) sheet of a whole account (or all accounts) for a period,
   in the same cinematic style as the trade cards (uses window.TradeCards.kit from cards.js).
   Card 1 = result, equity curve and key numbers. Card 2 = calendar of the period. */
(function () {
  const el = document.getElementById('report-data');
  const r1 = document.getElementById('r1'), r2 = document.getElementById('r2'), r3 = document.getElementById('r3');
  if (!el || !r1 || !r2 || !window.TradeCards) return;
  const d = JSON.parse(el.textContent);
  const K = window.TradeCards.kit;
  const { W, H, PAD, D, M, INK, SOFT, DIM, FAINT, ORANGE, WIN, LOSS, LINE, MINUS, MON, T, fitSize } = K;
  const val = (id) => document.getElementById(id);
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const st = { mode: 'money', kat: true };

  /* ---------- numbers ---------- */
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const sign = (n) => (n < 0 ? MINUS : '+');
  const dollar = !d.cur || d.cur === 'USD';
  const fmt2 = (n) => Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n) => (fin(n) ? sign(n) + (dollar ? '$' + fmt2(n) : fmt2(n) + ' ' + d.cur) : '—');
  const moneyShort = (n) => {
    const a = Math.abs(n), s = a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k' : String(Math.round(a));
    return sign(n) + (dollar ? '$' : '') + s;
  };
  const pctOf = (n) => (fin(n) && d.start ? (n / d.start) * 100 : null);
  const pct = (n) => (fin(n) ? sign(n) + Math.abs(n).toFixed(2) + '%' : '—');
  const rTxt = (n) => (fin(n) ? sign(n) + Math.abs(n).toFixed(Math.abs(n) >= 10 ? 0 : 1) + 'R' : '—');
  // a money amount shown the way the trader picked: $ / % of account / hidden
  const amount = (n) => (st.mode === 'pct' ? pct(pctOf(n)) : st.mode === 'r' ? null : money(n));
  const isWin = d.net >= 0, acc = isWin ? WIN : LOSS;
  const dayTxt = (s) => (s ? `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : '');
  const range = () => {
    if (!d.from) return '';
    if (d.from === d.to) return dayTxt(d.from).toUpperCase();
    const sameYear = d.from.slice(0, 4) === d.to.slice(0, 4);
    return `${dayTxt(d.from).replace(sameYear ? ' ' + d.from.slice(0, 4) : '', '')} – ${dayTxt(d.to)}`.toUpperCase();
  };
  function primary() {
    if (st.mode === 'pct' && d.start) return pct(pctOf(d.net));
    if (st.mode === 'r') return fin(d.totalR) ? rTxt(d.totalR) : Math.round(d.winRate * 100) + '% WIN';
    return money(d.net);
  }
  function secondary() {
    const p = [];
    if (st.mode !== 'r' && fin(d.totalR)) p.push(rTxt(d.totalR));
    if (st.mode === 'money' && d.start) p.push(pct(pctOf(d.net)));
    p.push(`${d.n} trade${d.n === 1 ? '' : 's'}`);
    return p.join('  ·  ');
  }

  /* ---------- shared parts ---------- */
  function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function head(c, kicker, title, sub) {
    K.brand(c, PAD, 140);
    const h = d.handle || '5abifx.com';
    T(c, h, W - PAD, 153, { fam: M, size: fitSize(c, h, 420, 26, M, 400, 2), color: DIM, align: 'right', ls: 2 });
    T(c, kicker, PAD, 330, { fam: M, size: 28, color: ORANGE, ls: 6 });
    T(c, title, PAD - 4, 440, { fam: D, w: 300, size: fitSize(c, title, W - 2 * PAD, 110, D, 300, -3), ls: -3 });
    T(c, sub, PAD, 500, { fam: M, size: fitSize(c, sub, W - 2 * PAD, 30, M, 400, 2), color: SOFT, ls: 2 });
  }
  function foot(c) {
    const y = H - PAD;
    c.fillStyle = LINE; c.fillRect(PAD, y - 60, W - 2 * PAD, 2);
    T(c, st.kat ? 'PROTECTED BY KATANA' : '5ABI.FX JOURNAL', PAD, y, { fam: M, size: 24, color: ORANGE, ls: 4 });
    const r = range();
    T(c, r, W - PAD, y, { fam: M, size: fitSize(c, r, 430, 24, M, 400, 4), color: DIM, align: 'right', ls: 4 });
  }

  /* ---------- card 1: the result ---------- */
  function equity(c, x0, y0, w, h) {
    const pts = [0, ...d.equity];
    T(c, 'EQUITY', x0, y0 - 18, { fam: M, size: 20, color: FAINT, ls: 5 });
    if (pts.length < 3) { T(c, 'More trades draw the curve', x0, y0 + h / 2, { fam: M, size: 26, color: FAINT }); return; }
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const padY = (hi - lo) * 0.08; lo -= padY; hi += padY;
    const X = (i) => x0 + (i / (pts.length - 1)) * w, Y = (v) => y0 + h - ((v - lo) / (hi - lo)) * h;
    // zero line
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; c.setLineDash([4, 10]);
    c.beginPath(); c.moveTo(x0, Y(0)); c.lineTo(x0 + w, Y(0)); c.stroke(); c.setLineDash([]);
    // area
    const g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, isWin ? 'rgba(47,211,166,.32)' : 'rgba(255,90,100,.05)');
    g.addColorStop(1, isWin ? 'rgba(47,211,166,0)' : 'rgba(255,90,100,.3)');
    c.beginPath(); c.moveTo(X(0), Y(0));
    pts.forEach((v, i) => c.lineTo(X(i), Y(v)));
    c.lineTo(X(pts.length - 1), Y(0)); c.closePath(); c.fillStyle = g; c.fill();
    // line
    c.strokeStyle = acc; c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); pts.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke();
    const ex = X(pts.length - 1), ey = Y(pts.at(-1));
    c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(ex, ey, 20, 0, 7); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(ex, ey, 8, 0, 7); c.fill();
    c.lineCap = 'butt';
  }
  function cells() {
    const r = st.mode === 'r';
    const pf = d.pf === 'inf' ? '∞' : fin(d.pf) ? d.pf.toFixed(2) : '—';
    return [
      ['WIN RATE', Math.round(d.winRate * 100) + '%'],
      ['PROFIT FACTOR', pf],
      ['TRADES', String(d.n)],
      ['GREEN DAYS', d.days ? `${d.greenDays} / ${d.days}` : '—'],
      r ? ['BEST TRADE', rTxt(d.bestTradeR)] : ['BEST DAY', amount(d.bestDay)],
      r || !fin(d.avgR) ? ['AVG TRADE', fin(d.avgR) ? rTxt(d.avgR) : r ? '—' : amount(d.n ? d.net / d.n : null)] : ['AVG R', rTxt(d.avgR)],
      r ? ['LOSS STREAK', String(d.worstRun)] : ['MAX DRAWDOWN', d.maxDD > 0 ? amount(-d.maxDD) : '0'],
      ['WIN STREAK', String(d.bestRun)],
      ['EDGE SCORE', fin(d.score) ? String(d.score) : '—'],
    ];
  }
  function card1(c) {
    K.bg(c);
    head(c, 'ACCOUNT REPORT', d.label, [d.acct, d.symbols.map((s) => s.s).join(' · ')].filter(Boolean).join('  ·  ').toUpperCase());
    const p = primary();
    T(c, p, PAD - 14, 790, { fam: D, w: 200, size: fitSize(c, p, W - 2 * PAD, 280, D, 200, -10), color: acc, ls: -10 });
    const s = secondary();
    T(c, s, PAD, 870, { fam: M, size: fitSize(c, s, W - 2 * PAD, 36, M, 400), color: SOFT });
    equity(c, PAD, 980, W - 2 * PAD, 330);
    c.fillStyle = LINE; c.fillRect(PAD, 1370, W - 2 * PAD, 2);
    const cw = (W - 2 * PAD) / 3;
    cells().forEach(([k, v], i) => {
      const x = PAD + (i % 3) * cw, y = 1440 + Math.floor(i / 3) * 118, s2 = String(v || '—');
      T(c, k, x, y, { fam: M, size: 20, color: FAINT, ls: 4 });
      const neg = s2.startsWith(MINUS), pos = s2.startsWith('+');
      T(c, s2, x, y + 50, { fam: M, size: fitSize(c, s2, cw - 24, 40, M, 400), color: neg ? LOSS : pos ? WIN : INK });
    });
    foot(c);
  }

  /* ---------- card 2: the calendar ---------- */
  const dayVal = (x) => (st.mode === 'r' ? (x.rn ? rTxt(x.r) : `${x.n}×`) : st.mode === 'pct' && d.start ? pct(pctOf(x.net)) : moneyShort(x.net));
  const shade = (v, max, a0, a1) => `rgba(${v >= 0 ? '47,211,166' : '255,90,100'},${(a0 + (a1 - a0) * Math.min(1, Math.abs(v) / (max || 1))).toFixed(3)})`;
  function monthGrid(c) {
    const [y, m] = d.month.split('-').map(Number);
    const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const gap = 12, cw = (W - 2 * PAD - 6 * gap) / 7, ch = 150;
    const max = Math.max(...Object.values(d.daily).map((x) => Math.abs(x.net)), 1);
    DOW.forEach((w, i) => T(c, w, PAD + i * (cw + gap) + cw / 2, 610, { fam: M, size: 20, color: FAINT, align: 'center', ls: 3 }));
    for (let day = 1; day <= nDays; day++) {
      const k = lead + day - 1, col = k % 7, row = Math.floor(k / 7);
      const x = PAD + col * (cw + gap), yy = 640 + row * (ch + gap);
      const iso = `${d.month}-${String(day).padStart(2, '0')}`, x2 = d.daily[iso];
      rrect(c, x, yy, cw, ch, 16);
      if (x2) {
        c.fillStyle = shade(x2.net, max, 0.18, 0.62); c.fill();
        c.strokeStyle = x2.net >= 0 ? 'rgba(47,211,166,.75)' : 'rgba(255,90,100,.75)'; c.lineWidth = 2; c.stroke();
      } else {
        c.fillStyle = 'rgba(255,255,255,.025)'; c.fill();
        c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 2; c.stroke();
      }
      T(c, String(day), x + 16, yy + 34, { fam: M, size: 22, color: x2 ? INK : FAINT });
      if (x2) {
        const v = dayVal(x2);
        T(c, v, x + cw / 2, yy + 96, { fam: D, w: 400, size: fitSize(c, v, cw - 18, 40, D, 400), align: 'center' });
        T(c, `${x2.n} trade${x2.n === 1 ? '' : 's'}`, x + cw / 2, yy + 132, { fam: M, size: 18, color: 'rgba(255,255,255,.75)', align: 'center' });
      }
    }
    const rows = Math.ceil((lead + nDays) / 7);
    return 640 + rows * (ch + gap);
  }
  function heatGrid(c) {
    const keys = Object.keys(d.daily).sort();
    const t0 = Date.parse(keys[0] + 'T00:00:00Z'), t1 = Date.parse(keys.at(-1) + 'T00:00:00Z');
    const mon = (t) => t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5;
    let start = mon(t0);
    const weeks = Math.min(26, Math.floor((mon(t1) - start) / (7 * 864e5)) + 1);
    start = mon(t1) - (weeks - 1) * 7 * 864e5;
    const gap = 8, size = Math.min(96, (W - 2 * PAD - 70 - (weeks - 1) * gap) / weeks);
    const gx = PAD + 70, max = Math.max(...Object.values(d.daily).map((x) => Math.abs(x.net)), 1);
    ['MON', 'WED', 'FRI', 'SUN'].forEach((w, i) => T(c, w, PAD, 640 + (i * 2) * (size + gap) + size * 0.68, { fam: M, size: 18, color: FAINT, ls: 2 }));
    for (let w = 0; w < weeks; w++) {
      for (let k = 0; k < 7; k++) {
        const t = start + (w * 7 + k) * 864e5, iso = new Date(t).toISOString().slice(0, 10), x2 = d.daily[iso];
        const x = gx + w * (size + gap), y = 620 + k * (size + gap);
        rrect(c, x, y, size, size, Math.min(12, size / 4));
        c.fillStyle = x2 ? shade(x2.net, max, 0.25, 0.9) : 'rgba(255,255,255,.05)'; c.fill();
        if (k === 0 && new Date(t).getUTCDate() <= 7) T(c, MON[new Date(t).getUTCMonth()].toUpperCase(), x, 600, { fam: M, size: 18, color: FAINT, ls: 2 });
      }
    }
    let y = 620 + 7 * (size + gap) + 70;
    // month totals, newest last (up to 6)
    const byM = {};
    keys.forEach((k) => { byM[k.slice(0, 7)] = (byM[k.slice(0, 7)] || 0) + d.daily[k].net; });
    const ms = Object.keys(byM).sort().slice(-6), mx = Math.max(...ms.map((m) => Math.abs(byM[m])), 1);
    T(c, 'MONTHS', PAD, y, { fam: M, size: 20, color: FAINT, ls: 5 });
    y += 30;
    ms.forEach((m) => {
      const v = byM[m], bw = (W - 2 * PAD - 460) * Math.abs(v) / mx;
      T(c, `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`, PAD, y + 46, { fam: M, size: 28, color: SOFT });
      rrect(c, PAD + 220, y + 22, Math.max(8, bw), 30, 8); c.fillStyle = v >= 0 ? WIN : LOSS; c.fill();
      const s = st.mode === 'r' ? '' : st.mode === 'pct' && d.start ? pct(pctOf(v)) : money(v);
      T(c, s, W - PAD, y + 48, { fam: M, size: 30, color: v >= 0 ? WIN : LOSS, align: 'right' });
      y += 74;
    });
    return y;
  }
  function card2(c) {
    K.bg(c, 0.6);
    head(c, 'TRADING CALENDAR', d.label, `${d.greenDays} GREEN DAY${d.greenDays === 1 ? '' : 'S'} OF ${d.days}  ·  WIN RATE ${Math.round(d.winRate * 100)}%`);
    const y = d.isMonth ? monthGrid(c) : heatGrid(c);
    // best day line, if there is room
    const best = Object.entries(d.daily).sort((a, b) => b[1].net - a[1].net)[0];
    if (best && y < H - 260) {
      const v = st.mode === 'r' ? (best[1].rn ? rTxt(best[1].r) : '') : st.mode === 'pct' && d.start ? pct(pctOf(best[1].net)) : money(best[1].net);
      T(c, 'BEST DAY', PAD, y + 70, { fam: M, size: 22, color: FAINT, ls: 5 });
      T(c, `${dayTxt(best[0])}${v ? '   ' + v : ''}`, W - PAD, y + 70, { fam: M, size: 30, color: best[1].net >= 0 ? WIN : LOSS, align: 'right' });
    }
    foot(c);
  }

  /* ---------- card 3: one big landscape sheet (iPad 4:3) ----------
     Everything on one picture, like a prop firm performance sheet: result, edge score, key numbers,
     equity with the drawdown under it, the calendar, weekdays and symbols. */
  const BW = 2400, BH = 1800, BP = 110;
  function bigBg(c) {
    c.fillStyle = '#050507'; c.fillRect(0, 0, BW, BH);
    c.globalCompositeOperation = 'lighter';
    let s = 11; const rn = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 10; i++) {
      const y = 100 + rn() * (BH - 200), w = 18 + rn() * 50, a = 0.08 + rn() * 0.28;
      for (let x = 0; x < BW; x += 14) {
        const n = (Math.sin(x / 150 + i * 2) * 0.5 + 0.5) * (Math.sin(x / 41 - i) * 0.5 + 0.5);
        const g = c.createLinearGradient(0, y - w, 0, y + w);
        g.addColorStop(0, 'rgba(255,90,31,0)');
        g.addColorStop(0.5, `rgba(255,90,31,${(a * (0.2 + 0.8 * n) * (x / BW * 0.8 + 0.2)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,90,31,0)');
        c.fillStyle = g; c.fillRect(x, y - w, 14, w * 2);
      }
    }
    c.globalCompositeOperation = 'source-over';
    const v = c.createRadialGradient(BW * 0.3, BH * 0.45, 100, BW * 0.5, BH * 0.5, BW * 0.7);
    v.addColorStop(0, 'rgba(5,5,7,.6)'); v.addColorStop(1, 'rgba(5,5,7,.96)');
    c.fillStyle = v; c.fillRect(0, 0, BW, BH);
  }
  function panel(c, x, y, w, h, label, right) {
    rrect(c, x, y, w, h, 28);
    c.fillStyle = 'rgba(255,255,255,.028)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
    if (label) T(c, label, x + 40, y + 62, { fam: M, size: 22, color: FAINT, ls: 5 });
    if (right) T(c, right, x + w - 40, y + 62, { fam: M, size: 22, color: DIM, align: 'right', ls: 3 });
  }
  function bigEquity(c, x, y, w, h) {
    const pts = [0, ...d.equity];
    if (pts.length < 3) { T(c, 'More trades draw the curve', x + w / 2, y + h / 2, { fam: M, size: 28, color: FAINT, align: 'center' }); return; }
    const ddH = Math.round(h * 0.24), eh = h - ddH - 30;
    let peak = 0; const dd = pts.map((v) => { peak = Math.max(peak, v); return v - peak; });
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const py = (hi - lo) * 0.08; lo -= py; hi += py;
    const X = (i) => x + (i / (pts.length - 1)) * w, Y = (v) => y + eh - ((v - lo) / (hi - lo)) * eh;
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; c.setLineDash([4, 10]);
    c.beginPath(); c.moveTo(x, Y(0)); c.lineTo(x + w, Y(0)); c.stroke(); c.setLineDash([]);
    const g = c.createLinearGradient(0, y, 0, y + eh);
    g.addColorStop(0, isWin ? 'rgba(47,211,166,.34)' : 'rgba(255,90,100,.05)');
    g.addColorStop(1, isWin ? 'rgba(47,211,166,0)' : 'rgba(255,90,100,.3)');
    c.beginPath(); c.moveTo(X(0), Y(0)); pts.forEach((v, i) => c.lineTo(X(i), Y(v)));
    c.lineTo(X(pts.length - 1), Y(0)); c.closePath(); c.fillStyle = g; c.fill();
    c.strokeStyle = acc; c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); pts.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke();
    const ex = X(pts.length - 1), ey = Y(pts.at(-1));
    c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(ex, ey, 22, 0, 7); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(ex, ey, 9, 0, 7); c.fill();
    c.lineCap = 'butt';
    // high-water mark label
    const hiV = Math.max(...pts), hiI = pts.indexOf(hiV);
    if (hiV > 0 && st.mode !== 'r') {
      const s = 'PEAK ' + (st.mode === 'pct' && d.start ? pct(pctOf(hiV)) : money(hiV));
      const tx = Math.min(Math.max(X(hiI), x + 10), x + w - 10);
      T(c, s, tx, Y(hiV) - 26, { fam: M, size: 20, color: SOFT, align: tx > x + w * 0.7 ? 'right' : tx < x + w * 0.3 ? 'left' : 'center', ls: 2 });
    }
    // drawdown ("underwater") strip
    const top = y + eh + 30, minDD = Math.min(...dd, -1e-9);
    T(c, 'DRAWDOWN', x, top - 6, { fam: M, size: 18, color: FAINT, ls: 4 });
    const DY = (v) => top + 10 + (v / minDD) * (ddH - 10);
    c.beginPath(); c.moveTo(X(0), DY(0)); dd.forEach((v, i) => c.lineTo(X(i), DY(v)));
    c.lineTo(X(dd.length - 1), DY(0)); c.closePath(); c.fillStyle = 'rgba(255,90,100,.32)'; c.fill();
    c.strokeStyle = 'rgba(255,90,100,.8)'; c.lineWidth = 3;
    c.beginPath(); dd.forEach((v, i) => (i ? c.lineTo(X(i), DY(v)) : c.moveTo(X(i), DY(v)))); c.stroke();
    if (d.maxDD > 0 && st.mode !== 'r') {
      const s = 'MAX ' + (st.mode === 'pct' && fin(d.maxDDPct) ? MINUS + Math.abs(d.maxDDPct).toFixed(2) + '%' : money(-d.maxDD));
      T(c, s, x + w, top - 6, { fam: M, size: 18, color: LOSS, align: 'right', ls: 3 });
    }
  }
  function bigMonth(c, x, y, w, h) {
    const [yy, m] = d.month.split('-').map(Number);
    const nDays = new Date(Date.UTC(yy, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(yy, m - 1, 1)).getUTCDay() + 6) % 7;
    const rows = Math.ceil((lead + nDays) / 7), gap = 10, cw = (w - 6 * gap) / 7;
    const ch = Math.min(96, (h - 44 - (rows - 1) * gap) / rows);
    const max = Math.max(...Object.values(d.daily).map((v) => Math.abs(v.net)), 1);
    DOW.forEach((n, i) => T(c, n, x + i * (cw + gap) + cw / 2, y + 20, { fam: M, size: 18, color: FAINT, align: 'center', ls: 3 }));
    for (let day = 1; day <= nDays; day++) {
      const k = lead + day - 1, cx = x + (k % 7) * (cw + gap), cy = y + 44 + Math.floor(k / 7) * (ch + gap);
      const x2 = d.daily[`${d.month}-${String(day).padStart(2, '0')}`];
      rrect(c, cx, cy, cw, ch, 14);
      if (x2) { c.fillStyle = shade(x2.net, max, 0.18, 0.62); c.fill(); c.strokeStyle = x2.net >= 0 ? 'rgba(47,211,166,.75)' : 'rgba(255,90,100,.75)'; }
      else { c.fillStyle = 'rgba(255,255,255,.025)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.07)'; }
      c.lineWidth = 2; c.stroke();
      const ty2 = ch < 70 ? cy + ch / 2 + 7 : cy + 28, vy = ch < 70 ? cy + ch / 2 + 10 : cy + ch - 16;
      T(c, String(day), cx + 14, ty2, { fam: M, size: 18, color: x2 ? 'rgba(255,255,255,.8)' : FAINT });
      if (x2) { const v = dayVal(x2); T(c, v, cx + cw - 14, vy, { fam: D, w: 400, size: fitSize(c, v, cw - 60, Math.min(30, ch * 0.62), D, 400), align: 'right' }); }
    }
  }
  function bigHeat(c, x, y, w, h) {
    const keys = Object.keys(d.daily).sort();
    const mon = (t) => t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5;
    const t0 = Date.parse(keys[0] + 'T00:00:00Z'), t1 = Date.parse(keys.at(-1) + 'T00:00:00Z');
    const weeks = Math.min(26, Math.floor((mon(t1) - mon(t0)) / (7 * 864e5)) + 1), start = mon(t1) - (weeks - 1) * 7 * 864e5;
    const gap = 8, lx = 70, size = Math.min((w - lx - (weeks - 1) * gap) / weeks, (h - 40 - 6 * gap) / 7);
    const max = Math.max(...Object.values(d.daily).map((v) => Math.abs(v.net)), 1);
    ['MON', 'WED', 'FRI', 'SUN'].forEach((n, i) => T(c, n, x, y + 40 + i * 2 * (size + gap) + size * 0.68, { fam: M, size: 17, color: FAINT, ls: 2 }));
    for (let wk = 0; wk < weeks; wk++) for (let k = 0; k < 7; k++) {
      const t = start + (wk * 7 + k) * 864e5, x2 = d.daily[new Date(t).toISOString().slice(0, 10)];
      const cx = x + lx + wk * (size + gap), cy = y + 40 + k * (size + gap);
      rrect(c, cx, cy, size, size, Math.min(10, size / 4));
      c.fillStyle = x2 ? shade(x2.net, max, 0.25, 0.9) : 'rgba(255,255,255,.05)'; c.fill();
      if (k === 0 && new Date(t).getUTCDate() <= 7) T(c, MON[new Date(t).getUTCMonth()].toUpperCase(), cx, y + 22, { fam: M, size: 17, color: FAINT, ls: 2 });
    }
    // month totals in the space to the right
    const used = lx + weeks * (size + gap), mx0 = x + used + 60, mw = w - used - 60;
    if (mw < 360) return;
    const byM = {};
    keys.forEach((k) => { const m = k.slice(0, 7); (byM[m] ||= { net: 0, r: 0 }); byM[m].net += d.daily[k].net; byM[m].r += d.daily[k].r; });
    const ms = Object.keys(byM).sort().slice(-5), mv = (m) => (st.mode === 'r' ? byM[m].r : byM[m].net);
    const mxv = Math.max(...ms.map((m) => Math.abs(mv(m))), 1e-9), rowH = Math.min(70, (h - 40) / ms.length);
    T(c, 'MONTHS', mx0, y + 22, { fam: M, size: 17, color: FAINT, ls: 3 });
    ms.forEach((m, j) => {
      const v = mv(m), yy = y + 40 + j * rowH;
      T(c, MON[Number(m.slice(5, 7)) - 1].toUpperCase() + ' ' + m.slice(2, 4), mx0, yy + 34, { fam: M, size: 24, color: SOFT });
      rrect(c, mx0 + 130, yy + 14, Math.max(8, (mw - 130 - 170) * Math.abs(v) / mxv), 26, 8); c.fillStyle = v >= 0 ? WIN : LOSS; c.fill();
      const tv = st.mode === 'r' ? rTxt(v) : st.mode === 'pct' && d.start ? pct(pctOf(v)) : moneyShort(v);
      T(c, tv, mx0 + mw, yy + 36, { fam: M, size: 26, color: v >= 0 ? WIN : LOSS, align: 'right' });
    });
  }
  function radar(c, cx, cy, r, parts) {
    const n = parts.length, ang = (i) => -Math.PI / 2 + (i / n) * Math.PI * 2;
    const P = (i, v) => [cx + Math.cos(ang(i)) * r * v, cy + Math.sin(ang(i)) * r * v];
    c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 2;
    [0.33, 0.66, 1].forEach((k) => { c.beginPath(); parts.forEach((_, i) => { const [x, y] = P(i, k); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); });
    parts.forEach((_, i) => { const [x, y] = P(i, 1); c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); });
    c.beginPath(); parts.forEach((p, i) => { const [x, y] = P(i, Math.max(0.04, p.v / 100)); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
    c.fillStyle = 'rgba(255,90,31,.22)'; c.fill(); c.strokeStyle = ORANGE; c.lineWidth = 4; c.lineJoin = 'round'; c.stroke();
    parts.forEach((p, i) => { const [x, y] = P(i, Math.max(0.04, p.v / 100)); c.fillStyle = INK; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); });
    parts.forEach((p, i) => {
      const cosv = Math.cos(ang(i)), sinv = Math.sin(ang(i)), [x, y] = P(i, 1.16);
      if (Math.abs(cosv) < 0.2) {   // top / bottom spoke: one line
        T(c, `${p.n}  ${p.v}`, x, sinv < 0 ? y - 4 : y + 22, { fam: M, size: 19, color: SOFT, align: 'center' });
        return;
      }
      const al = cosv > 0 ? 'left' : 'right';
      T(c, p.n, x, y + 2, { fam: M, size: 19, color: SOFT, align: al });
      T(c, String(p.v), x, y + 28, { fam: M, size: 19, color: FAINT, align: al });
    });
  }
  // sessions ranked by result (bars), then buys vs sells: the share-worthy "where my edge is" panel
  function edgeMap(c, x, y, w, h) {
    const ss = d.sessions || [], r = st.mode === 'r';
    const valOf = (q) => (r ? q.avgR : q.net);
    const txt = (q) => (r ? (fin(q.avgR) ? rTxt(q.avgR) + ' avg' : '—') : st.mode === 'pct' ? pct(pctOf(q.net)) : moneyShort(q.net));
    if (!ss.length) { T(c, 'Needs more trades', x + w / 2, y + h / 2, { fam: M, size: 26, color: FAINT, align: 'center' }); return; }
    const mx = Math.max(1e-9, ...ss.map((q) => Math.abs(valOf(q) || 0)));
    const nameW = 150, valW = 190, bx = x + nameW, bw = w - nameW - valW, rh = 46;
    ss.forEach((q, i) => {
      const yy = y + i * rh, v = valOf(q) || 0, top = i === 0 && v > 0;
      T(c, q.k, x, yy + 27, { fam: M, size: 22, color: top ? INK : SOFT, w: top ? 600 : 400 });
      rrect(c, bx, yy + 8, bw, 22, 11); c.fillStyle = 'rgba(255,255,255,.05)'; c.fill();
      const L = Math.max(14, (Math.abs(v) / mx) * bw);
      rrect(c, bx, yy + 8, L, 22, 11); c.fillStyle = v < 0 ? LOSS : top ? ORANGE : 'rgba(255,255,255,.82)'; c.fill();
      T(c, txt(q), x + w, yy + 25, { fam: M, size: 22, color: v < 0 ? LOSS : INK, align: 'right', w: 600 });
      T(c, `${q.win}% WIN · ${q.n} TRADES`, x + w, yy + 45, { fam: M, size: 15, color: FAINT, align: 'right', ls: 2 });
    });
    // buys vs sells
    const sd = (d.sides || []).filter((q) => q.n), ty = y + Math.max(3, ss.length) * rh + 26;
    if (!sd.length) return;
    c.fillStyle = LINE; c.fillRect(x, ty - 14, w, 2);
    const tot = sd.reduce((a, q) => a + q.n, 0);
    let cx = x;
    sd.forEach((q, i) => {
      const sw = (q.n / tot) * w, v = valOf(q) || 0;
      rrect(c, cx + (i ? 4 : 0), ty + 10, sw - 4, 10, 5); c.fillStyle = v < 0 ? LOSS : i ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.82)'; c.fill();
      cx += sw;
    });
    sd.forEach((q, i) => {
      const v = valOf(q) || 0, label = `${q.k.toUpperCase()}  ${txt(q)}  ·  ${q.win}%`;
      T(c, label, i ? x + w : x, ty + 56, { fam: M, size: fitSize(c, label, w / 2 - 10, 20, M, 400), color: v < 0 ? LOSS : SOFT, align: i ? 'right' : 'left', ls: 1 });
    });
  }
  function tile(c, x, y, w, h, label, value, sub, color) {
    rrect(c, x, y, w, h, 26); c.fillStyle = 'rgba(255,255,255,.035)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
    T(c, label, x + 36, y + 52, { fam: M, size: 19, color: FAINT, ls: 4 });
    const v = String(value || '—');
    T(c, v, x + 34, y + 124, { fam: D, w: 400, size: fitSize(c, v, w - 70, 64, D, 400, -1), color: color || INK, ls: -1 });
    if (sub) T(c, sub, x + 36, y + 162, { fam: M, size: fitSize(c, sub, w - 72, 20, M, 400), color: DIM });
  }
  function card3(c) {
    bigBg(c);
    const CW = BW - 2 * BP;
    // header: brand · period · handle
    K.brand(c, BP, 150);
    T(c, d.label, BW / 2, 172, { fam: D, w: 300, size: fitSize(c, d.label, 900, 66, D, 300, -2), align: 'center', ls: -2 });
    const h = d.handle || '5abifx.com';
    T(c, h, BW - BP, 164, { fam: M, size: fitSize(c, h, 520, 30, M, 400, 2), color: DIM, align: 'right', ls: 2 });
    c.fillStyle = LINE; c.fillRect(BP, 236, CW, 2);

    // hero: the result, centred
    const kick = ['NET RESULT', d.acct, d.symbols.map((x) => x.s).join(' · ')].filter(Boolean).join('  ·  ').toUpperCase();
    T(c, kick, BW / 2, 318, { fam: M, size: fitSize(c, kick, CW, 24, M, 400, 5), color: ORANGE, align: 'center', ls: 5 });
    const p = primary();
    T(c, p, BW / 2, 505, { fam: D, w: 300, size: fitSize(c, p, CW - 200, 200, D, 300, -6), color: acc, align: 'center', ls: -6 });
    const s2 = secondary() + `  ·  ${d.wins}W / ${d.losses}L`;
    T(c, s2, BW / 2, 572, { fam: M, size: fitSize(c, s2, CW, 30, M, 400), color: SOFT, align: 'center' });

    // four tiles
    const r = st.mode === 'r', pf = d.pf === 'inf' ? '∞' : fin(d.pf) ? d.pf.toFixed(2) : '—';
    const tw = (CW - 3 * 30) / 4, ty = 625, th = 190;
    const ratio = fin(d.avgW) && fin(d.avgL) && d.avgL ? (d.avgW / Math.abs(d.avgL)).toFixed(2) + '×' : '—';
    const avgWL = r ? (fin(d.bestTradeR) ? 'Best trade ' + rTxt(d.bestTradeR) : '') : `Avg win ${amount(Math.abs(d.avgW))}  ·  Avg loss ${amount(-Math.abs(d.avgL))}`;
    const dd = r ? String(d.worstRun) : d.maxDD > 0 ? (st.mode === 'pct' && fin(d.maxDDPct) ? MINUS + Math.abs(d.maxDDPct).toFixed(2) + '%' : money(-d.maxDD)) : '0';
    tile(c, BP, ty, tw, th, 'WIN RATE', Math.round(d.winRate * 100) + '%', `${d.greenDays} of ${d.days} days green`);
    tile(c, BP + (tw + 30), ty, tw, th, 'PROFIT FACTOR', pf, fin(d.avgR) ? `Avg ${rTxt(d.avgR)} a trade` : `${d.n} trades`);
    tile(c, BP + 2 * (tw + 30), ty, tw, th, 'AVG WIN ÷ AVG LOSS', ratio, avgWL);
    tile(c, BP + 3 * (tw + 30), ty, tw, th, r ? 'WORST LOSING STREAK' : 'MAX DRAWDOWN', dd, `Win streak ${d.bestRun}  ·  Loss streak ${d.worstRun}`, r ? INK : d.maxDD > 0 ? LOSS : INK);

    // equity + score
    const LW = 1300, RX = BP + LW + 30, RW = CW - LW - 30;
    panel(c, BP, 845, LW, 440, 'EQUITY CURVE', range());
    bigEquity(c, BP + 40, 985, LW - 80, 280);
    panel(c, RX, 845, RW, 440, 'EDGE SCORE');
    if (d.parts && d.parts.length) {
      radar(c, RX + RW * 0.36, 1090, 120, d.parts);
      T(c, String(d.score), RX + RW - 40, 970, { fam: D, w: 300, size: 110, align: 'right', ls: -3 });
      T(c, d.scoreLabel || '', RX + RW - 40, 1015, { fam: M, size: 22, color: SOFT, align: 'right', ls: 2 });
      if (d.weakest) {
        T(c, 'WORK ON', RX + RW - 40, 1200, { fam: M, size: 18, color: FAINT, align: 'right', ls: 4 });
        T(c, d.weakest, RX + RW - 40, 1238, { fam: M, size: fitSize(c, d.weakest, 300, 24, M, 400), color: ORANGE, align: 'right' });
      }
    } else T(c, 'Needs more trades', RX + RW / 2, 1080, { fam: M, size: 28, color: FAINT, align: 'center' });

    // calendar + time
    const cy = 1315, ch = 400;
    panel(c, BP, cy, LW, ch, d.isMonth ? 'CALENDAR' : 'DAILY HEATMAP', `${d.greenDays} OF ${d.days} DAYS GREEN`);
    if (d.isMonth) bigMonth(c, BP + 40, cy + 90, LW - 80, ch - 110); else bigHeat(c, BP + 40, cy + 90, LW - 80, ch - 110);
    panel(c, RX, cy, RW, ch, 'WHERE THE EDGE IS', 'NEW YORK TIME');
    edgeMap(c, RX + 40, cy + 100, RW - 80, ch - 120);

    // footer
    const fy = BH - 40;
    T(c, st.kat ? 'PROTECTED BY KATANA' : '5ABI.FX JOURNAL', BP, fy, { fam: M, size: 22, color: ORANGE, ls: 4 });
    const tag = 'SYNCED FROM MT5';
    T(c, '●  ' + tag, BW / 2, fy, { fam: M, size: 20, color: WIN, align: 'center', ls: 3 });
    T(c, 'ACCOUNT NUMBERS HIDDEN  ·  5ABIFX.COM', BW - BP, fy, { fam: M, size: 20, color: DIM, align: 'right', ls: 4 });
  }

  /* ---------- controls ---------- */
  function draw() {
    for (const cv of [r1, r2]) { cv.width = W; cv.height = H; }
    card1(r1.getContext('2d'));
    card2(r2.getContext('2d'));
    if (r3) { r3.width = BW; r3.height = BH; card3(r3.getContext('2d')); }
  }
  const modeSel = val('rmode');
  try { const m = localStorage.getItem('reportMode'); if (m && modeSel.querySelector(`option[value="${m}"]`)) modeSel.value = m; } catch (e) {}
  st.mode = modeSel.value;
  st.kat = val('rkat').checked;
  modeSel.addEventListener('change', () => { st.mode = modeSel.value; try { localStorage.setItem('reportMode', st.mode); } catch (e) {} draw(); });
  val('rkat').addEventListener('change', () => { st.kat = val('rkat').checked; draw(); });
  const fileName = (id) => `5ABIFX-report-${(d.month || d.label).replace(/\s+/g, '-')}-${id === 'r1' ? '1-result' : id === 'r2' ? '2-calendar' : 'big'}.png`;
  document.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => {
    val(b.dataset.save).toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName(b.dataset.save);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }));
  // phones: share straight to Instagram / WhatsApp when the browser can share files
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  document.querySelectorAll('[data-share]').forEach((b) => {
    if (!canShare) return;
    b.hidden = false;
    b.addEventListener('click', () => val(b.dataset.share).toBlob((blob) => {
      const f = new File([blob], fileName(b.dataset.share), { type: 'image/png' });
      navigator.share({ files: [f], title: '5ABI.FX report' }).catch(() => {});
    }, 'image/png'));
  });
  draw();
  K.onLogo(draw);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
})();
