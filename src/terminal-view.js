// The Desk page HTML: a terminal-style screen. Ticker strip, day map (with news), forecast, rules, news catalysts,
// next trade check and you vs your rules. Charts are inline SVG drawn here; public/terminal.js adds the live parts
// (clock, session, countdowns, the news panel and the trade check).
const { esc } = require('./views');

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


// ---------- top tiles: your day (one bar per hour), today, mistake risk, up next, today's rule ----------
// Plain HTML with fixed heights, so the tiles keep their size on any screen width.
const SESS_BANDS = [['Asia', 0, 3], ['London', 3, 8], ['NY AM', 8, 12], ['NY PM', 12, 17], ['Asia', 19, 24]];
function dayTile(T, N) {
  const hrs = Array.from({ length: 24 }, (_, h) => {
    const a = T.halves[h * 2] || { n: 0, u: 0 }, b = T.halves[h * 2 + 1] || { n: 0, u: 0 };
    const today = T.todayTrades.filter((t) => Math.floor(t.min / 60) === h);
    const inWin = T.best && (() => { const f = T.best.from, to = T.best.to > f ? T.best.to : 1440; return h * 60 < to && (h + 1) * 60 > f; })();
    const red = T.avoid.includes(h * 60) || T.avoid.includes(h * 60 + 30);
    const news = N && N.has ? N.events.filter((e) => e.day === 0 && Math.floor(e.nyMin / 60) === h) : [];
    return { h, n: a.n + b.n, u: a.u + b.u, today, inWin, red, news };
  });
  const mx = Math.max(0.5, ...hrs.map((x) => Math.abs(x.u)));
  const cols = hrs.map((x) => {
    const net = x.today.reduce((s, t) => s + t.net, 0);
    const tip = `${String(x.h).padStart(2, '0')}:00 · usually ${x.n} trades, ${T.fmtU(x.u)}${x.today.length ? ` · today ${x.today.length}` : ''}${x.red ? ' · red hour' : ''}${x.inWin ? ' · your window' : ''}${x.news.length ? ' · news: ' + x.news.map((e) => `${T.hhmm(e.nyMin)} ${e.cur} ${e.name}`).join(', ') : ''}`;
    const ht = x.n ? 10 + (Math.abs(x.u) / mx) * 90 : 0;
    return `<div class="tm-hc" title="${esc(tip)}"><span class="tm-hn ${x.today.length ? (net >= 0 ? 'pos' : 'neg') : ''}">${x.today.length || ''}</span>
      <span class="tm-hb${x.inWin ? ' win' : ''}${x.red ? ' red' : ''}">${x.n ? `<i class="${x.u >= 0 ? 'up' : 'dn'}" style="height:${ht.toFixed(0)}%;opacity:${(0.35 + (Math.abs(x.u) / mx) * 0.65).toFixed(2)}"></i>` : ''}</span>
      <span class="tm-hl">${x.news.length ? `<i class="tm-hnw i${Math.max(...x.news.map((e) => e.imp))}"></i>` : x.h % 3 ? '' : String(x.h).padStart(2, '0')}</span></div>`;
  }).join('');
  const bands = SESS_BANDS.map(([n, a, b]) => `<span style="left:${((a / 24) * 100).toFixed(2)}%;width:${(((b - a) / 24) * 100).toFixed(2)}%">${n}</span>`).join('');
  return `<section class="card tp tm-day" aria-label="Your day">
    <div class="tp-h"><span class="tp-l"><span class="tm-live"></span>Your day · New York time</span>
      <span class="tm-sessn"><b id="tm-sess">${esc(T.sessNow)}</b> <span id="tm-sessnext" class="muted">&nbsp;</span><span class="tm-sessbar"><i id="tm-sessbar" style="width:0%"></i></span></span></div>
    <div class="tm-ss" aria-hidden="true">${bands}</div>
    <div class="tm-hrs">${cols}<i class="tm-hnow" aria-hidden="true"></i></div>
    <div class="tm-leg"><span><i class="up"></i>usual win hour</span><span><i class="dn"></i>usual losing hour</span><span><i class="bl"></i>red hour</span><span><i class="wn"></i>your window</span><span><i class="nw"></i>news</span><span class="muted">number = trades today</span></div>
  </section>`;
}

function todayTile(T, money) {
  const u = T.today.u, usual = Math.max(1, Math.round(T.usualTrades)), n = T.today.n, won = T.today.list.filter((v) => v >= 0).length;
  const top = Math.max(usual, n), d = T.daily, used = d ? clamp(d.used / d.allow, 0, 1) : 0;
  return `<section class="card tp tm-tdy"><span class="tp-l">Today</span>
    <b class="tm-big ${u > 0 ? 'pos' : u < 0 ? 'neg' : ''}">${T.fmtU(u)}</b>
    <small class="muted">${n} trade${n === 1 ? '' : 's'} · usual ${usual}${n ? ` · ${won} won` : ''}</small>
    <div class="tm-bar tm-count${n > usual ? ' warn' : ''}" title="${n} trades today, you usually take ${usual}"><i style="width:${((n / top) * 100).toFixed(0)}%"></i><b style="left:${((usual / top) * 100).toFixed(0)}%"></b></div>
    <small class="${n > usual ? 'tm-warn' : 'muted'}">${n > usual ? 'Above your usual count' : n === usual ? 'At your usual count' : `${usual - n} left before your usual count`}</small>
    <div class="tm-dl"><span>Daily loss used</span>${d ? `<b class="${used >= 0.8 ? 'neg' : ''}">${Math.round(used * 100)}% · ${money(d.left).replace(/^[+−]/, '')} left</b>` : '<a href="/journal/insights">Add firm rules</a>'}</div>
  </section>`;
}

function riskTile(T) {
  const t = T.level === 'High' ? 'Today looks like your bad days' : T.level === 'Medium' ? 'Today needs some care' : 'Today looks like your good days';
  const top = T.drivers[0];
  return `<section class="card tp tm-rsk"><span class="tp-l">Mistake risk</span>
    <div class="tm-rskb">${gauge(T.score, T.level)}<div><b class="tm-rt">${t}</b>${top ? `<small class="muted">${esc(top.title.replace(/\.$/, ''))}</small>` : ''}<a class="small" href="#tm-fcp">Why ↓</a></div></div>
  </section>`;
}

function upNext(N, T) {
  const fut = N && N.has ? N.events.filter((e) => e.t > Date.now()).sort((a, b) => b.imp - a.imp || a.t - b.t).slice(0, 4).sort((a, b) => a.t - b.t) : [];
  const day = (e) => new Date(e.t).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const rows = fut.length ? fut.map((e) => `<div class="tm-ux"><span class="tm-un"><i class="tm-hnw i${e.imp}"></i>${esc(e.cur)} ${esc(e.name)}</span><small class="muted">${e.day === 0 ? 'Today' : esc(day(e))} ${T.hhmm(e.nyMin)} · <em data-cd="${e.t}">--</em></small></div>`).join('')
    : `<div class="tm-empty"><i class="ok"></i>${N && N.has ? 'No medium or high impact news this week.' : 'News switches on with Trade Journal EA 1.30.'}</div>`;
  return `<section class="card tp tm-upn"><div class="tp-h"><span class="tp-l">Coming up</span><a class="small" href="#tm-newsp">All news ↓</a></div>${rows}</section>`;
}

function ruleTile(T, money) {
  const r = T.rules[0];
  return `<section class="card tp tm-rl1"><div class="tp-h"><span class="tp-l">Today's rule</span>${T.rules.length > 1 ? `<a class="small" href="#tm-rulesp">All ${T.rules.length} ↓</a>` : ''}</div>
    ${r ? `<b class="tm-rt">${esc(r.rule)}</b>${r.saved ? `<small class="neg">${esc(r.tag)}: ${money(-r.saved).replace(/^[+]/, '')}</small>` : `<small class="muted">${esc(r.tag)}</small>`}` : '<div class="tm-empty"><i class="ok"></i>No leaks found yet.</div>'}
  </section>`;
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
  const G = T.ghost, mk = marketPanel(market || []);
  return `
<div class="tm${mk ? '' : ' nomkt'}">
  ${dayTile(T, N)}
  ${todayTile(T, money)}
  ${riskTile(T)}
  ${mk}
  ${upNext(N, T)}
  ${ruleTile(T, money)}
  ${panel('tm-fc" id="tm-fcp', 'Mistake forecast', T.level === 'High' ? 'Today looks like your bad days' : T.level === 'Medium' ? 'Today needs some care' : 'Today looks like your good days',
    `<div class="tm-fcb">${gauge(T.score, T.level)}<div class="tm-drvs">${drivers}</div></div>${recent(T)}`, `<span class="tp-r">${esc(acctNote)}</span>`)}
  ${panel('tm-rules" id="tm-rulesp', "Today's rules", 'From your own leaks', `<div class="tm-rl">${rules}</div>`, '<span class="tp-r" title="KATANA can enforce these after its next update">reminders</span>')}
  ${panel('tm-wide tm-news" id="tm-newsp', 'News catalysts', '', `<div id="tm-news"></div><script id="tm-ndata" type="application/json">${ndata}</script>`,
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
  return `<section class="card tp tm-mkt">
    <div class="tp-h"><span class="tp-l">Live market · your most traded</span><span class="seg tm-mkts" id="tm-mkts">${chips}</span></div>
    <div class="tm-tv" id="tm-tv" data-tv="${esc(list[0].tv)}"></div>
    <p class="small muted tm-tvnote">Live prices from TradingView. Your broker's price can differ slightly.</p>
  </section>`;
}

module.exports = { html, tvSymbol };
