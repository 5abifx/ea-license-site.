// The Desk page HTML: a terminal-style screen. Ticker strip, day map (with news), forecast, rules, news catalysts,
// next trade check and you vs your rules. Charts are inline SVG drawn here; public/terminal.js adds the live parts
// (clock, session, countdowns, the news panel and the trade check).
const { esc } = require('./views');

const X0 = 96, X1 = 1180;                       // day map drawing area (viewBox 0 0 1200 236)
const xm = (min) => X0 + ((X1 - X0) * min) / 1440;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function gauge(score, level) {
  const len = 348.7, col = level === 'High' ? 'var(--danger)' : level === 'Medium' ? 'var(--warn)' : 'var(--ok)';
  const ticks = Array.from({ length: 21 }, (_, i) => {
    const a = ((135 + i * 13.5) * Math.PI) / 180, r1 = 86, r2 = i % 5 ? 82 : 78;
    return `<line x1="${(90 + r1 * Math.cos(a)).toFixed(1)}" y1="${(90 + r1 * Math.sin(a)).toFixed(1)}" x2="${(90 + r2 * Math.cos(a)).toFixed(1)}" y2="${(90 + r2 * Math.sin(a)).toFixed(1)}" class="tm-gt"/>`;
  }).join('');
  return `<div class="tm-gauge"><svg viewBox="0 0 180 180" aria-hidden="true">${ticks}
    <circle cx="90" cy="90" r="68" fill="none" stroke="var(--card-2)" stroke-width="12" stroke-dasharray="${(len * 68) / 74} 465" transform="rotate(135 90 90)" stroke-linecap="round"/>
    <circle class="tm-arc" cx="90" cy="90" r="68" fill="none" stroke="${col}" stroke-width="12" stroke-dasharray="${((len * 68) / 74) * score / 100} 465" transform="rotate(135 90 90)" stroke-linecap="round"/></svg>
    <div class="tm-gc"><b>${score}</b><span class="tm-lvl ${level}">${level} risk</span></div></div>`;
}

// ---------- ticker strip ----------
function kpis(T, N, money) {
  const tile = (k, label, body, cls = '') => `<div class="tm-k ${cls}" data-k="${k}"><span class="tm-kl">${label}</span>${body}</div>`;
  const u = T.today.u, usual = Math.max(1, Math.round(T.usualTrades));
  const dots = Array.from({ length: Math.max(usual, T.today.n) }, (_, i) => {
    const v = T.today.list[i];
    return `<i class="${v === undefined ? '' : v >= 0 ? 'up' : 'dn'}${i >= usual ? ' over' : ''}"></i>`;
  }).join('');
  const segs = ['Low', 'Medium', 'High'].map((l) => `<i class="${l === T.level ? 'on ' + l : ''}"></i>`).join('');
  const d = T.daily, used = d ? clamp(d.used / d.allow, 0, 1) : 0;
  const fut = N && N.has ? N.events.filter((e) => e.t > Date.now()) : [];
  const nx = fut.find((e) => e.imp === 3) || fut[0] || null;
  const G = T.ghost, sp = G.curve.length > 1 ? spark(G.curve.map((p) => p[1] - p[0])) : '';
  return `<div class="tm-kpis">
    ${tile('sess', 'Session · NY', `<b class="tm-kv" id="tm-sess">${esc(T.sessNow)}</b><div class="tm-bar"><i id="tm-sessbar" style="width:0%"></i></div><small id="tm-sessnext">&nbsp;</small>`)}
    ${tile('today', 'Today', `<b class="tm-kv ${u > 0 ? 'pos' : u < 0 ? 'neg' : ''}">${T.fmtU(u)}</b>${usual <= 12 && T.today.n <= 16
      ? `<div class="tm-dots" title="${T.today.n} trades today, you usually take ${usual}">${dots}</div>`
      : `<div class="tm-bar tm-count${T.today.n > usual ? ' warn' : ''}" title="${T.today.n} trades today, you usually take ${usual}"><i style="width:${Math.min(100, (T.today.n / Math.max(usual, T.today.n)) * 100).toFixed(0)}%"></i><b style="left:${Math.min(100, (usual / Math.max(usual, T.today.n)) * 100).toFixed(0)}%"></b></div>`}<small>${T.today.n} of usual ${usual} trades${T.today.n ? ` · ${T.today.list.filter((v) => v >= 0).length} won` : ''}</small>`)}
    ${tile('risk', 'Mistake risk', `<b class="tm-kv">${T.score}<em>/100</em></b><div class="tm-segs">${segs}</div><small>${T.level} today</small>`)}
    ${tile('room', 'Daily loss used', d ? `<b class="tm-kv ${used >= 0.8 ? 'neg' : ''}">${Math.round(used * 100)}%</b><div class="tm-bar ${used >= 0.8 ? 'bad' : used >= 0.5 ? 'warn' : ''}"><i style="width:${(used * 100).toFixed(0)}%"></i></div><small>${money(d.left).replace(/^[+−]/, '')} left today</small>`
      : `<b class="tm-kv muted">--</b><div class="tm-bar"><i style="width:0"></i></div><small>Add firm rules in Insights</small>`)}
    ${tile('news', 'Next news', nx ? `<b class="tm-kv" data-cd="${nx.t}">--</b><div class="tm-imp i${nx.imp}"><i></i><i></i><i></i><span>${esc(nx.cur)} ${esc(nx.name)}</span></div><small>${nx.move !== null ? `gold moves ±$${nx.move.toFixed(1)}` : `${T.hhmm(nx.nyMin)} NY`}</small>`
      : `<b class="tm-kv muted">--</b><div class="tm-imp"><i></i><i></i><i></i><span>${N && N.has ? 'Quiet for your symbols' : 'Waiting for news'}</span></div><small>${N && N.has ? 'next 7 days' : 'Journal EA 1.30 sends it'}</small>`)}
    ${tile('gap', 'Rules would add', `<b class="tm-kv ${G.gap > 0 ? 'pos' : ''}">${T.fmtU(G.gap)}</b>${sp}<small>last ${G.days} trading days</small>`)}
  </div>`;
}

function spark(vals) {
  const mn = Math.min(0, ...vals), mx = Math.max(0.1, ...vals), W = 120, H = 22;
  const pts = vals.map((v, i) => `${((W * i) / (vals.length - 1)).toFixed(1)},${(H - ((H - 2) * (v - mn)) / (mx - mn) - 1).toFixed(1)}`).join(' ');
  return `<svg class="tm-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}

// ---------- day map ----------
function dayMap(T, N) {
  const lane = (y, label) => `<text x="0" y="${y + 19}" class="tm-lane">${label}</text>`;
  let s = `<svg class="tm-map" viewBox="0 0 1200 236" role="img" aria-label="Today in New York time: sessions, news, your history and your plan">`;
  s += lane(28, 'Market') + lane(88, 'Your history') + lane(148, 'Your plan') + lane(200, 'Today');
  for (let h = 0; h <= 24; h += 3) s += `<line x1="${xm(h * 60)}" x2="${xm(h * 60)}" y1="20" y2="226" class="tm-grid"/><text x="${xm(h * 60)}" y="12" class="tm-tick" text-anchor="middle">${String(h % 24).padStart(2, '0')}:00</text>`;
  const sess = [['Asia', 19 * 60, 1440], ['Asia', 0, 180], ['London', 180, 480], ['NY AM', 480, 720], ['NY PM', 720, 1020]];
  sess.forEach(([n, a, b]) => {
    s += `<rect x="${xm(a) + 1}" y="28" width="${xm(b) - xm(a) - 2}" height="28" rx="6" class="tm-sess"/>`;
    if (b - a >= 180) s += `<text x="${(xm(a) + xm(b)) / 2}" y="47" class="tm-sl" text-anchor="middle">${n}</text>`;
  });
  s += `<rect x="${xm(570) - 2}" y="24" width="4" height="36" rx="2" class="tm-open"><title>09:30 cash open</title></rect>`;
  if (N && N.has) N.events.filter((e) => e.day === 0).forEach((e) => {
    const x = xm(e.nyMin);
    s += `<g class="tm-nm i${e.imp}"><line x1="${x}" x2="${x}" y1="60" y2="226"/><path d="M${x} 58 l6 -8 l-6 -8 l-6 8z"/><title>${T.hhmm(e.nyMin)} ${esc(e.cur)} ${esc(e.name)}</title></g>`;
  });
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

// ---------- you vs your rules ----------
function ghost(G) {
  const c = G.curve; if (c.length < 2) return '<p class="muted small">Not enough trades in the last 30 days yet.</p>';
  const W = 440, H = 210, l = 38, r = 432, t = 10, b = 186;
  const vals = c.flatMap((p) => [p[0], p[1]]).concat(0);
  const mn = Math.min(...vals) - 0.5, mx = Math.max(...vals) + 0.5;
  const x = (i) => l + ((r - l) * i) / (c.length - 1), y = (v) => b - ((b - t) * (v - mn)) / (mx - mn);
  const path = (k) => c.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.ceil((mx - mn) / 4));
  let s = `<svg class="tm-ghost" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your last 30 trading days: actual against rules kept">`;
  for (let v = Math.ceil(mn); v <= mx; v += step) s += `<line x1="${l}" x2="${r}" y1="${y(v)}" y2="${y(v)}" class="tm-grid"/><text x="${l - 6}" y="${y(v) + 4}" class="tm-tick" text-anchor="end">${v > 0 ? '+' : ''}${v}R</text>`;
  s += `<line x1="${l}" x2="${r}" y1="${y(0)}" y2="${y(0)}" class="tm-zero"/>`;
  // shaded gap between the two lines
  const gap = c.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ') + ' ' + [...c].map((p, i) => [p, i]).reverse().map(([p, i]) => `L${x(i).toFixed(1)} ${y(p[0]).toFixed(1)}`).join(' ') + ' Z';
  s += `<path d="${gap}" class="tm-gfill"/><path d="${path(1)}" class="tm-gr"/><path d="${path(0)}" class="tm-ga"/>`;
  c.forEach((p, i) => { if (p[2]) s += `<circle cx="${x(i)}" cy="${y(p[0])}" r="3" class="tm-gx"/>`; });
  const ex = x(c.length - 1);
  s += `<text x="${ex - 4}" y="${y(c[c.length - 1][1]) - 8}" class="tm-gl r" text-anchor="end">rules kept</text><text x="${ex - 4}" y="${y(c[c.length - 1][0]) + 16}" class="tm-gl" text-anchor="end">you</text>`;
  s += `<text x="${l}" y="${H - 4}" class="tm-tick">${G.days} trading days ago</text><text x="${r}" y="${H - 4}" class="tm-tick" text-anchor="end">today</text></svg>`;
  return s;
}

function recent(T) {
  const d = T.recentDays || []; if (d.length < 3) return '';
  const mx = Math.max(0.5, ...d.map((x) => Math.abs(x[1])));
  const W = 420, H = 56, bw = W / d.length;
  const bars = d.map(([day, u, n], i) => { const h = Math.max(2, (Math.abs(u) / mx) * 24); return `<rect x="${(i * bw + bw * 0.18).toFixed(1)}" y="${u >= 0 ? 28 - h : 28}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="${u >= 0 ? 'tm-up' : 'tm-dn'}"><title>${day} · ${n} trades · ${T.fmtU(u)}</title></rect>`; }).join('');
  return `<div class="tm-rd"><span class="tp-l">Your last ${d.length} trading days</span><svg viewBox="0 0 ${W} ${H}" class="tm-rdb" role="img" aria-label="Result of your recent days"><line x1="0" x2="${W}" y1="28" y2="28" class="tm-zero"/>${bars}</svg></div>`;
}

const panel = (cls, label, title, body, right = '') => `<section class="card tp ${cls}"><div class="tp-h"><span class="tp-l">${label}</span>${right}</div>${title ? `<h2 class="tp-t">${title}</h2>` : ''}${body}</section>`;

function html(T, { news: N, money, cur, acctNote, market }) {
  if (T.locked) {
    const pct = Math.round((T.have / T.need) * 100);
    return `<section class="card tp tm-lock"><span class="tp-l">Desk locked</span><b class="tm-kv">${T.have}<em>/${T.need}</em></b>
      <div class="tm-bar"><i style="width:${pct}%"></i></div><p class="muted">The Desk starts after 10 closed trades. You have ${T.have}. Keep the Trade Journal EA running.</p></section>`;
  }
  const newsData = N && N.has ? N.events : [];
  const data = JSON.stringify({ ...T.check, cur, news: newsData.filter((e) => e.day === 0).map((e) => [e.nyMin, e.imp, e.cur + ' ' + e.name]) }).replace(/</g, '\\u003c');
  const ndata = JSON.stringify({ events: newsData, has: !!(N && N.has), curs: N ? N.curs || [] : [] }).replace(/</g, '\\u003c');
  const maxW = Math.max(1, ...T.drivers.map((d) => Math.abs(d.w)));
  const drivers = T.drivers.length ? T.drivers.slice(0, 5).map((d) => `<div class="tm-drv ${d.tone}" title="${esc(d.text)}">
      <div class="tm-dt"><b>${esc(d.title.replace(/\.$/, ''))}</b><span>${esc(d.stat)}</span></div>
      <div class="tm-dw"><i style="width:${Math.round((Math.abs(d.w) / maxW) * 100)}%"></i></div><em>${d.w > 0 ? '+' : ''}${d.w}</em></div>`).join('')
    : '<div class="tm-empty"><i class="ok"></i>Nothing in your history flags today.</div>';
  const maxCost = Math.max(1, ...T.rules.map((r) => Math.abs(r.saved)));
  const rules = T.rules.length ? T.rules.map((r, i) => `<div class="tm-rule" title="Found by Insights. The next KATANA update can enforce it in MT5.">
      <span class="tm-rn">${String(i + 1).padStart(2, '0')}</span>
      <div class="tm-rb"><b>${esc(r.rule)}</b><div class="tm-cost"><i style="width:${Math.round((Math.abs(r.saved) / maxCost) * 100)}%"></i></div></div>
      <div class="tm-rc"><span class="neg">${r.saved ? money(-r.saved).replace(/^[+]/, '') : '-'}</span><small>${esc(r.tag)}</small></div></div>`).join('')
    : '<div class="tm-empty"><i class="ok"></i>No leaks found yet.</div>';
  const G = T.ghost;
  const leg = (items) => `<div class="tm-leg">${items.map(([c, t]) => `<span><i class="${c}"></i>${t}</span>`).join('')}</div>`;
  return `
<div class="tm">
  ${kpis(T, N, money)}
  ${panel('tm-wide', '<span class="tm-live"></span>Your day · New York time', '', `<div class="tm-scroll">${dayMap(T, N)}</div>`,
    leg([['up', 'you win'], ['dn', 'you lose'], ['bl', 'red hour'], ['wn', 'your window'], ['nw', 'news']]))}
  ${marketPanel(market || [])}
  ${panel('tm-fc', 'Mistake forecast', T.level === 'High' ? 'Today looks like your bad days' : T.level === 'Medium' ? 'Today needs some care' : 'Today looks like your good days',
    `<div class="tm-fcb">${gauge(T.score, T.level)}<div class="tm-drvs">${drivers}</div></div>${recent(T)}`, `<span class="tp-r">${esc(acctNote)}</span>`)}
  ${panel('tm-rules', "Today's rules", 'From your own leaks', `<div class="tm-rl">${rules}</div>`, '<span class="tp-r" title="KATANA can enforce these after its next update">reminders</span>')}
  ${panel('tm-wide tm-news', 'News catalysts', '', `<div id="tm-news"></div><script id="tm-ndata" type="application/json">${ndata}</script>`,
    `<div class="seg tm-days" id="tm-days"><button type="button" data-d="0" aria-pressed="true">Today</button><button type="button" data-d="1" aria-pressed="false">Tomorrow</button><button type="button" data-d="w" aria-pressed="false">This week</button></div>`)}
  ${panel('tm-ckp', 'Next trade check', '', `<div class="tm-ck" id="tm-ck"><noscript><p class="muted">Turn on JavaScript to use the trade check.</p></noscript></div>
    <script id="tm-data" type="application/json">${data}</script>`)}
  ${panel('tm-gh', 'You vs your rules', '', `${ghost(G)}
    <div class="tm-facts">
      <div><span>Left on table</span><b class="${G.gap > 0 ? 'pos' : ''}">${T.fmtU(G.gap)}</b></div>
      <div><span>Broke a rule</span><b>${G.broke}</b><small>${T.fmtU(G.brokeU)}</small></div>
      ${G.types[0] ? `<div><span>Costliest habit</span><b class="sm">${esc(G.types[0].name)}</b><small>${G.types[0].n} · ${T.fmtU(G.types[0].u)}</small></div>` : ''}
    </div>`, `<span class="tp-r" title="R where your trades have a stop, otherwise the trade's money against your average loss. Rules: no trade within 15 min of a loss${T.check.cap ? `, max ${T.check.cap} a day` : ''}, none in your red hours.">last ${G.days} days ⓘ</span>`)}
</div>
<script src="/terminal.js"></script>`;
}

// MT5 symbol -> TradingView symbol for the free live chart widget (broker suffixes like .sc, .m, -pro, # are dropped)
const TV_MAP = { XAUUSD: 'OANDA:XAUUSD', GOLD: 'OANDA:XAUUSD', XAGUSD: 'OANDA:XAGUSD', SILVER: 'OANDA:XAGUSD',
  US30: 'OANDA:US30USD', DJ30: 'OANDA:US30USD', WS30: 'OANDA:US30USD', NAS100: 'OANDA:NAS100USD', US100: 'OANDA:NAS100USD', USTEC: 'OANDA:NAS100USD', NDX100: 'OANDA:NAS100USD',
  SPX500: 'OANDA:SPX500USD', US500: 'OANDA:SPX500USD', SP500: 'OANDA:SPX500USD', GER40: 'OANDA:DE30EUR', DE40: 'OANDA:DE30EUR', GER30: 'OANDA:DE30EUR', UK100: 'OANDA:UK100GBP',
  JP225: 'OANDA:JP225USD', USOIL: 'TVC:USOIL', WTI: 'TVC:USOIL', XTIUSD: 'TVC:USOIL', UKOIL: 'TVC:UKOIL', BRENT: 'TVC:UKOIL', XBRUSD: 'TVC:UKOIL',
  BTCUSD: 'BITSTAMP:BTCUSD', ETHUSD: 'BITSTAMP:ETHUSD', DXY: 'TVC:DXY', USDX: 'TVC:DXY' };
function tvSymbol(sym) {
  const s = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim().split(' ')[0];
  if (TV_MAP[s]) return TV_MAP[s];
  for (const k of Object.keys(TV_MAP)) if (s.startsWith(k)) return TV_MAP[k];
  if (/^[A-Z]{6}/.test(s)) return 'FX:' + s.slice(0, 6);
  return '';
}

// live chart of the trader's most traded instruments: TradingView's free Advanced Chart widget (live prices, no cost)
function marketPanel(syms) {
  const list = syms.map((x) => ({ ...x, tv: tvSymbol(x.sym) })).filter((x) => x.tv).filter((x, i, l) => l.findIndex((y) => y.tv === x.tv) === i).slice(0, 4);
  if (!list.length) return '';
  const chips = list.map((x, i) => `<button type="button" data-tv="${esc(x.tv)}" aria-pressed="${i === 0}">${esc(x.sym)}<small>${x.n} trades</small></button>`).join('');
  return `<section class="card tp tm-wide tm-mkt">
    <div class="tp-h"><span class="tp-l">Live market · your most traded</span><span class="seg tm-mkts" id="tm-mkts">${chips}</span></div>
    <div class="tm-tv" id="tm-tv" data-tv="${esc(list[0].tv)}"></div>
    <p class="small muted tm-tvnote">Live prices from TradingView. Your broker's price can differ slightly.</p>
  </section>`;
}

module.exports = { html, tvSymbol };
