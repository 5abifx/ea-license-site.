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
const unit = (cur) => (cur && cur !== 'USD' ? `<small class="u">${esc(cur)}</small>` : '');
const dol = (cur) => (cur === 'USD' ? '$' : '');

// ---------- hero: the month's P&L, big, counting up on load ----------
function heroHtml(h, { cur, shareHref }) {
  const pf = h.pf === null ? '-' : h.pf === Infinity ? '∞' : h.pf.toFixed(2);
  const ratio = h.avgL ? (h.avgW / h.avgL).toFixed(2) : '-';
  return `<section class="pl-hero" data-net="${h.n ? h.net : 0}" data-label="${esc(h.label)}">
    <span class="kicker">${esc(h.label)} · Net P&amp;L</span>
    <div class="pl-big ${cls(h.net)}"><span class="pl-num" data-count="${h.n ? h.net : 0}" data-pre="${dol(cur)}">${h.n ? sgn(h.net) + dol(cur) + f2(h.net) : dol(cur) + '0.00'}</span>${unit(cur)}</div>
    <p class="pl-sub">${h.pct !== null && h.n ? `<b class="${cls(h.pct)}">${h.pct >= 0 ? '↗' : '↘'} ${sgn(h.pct)}${Math.abs(h.pct).toFixed(2)}%</b> · ` : ''}${h.wins}W / ${h.losses}L · ${h.n} trade${h.n === 1 ? '' : 's'}${h.n && shareHref ? ` · <a href="${shareHref}">Share report ›</a>` : ''}</p>
  </section>
  <div class="pl-tiles">
    <div class="pl-tile"><span>Win rate</span><strong>${h.n ? Math.round(h.winRate * 100) + '%' : '-'}</strong><small>${h.days ? `${h.greenDays} of ${h.days} days green` : 'No trades yet'}</small></div>
    <div class="pl-tile"><span>Profit factor</span><strong>${pf}</strong><small>${h.avgR !== null ? `Avg ${rTxt(h.avgR)} a trade` : 'Needs a stop-loss for R'}</small></div>
    <div class="pl-tile"><span>Avg win / avg loss</span><strong>${ratio}${ratio !== '-' ? '×' : ''}</strong><small>${h.n ? `Win ${dol(cur)}${f2(h.avgW)} · Loss ${dol(cur)}${f2(h.avgL)}` : '-'}</small></div>
    <div class="pl-tile"><span>Best day</span><strong class="${cls(h.bestDay)}">${h.bestDay === null ? '-' : sgn(h.bestDay) + dol(cur) + f2(h.bestDay)}</strong><small>${h.worstDay === null ? '-' : `Worst ${sgn(h.worstDay)}${dol(cur)}${f2(h.worstDay)}`}</small></div>
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
  const abs$ = (v) => money(v).replace(/^[+−]/, '');
  if (!D) return `<div class="dk-card empty"><div class="row between"><b>${title}</b></div><p class="muted small">No prop firm rules yet. <a href="${href}">Set them ›</a></p></div>`;
  if (D.error) return `<div class="dk-card empty"><div class="row between"><b>${title}</b></div><p class="muted small">${esc(D.error)} <a href="${href}">Open ›</a></p></div>`;
  const m = [];
  if (D.daily) { const u = D.daily.used / D.daily.allow; m.push(meter(`Room left today <small class="muted">(${D.daily.pct}% daily)</small>`, 1 - u, `${money(D.daily.left).replace('+', '')} of ${abs$(D.daily.allow)}`, room(u))); }
  if (D.max) { const u = 1 - D.max.left / D.max.allow; m.push(meter(`Room to max loss <small class="muted">(${D.max.pct}%)</small>`, 1 - u, `${money(D.max.left).replace('+', '')} left · floor ${abs$(D.max.floor)}`, room(u))); }
  if (D.target) m.push(meter(`Profit target <small class="muted">(${D.target.pct}%)</small>`, D.target.done, D.target.done >= 1 ? 'Reached' : `${Math.round(D.target.done * 100)}% · ${abs$(D.target.left)} to go`, 'var(--accent)'));
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
function sessionClock(T, shift) {
  // "heat ring": 48 half-hour tiles round the day, brighter teal = more profit, red = loss; sessions on the rim;
  // the centre shows the session you are in now and how it usually goes (filled by public/clock.js)
  const C = 200, RR = 124, RW = 40, mx = Math.max(1, ...T.halves.map((h) => Math.abs(h.net)));
  const ang = (min) => (min / 1440) * Math.PI * 2 - Math.PI / 2;
  const P = (min, r) => [+(C + Math.cos(ang(min)) * r).toFixed(1), +(C + Math.sin(ang(min)) * r).toFixed(1)];
  const arc = (a, b, r) => { const [x1, y1] = P(a, r), [x2, y2] = P(b, r); return `M${x1} ${y1} A${r} ${r} 0 ${b - a > 720 ? 1 : 0} 1 ${x2} ${y2}`; };
  const sessOf = (min) => (T.sessions.find((x) => (x.from < x.to ? min >= x.from && min < x.to : min >= x.from || min < x.to)) || {}).key;
  const RIM = RR + RW / 2 + 14, best = T.ranked[0] ? T.ranked[0].key : '';
  let s = `<defs>
    <radialGradient id="ckbg"><stop offset="0" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="ckhot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb35c"/><stop offset="1" stop-color="#ff5a1f"/></linearGradient>
    <filter id="ckglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="ckglow2" filterUnits="userSpaceOnUse" x="-20" y="-20" width="440" height="440"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <circle cx="${C}" cy="${C}" r="${RR - RW / 2 - 4}" fill="url(#ckbg)"/>`;
  // the 48 tiles
  T.halves.forEach((h) => {
    const k = Math.abs(h.net) / mx, col = !h.n ? 'rgba(255,255,255,.045)'
      : h.net >= 0 ? `rgba(38,198,160,${(0.2 + 0.8 * k).toFixed(2)})` : `rgba(240,70,75,${(0.28 + 0.72 * k).toFixed(2)})`;
    s += `<path data-s="${sessOf(h.from)}" class="ck-t" d="${arc(h.from + 1.6, h.from + 28.4, RR)}" stroke="${col}" stroke-width="${RW}" fill="none"${h.n && k > 0.6 && h.net > 0 ? ' filter="url(#ckglow2)"' : ''}><title>${hhmm(h.from)}–${hhmm(h.from + 30)} · ${h.n} trades</title></path>`;
  });
  // fine ticks just outside the ring, hour labels inside
  for (let i = 0; i < 24; i++) { const big = i % 6 === 0, [x1, y1] = P(i * 60, RR + RW / 2 + 3), [x2, y2] = P(i * 60, RR + RW / 2 + (big ? 9 : 6));
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,${big ? 0.45 : 0.16})" stroke-width="1"/>`; }
  [0, 6, 12, 18].forEach((h) => { const [x, y] = P(h * 60, RR - RW / 2 - 13); s += `<text x="${x}" y="${y + 4}" text-anchor="middle" class="ck-h">${String(h).padStart(2, '0')}</text>`; });
  // the sessions on the rim, names written along the arc
  T.sessions.filter((x) => x.key !== 'off').forEach((x) => {
    const a = x.from, b = x.to < x.from ? x.to + 1440 : x.to, large = b - a > 720 ? 1 : 0, on = x.key === best;
    const [t1x, t1y] = P(a, RIM + 16), [t2x, t2y] = P(b, RIM + 16), bottom = ((a + b) / 2) % 1440 > 360 && ((a + b) / 2) % 1440 < 1080;
    s += `<path data-s="${x.key}" d="${arc(a + 8, b - 8, RIM)}" fill="none" stroke="${on ? 'url(#ckhot)' : 'rgba(255,255,255,.28)'}" stroke-width="${on ? 4 : 2}" stroke-linecap="round"${on ? ' filter="url(#ckglow)"' : ''}/>`;
    s += `<path id="ckt-${x.key}" d="${bottom ? `M${t2x} ${t2y} A${RIM + 16} ${RIM + 16} 0 ${large} 0 ${t1x} ${t1y}` : `M${t1x} ${t1y} A${RIM + 16} ${RIM + 16} 0 ${large} 1 ${t2x} ${t2y}`}" fill="none"/>
      <text data-s="${x.key}" class="ck-s${on ? ' on' : ''}" dy="${bottom ? 9 : 0}"><textPath href="#ckt-${x.key}" startOffset="50%" text-anchor="middle">${esc(x.name.toUpperCase())}</textPath></text>`;
  });
  // live "now" tick across the ring + centre read-out
  s += `<g class="ck-hand" data-shift="${shift}"><line x1="${C}" y1="${C - RR + RW / 2 + 4}" x2="${C}" y2="${C - RIM - 4}" stroke="#fff" stroke-width="2.5" stroke-linecap="round" filter="url(#ckglow2)"/>
      <circle cx="${C}" cy="${C - RIM - 4}" r="3.5" fill="#fff"/></g>
    <text x="${C}" y="${C - 30}" text-anchor="middle" class="ck-c3" id="ck-sess"></text>
    <text x="${C}" y="${C + 8}" text-anchor="middle" class="ck-c2" id="ck-net"></text>
    <text x="${C}" y="${C + 28}" text-anchor="middle" class="ck-c1" id="ck-sub"></text>
    <text x="${C}" y="${C + 48}" text-anchor="middle" class="ck-c1 ck-now" id="ck-time">--:--</text>`;
  const stats = T.sessions.map((x) => { const r = T.ranked.find((y) => y.key === x.key);
    return { k: x.key, n: x.name, f: x.from, t: x.to, net: r ? short(r.net) : '', pos: r ? r.net >= 0 : true, sub: r ? `${r.win}% win · ${r.n} trades` : 'No trades yet' }; });
  return `<svg class="ck" viewBox="-14 -14 ${C * 2 + 28} ${C * 2 + 28}" role="img" aria-label="Profit by half hour of the day" data-sessions='${esc(JSON.stringify(stats))}'>${s}</svg>`;
}
function spark(pts) {
  if (pts.length < 2) return '';
  const W = 140, H = 34, lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), sp = hi - lo || 1;
  const pt = (v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)} ${(H - ((v - lo) / sp) * H).toFixed(1)}`;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${pt(v, i)}`).join(' '), col = pts.at(-1) >= 0 ? 'var(--ok)' : 'var(--danger)';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} L${W} ${H} L0 ${H} Z" fill="${col}" fill-opacity=".1"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function timeHtml(T, { money, offsetForm, tzName, shift = 0 }) {
  if (!T.ranked.length) return '<section class="card"><p class="muted">No trades in this period.</p></section>';
  const mx = Math.max(1, ...T.rows.flatMap((r) => r.cells.map((c) => Math.abs(c.net))));
  const rows = T.rows.filter((r, i) => i < 5 || r.n);
  const heat = `<div class="hw" style="--cols:24">
    <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hw-h">${h % 3 ? '' : String(h).padStart(2, '0')}</span>`).join('')}<span class="hw-h">Total</span>
    ${rows.map((r) => `<span class="hw-d">${DOW[r.dow]}</span>${r.cells.map((c, h) => `<i title="${DOW[r.dow]} ${String(h).padStart(2, '0')}:00 · ${c.n} trades${c.n ? ' · ' + money(c.net) : ''}" style="${c.n ? `background:${c.net >= 0 ? 'rgba(38,198,160,' : 'rgba(240,70,75,'}${(0.18 + 0.72 * Math.min(1, Math.abs(c.net) / mx)).toFixed(2)})` : ''}"></i>`).join('')}<b class="${cls(r.total)}">${r.n ? short(r.total) : '-'}</b>`).join('')}
  </div>`;
  const top = T.ranked[0];
  return `<div class="tm-top">
    <section class="card tm-clock"><h2>Session clock</h2><p class="muted small">Every half hour of the day, ${esc(tzName)}. Brighter teal made more money, red lost it. The sessions sit on the rim, and the white tick is now. Hover a session to light it up.</p>
      <div class="ck-wrap">${sessionClock(T, shift)}
        <div class="ck-side">${T.sessions.filter((x) => x.key !== 'off').map((x) => { const r = T.ranked.find((y) => y.key === x.key);
          return `<div class="ck-l${top.key === x.key ? ' on' : ''}" data-s="${x.key}" tabindex="0"><i></i><span>${esc(x.name)}<small class="muted">${hhmm(x.from)}–${hhmm(x.to)}</small></span><b class="${r ? cls(r.net) : ''}">${r ? short(r.net) : '-'}</b></div>`; }).join('')}
          <hr>${T.best ? `<p class="small"><span class="muted">Best half hour</span><br><b>${hhmm(T.best.from)}–${hhmm(T.best.from + 30)}</b> <b class="${cls(T.best.net)}">${money(T.best.net)}</b> <span class="muted">· ${T.best.n} trades</span></p>` : ''}
          ${T.worst && T.worst !== T.best && T.worst.net < 0 ? `<p class="small"><span class="muted">Worst half hour</span><br><b>${hhmm(T.worst.from)}–${hhmm(T.worst.from + 30)}</b> <b class="neg">${money(T.worst.net)}</b> <span class="muted">· ${T.worst.n} trades</span></p>` : ''}</div></div>
    </section>
    <section class="card tm-rank"><h2>Sessions, ranked</h2><p class="muted small">${esc(top.name)} made the most. Scroll, tap or use the arrows to turn the dial.</p>
      <div class="dial" tabindex="0" aria-label="Sessions ranked by profit">
        <svg class="dial-arc" viewBox="0 0 60 400" preserveAspectRatio="none" aria-hidden="true"><path d="M48 0 Q-8 200 48 400" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.5"/></svg>
        <ol class="rank">${T.ranked.map((x, i) => `<li data-i="${i}" class="${i ? '' : 'first'}"><span class="rk-n">${String(i + 1).padStart(2, '0')}</span>
          <div class="rk-b"><b class="rk-name">${esc(x.name)}</b><span class="rk-net ${cls(x.net)}">${money(x.net)}</span>
            <small class="rk-more">${x.win}% win · ${x.n} trades${x.avgR !== null ? ` · ${rTxt(x.avgR)} avg` : ''}<br>${x.range}</small></div><span class="rk-spark">${spark(x.spark)}</span></li>`).join('')}</ol>
        <span class="dial-btns"><button type="button" class="small secondary" data-d="-1" aria-label="Previous">▲</button><button type="button" class="small secondary" data-d="1" aria-label="Next">▼</button></span>
      </div>
    </section></div>
  <section class="card"><div class="row between"><h2>Hour by weekday</h2>${offsetForm}</div>
    <p class="muted small">Open time of each trade, ${esc(tzName)}. Brighter = more money made (green) or lost (red).</p>${heat}</section>
  <script src="/clock.js"></script>`;
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
