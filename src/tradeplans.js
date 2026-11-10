// Trade plans and "What we found".
// A plan is written before the trade (on the site now; from KATANA in a later update), matched to the MT5 trade by
// pair + direction when it opens within MATCH_AFTER minutes, then shown next to the result with the cost of each slip.
// "What we found" answers questions most traders can't answer about their own trading, each with one Fix line.
const { prep, analyze } = require('./insights');

// setup tags, members-only (never shown on public pages). One shape and one target; any number of locations and confluences.
const TAGS = [
  ['shape', 'Shape', ['p shape', 'b shape', 'D shape', 'B shape', 'Thin / trending'], true],
  ['loc', 'At', ['VAL', 'VAH', 'POC'], false],
  ['target', 'Targeting', ['Poor high', 'Poor low'], true],
  ['conf', 'With', ['VWAP', 'Delta divergence', 'Heatmap level'], false],
];
const SETUPS = TAGS.flatMap((g) => g[2]);
// tags from a form or from KATANA -> one "p shape · VAL · Poor high · VWAP" line
function setupText(b) {
  const out = [];
  TAGS.forEach(([k, , opts, one]) => {
    const got = [].concat(b[k] ?? []).flatMap((v) => String(v).split(',')).map((v) => v.trim()).filter(Boolean)
      .map((v) => opts.find((o) => o === v) || opts.find((o) => o.split(' ')[0] === v) || (k === 'shape' ? null : opts.find((o) => o.toLowerCase() === v.toLowerCase())) || null).filter(Boolean);
    const uniq = [...new Set(got)];
    out.push(...(one ? uniq.slice(0, 1) : uniq));
  });
  return out.join(' · ');
}
const setupTags = (s) => String(s || '').split(' · ').filter(Boolean);
const CHECKS = [['bias', 'Bias agrees'], ['news', 'No news in 30 min'], ['aplus', 'A+ setup'], ['session', 'Inside my session']];
const MATCH_BEFORE = 30;     // minutes: a trade opened a little before the plan was saved still counts
const MATCH_AFTER = 240;     // minutes: about 4 hours
const MISSED_AFTER = 7 * 24 * 60;   // a plan with no trade after a week is closed as "no trade taken"
const NY_DEFAULT = 7;
const SESS = [['Asia', 19 * 60, 3 * 60], ['London', 3 * 60, 8 * 60], ['NY AM', 8 * 60, 12 * 60], ['NY PM', 12 * 60, 17 * 60], ['After hours', 17 * 60, 19 * 60]];

const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const ts = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + (String(s).length <= 19 ? 'Z' : '')) : NaN);
const median = (l) => { const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const symKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sameSym = (a, b) => { const x = symKey(a), y = symKey(b); return !!x && !!y && (x.startsWith(y) || y.startsWith(x)); };

function init(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS trade_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number TEXT NOT NULL DEFAULT '',
    symbol TEXT NOT NULL, side TEXT NOT NULL,            -- BUY | SELL
    entry REAL NOT NULL, sl REAL NOT NULL, tp REAL NOT NULL,
    risk_pct REAL, risk_money REAL, lots REAL, balance REAL,
    setup TEXT NOT NULL DEFAULT '', checks TEXT NOT NULL DEFAULT '[]', reason TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'site',                 -- site | katana
    plan_time TEXT NOT NULL,                             -- broker clock, like journal_trades.open_time
    status TEXT NOT NULL DEFAULT 'open',                 -- open | matched | missed
    trade_id INTEGER REFERENCES journal_trades(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_plans_user ON trade_plans(user_id, status)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_trade ON trade_plans(trade_id) WHERE trade_id IS NOT NULL');
}

// the broker clock now: New York time + the trader's offset (same clock as the trades)
function brokerNow(offset = NY_DEFAULT, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) + offset * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
}

// link open plans to the trade they became; close plans that never got a trade
function match(db, u) {
  const open = db.prepare("SELECT * FROM trade_plans WHERE user_id = ? AND status = 'open' ORDER BY plan_time").all(u.id);
  if (!open.length) return;
  const nowMs = ts(brokerNow(u.ny_offset ?? NY_DEFAULT));
  const taken = new Set(db.prepare('SELECT trade_id FROM trade_plans WHERE user_id = ? AND trade_id IS NOT NULL').all(u.id).map((r) => r.trade_id));
  const rows = db.prepare('SELECT id, account_number, symbol, side, open_time FROM journal_trades WHERE user_id = ? AND open_time IS NOT NULL ORDER BY open_time DESC LIMIT 2000').all(u.id);
  const set = db.prepare('UPDATE trade_plans SET status = ?, trade_id = ? WHERE id = ?');
  open.forEach((p) => {
    const at = ts(p.plan_time);
    const hit = rows.filter((t) => {
      const o = ts(t.open_time);
      return !taken.has(t.id) && t.side === p.side && o >= at - MATCH_BEFORE * 60e3 && o <= at + MATCH_AFTER * 60e3
        && sameSym(t.symbol, p.symbol) && (!p.account_number || p.account_number === t.account_number);
    }).sort((a, b) => Math.abs(ts(a.open_time) - at) - Math.abs(ts(b.open_time) - at))[0];
    if (hit) {
      taken.add(hit.id); set.run('matched', hit.id, p.id);
      if (p.setup) db.prepare("UPDATE journal_trades SET setup = ? WHERE id = ? AND (setup IS NULL OR setup = '')").run(p.setup.slice(0, 120), hit.id);
    } else if (nowMs - at > MISSED_AFTER * 60e3) set.run('missed', null, p.id);
  });
}

// money per 1.0 price move for this trade's size, from its own result (or its risk)
function moneyPerPoint(t) {
  const gross = fin(t.profit) ? Number(t.profit) : Number(t.net);
  if (fin(t.exit) && fin(t.entry) && Number(t.exit) !== Number(t.entry) && Number.isFinite(gross) && gross) return Math.abs(gross / (t.exit - t.entry));
  if (fin(t.risk_money) && fin(t.sl) && fin(t.entry) && Number(t.sl) !== Number(t.entry)) return Math.abs(t.risk_money / (t.entry - t.sl));
  return null;
}

// plan next to result: one row per part of the plan, with what each slip cost
function compare(p, t) {
  const dir = p.side === 'SELL' ? -1 : 1, k = moneyPerPoint(t);
  const dist = Math.abs(p.entry - p.sl), tol = dist * 0.1;
  const rows = [];
  const cost = (pts) => (k ? pts * k : null);
  const slip = (t.entry - p.entry) * dir;            // > 0: a worse price than planned
  rows.push(slip <= tol
    ? { ok: true, label: 'Entry on plan', detail: `${p.entry} → ${t.entry}` }
    : { ok: false, label: 'Worse entry', detail: `${p.entry} → ${t.entry}`, cost: cost(slip), kind: 'risk' });
  if (fin(p.risk_pct) && fin(t.risk_pct)) {
    rows.push(t.risk_pct <= p.risk_pct * 1.1
      ? { ok: true, label: 'Risk on plan', detail: `${(+p.risk_pct).toFixed(1)}% → ${(+t.risk_pct).toFixed(1)}%` }
      : { ok: false, label: 'Risked more', detail: `${(+p.risk_pct).toFixed(1)}% → ${(+t.risk_pct).toFixed(1)}%`,
        cost: fin(t.risk_money) ? t.risk_money * (1 - p.risk_pct / t.risk_pct) : null, kind: 'risk' });
  }
  if (!fin(t.sl)) rows.push({ ok: false, label: 'No stop', detail: `${p.sl} → none` });
  else {
    const wider = (p.sl - t.sl) * dir;               // > 0: the stop sat further away than planned
    rows.push(wider > tol
      ? { ok: false, label: 'Stop moved', detail: `${p.sl} → ${t.sl}`, cost: cost(wider), kind: 'risk' }
      : { ok: true, label: 'Stop held', detail: `${p.sl} → ${t.sl}` });
  }
  const reach = (t.exit - p.tp) * dir, lossPlan = cost(dist);
  if (reach >= -tol) rows.push({ ok: true, label: 'Target hit', detail: `${p.tp} → ${t.exit}` });
  else if (t.net > 0) rows.push({ ok: false, label: 'Closed early', detail: `${p.tp} → ${t.exit}`, cost: cost(-reach), kind: 'left' });
  else if (lossPlan && -t.net > lossPlan * 1.15) rows.push({ ok: false, label: 'Bigger loss', detail: `${p.sl} → ${t.exit}`, cost: -t.net - lossPlan, kind: 'risk' });
  else rows.push({ ok: true, label: 'Loss as planned', detail: `${p.sl} → ${t.exit}` });
  return { rows, followed: rows.filter((r) => r.ok).length, total: rows.length, planPays: cost(Math.abs(p.tp - p.entry)), planLoss: lossPlan, k };
}

// the plan lines (white) and what the trade did (orange) on one small price chart
function chartSvg(p, t, { W = 520, H = 190 } = {}) {
  const ps = [p.entry, p.sl, p.tp, t.entry, t.exit, t.sl].filter(fin).map(Number);
  let lo = Math.min(...ps), hi = Math.max(...ps); const pad = (hi - lo) * 0.14 || 1; lo -= pad; hi += pad;
  const y = (v) => +(H - 14 - ((v - lo) / (hi - lo)) * (H - 28)).toFixed(1);
  const L = 64, R = W - 10, ex = R - 46;
  const line = (v, txt) => `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" class="pv-pl"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="pv-plt">${txt}</text>`;
  const movedStop = fin(t.sl) && Math.abs(t.sl - p.sl) > Math.abs(p.entry - p.sl) * 0.1;
  return `<svg viewBox="0 0 ${W} ${H}" class="pvr-svg" role="img" aria-label="Plan lines in white, what the trade did in orange">
    <rect x="${L}" y="${Math.min(y(p.entry), y(p.tp))}" width="${R - L}" height="${Math.abs(y(p.entry) - y(p.tp))}" class="pv-zr"/>
    <rect x="${L}" y="${Math.min(y(p.entry), y(p.sl))}" width="${R - L}" height="${Math.abs(y(p.entry) - y(p.sl))}" class="pv-zk"/>
    ${line(p.tp, 'Target')}${line(p.entry, 'Entry')}${line(p.sl, 'Stop')}
    ${movedStop ? `<line x1="${L + 90}" x2="${R}" y1="${y(t.sl)}" y2="${y(t.sl)}" class="pv-ac pv-acd"/><text x="${R}" y="${y(t.sl) - 6}" text-anchor="end" class="pv-act">your stop</text>` : ''}
    <path d="M${L + 24} ${y(t.entry)} C ${L + 140} ${y(t.entry)}, ${ex - 120} ${y(t.exit)}, ${ex} ${y(t.exit)}" class="pv-ac"/>
    <circle cx="${L + 24}" cy="${y(t.entry)}" r="4" class="pv-acc"/><circle cx="${ex}" cy="${y(t.exit)}" r="4.5" class="pv-acc"/>
    <text x="${ex + 9}" y="${y(t.exit) + 4}" class="pv-act">out</text></svg>`;
}

// ---------- What we found ----------
const nyMin = (t, off) => { const d = new Date((Number.isFinite(t.o) ? t.o : t.c) - off * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const sessOf = (m) => (SESS.find(([, a, b]) => (a < b ? m >= a && m < b : m >= a || m < b)) || ['Other'])[0];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (t) => { const d = new Date(t.c); return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

// small pictures for the answers: few words, the picture explains
const V = {
  // 24h clock (New York time): the 5 best trades as dots, the session most of them sit in as an arc
  clock(mins, ses) {
    const R = 30, c = 38, pt = (m, r = R) => { const a = (m / 1440) * Math.PI * 2 - Math.PI / 2; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; };
    const S = SESS.find((s) => s[0] === ses);
    let arc = '';
    if (S) { const [x1, y1] = pt(S[1]), [x2, y2] = pt(S[2]); const span = ((S[2] - S[1] + 1440) % 1440) / 1440; arc = `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${span > 0.5 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" class="v-arc"/>`; }
    const ticks = [0, 360, 720, 1080].map((m) => { const [a, b] = pt(m, R - 4), [x, y] = pt(m, R + 4); return `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="v-tick"/>`; }).join('');
    const dots = mins.map((m) => { const [x, y] = pt(m); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="v-dot"/>`; }).join('');
    return `<svg viewBox="0 0 76 76" class="v-clock" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${R}" class="v-ring"/>${ticks}${arc}${dots}<text x="${c}" y="${c + 4}" text-anchor="middle" class="v-lab">NY</text></svg>`;
  },
  // two bars: the usual loss and this one
  vs(usual, big, lu, lb) {
    const w = (v) => Math.max(4, Math.min(100, (v / Math.max(usual, big)) * 100)).toFixed(0);
    return `<div class="v-vs"><div><span>${lu}</span><i style="width:${w(usual)}%"></i></div><div><span>${lb}</span><i class="neg" style="width:${w(big)}%"></i></div></div>`;
  },
  // one bar split in two: what was taken, what was left
  split(a, b, la, lb) {
    const p = Math.round((a / (a + b)) * 100);
    return `<div class="v-split"><div class="v-sbar"><i style="width:${p}%"></i><b style="width:${100 - p}%"></b></div><div class="v-slab"><span>${la}</span><span class="o">${lb}</span></div></div>`;
  },
  // one dot per planned trade; a moved stop is an orange ring
  dots(list) {
    return `<div class="v-dots">${list.map((x) => `<i class="${x ? 'm' : ''}" title="${x ? 'Stop moved' : 'Stop kept'}"></i>`).join('')}</div>`;
  },
  // two rings side by side
  rings(a, b, la, lb) {
    const ring = (p, l, o) => { const C = 2 * Math.PI * 22; return `<figure><svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="22" class="v-ring"/><circle cx="28" cy="28" r="22" class="v-fill${o ? ' o' : ''}" stroke-dasharray="${((p / 100) * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)"/><text x="28" y="32" text-anchor="middle">${p}%</text></svg><figcaption>${l}</figcaption></figure>`; };
    return `<div class="v-rings">${ring(a, la, true)}${ring(b, lb, false)}</div>`;
  },
  icon(kind) {
    const clock = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
    const P = {
      time: clock, besttime: clock, weekday: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      overtrade: '<rect x="4" y="4" width="16" height="4" rx="1"/><rect x="4" y="10" width="16" height="4" rx="1"/><rect x="4" y="16" width="16" height="4" rx="1"/>',
      revenge: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 3 2 0-2-1-4 0-6z"/>', tilt: '<path d="M4 18l6-6 4 4 6-8"/><path d="M14 8h6v6"/>',
      risk: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>', hold: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
      nostop: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>', gaveback: '<path d="M4 16l5-8 4 5 3-3 4 6"/><path d="M4 20h16"/>',
    };
    return `<svg viewBox="0 0 24 24" class="v-icon" aria-hidden="true">${P[kind] || '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>'}</svg>`;
  },
};

function found(rows, plansByTrade, { money, esc, off = NY_DEFAULT, planHref = '/journal/plan' }) {
  const T = prep(rows);
  if (T.length < 5) return null;
  const sum = (l) => l.reduce((s, t) => s + t.net, 0);
  const amt = (v) => String(money(Math.abs(v))).replace(/^[+−-]/, '');
  const winPct = (l) => (l.length ? Math.round((l.filter((t) => t.net > 0).length / l.length) * 100) : 0);
  const side = (t) => (t.side === 'SELL' ? 'sell' : 'buy');
  const Q = [];
  const losses = T.filter((t) => t.net < 0), avgLoss = losses.length ? -sum(losses) / losses.length : 0;

  // 1 best trade, and when the best trades happen
  const wins = T.filter((t) => t.net > 0).sort((a, b) => b.net - a.net);
  if (wins.length) {
    const best = wins[0], top = wins.slice(0, 5), bySess = {};
    top.forEach((t) => { const s = sessOf(nyMin(t, off)); bySess[s] = (bySess[s] || 0) + 1; });
    const [ses, n] = Object.entries(bySess).sort((a, b) => b[1] - a[1])[0];
    Q.push({ q: 'Best trade', a: money(best.net), tone: 'pos', sub: `${esc(best.symbol)} ${side(best)} · ${when(best)}`,
      viz: V.clock(top.map((t) => nyMin(t, off)), n >= 3 ? ses : ''),
      fix: n >= 3 && top.length >= 5 ? `${n} of your 5 best: ${ses}. Trade there.` : 'Write down why it worked.', href: `/journal/${best.id}` });
  }
  // 2 biggest loss, next to the usual loss
  const worst = [...T].sort((a, b) => a.net - b.net)[0];
  if (worst && worst.net < 0) {
    const x = avgLoss ? -worst.net / avgLoss : 1;
    Q.push({ q: 'Biggest loss', a: money(worst.net), tone: 'neg', sub: `${x.toFixed(1)}× your usual loss`,
      viz: V.vs(avgLoss, -worst.net, 'Usual', 'This one'),
      fix: x >= 2 ? 'Never widen the stop.' : 'A controlled loss. Keep it so.', href: `/journal/${worst.id}` });
  }
  // 3 real risk per trade
  const rk = T.filter((t) => fin(t.risk_pct)).slice(-60);
  if (rk.length >= 5) {
    const vals = rk.map((t) => Number(t.risk_pct)), mid = median(vals);
    const planned = median(rk.map((t) => plansByTrade[t.id]?.risk_pct).filter(fin));
    const base = planned || mid, over = rk.filter((t) => t.risk_pct > base * 1.3);
    const mx = Math.max(...vals, base * 1.5), w = 300 / rk.length;
    const bars = rk.map((t, i) => { const h = Math.max(2, (t.risk_pct / mx) * 46); return `<rect x="${(i * w + 0.5).toFixed(1)}" y="${(50 - h).toFixed(1)}" width="${Math.max(1, w - 1.5).toFixed(1)}" height="${h.toFixed(1)}"${t.risk_pct > base * 1.3 ? ' class="o"' : ''}/>`; }).join('');
    const by = (50 - (base / mx) * 46).toFixed(1);
    Q.push({ q: 'Real risk per trade', a: `${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)}%`,
      sub: over.length ? `${over.length} trade${over.length > 1 ? 's' : ''} over ${base.toFixed(1)}%` : `Steady at ${base.toFixed(1)}%`,
      viz: `<svg viewBox="0 0 300 52" class="fq-bars" preserveAspectRatio="none" aria-hidden="true">${bars}<line x1="0" x2="300" y1="${by}" y2="${by}"/></svg>`,
      fix: over.length ? `Every trade at ${base.toFixed(1)}%.` : 'Keep it there.' });
  }
  // 4 the habit that costs the most (from Insights)
  const A = analyze(rows, { money, esc });
  const leak = !A.locked && [...A.items].filter((i) => i.tone === 'bad').sort((a, b) => (b.saved || 0) - (a.saved || 0))[0];
  if (leak) Q.push({ q: 'Costliest habit', a: esc(leak.tag), tone: 'acc', sub: leak.saved ? `−${amt(leak.saved)}` : '',
    viz: V.icon(leak.kind), fix: esc(String(leak.rule || leak.fix).replace(/<[^>]+>/g, '').split('. ')[0].replace(/\.$/, '')) + '.', href: '/journal/insights' });
  // 5 left on the table: wins closed before their target (the plan's, else the trade's TP)
  let taken = 0;
  const early = T.filter((t) => t.net > 0 && fin(t.exit)).map((t) => {
    const tp = fin(plansByTrade[t.id]?.tp) ? Number(plansByTrade[t.id].tp) : fin(t.tp) ? Number(t.tp) : null, k = moneyPerPoint(t);
    if (tp === null || !k) return null;
    const left = (tp - t.exit) * t.dir * k;
    if (left > Math.abs(t.net) * 0.1) { taken += t.net; return left; }
    return null;
  }).filter((v) => v !== null);
  if (early.length) {
    const left = early.reduce((s, v) => s + v, 0);
    Q.push({ q: 'Left on the table', a: amt(left), tone: 'acc', sub: `${early.length} win${early.length > 1 ? 's' : ''} closed early`,
      viz: V.split(taken, left, `Taken ${amt(taken)}`, `Left ${amt(left)}`), fix: 'Half at 1R, rest to target.' });
  }
  // 6 stops moved (needs plans)
  const pl = T.filter((t) => plansByTrade[t.id]);
  if (pl.length) {
    const mv = pl.map((t) => { const p = plansByTrade[t.id]; return fin(t.sl) && (p.sl - t.sl) * t.dir > Math.abs(p.entry - p.sl) * 0.1; });
    const moved = pl.filter((t, i) => mv[i]), bad = moved.filter((t) => t.net < 0);
    Q.push({ q: 'Stops moved', a: `${moved.length} of ${pl.length}`, sub: bad.length ? `${bad.length} became losses · ${amt(sum(bad))}` : 'planned trades',
      viz: V.dots(mv.slice(-24)), fix: moved.length ? 'The plan\'s stop is final.' : 'Stops held. Keep it so.' });
  } else Q.push({ q: 'Stops moved', a: '–', empty: true, sub: 'Needs your plans', viz: V.dots([0, 0, 0, 0, 0, 0]), fix: 'Plan your next trade.', href: planHref });
  // 7 planned vs not
  const un = T.filter((t) => !plansByTrade[t.id]);
  if (pl.length >= 3 && un.length >= 3) Q.push({ q: 'Plan vs no plan', a: '', sub: 'Win rate',
    viz: V.rings(winPct(pl), winPct(un), `Planned · ${pl.length}`, `No plan · ${un.length}`),
    fix: winPct(pl) >= winPct(un) ? 'Plan every trade.' : 'Check each plan vs result.' });
  else Q.push({ q: 'Plan vs no plan', a: '', empty: true, sub: `${pl.length} of 3 planned trades needed`, viz: V.rings(0, winPct(un), 'Planned', 'No plan'), fix: 'Plan your next trade.', href: planHref });
  return { count: T.length, items: Q };
}

function foundHtml(F) {
  if (!F) return '';
  return `<section class="found">
    <div class="row between"><h2>What we found</h2><span class="fq-nav"><span class="muted small">Last 90 days · ${F.count} trades</span><button type="button" class="fq-btn" data-d="-1" aria-label="Previous">‹</button><button type="button" class="fq-btn" data-d="1" aria-label="Next">›</button></span></div>
    <div class="fq-grid">${F.items.map((x, i) => `<${x.href ? `a href="${x.href}"` : 'div'} class="fq${x.empty ? ' empty' : ''}">
      <span class="fq-q"><em>${String(i + 1).padStart(2, '0')}</em>${x.q}</span>
      ${x.a ? `<b class="fq-a${x.tone ? ' ' + x.tone : ''}">${x.a}</b>` : ''}
      <div class="fq-v">${x.viz || ''}</div>
      ${x.sub ? `<span class="fq-s">${x.sub}</span>` : ''}
      <span class="fq-fix"><i>Fix</i>${x.fix}</span></${x.href ? 'a' : 'div'}>`).join('')}</div></section>`;
}

module.exports = { init, brokerNow, match, compare, chartSvg, found, foundHtml, moneyPerPoint, sameSym, SETUPS, TAGS, setupText, setupTags, CHECKS, MATCH_AFTER };
