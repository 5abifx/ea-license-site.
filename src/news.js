// News catalysts for the Desk: MT5's own economic calendar, sent by the Trade Journal EA (POST /api/journal/calendar).
// Stored once for everyone in news_events (UTC). No outside data feed.

// currencies that move a symbol (gold and US indices follow USD news)
function currenciesOf(sym) {
  const s = String(sym || '').toUpperCase();
  const out = new Set();
  ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY'].forEach((c) => { if (s.includes(c)) out.add(c); });
  if (/XAU|XAG|GOLD|SILVER|US30|DJ|NAS|NDX|USTEC|US100|SPX|US500|SP500|WTI|USOIL|OIL|BTC|ETH/.test(s)) out.add('USD');
  if (/GER|DAX|DE40|EU50|STOXX|FRA/.test(s)) out.add('EUR');
  if (/UK100|FTSE/.test(s)) out.add('GBP');
  if (/JP225|NIK|JPN/.test(s)) out.add('JPY');
  if (!out.size) out.add('USD');
  return [...out];
}

// UTC milliseconds of a New York wall-clock time given as "UTC" milliseconds (DST aware)
function nyToUtc(nyMs) {
  const guess = nyMs + 5 * 3600e3;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const back = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return guess + (nyMs - back);
}
const utcToNyMin = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return (+p.hour % 24) * 60 + +p.minute;
};

// save a batch from the EA: [[event_id, utc_seconds, cur, name, imp, actual, forecast, previous, unit, move, dir], ...]
function save(db, events) {
  const n = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const s = (v, max) => String(v ?? '').slice(0, max);
  const up = db.prepare(`INSERT INTO news_events (id, event_id, t, cur, name, imp, actual, forecast, previous, unit, move, dir)
    VALUES (@id, @event_id, @t, @cur, @name, @imp, @actual, @forecast, @previous, @unit, @move, @dir)
    ON CONFLICT(id) DO UPDATE SET actual = COALESCE(excluded.actual, actual), forecast = COALESCE(excluded.forecast, forecast),
      previous = COALESCE(excluded.previous, previous), move = COALESCE(excluded.move, move), dir = COALESCE(excluded.dir, dir),
      name = excluded.name, imp = excluded.imp, updated_at = datetime('now')`);
  let saved = 0;
  db.transaction(() => {
    (Array.isArray(events) ? events : []).slice(0, 3000).forEach((e) => {
      if (!Array.isArray(e) || e.length < 5) return;
      const ev = s(e[0], 20), t = n(e[1]), cur = s(e[2], 3).toUpperCase(), imp = n(e[4]);
      if (!/^\d+$/.test(ev) || !t || !/^[A-Z]{3}$/.test(cur) || !(imp >= 1 && imp <= 3)) return;
      const tm = Math.round(t) * 1000;
      if (tm < Date.now() - 800 * 864e5 || tm > Date.now() + 30 * 864e5) return;
      up.run({ id: `${ev}:${tm}`, event_id: ev, t: tm, cur, name: s(e[3], 90), imp, actual: n(e[5]), forecast: n(e[6]), previous: n(e[7]),
        unit: s(e[8], 6), move: n(e[9]) !== null && n(e[9]) >= 0 ? n(e[9]) : null, dir: n(e[10]) ? Math.sign(n(e[10])) : null });
      saved++;
    });
  })();
  return saved;
}

// catalysts for one trader: today and the rest of the week (7 days) for the currencies they trade, each with its history and their record
function catalysts(db, trades, { offset, nowUtc = Date.now() }) {
  const syms = [...new Set(trades.map((t) => t.symbol))];
  const curs = [...new Set(syms.flatMap(currenciesOf))];
  if (!curs.length) return { has: false, events: [] };
  const any = db.prepare('SELECT COUNT(*) AS n FROM news_events').get().n;
  if (!any) return { has: false, events: [] };
  const q = curs.map(() => '?').join(',');
  const nyNow = utcToNyMin(nowUtc);
  const dayStart = nowUtc - nyNow * 60000 - 60000;            // NY midnight, roughly
  const rows = db.prepare(`SELECT * FROM news_events WHERE t >= ? AND t < ? AND imp >= 2 AND cur IN (${q}) ORDER BY t, imp DESC`)
    .all(dayStart, dayStart + 7 * 864e5, ...curs);
  const hist = db.prepare('SELECT t, actual, forecast, move, dir FROM news_events WHERE event_id = ? AND t < ? AND actual IS NOT NULL ORDER BY t DESC LIMIT 8');
  // the trader's trades in UTC
  const tUtc = trades.map((t) => ({ t, at: nyToUtc((Number.isFinite(t.o) ? t.o : t.c) - offset * 3600e3) }));
  const events = rows.slice(0, 40).map((e) => {
    const h = hist.all(e.event_id, Math.min(e.t, nowUtc) + (e.actual !== null ? 1 : 0)).reverse();
    const past = db.prepare('SELECT t FROM news_events WHERE event_id = ? AND t < ?').all(e.event_id, nowUtc).map((x) => x.t);
    const near = tUtc.filter((x) => past.some((pt) => Math.abs(x.at - pt) <= 15 * 60000)).map((x) => x.t);
    const moves = h.filter((x) => x.move !== null);
    const beat = h.filter((x) => x.forecast !== null && x.actual > x.forecast && x.dir);
    return {
      id: e.id, t: e.t, nyMin: utcToNyMin(e.t), day: Math.floor((e.t - dayStart) / 864e5), cur: e.cur, name: e.name, imp: e.imp,
      actual: e.actual, forecast: e.forecast, previous: e.previous, unit: e.unit, released: e.actual !== null || e.t <= nowUtc,
      hist: h.map((x) => [x.actual, x.forecast]),
      move: moves.length ? moves.reduce((s, x) => s + x.move, 0) / moves.length : null, bigMove: moves.length ? Math.max(...moves.map((x) => x.move)) : null,
      beatUp: beat.filter((x) => x.dir > 0).length, beatN: beat.length,
      you: near.length ? { n: near.length, net: near.reduce((s, t) => s + t.net, 0), r: near.filter((t) => t.r !== null).reduce((s, t) => s + t.r, 0), hasR: near.some((t) => t.r !== null) } : null,
    };
  });
  return { has: true, events, curs };
}

module.exports = { save, catalysts, currenciesOf, nyToUtc, utcToNyMin };
