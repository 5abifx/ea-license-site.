/* Account report: two 9:16 share cards of a whole account (or all accounts) for a period,
   in the same cinematic style as the trade cards (uses window.TradeCards.kit from cards.js).
   Card 1 = result, equity curve and key numbers. Card 2 = calendar of the period. */
(function () {
  const el = document.getElementById('report-data');
  const r1 = document.getElementById('r1'), r2 = document.getElementById('r2');
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

  /* ---------- controls ---------- */
  function draw() {
    for (const cv of [r1, r2]) { cv.width = W; cv.height = H; }
    card1(r1.getContext('2d'));
    card2(r2.getContext('2d'));
  }
  const modeSel = val('rmode');
  try { const m = localStorage.getItem('reportMode'); if (m && modeSel.querySelector(`option[value="${m}"]`)) modeSel.value = m; } catch (e) {}
  st.mode = modeSel.value;
  st.kat = val('rkat').checked;
  modeSel.addEventListener('change', () => { st.mode = modeSel.value; try { localStorage.setItem('reportMode', st.mode); } catch (e) {} draw(); });
  val('rkat').addEventListener('change', () => { st.kat = val('rkat').checked; draw(); });
  const fileName = (id) => `5ABIFX-report-${(d.month || d.label).replace(/\s+/g, '-')}-${id === 'r1' ? '1-result' : '2-calendar'}.png`;
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
