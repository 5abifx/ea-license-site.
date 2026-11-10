// Plan a trade: the ladder (target / entry / stop to scale), reward : risk blocks, risk in money and lot size
// update as the trader types. The lot comes from the trader's own past trades on that pair.
(function () {
  const f = document.getElementById('plan-form');
  if (!f) return;
  let D = {};
  try { D = JSON.parse(document.getElementById('plan-data').textContent); } catch (e) { /* no data */ }
  const $ = (id) => document.getElementById(id);
  const num = (n) => { const v = parseFloat(String(f.elements[n].value || '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
  const val = (n) => { const el = f.elements[n]; return el && el.value !== undefined ? el.value : ''; };
  const side = () => (f.querySelector('input[name=side]:checked') || {}).value || 'BUY';
  const fmt = (v, c) => `${c && c !== 'USD' ? '' : '$'}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c && c !== 'USD' ? ' ' + c : ''}`;

  // target, entry and stop to scale: reward zone white, risk zone orange
  function ladder(e, s, t, dir, ok) {
    const W = 150, H = 168, X = 54, BW = 54;
    if (!ok) {
      $('pc-lad').innerHTML = `<rect x="${X}" y="14" width="${BW}" height="92" rx="4" class="lz-r"/><rect x="${X}" y="110" width="${BW}" height="46" rx="4" class="lz-k"/>
        <text x="${X - 8}" y="18" class="lt" text-anchor="end">Target</text><text x="${X - 8}" y="112" class="lt" text-anchor="end">Entry</text><text x="${X - 8}" y="160" class="lt" text-anchor="end">Stop</text>`;
      return;
    }
    const hi = Math.max(e, s, t), lo = Math.min(e, s, t), y = (v) => 12 + ((hi - v) / (hi - lo)) * (H - 24);
    const zone = (a, b, cls) => `<rect x="${X}" y="${Math.min(y(a), y(b)).toFixed(1)}" width="${BW}" height="${Math.max(2, Math.abs(y(a) - y(b))).toFixed(1)}" rx="4" class="${cls}"/>`;
    const tag = (v, l) => `<line x1="${X - 4}" x2="${X + BW + 4}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="ll"/><text x="${X - 8}" y="${(y(v) + 4).toFixed(1)}" class="lt" text-anchor="end">${l}</text><text x="${X + BW + 8}" y="${(y(v) + 4).toFixed(1)}" class="lv">${v}</text>`;
    const R = Math.abs(t - e) / Math.abs(e - s);
    $('pc-lad').innerHTML = zone(e, t, 'lz-r') + zone(e, s, 'lz-k') + tag(t, 'Target') + tag(e, 'Entry') + tag(s, 'Stop')
      + `<text x="${X + BW / 2}" y="${((y(e) + y(t)) / 2 + 4).toFixed(1)}" class="lr" text-anchor="middle">${R.toFixed(1)}R</text>`
      + `<text x="${X + BW / 2}" y="${((y(e) + y(s)) / 2 + 4).toFixed(1)}" class="lk" text-anchor="middle">1R</text>`
      + `<path d="M${X + BW + 30} ${(dir > 0 ? y(e) - 6 : y(e) + 6).toFixed(1)} l6 ${dir > 0 ? -8 : 8} l6 ${dir > 0 ? 8 : -8}" class="la"/>`;
  }
  function calc() {
    const e = num('entry'), s = num('sl'), t = num('tp'), r = num('risk_pct'), dir = side() === 'SELL' ? -1 : 1;
    const acct = val('account'), bal = (D.bal || {})[acct] || Object.values(D.bal || {})[0];
    const sym = String(val('symbol')).toUpperCase().replace(/[^A-Z0-9]/g, '');
    let warn = '';
    const risk = (e - s) * dir, reward = (t - e) * dir, ok = risk > 0 && reward > 0;
    if (Number.isFinite(e) && Number.isFinite(s) && risk <= 0) warn = `Stop goes ${dir > 0 ? 'below' : 'above'} entry on a ${dir > 0 ? 'buy' : 'sell'}.`;
    else if (Number.isFinite(e) && Number.isFinite(t) && reward <= 0) warn = `Target goes ${dir > 0 ? 'above' : 'below'} entry on a ${dir > 0 ? 'buy' : 'sell'}.`;
    $('pc-rr').textContent = ok ? (reward / risk).toFixed(1) : '-';
    const n = ok ? Math.min(6, Math.round(reward / risk)) : 0;
    $('pc-blocks').innerHTML = ok ? '<i class="k"></i>' + '<i></i>'.repeat(Math.max(0, n)) : '';
    const money = bal && r > 0 ? (bal.b * r) / 100 : NaN;
    $('pc-risk').textContent = Number.isFinite(money) ? fmt(money, bal.c) : r > 0 ? `${r}%` : '-';
    const key = sym && Object.keys(D.vpl || {}).find((k) => k.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith(sym));
    const v = key ? D.vpl[key] : NaN;
    $('pc-lot').textContent = risk > 0 && Number.isFinite(money) && v > 0 ? (money / (risk * v)).toFixed(2) : '-';
    $('pc-lot').title = v > 0 ? '' : 'Shows once the journal has a trade on this pair';
    ladder(e, s, t, dir, ok);
    const w = $('pc-warn'); w.hidden = !warn; w.textContent = warn;
  }
  f.addEventListener('input', calc);
  f.addEventListener('change', calc);
  f.querySelectorAll('.tp-chips .tp-chip').forEach((b) => b.addEventListener('click', () => { f.elements.symbol.value = b.dataset.v; calc(); }));
  calc();
})();

// "Your plans" filter: All / Waiting / Done
(function () {
  const btns = document.querySelectorAll('.tp-filter button');
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('.tp-scroll .tp-row').forEach((r) => { r.hidden = b.dataset.f !== 'all' && r.dataset.k !== b.dataset.f; });
  }));
})();
