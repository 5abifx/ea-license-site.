// HTML for the journal hero, the recap, the prop firm desk, and the Time and Habits tabs of Insights.
// Charts are inline SVG / HTML drawn on the server, colored from the site theme tokens.
const { esc } = require('./views');
const { hhmm, FIRMS } = require('./desk');

const f2 = (v) => Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sgn = (v) => (v < 0 ? '−' : '+');
const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const short = (v) => `${sgn(v)}${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.round(Math.abs(v))}`;
const rTxt = (v) => (v === null || v === undefined ? '' : `${sgn(v)}${Math.abs(v).toFixed(2)}R`);
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayName = (iso) => `${DOW[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7]} ${Number(iso.slice(8))} ${new Date(iso + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
const unit = (cur) => (cur ? `<small class="u">${esc(cur)}</small>` : '');

// ---------- hero: the month's P&L, big, counting up on load ----------
function heroHtml(h, { cur, shareHref }) {
  const pf = h.pf === null ? '-' : h.pf === Infinity ? '∞' : h.pf.toFixed(2);
  const ratio = h.avgL ? (h.avgW / h.avgL).toFixed(2) : '-';
  return `<section class="pl-hero" data-net="${h.n ? h.net : 0}" data-label="${esc(h.label)}">
    <span class="kicker">${esc(h.label)} · Net P&amp;L</span>
    <div class="pl-big ${cls(h.net)}"><span class="pl-num" data-count="${h.n ? h.net : 0}">${h.n ? sgn(h.net) + f2(h.net) : '0.00'}</span>${unit(cur)}</div>
    <p class="pl-sub">${h.pct !== null && h.n ? `<b class="${cls(h.pct)}">${h.pct >= 0 ? '↗' : '↘'} ${sgn(h.pct)}${Math.abs(h.pct).toFixed(2)}%</b> · ` : ''}${h.wins}W / ${h.losses}L · ${h.n} trade${h.n === 1 ? '' : 's'}${h.n && shareHref ? ` · <a href="${shareHref}">Share report ›</a>` : ''}</p>
  </section>
  <div class="pl-tiles">
    <div class="pl-tile"><span>Win rate</span><strong>${h.n ? Math.round(h.winRate * 100) + '%' : '-'}</strong><small>${h.days ? `${h.greenDays} of ${h.days} days green` : 'No trades yet'}</small></div>
    <div class="pl-tile"><span>Profit factor</span><strong>${pf}</strong><small>${h.avgR !== null ? `Avg ${rTxt(h.avgR)} a trade` : 'Needs a stop-loss for R'}</small></div>
    <div class="pl-tile"><span>Avg win / avg loss</span><strong>${ratio}${ratio !== '-' ? '×' : ''}</strong><small>${h.n ? `Win ${f2(h.avgW)} · Loss ${f2(h.avgL)}` : '-'}</small></div>
    <div class="pl-tile"><span>Best day</span><strong class="${cls(h.bestDay)}">${h.bestDay === null ? '-' : sgn(h.bestDay) + f2(h.bestDay)}</strong><small>${h.worstDay === null ? '-' : `Worst ${sgn(h.worstDay)}${f2(h.worstDay)}`}</small></div>
  </div>`;
}

// ---------- recap: this week, last session, recent trades ----------
function recapHtml(R, { money, mask }) {
  if (!R) return '';
  const W = R.week, S = R.session;
  const mx = Math.max(1, ...W.days.map((d) => Math.abs(d.net)));
  const days = W.days.filter((d, i) => i < 5 || d.n);
  return `<div class="recap">
    <section class="card rc-week"><div class="row between"><span class="kicker">This week</span><span class="muted small">${dayName(W.from).slice(4)} – ${dayName(W.to).slice(4)}</span></div>
      <strong class="rc-big ${cls(W.net)}">${W.n ? money(W.net) : '-'}</strong>
      <dl class="rc-kv"><div><dt>Trades</dt><dd>${W.n}</dd></div><div><dt>Win rate</dt><dd>${W.n ? W.win + '%' : '-'}</dd></div><div><dt>W / L</dt><dd>${W.wins} / ${W.losses}</dd></div></dl>
      <div class="rc-bars">${days.map((d) => `<div title="${dayName(d.d)}: ${d.n} trades"><i class="${d.net >= 0 ? 'up' : 'down'}" style="height:${d.n ? Math.max(4, Math.round((Math.abs(d.net) / mx) * 56)) : 2}px"></i><span>${DOW[(new Date(d.d + 'T00:00:00Z').getUTCDay() + 6) % 7].slice(0, 1)}</span></div>`).join('')}</div>
    </section>
    <section class="card rc-session"><div class="row between"><span class="kicker">Last session</span><span class="muted small">${dayName(S.d)}</span></div>
      <strong class="rc-big ${cls(S.net)}">${money(S.net)}</strong>
      <dl class="rc-kv"><div><dt>Trades</dt><dd>${S.n}</dd></div><div><dt>W / L</dt><dd>${S.wins} / ${S.losses}</dd></div><div><dt>Avg R</dt><dd>${S.avgR === null ? '-' : rTxt(S.avgR)}</dd></div></dl>
      <p class="small rc-line">Best <a href="/journal/${S.best.id}">${esc(S.best.symbol)} ${esc(S.best.side)}</a> <b class="${cls(S.best.net)}">${money(S.best.net)}</b>${S.n > 1 ? ` · Worst <a href="/journal/${S.worst.id}">${esc(S.worst.symbol)}</a> <b class="${cls(S.worst.net)}">${money(S.worst.net)}</b>` : ''}</p>
    </section>
    <section class="card rc-recent"><div class="row between"><span class="kicker">Recent trades</span><a class="small" href="#cal">Calendar ›</a></div>
      <ul>${R.recent.map((t) => `<li><a href="/journal/${t.id}"><span class="rc-sym"><i class="${t.side === 'SELL' ? 'down' : 'up'}">${t.side === 'SELL' ? '↘' : '↗'}</i><b>${esc(t.symbol)}</b><small>${t.setup ? esc(t.setup) : mask(t)}${t.r !== null ? ` · ${rTxt(t.r)}` : ''}</small></span>
        <span class="rc-val"><b class="${cls(t.net)}">${money(t.net)}</b><small>${esc(t.close_time.slice(5, 10).replace('-', '/'))} ${esc(t.close_time.slice(11, 16))}</small></span></a></li>`).join('')}</ul>
    </section>
  </div>`;
}

// ---------- prop firm desk ----------
const statusTag = (s) => ({ active: '<span class="tag">Active</span>', passed: '<span class="tag ok">Target hit</span>',
  consistency: '<span class="tag warn">Target hit · consistency rule</span>', breached: '<span class="tag bad">Max loss breached</span>' }[s] || '');
function meter(label, frac, txt, col) {
  const w = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return `<div class="dk-m"><div class="row between"><span>${label}</span><span class="mono small">${txt}</span></div><span class="t"><i style="width:${w}%;background:${col}"></i></span></div>`;
}
const room = (used) => (used >= 0.9 ? 'var(--danger)' : used >= 0.7 ? 'var(--warn)' : 'var(--ok)');
function deskCard(D, { title, money, href }) {
  if (!D) return `<div class="dk-card empty"><div class="row between"><b>${title}</b></div><p class="muted small">No prop firm rules yet. <a href="${href}">Set them ›</a></p></div>`;
  if (D.error) return `<div class="dk-card empty"><div class="row between"><b>${title}</b></div><p class="muted small">${esc(D.error)} <a href="${href}">Open ›</a></p></div>`;
  const m = [];
  if (D.daily) { const u = D.daily.used / D.daily.allow; m.push(meter(`Room left today <small class="muted">(${D.daily.pct}% daily)</small>`, 1 - u, `${money(D.daily.left).replace('+', '')} of ${f2(D.daily.allow)}`, room(u))); }
  if (D.max) { const u = 1 - D.max.left / D.max.allow; m.push(meter(`Room to max loss <small class="muted">(${D.max.pct}%)</small>`, 1 - u, `${money(D.max.left).replace('+', '')} left · floor ${f2(D.max.floor)}`, room(u))); }
  if (D.target) m.push(meter(`Profit target <small class="muted">(${D.target.pct}%)</small>`, D.target.done, D.target.done >= 1 ? 'Reached' : `${Math.round(D.target.done * 100)}% · ${f2(D.target.left)} to go`, 'var(--accent)'));
  if (D.consistency) m.push(meter(`Best day share <small class="muted">(max ${D.consistency.pct}%)</small>`, D.consistency.share / D.consistency.pct, `${Math.round(D.consistency.share)}%`, D.consistency.ok ? 'var(--ok)' : 'var(--danger)'));
  return `<div class="dk-card ${D.status}"><div class="row between"><b>${title}</b>${statusTag(D.status)}</div>
    <div class="dk-top"><strong class="${cls(D.gain)}">${money(D.gain)}</strong><span class="muted small">${D.gainPct >= 0 ? '+' : '−'}${Math.abs(D.gainPct).toFixed(2)}% · ${D.days} trading day${D.days === 1 ? '' : 's'}${D.firm ? ' · ' + esc(D.firm) : ''}</span></div>
    ${m.join('')}${href ? `<a class="small dk-link" href="${href}">Rules and details ›</a>` : ''}</div>`;
}
function deskForm(acct, L) {
  const v = (x) => (x ? String(x) : '');
  return `<form method="post" action="/journal/insights/limits" class="prop-form dk-form">
    <input type="hidden" name="account" value="${esc(acct)}">
    <label>Firm preset<select name="firm" class="firm-pick">${['', ...Object.keys(FIRMS)].map((k) => `<option value="${k}"${(L.firm || '') === k ? ' selected' : ''}
      ${k ? `data-daily="${FIRMS[k].daily}" data-max="${FIRMS[k].max}" data-target="${FIRMS[k].target}"` : ''}>${k ? esc(FIRMS[k].name) : 'Custom (type your own)'}</option>`).join('')}</select></label>
    <label>Daily loss limit %<input name="daily" inputmode="decimal" value="${v(L.daily)}" placeholder="e.g. 5"></label>
    <label>Max loss %<input name="max" inputmode="decimal" value="${v(L.max)}" placeholder="e.g. 10"></label>
    <label>Profit target %<input name="target" inputmode="decimal" value="${v(L.target)}" placeholder="e.g. 8"></label>
    <label>Consistency: best day max %<input name="consistency" inputmode="decimal" value="${v(L.consistency)}" placeholder="optional, e.g. 40"></label>
    <label>Start balance<input name="start" inputmode="decimal" value="${v(L.start)}" placeholder="from the first trade"></label>
    <div><button class="small">Save rules</button></div>
    <p class="small muted">Presets are the usual 2-step rules. Firms change them, so check your firm's dashboard.</p>
  </form>
  <script>document.querySelectorAll('.firm-pick').forEach(function(s){s.addEventListener('change',function(){var o=s.selectedOptions[0];if(!o.dataset.daily)return;var f=s.form;f.daily.value=o.dataset.daily;f.max.value=o.dataset.max;f.target.value=o.dataset.target;});});</script>`;
}

// ---------- time ----------
function sessionClock(T) {
  const C = 170, R0 = 92, MAXL = 42, mx = Math.max(1, ...T.halves.map((h) => Math.abs(h.net)));
  const ang = (min) => (min / 1440) * Math.PI * 2 - Math.PI / 2;
  const P = (min, r) => [C + Math.cos(ang(min)) * r, C + Math.sin(ang(min)) * r];
  let s = `<circle cx="${C}" cy="${C}" r="${R0}" fill="none" stroke="var(--line)" stroke-width="1.5"/>`;
  for (let h = 0; h < 24; h++) { const [x1, y1] = P(h * 60, R0 - 4), [x2, y2] = P(h * 60, R0 - (h % 6 ? 8 : 14)); s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line)" stroke-width="1.5"/>`; }
  [0, 6, 12, 18].forEach((h) => { const [x, y] = P(h * 60, R0 - 30); s += `<text x="${x}" y="${y + 5}" text-anchor="middle" class="ck-h">${String(h).padStart(2, '0')}</text>`; });
  T.halves.forEach((h) => {
    if (!h.n) return;
    const len = Math.max(4, (Math.abs(h.net) / mx) * MAXL), r1 = h.net >= 0 ? R0 + 4 : R0 - 4, r2 = h.net >= 0 ? R0 + 4 + len : Math.max(40, R0 - 4 - len * 0.7);
    const [x1, y1] = P(h.from + 15, r1), [x2, y2] = P(h.from + 15, r2);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${h.net >= 0 ? 'var(--ok)' : 'var(--danger)'}" stroke-width="7" stroke-linecap="round"><title>${hhmm(h.from)}–${hhmm(h.from + 30)}: ${h.n} trades</title></line>`;
  });
  // sessions on the rim
  const RIM = R0 + MAXL + 16;
  T.sessions.filter((x) => x.key !== 'off').forEach((x) => {
    const a = x.from, b = x.to < x.from ? x.to + 1440 : x.to, [x1, y1] = P(a + 8, RIM), [x2, y2] = P(b - 8, RIM), large = b - a > 720 ? 1 : 0;
    const best = T.ranked[0] && T.ranked[0].key === x.key;
    s += `<path d="M${x1} ${y1} A${RIM} ${RIM} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${best ? 'var(--accent)' : 'var(--muted)'}" stroke-opacity="${best ? 1 : 0.55}" stroke-width="${best ? 4 : 2.5}" stroke-linecap="round"/>`;
    const [lx, ly] = P((a + b) / 2, RIM + 16);
    s += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" class="ck-s${best ? ' on' : ''}">${esc(x.name)}</text>`;
  });
  return `<svg class="ck" viewBox="-24 -10 ${C * 2 + 48} ${C * 2 + 20}" role="img" aria-label="Profit by half hour of the day">${s}</svg>`;
}
function spark(pts) {
  if (pts.length < 2) return '';
  const W = 140, H = 34, lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), sp = hi - lo || 1;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)} ${(H - ((v - lo) / sp) * H).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${pts.at(-1) >= 0 ? 'var(--ok)' : 'var(--danger)'}" stroke-width="2"/></svg>`;
}
function timeHtml(T, { money, offsetForm, tzName }) {
  if (!T.ranked.length) return '<section class="card"><p class="muted">No trades in this period.</p></section>';
  const mx = Math.max(1, ...T.rows.flatMap((r) => r.cells.map((c) => Math.abs(c.net))));
  const rows = T.rows.filter((r, i) => i < 5 || r.n);
  const heat = `<div class="hw" style="--cols:24">
    <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hw-h">${h % 3 ? '' : String(h).padStart(2, '0')}</span>`).join('')}<span class="hw-h">Total</span>
    ${rows.map((r) => `<span class="hw-d">${DOW[r.dow]}</span>${r.cells.map((c, h) => `<i title="${DOW[r.dow]} ${String(h).padStart(2, '0')}:00 · ${c.n} trades${c.n ? ' · ' + money(c.net) : ''}" style="${c.n ? `background:${c.net >= 0 ? 'rgba(38,198,160,' : 'rgba(240,70,75,'}${(0.18 + 0.72 * Math.min(1, Math.abs(c.net) / mx)).toFixed(2)})` : ''}"></i>`).join('')}<b class="${cls(r.total)}">${r.n ? short(r.total) : '-'}</b>`).join('')}
  </div>`;
  const top = T.ranked[0];
  return `<div class="tm-top">
    <section class="card tm-clock"><h2>Session clock</h2><p class="muted small">Every half hour of the day (${esc(tzName)}). A bar out made money, a bar in lost it. The sessions sit on the rim.</p>
      <div class="ck-wrap">${sessionClock(T)}
        <div class="ck-side">${T.sessions.filter((x) => x.key !== 'off').map((x) => `<div class="ck-l${top.key === x.key ? ' on' : ''}"><i></i><span>${esc(x.name)}</span><span class="mono muted">${hhmm(x.from)}–${hhmm(x.to)}</span></div>`).join('')}
          <hr>${T.best ? `<p class="small">Best half hour <b class="mono">${hhmm(T.best.from)}–${hhmm(T.best.from + 30)}</b><br><b class="${cls(T.best.net)}">${money(T.best.net)}</b> <span class="muted">· ${T.best.n} trades</span></p>` : ''}
          ${T.worst && T.worst !== T.best && T.worst.net < 0 ? `<p class="small">Worst half hour <b class="mono">${hhmm(T.worst.from)}–${hhmm(T.worst.from + 30)}</b><br><b class="neg">${money(T.worst.net)}</b> <span class="muted">· ${T.worst.n} trades</span></p>` : ''}</div></div>
    </section>
    <section class="card tm-rank"><h2>Sessions, ranked</h2><p class="muted small">${esc(top.name)} made the most.</p>
      <ol class="rank">${T.ranked.map((x, i) => `<li class="${i ? '' : 'first'}"><span class="rk-n">${String(i + 1).padStart(2, '0')}</span>
        <div class="rk-b"><b>${esc(x.name)}</b><small class="muted mono">${x.range}</small><span><b class="${cls(x.net)}">${money(x.net)}</b> <span class="muted">· ${x.win}% win · ${x.n} trades${x.avgR !== null ? ` · ${rTxt(x.avgR)} avg` : ''}</span></span></div>${spark(x.spark)}</li>`).join('')}</ol>
    </section></div>
  <section class="card"><div class="row between"><h2>Hour by weekday</h2>${offsetForm}</div>
    <p class="muted small">Open time of each trade, ${esc(tzName)}. Brighter = more money made (green) or lost (red).</p>${heat}</section>`;
}

// ---------- habits ----------
function hbars(list, { money, sub }) {
  const mx = Math.max(1, ...list.map((x) => Math.abs(x.net ?? x.avg)));
  return `<div class="hb">${list.map((x) => { const v = x.net ?? x.avg, w = Math.round((Math.abs(v) / mx) * 100);
    return `<div class="hb-r"><span class="hb-l">${esc(x.label)}<small class="muted">${sub(x)}</small></span>
      <span class="hb-t"><i class="${v >= 0 ? 'up' : 'down'}" style="width:${(x.n ?? x.days) ? Math.max(2, w) : 0}%"></i></span><b class="mono ${cls(v)}">${(x.n ?? x.days) ? money(v) : '-'}</b></div>`; }).join('')}</div>`;
}
function habitsHtml(H, { money }) {
  const tr = (x) => `${x.n} trade${x.n === 1 ? '' : 's'}${x.n ? ` · ${x.win}% win` : ''}`;
  const cards = [];
  const n = H.nth.filter((x) => x.n), best = n.length ? n.reduce((a, b) => (b.net > a.net ? b : a)) : null, late = H.nth.slice(1).filter((x) => x.n && x.net < 0);
  cards.push(['Trade number of the day', hbars(H.nth, { money, sub: tr }),
    best ? `Your <b>${best.label}</b> trade of the day makes the most.${late.length ? ` The ${late.map((x) => x.label).join(', ')} trade${late.length > 1 ? 's' : ''} lose${late.length > 1 ? '' : 's'} money: try a daily trade limit.` : ''}` : '']);
  const aw = H.after[0], al = H.after[1], q = H.after[2];
  cards.push(['After a win, after a loss', hbars(H.after, { money, sub: tr }),
    al.n && aw.n ? (al.win < aw.win - 5 ? `After a loss you win <b>${al.win}%</b> of the next trades, against <b>${aw.win}%</b> after a win. Take a pause after a loss.` : `Your next trade holds up after a loss (${al.win}% win). Good control.`) + (q.n && q.net < 0 ? ` Trades within 15 minutes of a loss cost <b>${money(q.net)}</b>.` : '') : '']);
  const hw = H.holdWin, hl = H.holdLoss, fm = (m) => (m === null ? '-' : m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
  cards.push(['How long you hold', hbars(H.hold, { money, sub: tr }),
    hw !== null && hl !== null ? `Winners are held <b>${fm(hw)}</b>, losers <b>${fm(hl)}</b> (middle trade).${hl > hw * 1.3 ? ' You give losers more time than winners: cut them at the stop.' : ''}` : '']);
  const dc = H.dayCount.filter((x) => x.days), bestDc = dc.length ? dc.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
  cards.push(['Trades in a day', hbars(H.dayCount, { money, sub: (x) => `${x.days} day${x.days === 1 ? '' : 's'}${x.days ? ` · ${x.green}% green` : ''}` }),
    bestDc ? `Days with <b>${bestDc.label}</b> are your best on average. Each bar is the average day.` : '']);
  const [b, s] = H.side;
  cards.push(['Buys vs sells', hbars(H.side, { money, sub: tr }),
    b.n && s.n ? `${b.net >= s.net ? 'Buys' : 'Sells'} make more for you${Math.min(b.net, s.net) < 0 ? `; ${b.net < s.net ? 'buys' : 'sells'} lose money` : ''}.` : '']);
  const [u, g] = H.size;
  cards.push(['Position size', hbars(H.size, { money, sub: tr }),
    g.n ? (g.net < 0 ? `Trades at 1.5× your usual size or more lost <b>${money(g.net)}</b>. Keep the size the same every trade.`
      : g.win < u.win - 5 ? `Bigger trades win less often (<b>${g.win}%</b> against <b>${u.win}%</b>). Keep the size the same every trade.`
      : 'Bigger trades hold up. Keep the risk per trade the same anyway.') : 'You keep the same size. Good.']);
  return `<div class="hab">${cards.map(([t, body, note]) => `<section class="card"><h2>${t}</h2>${body}${note ? `<p class="small hb-note">${note}</p>` : ''}</section>`).join('')}</div>`;
}

module.exports = { heroHtml, recapHtml, deskCard, deskForm, timeHtml, habitsHtml };
