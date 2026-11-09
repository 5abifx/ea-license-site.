// The Desk page HTML: forecast, today's rules, day map, next trade check, you vs your rules.
// Charts are inline SVG drawn here; public/terminal.js adds the live clock, the "now" line and the trade check.
const { esc } = require('./views');

const X0 = 96, X1 = 1180;                       // day map drawing area (viewBox 0 0 1200 236)
const xm = (min) => X0 + ((X1 - X0) * min) / 1440;

function gauge(score, level) {
  const len = 348.7, col = level === 'High' ? 'var(--danger)' : level === 'Medium' ? 'var(--warn)' : 'var(--ok)';
  return `<div class="tm-gauge"><svg viewBox="0 0 180 180" aria-hidden="true">
    <circle cx="90" cy="90" r="74" fill="none" stroke="var(--card-2)" stroke-width="14" stroke-dasharray="${len} 465" transform="rotate(135 90 90)" stroke-linecap="round"/>
    <circle class="tm-arc" cx="90" cy="90" r="74" fill="none" stroke="${col}" stroke-width="14" stroke-dasharray="${(len * score) / 100} 465" transform="rotate(135 90 90)" stroke-linecap="round"/></svg>
    <div class="tm-gc"><b>${score}</b><span>${level} risk of<br>a rule break</span></div></div>`;
}

function dayMap(T) {
  const lane = (y, label) => `<text x="0" y="${y + 19}" class="tm-lane">${label}</text>`;
  let s = `<svg class="tm-map" viewBox="0 0 1200 236" role="img" aria-label="Today in New York time: sessions, your history and your plan">`;
  s += lane(28, 'Market') + lane(88, 'Your history') + lane(148, 'Your plan') + lane(200, 'Today');
  for (let h = 0; h <= 24; h += 3) s += `<line x1="${xm(h * 60)}" x2="${xm(h * 60)}" y1="20" y2="226" class="tm-grid"/><text x="${xm(h * 60)}" y="12" class="tm-tick" text-anchor="middle">${String(h % 24).padStart(2, '0')}:00</text>`;
  const sess = [['Asia', 19 * 60, 1440], ['Asia', 0, 180], ['London', 180, 480], ['NY AM', 480, 720], ['NY PM', 720, 1020]];
  sess.forEach(([n, a, b]) => {
    s += `<rect x="${xm(a) + 1}" y="28" width="${xm(b) - xm(a) - 2}" height="28" rx="6" class="tm-sess"/>`;
    if (b - a >= 180) s += `<text x="${(xm(a) + xm(b)) / 2}" y="47" class="tm-sl" text-anchor="middle">${n}</text>`;
  });
  s += `<rect x="${xm(570) - 2}" y="24" width="4" height="36" rx="2" class="tm-open"/>`;
  T.halves.forEach((h) => {
    const a = Math.min(1, Math.abs(h.u) / T.maxAbs);
    s += `<rect x="${xm(h.from) + 1}" y="88" width="${xm(30) - xm(0) - 2}" height="28" rx="4" class="${h.n ? (h.u >= 0 ? 'tm-up' : 'tm-dn') : 'tm-none'}" style="opacity:${h.n ? (0.2 + a * 0.8).toFixed(2) : 1}"><title>${T.hhmm(h.from)} · ${h.n} trades · ${T.fmtU(h.u)}</title></rect>`;
  });
  T.avoid.forEach((m) => { s += `<rect x="${xm(m) + 1}" y="148" width="${xm(30) - xm(0) - 2}" height="28" rx="5" class="tm-block"><title>Red hour for you: no new trades</title></rect>`; });
  if (T.best) {
    const a = T.best.from, b = T.best.to > a ? T.best.to : 1440;
    s += `<rect x="${xm(a) + 1}" y="148" width="${xm(b) - xm(a) - 2}" height="28" rx="6" class="tm-win"/><text x="${xm(a) + 6}" y="166" class="tm-wl">Your window</text>`;
  }
  T.todayTrades.forEach((t) => { s += `<circle cx="${xm(t.min)}" cy="214" r="7" class="${t.net >= 0 ? 'tm-tu' : 'tm-td'}"><title>${esc(t.sym)} ${T.fmtU(t.u)}</title></circle>`; });
  s += `<g class="tm-now" data-x0="${X0}" data-x1="${X1}"><line y1="20" y2="228" x1="0" x2="0"/><text y="234" x="0" text-anchor="middle">now</text></g></svg>`;
  return s;
}

function ghost(G) {
  const c = G.curve; if (c.length < 2) return '<p class="muted small">Not enough trades in the last 30 days yet.</p>';
  const W = 1100, H = 240, l = 44, r = 1090, t = 14, b = 212;
  const vals = c.flatMap((p) => [p[0], p[1]]).concat(0);
  const mn = Math.min(...vals) - 0.5, mx = Math.max(...vals) + 0.5;
  const x = (i) => l + ((r - l) * i) / (c.length - 1), y = (v) => b - ((b - t) * (v - mn)) / (mx - mn);
  const path = (k) => c.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.ceil((mx - mn) / 5));
  let s = `<svg class="tm-ghost" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your last 30 trading days: actual against rules kept">`;
  for (let v = Math.ceil(mn); v <= mx; v += step) s += `<line x1="${l}" x2="${r}" y1="${y(v)}" y2="${y(v)}" class="tm-grid"/><text x="${l - 6}" y="${y(v) + 4}" class="tm-tick" text-anchor="end">${v > 0 ? '+' : ''}${v}R</text>`;
  s += `<line x1="${l}" x2="${r}" y1="${y(0)}" y2="${y(0)}" class="tm-zero"/>`;
  s += `<path d="${path(1)} L${r} ${y(mn)} L${l} ${y(mn)} Z" class="tm-gfill"/><path d="${path(1)}" class="tm-gr"/><path d="${path(0)}" class="tm-ga"/>`;
  c.forEach((p, i) => { if (p[2]) s += `<circle cx="${x(i)}" cy="${y(p[0])}" r="3.5" class="tm-gx"/>`; });
  s += `<text x="${l}" y="${H - 6}" class="tm-tick">${G.days} trading days ago</text><text x="${r}" y="${H - 6}" class="tm-tick" text-anchor="end">today</text></svg>`;
  return s;
}

function html(T, { money, cur, acctNote }) {
  if (T.locked) return `<section class="card"><p class="muted">The Desk starts after 10 closed trades. You have ${T.have}. Keep the Trade Journal EA running.</p></section>`;
  const data = JSON.stringify({ ...T.check, cur }).replace(/</g, '\\u003c');
  const drivers = T.drivers.length ? T.drivers.slice(0, 4).map((d) => `<div class="tm-drv ${d.tone}"><i></i><p><b>${esc(d.title)}</b> ${esc(d.text)}</p><em>${d.w > 0 ? '+' : ''}${d.w}</em></div>`).join('')
    : '<p class="muted small">Nothing in your history flags today. Trade your plan.</p>';
  const rules = T.rules.length ? T.rules.map((r) => `<div class="tm-rule"><div><h4>${esc(r.rule)}</h4><span class="muted small">${esc(r.tag)}${r.saved ? ` · cost you ${money(-r.saved).replace(/^[+]/, '')}` : ''}</span></div>
      <span class="tag" title="KATANA will be able to enforce this after its next update">Reminder</span></div>`).join('')
    : '<p class="muted small">No leaks found yet. Your rules show up here when Insights finds one.</p>';
  const G = T.ghost;
  return `
<div class="tm">
  <section class="card tm-fc">
    <div class="tm-h"><div><span class="tm-eb">Mistake forecast</span><h2>${T.level === 'High' ? 'Today looks like your bad days' : T.level === 'Medium' ? 'Today needs some care' : 'Today looks like your good days'}</h2></div><span class="muted small">${acctNote}</span></div>
    <div class="tm-fcb">${gauge(T.score, T.level)}<div class="tm-drvs">${drivers}</div></div>
  </section>
  <section class="card tm-rules">
    <div class="tm-h"><div><span class="tm-eb">Today's rules</span><h2>Written from your own leaks</h2></div></div>
    ${rules}
    <p class="muted small">Found by Insights in your trades. The next KATANA update can enforce them in MT5; for now they are your reminders.</p>
  </section>
  <section class="card tm-wide">
    <div class="tm-h"><div><span class="tm-eb">Your day, mapped</span><h2>Market, your history and your plan on one clock</h2></div>
      <div class="tm-leg"><span><i class="up"></i>you make money</span><span><i class="dn"></i>you lose money</span><span><i class="bl"></i>red hour: no new trades</span><span><i class="wn"></i>your window</span></div></div>
    <div class="tm-scroll">${dayMap(T)}</div>
    <p class="muted small">New York time. Read down a column: where your history is red, your plan blocks new trades; your window is where your best trades came from.</p>
  </section>
  <section class="card tm-wide">
    <div class="tm-h"><div><span class="tm-eb">Next trade check</span><h2>Before you click buy, ask your journal</h2></div></div>
    <div class="tm-ck" id="tm-ck"><noscript><p class="muted">Turn on JavaScript to use the trade check.</p></noscript></div>
    <script id="tm-data" type="application/json">${data}</script>
  </section>
  <section class="card tm-wide">
    <div class="tm-h"><div><span class="tm-eb">You vs your rules</span><h2>What following your own rules would have made</h2></div>
      <div class="tm-leg"><span><i class="ac"></i>you</span><span><i class="rl"></i>you, rules kept</span><span><i class="dn"></i>trade that broke a rule</span></div></div>
    <div class="tm-gw">${ghost(G)}
      <div class="tm-facts">
        <div><span>Left on the table</span><b class="${G.gap > 0 ? 'pos' : ''}">${T.fmtU(G.gap)}</b><small>last ${G.days} trading days</small></div>
        <div><span>Trades that broke a rule</span><b>${G.broke}</b><small>${T.fmtU(G.brokeU)} together</small></div>
        ${G.types[0] ? `<div><span>Costliest habit</span><b>${esc(G.types[0].name)}</b><small>${G.types[0].n} trades · ${T.fmtU(G.types[0].u)}</small></div>` : ''}
      </div></div>
    <p class="muted small">R where your trades have a stop, otherwise the trade's money against your average loss. Rules here: no trade within 15 min of a loss${T.check.cap ? `, max ${T.check.cap} a day` : ''}, none in your red hours.</p>
  </section>
</div>
<script src="/terminal.js"></script>`;
}

module.exports = { html };
