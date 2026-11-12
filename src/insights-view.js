// HTML for the Insights page and the short Insights strip on the journal page.
// All charts are inline SVG / HTML drawn on the server, colored from the site theme tokens.
const { esc } = require('./views');

const f0 = (v) => Math.round(v).toLocaleString('en-US');
const short = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.round(Math.abs(v))}`;
const tone = (v, good, ok) => (v >= good ? 'pos' : v >= ok ? 'mid' : 'neg');
const barColor = (v) => (v >= 70 ? 'var(--ok)' : v >= 45 ? 'var(--warn)' : 'var(--danger)');

function scoreCard(S) {
  return `<div class="card ins-score">
    <span class="ins-tag"><i></i>Edge score</span>
    <div class="score-num"><b class="${tone(S.total, 65, 45)}">${S.total}</b><span class="muted">/ 100 · ${esc(S.label)}</span></div>
    <div class="score-bars">${S.parts.map((p) => `<div class="sbar${p === S.weakest ? ' weak' : ''}"><span>${esc(p.name)}</span><span class="t"><i style="width:${p.v}%;background:${barColor(p.v)}"></i></span><span class="mono">${p.v}</span></div>`).join('')}</div>
    <p class="small muted">Weakest: <strong>${esc(S.weakest.name.toLowerCase())}</strong>. ${esc(S.weakest.tip)}</p>
  </div>`;
}

function byNumBars(byNum, money) {
  const mx = Math.max(1, ...byNum.map((b) => Math.abs(b.net)));
  return `<div class="tbars" role="img" aria-label="Net profit by trade number of the day">${byNum.map((b) => `<div>
    <span class="mono ${b.net >= 0 ? 'pos' : 'neg'}">${b.n ? short(b.net) : '-'}</span>
    <i style="height:${b.n ? Math.max(4, Math.round((Math.abs(b.net) / mx) * 80)) : 0}px;background:${b.net >= 0 ? 'var(--ok)' : 'var(--danger)'}"></i>
    <span class="muted">${b.label}</span><small class="muted">${b.n} trades</small></div>`).join('')}</div>`;
}

function focusCard(a, money) {
  const F = a.focus;
  if (!F) return `<div class="card ins-focus calm"><span class="kicker">This week's focus</span>
    <h3>No big leak found. Keep doing what you're doing.</h3>
    <p class="muted small">Your strengths are listed below. Keep your size and your rules the same.</p></div>`;
  const N = a.numbers;
  return `<div class="card ins-focus"><span class="kicker">This week's focus</span>
    <h3>${esc(F.title || F.tag)}</h3>
    <p class="small">${F.html}</p>
    ${F.chart === 'byNum' ? byNumBars(a.byNum, money) : ''}
    <div class="rule"><p><b>Rule to try:</b> ${esc(F.rule)}${F.saved > 0 ? ` Without this leak, these trades would have made <b>${money(N.net + F.saved)}</b> instead of <b>${money(N.net)}</b>.` : ''}</p></div>
  </div>`;
}

function numsRow(N, money, cur) {
  const pf = N.pf === null ? '-' : N.pf === Infinity ? '∞' : N.pf.toFixed(2);
  const rc = N.recovery === Infinity ? '∞' : N.recovery.toFixed(1);
  return `<div class="ins-nums">
    <div><span>Profit factor</span><strong class="${N.pf === null ? '' : tone(N.pf, 1.8, 1.2)}">${pf}</strong><small>Aim for 1.8 or more</small></div>
    <div><span>Expectancy</span><strong class="${N.expMoney >= 0 ? 'pos' : 'neg'}">${money(N.expMoney)}</strong><small>${N.expR === null ? 'per trade' : `${N.expR >= 0 ? '+' : '−'}${Math.abs(N.expR).toFixed(2)}R per trade`}</small></div>
    <div><span>Avg win / loss</span><strong>${f0(N.avgW)} / ${f0(N.avgL)}</strong><small>${N.ratio === null ? '-' : `Ratio ${N.ratio.toFixed(2)}`}${cur ? ' · ' + esc(cur) : ''}</small></div>
    <div><span>Max drawdown</span><strong class="neg">${N.maxDDPct !== null ? `−${N.maxDDPct.toFixed(1)}%` : money(-N.maxDD)}</strong><small>Recovered ${rc}×</small></div>
    <div><span>Best day share</span><strong class="${N.bestShare === null ? '' : N.bestShare > 40 ? 'neg' : N.bestShare > 30 ? 'mid' : 'pos'}">${N.bestShare === null ? '-' : Math.round(N.bestShare) + '%'}</strong><small>of total profit</small></div>
    <div><span>Win rate</span><strong>${Math.round(N.winRate * 100)}%</strong><small>${N.breakEvenWin === null ? '' : `Need ${Math.round(N.breakEvenWin * 100)}% to break even`}</small></div>
  </div>`;
}

const itemCard = (i) => `<div class="ins ${i.tone}" id="leak-${esc(i.kind || '')}"><span class="ins-tag"><i></i>${esc(i.tag)}</span><p>${i.html}</p>${i.fix ? `<div class="fix">${i.fix}</div>` : ''}</div>`;

// ---------- charts ----------
function equityChart(eq, money) {
  if (eq.length < 2) return '';
  const W = 600, H = 170, DH = 50, L = 46, R = 8, T = 10;
  const vals = eq.map((p) => p.eq);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const x = (i) => L + (i / (eq.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / span) * (H - T - 20);
  const mdd = Math.max(1, ...eq.map((p) => p.dd));
  const G = 22;                                    // gap between the equity and drawdown panels
  const yd = (v) => H + G + (v / mdd) * DH;
  const line = eq.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.eq).toFixed(1)}`).join(' ');
  const dd = eq.map((p, i) => `L${x(i).toFixed(1)} ${yd(p.dd).toFixed(1)}`).join(' ');
  const last = eq[eq.length - 1];
  const up = last.eq >= 0;
  return `<svg viewBox="0 0 ${W} ${H + G + DH + 8}" role="img" aria-label="Equity curve ending at ${esc(money(last.eq))}, with drawdown below">
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
    <line x1="${L}" x2="${W - R}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line)" stroke-dasharray="3 4"/>
    ${y(0) - y(hi) > 14 ? `<text x="${L - 6}" y="${y(hi) + 4}" text-anchor="end">${short(hi)}</text>` : ''}
    <text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
    ${lo < 0 && y(lo) - y(0) > 14 ? `<text x="${L - 6}" y="${y(lo) + 4}" text-anchor="end">${short(lo)}</text>` : ''}
    <path d="${line} L${x(eq.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z" fill="${up ? 'rgba(38,198,160,.12)' : 'rgba(240,70,75,.12)'}"/>
    <path d="${line}" fill="none" stroke="${up ? 'var(--ok)' : 'var(--danger)'}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${x(eq.length - 1)}" cy="${y(last.eq)}" r="4" fill="${up ? 'var(--ok)' : 'var(--danger)'}"/>
    <path d="M${L} ${H + G} ${dd} L${W - R} ${H + G} Z" fill="rgba(240,70,75,.25)"/>
    <line x1="${L}" x2="${W - R}" y1="${H + G}" y2="${H + G}" stroke="var(--line)"/>
    <text x="${L - 6}" y="${H + G + 4}" text-anchor="end">DD</text>
    <text x="${L - 6}" y="${H + G + DH + 4}" text-anchor="end">${short(-mdd)}</text>
  </svg>`;
}

function heatmap(heat) {
  const mx = Math.max(1, ...heat.flatMap((r) => r.cells.map((c) => Math.abs(c.net))));
  const bg = (c) => (!c.n ? 'var(--card-2)' : c.net >= 0 ? `rgba(38,198,160,${(0.12 + 0.5 * c.net / mx).toFixed(2)})` : `rgba(240,70,75,${(0.12 + 0.5 * -c.net / mx).toFixed(2)})`);
  return `<div class="heat" role="table" aria-label="Net profit by session and weekday">
    <span></span>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => `<span>${d}</span>`).join('')}
    ${heat.map((r) => `<span>${esc(r.name)}</span>${r.cells.map((c) => `<b style="background:${bg(c)}" title="${c.n} trades">${c.n ? short(c.net) : '·'}</b>`).join('')}`).join('')}
  </div>`;
}

function histogram(hist) {
  const W = 600, H = 170, mx = Math.max(1, ...hist.map((h) => h.n)), bw = (W - 20) / hist.length;
  return `<svg viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="How many trades ended at each R multiple">
    <line x1="10" x2="${W - 10}" y1="${H}" y2="${H}" stroke="var(--line)"/>
    ${hist.map((h, i) => { const bh = (h.n / mx) * (H - 24); const x = 10 + i * bw + 6; return `
      <rect x="${x}" y="${H - bh}" width="${bw - 12}" height="${bh}" rx="3" fill="${h.pos ? 'var(--ok)' : 'var(--danger)'}"/>
      ${h.n ? `<text x="${x + (bw - 12) / 2}" y="${H - bh - 5}" text-anchor="middle">${h.n}</text>` : ''}
      <text x="${x + (bw - 12) / 2}" y="${H + 16}" text-anchor="middle">${h.label}</text>`; }).join('')}
  </svg>`;
}

function edgeMap(e) {
  const W = 600, H = 200, L = 40, B = 24, T = 8, R = 10;
  const x = (r) => L + ((Math.min(Math.max(r, 0.25), 3.25) - 0.25) / 3) * (W - L - R);
  const y = (w) => T + (1 - (Math.min(Math.max(w, 0.1), 0.8) - 0.1) / 0.7) * (H - T - B);
  const pts = []; for (let r = 0.25; r <= 3.2501; r += 0.05) pts.push([x(r), y(1 / (1 + r))]);
  const curve = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const above = e.win >= 1 / (1 + e.ratio);
  const dx = x(e.ratio), dy = y(e.win);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Win rate ${Math.round(e.win * 100)}% and win to loss ratio ${e.ratio.toFixed(2)}, ${above ? 'above' : 'below'} the break-even line">
    <path d="${curve} L${W - R} ${T} L${pts[0][0]} ${T} Z" fill="rgba(38,198,160,.07)"/>
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--line)"/>
    <path d="${curve}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4"/>
    ${[0.2, 0.4, 0.6, 0.8].map((w) => `<text x="${L - 6}" y="${y(w) + 4}" text-anchor="end">${w * 100}%</text>`).join('')}
    ${[0.5, 1, 1.5, 2, 2.5, 3].map((r) => `<text x="${x(r)}" y="${H - 6}" text-anchor="middle">${r}</text>`).join('')}
    <text x="${W - R - 4}" y="${T + 14}" text-anchor="end">profitable</text>
    <text x="${x(2.6)}" y="${y(1 / 3.6) + 16}" text-anchor="middle">break-even line</text>
    <circle cx="${dx}" cy="${dy}" r="7" fill="var(--accent)"/>
    <text x="${dx + (dx > W - 160 ? -12 : 12)}" y="${dy - 10}" text-anchor="${dx > W - 160 ? 'end' : 'start'}" class="you">You: ${Math.round(e.win * 100)}% · ${e.ratio.toFixed(2)}</text>
  </svg>`;
}

function chartsHtml(a, money) {
  const C = a.charts, N = a.numbers;
  const cards = [];
  cards.push(`<div class="card ins-chart"><h3>Equity and drawdown</h3>${equityChart(C.equity, money)}
    <p class="small muted">Worst drop: ${N.maxDDPct !== null ? `−${N.maxDDPct.toFixed(1)}% (${money(-N.maxDD)})` : money(-N.maxDD)}.</p></div>`);
  const hot = C.heat.flatMap((r) => r.cells.map((c, i) => ({ ...c, s: r.name, d: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][i] }))).filter((c) => c.n >= 2).sort((p, q) => p.net - q.net);
  cards.push(`<div class="card ins-chart"><h3>Profit by session and day</h3>${heatmap(C.heat)}
    <p class="small muted">${hot[0] && hot[0].net < 0 ? `Reddest spot: ${esc(hot[0].s)} on ${hot[0].d}, ${money(hot[0].net)}.` : 'No red zone with 2 or more trades yet.'} Sessions use broker time.</p></div>`);
  cards.push(`<div class="card ins-chart"><h3>Profit by trade number of the day</h3>${byNumBars(a.byNum, money)}
    <p class="small muted">If the bars turn red after the 2nd or 3rd trade, that is your daily trade limit.</p></div>`);
  if (C.hist) {
    const wins = C.hist.filter((h) => h.pos), small = wins.slice(0, 2).reduce((s, h) => s + h.n, 0), allW = wins.reduce((s, h) => s + h.n, 0);
    cards.push(`<div class="card ins-chart"><h3>Where your trades end, in R</h3>${histogram(C.hist)}
      <p class="small muted">${allW ? `${Math.round((small / allW) * 100)}% of your winners close at 1R or less.` : 'No winners with a stop yet.'}</p></div>`);
  }
  if (C.edge) cards.push(`<div class="card ins-chart"><h3>Edge map: win rate vs win size</h3>${edgeMap(C.edge)}
    <p class="small muted">${C.edge.win >= 1 / (1 + C.edge.ratio) ? 'You are above the break-even line.' : 'You are below the break-even line.'} Moving right means bigger winners, moving up means more winners.</p></div>`);
  return `<div class="ins-charts">${cards.join('')}</div>`;
}

function propHtml(P, acct, limits) {
  const v = (x) => (x ? String(x) : '');
  const form = `<form method="post" action="/journal/insights/limits" class="prop-form">
    <input type="hidden" name="account" value="${esc(acct)}">
    <label>Daily loss limit %<input name="daily" inputmode="decimal" value="${v(limits.daily)}" placeholder="e.g. 5"></label>
    <label>Max loss %<input name="max" inputmode="decimal" value="${v(limits.max)}" placeholder="e.g. 10"></label>
    <label>Profit target %<input name="target" inputmode="decimal" value="${v(limits.target)}" placeholder="e.g. 8"></label>
    <label>Start balance<input name="start" inputmode="decimal" value="${v(limits.start)}" placeholder="from the first trade"></label>
    <div><button class="small">Save limits</button></div>
  </form>`;
  let body = '<p class="muted small">Type your prop firm\'s rules for this account. The journal then shows how close you came to each limit.</p>';
  if (P && P.error) body = `<p class="muted small">${esc(P.error)}</p>`;
  else if (P) body = `<div class="prop-rows">${P.rows.map((r) => {
    const w = Math.round(Math.min(1, r.used) * 100);
    const col = r.good ? 'var(--ok)' : r.used >= 0.9 ? 'var(--danger)' : r.used >= 0.7 ? 'var(--warn)' : 'var(--ok)';
    return `<div class="prop-row"><div class="row between"><b>${esc(r.name)}</b><span class="mono small">${r.good ? `${w}% done` : `${Math.round(r.used * 100)}% used`}</span></div>
      <span class="t"><i style="width:${w}%;background:${col}"></i></span><p class="small">${r.html}</p></div>`;
  }).join('')}</div>
    <div class="fix">${esc(P.fix)}</div>`;
  return `<section class="card prop${P && P.danger ? ' danger' : ''}"><div class="row between"><h2>Prop firm guard</h2><span class="muted small">All trades of this account</span></div>
    ${body}<details${P ? '' : ' open'}><summary class="small">Account limits</summary>${form}</details></section>`;
}

// full page body (between the page head and the footer)
function fullHtml(a, { money, cur, prop, whatif = '' }) {
  if (a.locked) return `<section class="card"><p class="muted">Insights unlock after ${a.need} closed trades. ${a.have} so far.</p></section>${prop || ''}`;
  const bad = a.items.filter((i) => i.tone !== 'good'), good = a.items.filter((i) => i.tone === 'good');
  return `<div class="ins-top">${scoreCard(a.score)}${focusCard(a, money)}</div>
    ${numsRow(a.numbers, money, cur)}
    ${whatif}
    <section class="card"><div class="row between"><h2>Leaks to fix</h2><span class="muted small">Biggest cost first</span></div>
      ${bad.length ? `<div class="ins-grid">${bad.map(itemCard).join('')}</div>` : '<p class="muted">No leaks found in this period. Nice.</p>'}</section>
    ${good.length ? `<section class="card"><h2>What works</h2><div class="ins-grid">${good.map(itemCard).join('')}</div></section>` : ''}
    ${prop || ''}
    ${chartsHtml(a, money)}
    <p class="small muted">Plain rules on your own trades, nothing is sent anywhere. Exit, stop and R insights need trades with a stop-loss. Mistake and emotion insights use the notes you write on each trade.</p>`;
}

// short strip for the journal page
function stripHtml(a, { money, href, count }) {
  if (a.locked) return `<p class="muted">Insights unlock after ${a.need} closed trades. ${a.have} so far.</p>`;
  const top = a.items.filter((i) => i.tone !== 'good').slice(0, 3);
  const items = top.length ? top : a.items.slice(0, 3);
  return `<div class="ins-strip">
      <div class="strip-score"><b class="${tone(a.score.total, 65, 45)}">${a.score.total}</b><span>Edge score<br><small class="muted">${esc(a.score.label)}</small></span></div>
      <div class="strip-focus"><span class="kicker">This week's focus</span><p>${a.focus ? `<strong>${esc(a.focus.title || a.focus.tag)}</strong> Rule to try: ${esc(a.focus.rule)}` : 'No big leak found. Keep your rules the same.'}</p></div>
    </div>
    ${items.length ? `<div class="ins-grid">${items.map(itemCard).join('')}</div>` : ''}
    <p class="ins-more"><a class="btn small secondary" href="${href}">All insights and charts ›</a></p>`;
}

module.exports = { fullHtml, stripHtml, propHtml };
