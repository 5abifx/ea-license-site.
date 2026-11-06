// Insights > Overview: "What if" simulator. Switch off sessions / days / symbols / sides or cap trades a day,
// and the result, the numbers and the equity curve update live. Nothing is saved; it only reads the trades on the page.
(function () {
  const box = document.getElementById('whatif'), el = document.getElementById('wi-data');
  if (!box || !el) return;
  const D = JSON.parse(el.textContent);
  // a trade: [id, closeMs, net, r, sym, side(0 buy, 1 sell), sess, dow, dayKey, openMin]
  const ALL = D.t.slice().sort((a, b) => a[1] - b[1]);
  if (ALL.length < 3) { box.hidden = true; return; }
  const usd = !D.cur || D.cur === 'USD';
  const fmt = (v) => (v < 0 ? '−' : '+') + (usd ? '$' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (usd ? '' : ' ' + D.cur);
  const fmtS = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '+') + (usd ? '$' : '') + (a >= 1000 ? (a / 1000).toFixed(1) + 'k' : Math.round(a)); };
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const has = (i) => [...new Set(ALL.map((t) => t[i]))].sort((a, b) => a - b);
  const groups = [
    { key: 'sess', i: 6, label: 'Sessions (New York time)', vals: has(6), name: (v) => D.sess[v][1] },
    { key: 'dow', i: 7, label: 'Days', vals: has(7), name: (v) => DOW[v] },
    { key: 'sym', i: 4, label: 'Symbols', vals: has(4), name: (v) => D.syms[v] },
    { key: 'side', i: 5, label: 'Side', vals: has(5), name: (v) => (v ? 'Sells' : 'Buys') },
  ].filter((g) => g.vals.length > 1);
  const st = { off: {}, cap: 0 };
  groups.forEach((g) => (st.off[g.key] = new Set()));

  function run(s) {
    let list = ALL.filter((t) => groups.every((g) => !s.off[g.key].has(t[g.i])));
    if (s.cap) {
      const per = {}, keep = new Set();
      list.slice().sort((a, b) => a[8] - b[8] || a[9] - b[9]).forEach((t) => { per[t[8]] = (per[t[8]] || 0) + 1; if (per[t[8]] <= s.cap) keep.add(t); });
      list = list.filter((t) => keep.has(t));
    }
    let eq = 0, peak = 0, dd = 0, gw = 0, gl = 0, w = 0;
    const curve = list.map((t) => { eq += t[2]; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); if (t[2] > 0) { gw += t[2]; w++; } else gl -= t[2]; return [t[1], eq]; });
    return { n: list.length, net: eq, win: list.length ? Math.round((w / list.length) * 100) : 0, pf: gl ? gw / gl : gw ? Infinity : 0, dd, curve };
  }
  const BASE = run({ off: Object.fromEntries(groups.map((g) => [g.key, new Set()])), cap: 0 });

  // one-tap ideas: the single changes that would have helped most
  function ideas() {
    const out = [];
    const empty = () => ({ off: Object.fromEntries(groups.map((g) => [g.key, new Set()])), cap: 0 });
    groups.forEach((g) => g.vals.forEach((v) => { const s = empty(); s.off[g.key].add(v); const r = run(s); if (r.n) out.push({ txt: `Skip ${g.name(v)}`, gain: r.net - BASE.net, apply: () => st.off[g.key].add(v) }); }));
    const maxDay = Math.max(...Object.values(ALL.reduce((a, t) => ((a[t[8]] = (a[t[8]] || 0) + 1), a), {})));
    [1, 2, 3].filter((c) => c < maxDay).forEach((c) => { const s = empty(); s.cap = c; const r = run(s); out.push({ txt: `Max ${c} trade${c > 1 ? 's' : ''} a day`, gain: r.net - BASE.net, apply: () => (st.cap = c) }); });
    return out.filter((x) => x.gain > 0.5).sort((a, b) => b.gain - a.gain).slice(0, 3);
  }

  const ctl = box.querySelector('.wi-ctl'), res = box.querySelector('.wi-res'), reset = box.querySelector('[data-wi-reset]');
  const IDEAS = ideas();
  ctl.innerHTML = (IDEAS.length ? `<div class="wi-g"><span class="wi-l">Biggest wins from one change</span><div class="wi-chips">${IDEAS.map((x, i) => `<button type="button" class="wi-idea" data-idea="${i}">${x.txt}<b>${fmtS(x.gain)}</b></button>`).join('')}</div></div>` : '') +
    groups.map((g) => `<div class="wi-g"><span class="wi-l">${g.label}</span><div class="wi-chips">${g.vals.map((v) => `<button type="button" class="wi-c" aria-pressed="true" data-g="${g.key}" data-v="${v}">${g.name(v)}</button>`).join('')}</div></div>`).join('') +
    `<div class="wi-g"><span class="wi-l">Trades a day</span><div class="wi-chips">${[0, 1, 2, 3].map((c) => `<button type="button" class="wi-c wi-cap" aria-pressed="${c ? 'false' : 'true'}" data-cap="${c}">${c ? 'Max ' + c : 'Any'}</button>`).join('')}</div></div>`;

  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.idea !== undefined) { IDEAS[b.dataset.idea].apply(); }
    else if (b.dataset.cap !== undefined) st.cap = Number(b.dataset.cap);
    else { const set = st.off[b.dataset.g], v = Number(b.dataset.v); if (set.has(v)) set.delete(v); else set.add(v); }
    draw();
  });
  reset.addEventListener('click', () => { groups.forEach((g) => st.off[g.key].clear()); st.cap = 0; draw(); });

  function chart(R) {
    const W = 600, H = 190, L = 6, Rr = 6, T = 14, B = 14;
    const pts = [...BASE.curve.map((p) => p[1]), ...R.curve.map((p) => p[1]), 0];
    const lo = Math.min(...pts), hi = Math.max(...pts), sp = hi - lo || 1;
    const t0 = ALL[0][1], t1 = ALL.at(-1)[1], ts = t1 - t0 || 1;
    const X = (t) => L + ((t - t0) / ts) * (W - L - Rr), Y = (v) => T + (1 - (v - lo) / sp) * (H - T - B);
    const path = (c) => (c.length ? `M${X(t0).toFixed(1)} ${Y(0).toFixed(1)} ` + c.map((p) => `L${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ') : '');
    const up = R.net >= BASE.net;
    return `<svg class="wi-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Equity curve, real and what-if">
      <line x1="${L}" x2="${W - Rr}" y1="${Y(0)}" y2="${Y(0)}" stroke="rgba(255,255,255,.08)" vector-effect="non-scaling-stroke"/>
      <path d="${path(BASE.curve)}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
      ${R.curve.length ? `<path d="${path(R.curve)} L${X(R.curve.at(-1)[0]).toFixed(1)} ${Y(0)} Z" fill="${up ? 'rgba(38,198,160,.10)' : 'rgba(240,70,75,.10)'}"/>
      <path d="${path(R.curve)}" fill="none" stroke="${up ? 'var(--ok)' : 'var(--danger)'}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>` : ''}
      <line class="wi-x" x1="0" x2="0" y1="${T - 6}" y2="${H}" stroke="rgba(255,255,255,.25)" vector-effect="non-scaling-stroke" hidden/>
    </svg><div class="wi-tip" hidden></div>`;
  }
  const at = (c, t) => { let v = 0; for (const p of c) { if (p[0] > t) break; v = p[1]; } return v; };

  function draw() {
    const R = run(st), diff = R.net - BASE.net, changed = groups.some((g) => st.off[g.key].size) || st.cap;
    reset.hidden = !changed;
    ctl.querySelectorAll('.wi-c[data-g]').forEach((b) => b.setAttribute('aria-pressed', String(!st.off[b.dataset.g].has(Number(b.dataset.v)))));
    ctl.querySelectorAll('.wi-cap').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.cap) === st.cap)));
    const pf = (v) => (v === Infinity ? '∞' : v.toFixed(2));
    const delta = (a, b, f, better) => { const d = a - b; if (!changed || Math.abs(d) < 1e-9) return ''; return `<small class="${(better ? d > 0 : d < 0) ? 'pos' : 'neg'}">${f(d)}</small>`; };
    res.innerHTML = `<div class="wi-hero"><span class="muted small">${changed ? 'Would have made' : 'You made'}</span>
        <b class="${R.net >= 0 ? 'pos' : 'neg'}">${fmt(R.net)}</b>
        <span class="wi-diff ${changed ? (diff >= 0 ? 'up' : 'down') : ''}">${changed ? `${fmtS(diff)} ${diff >= 0 ? 'better' : 'worse'} than real` : 'Switch something off to compare'}</span></div>
      <div class="wi-nums">
        <div><span>Trades</span><b>${R.n}</b>${delta(R.n, BASE.n, (d) => (d > 0 ? '+' : '−') + Math.abs(d), true).replace(/pos|neg/, 'muted')}</div>
        <div><span>Win rate</span><b>${R.win}%</b>${delta(R.win, BASE.win, (d) => (d > 0 ? '+' : '−') + Math.abs(d) + ' pts', true)}</div>
        <div><span>Profit factor</span><b>${pf(R.pf)}</b>${Number.isFinite(R.pf) && Number.isFinite(BASE.pf) ? delta(R.pf, BASE.pf, (d) => (d > 0 ? '+' : '−') + Math.abs(d).toFixed(2), true) : ''}</div>
        <div><span>Max drawdown</span><b>${fmtS(-R.dd).replace('+', '')}</b>${delta(R.dd, BASE.dd, (d) => (d > 0 ? '+' : '−') + fmtS(Math.abs(d)).slice(1), false)}</div>
      </div>
      <div class="wi-chart">${chart(R)}<div class="wi-key small muted"><span><i class="k1"></i>What if</span><span><i class="k2"></i>Real</span><span>Hover the curve to compare</span></div></div>`;
    // hover / touch: read both curves at that date
    const svg = res.querySelector('.wi-svg'), tip = res.querySelector('.wi-tip'), line = svg.querySelector('.wi-x');
    const t0 = ALL[0][1], t1 = ALL.at(-1)[1];
    const move = (cx) => {
      const r = svg.getBoundingClientRect(), f = Math.max(0, Math.min(1, (cx - r.left) / r.width)), t = t0 + f * (t1 - t0);
      line.setAttribute('x1', f * 600); line.setAttribute('x2', f * 600); line.hidden = false;
      const day = new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      tip.innerHTML = `<b>${day}</b><span><i class="k1"></i>${fmt(at(R.curve, t))}</span><span><i class="k2"></i>${fmt(at(BASE.curve, t))}</span>`;
      tip.hidden = false; tip.style.left = Math.min(r.width - 150, Math.max(0, f * r.width - 75)) + 'px';
    };
    svg.addEventListener('pointermove', (e) => move(e.clientX));
    svg.addEventListener('pointerdown', (e) => move(e.clientX));
    svg.addEventListener('pointerleave', () => { tip.hidden = true; line.hidden = true; });
  }
  draw();
})();
