// Plan a trade: reward : risk, risk in money and lot size update as the trader types.
// The lot comes from the trader's own past trades on that pair (money per price move per lot).
(function () {
  const f = document.getElementById('plan-form');
  if (!f) return;
  let D = {};
  try { D = JSON.parse(document.getElementById('plan-data').textContent); } catch (e) { /* no data */ }
  const $ = (id) => document.getElementById(id);
  const num = (n) => { const v = parseFloat(String(f.elements[n].value || '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
  const val = (n) => { const el = f.elements[n]; return el && (el.value !== undefined ? el.value : ''); };
  const side = () => (f.querySelector('input[name=side]:checked') || {}).value || 'BUY';
  const fmt = (v, c) => `${c && c !== 'USD' ? '' : '$'}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c && c !== 'USD' ? ' ' + c : ''}`;
  function calc() {
    const e = num('entry'), s = num('sl'), t = num('tp'), r = num('risk_pct'), dir = side() === 'SELL' ? -1 : 1;
    const acct = val('account'), bal = (D.bal || {})[acct] || Object.values(D.bal || {})[0];
    const sym = String(val('symbol')).toUpperCase().trim();
    let warn = '';
    const risk = (e - s) * dir, reward = (t - e) * dir;
    $('pc-rr').textContent = risk > 0 && reward > 0 ? (reward / risk).toFixed(1) : '-';
    if (Number.isFinite(e) && Number.isFinite(s) && risk <= 0) warn = `The stop must be ${dir > 0 ? 'below' : 'above'} the entry for a ${dir > 0 ? 'buy' : 'sell'}.`;
    else if (Number.isFinite(e) && Number.isFinite(t) && reward <= 0) warn = `The target must be ${dir > 0 ? 'above' : 'below'} the entry for a ${dir > 0 ? 'buy' : 'sell'}.`;
    const money = bal && r > 0 ? (bal.b * r) / 100 : NaN;
    $('pc-risk').textContent = Number.isFinite(money) ? fmt(money, bal.c) : r > 0 ? `${r}%` : '-';
    const key = Object.keys(D.vpl || {}).find((k) => k.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith(sym.replace(/[^A-Z0-9]/g, '')) && sym);
    const v = key ? D.vpl[key] : NaN;
    $('pc-lot').textContent = risk > 0 && Number.isFinite(money) && v > 0 ? (money / (risk * v)).toFixed(2) : '-';
    $('pc-lot').title = v > 0 ? '' : 'Shows once the journal has a trade on this pair';
    const w = $('pc-warn'); w.hidden = !warn; w.textContent = warn;
  }
  f.addEventListener('input', calc);
  f.addEventListener('change', calc);
  f.querySelectorAll('.tp-chips .tp-chip').forEach((b) => b.addEventListener('click', () => { f.elements.symbol.value = b.dataset.v; calc(); }));
  calc();
})();
