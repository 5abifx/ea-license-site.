// Visitors on the Admin sales dashboard: who comes, from where, on what, and which post brought them.
// Each counted visit (src/sales.js trackVisits) also keeps the device (phone / tablet / PC), the campaign
// (?utm_campaign=...) and the country. The country comes from the visitor's browser time zone, sent once
// by a tiny script; no IP address is stored. Filters combine: period, source, page, device, country, new or returning.
const { esc } = require('./views');

const deviceOf = (ua) => (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua) ? 'tablet' : /mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua) ? 'phone' : 'pc');
const DEV = { phone: 'Phone', tablet: 'Tablet', pc: 'PC' };
// in-app browsers often hide the link they came from, but name themselves in the user agent
function appOf(ua) {
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok|Bytedance/i.test(ua)) return 'tiktok';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  if (/LinkedInApp/i.test(ua)) return 'linkedin';
  if (/Twitter/i.test(ua)) return 'x';
  return '';
}
const cleanCmp = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);

// IANA time zone -> country (the common ones for this audience; others fall back to their region)
const TZ = {
  Canada: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/Regina', 'America/St_Johns', 'America/Montreal', 'America/Moncton', 'America/Whitehorse', 'America/Yellowknife', 'America/Iqaluit', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Swift_Current', 'America/Dawson_Creek', 'America/Fort_Nelson', 'America/Cambridge_Bay', 'America/Inuvik', 'America/Rankin_Inlet', 'America/Resolute', 'America/Atikokan', 'America/Nipigon', 'America/Thunder_Bay', 'America/Rainy_River', 'America/Creston', 'America/Dawson'],
  India: ['Asia/Kolkata', 'Asia/Calcutta'],
  USA: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Detroit', 'America/Boise', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville', 'Pacific/Honolulu', 'America/Juneau', 'America/Menominee', 'America/Adak'],
  UK: ['Europe/London', 'Europe/Belfast'], Ireland: ['Europe/Dublin'], Australia: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Hobart', 'Australia/Darwin'],
  'New Zealand': ['Pacific/Auckland'], UAE: ['Asia/Dubai'], 'Saudi Arabia': ['Asia/Riyadh'], Qatar: ['Asia/Qatar'], Kuwait: ['Asia/Kuwait'], Pakistan: ['Asia/Karachi'], Nepal: ['Asia/Kathmandu', 'Asia/Katmandu'],
  Bangladesh: ['Asia/Dhaka'], 'Sri Lanka': ['Asia/Colombo'], Singapore: ['Asia/Singapore'], Malaysia: ['Asia/Kuala_Lumpur'], Indonesia: ['Asia/Jakarta'], Philippines: ['Asia/Manila'], Thailand: ['Asia/Bangkok'],
  'Hong Kong': ['Asia/Hong_Kong'], Japan: ['Asia/Tokyo'], China: ['Asia/Shanghai'], Germany: ['Europe/Berlin'], France: ['Europe/Paris'], Italy: ['Europe/Rome'], Spain: ['Europe/Madrid'], Netherlands: ['Europe/Amsterdam'],
  Portugal: ['Europe/Lisbon'], Poland: ['Europe/Warsaw'], Switzerland: ['Europe/Zurich'], Turkey: ['Europe/Istanbul'], Cyprus: ['Asia/Nicosia', 'Europe/Nicosia'], Nigeria: ['Africa/Lagos'], 'South Africa': ['Africa/Johannesburg'],
  Kenya: ['Africa/Nairobi'], Ghana: ['Africa/Accra'], Egypt: ['Africa/Cairo'], Morocco: ['Africa/Casablanca'], Brazil: ['America/Sao_Paulo'], Mexico: ['America/Mexico_City'], Argentina: ['America/Argentina/Buenos_Aires'], Colombia: ['America/Bogota'],
};
const TZ_MAP = Object.fromEntries(Object.entries(TZ).flatMap(([c, l]) => l.map((z) => [z, c])));
function countryOf(tz) {
  const z = String(tz || '').slice(0, 60);
  if (TZ_MAP[z]) return TZ_MAP[z];
  const region = z.split('/')[0];
  return { Europe: 'Europe (other)', Asia: 'Asia (other)', Africa: 'Africa (other)', America: 'Americas (other)', Australia: 'Australia', Pacific: 'Pacific (other)' }[region] || '';
}

// the small script that sends the browser's time zone once per visitor session
const TZ_BEACON = `<script>(function(){try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z&&navigator.sendBeacon)navigator.sendBeacon('/api/vtz',new Blob([z],{type:'text/plain'}));}catch(e){}})();</script>`;

function routes(app, { db, express }) {
  app.post('/api/vtz', express.text({ limit: '200b' }), (req, res) => {
    try {
      const vid = req.session && req.session.vid;
      const ctry = countryOf(typeof req.body === 'string' ? req.body.trim() : '');
      if (vid && ctry && !req.session.ctry) {
        req.session.ctry = ctry;
        db.prepare("UPDATE visits SET ctry = ? WHERE vid = ? AND ctry = ''").run(ctry, vid);
      }
    } catch (e) { console.error('vtz:', e.message); }
    res.status(204).end();
  });
}

// ---- the dashboard section ----
const COLORS = ['#ff5a1f', '#7c86ff', '#2fd3b4', '#f5a524', '#e8e8ea', '#f04a4a', '#c084fc'];
function section(db, { q, from, days, srcLabel, TRACKED }) {
  const f = { s: q.vs, pg: q.vp, d: q.vd, c: q.vc, n: q.vn };
  const fromDay = days ? from.slice(0, 10) : '0000';
  const chartFrom = days ? fromDay : new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10);
  const where = ['v.day >= ?'], args = [fromDay];
  if (f.s !== undefined && f.s !== '') { where.push('v.src = ?'); args.push(f.s === '-' ? '' : f.s); }
  if (f.pg) { where.push('v.path = ?'); args.push(f.pg); }
  if (f.d) { where.push('v.dev = ?'); args.push(f.d); }
  if (f.c) { where.push('v.ctry = ?'); args.push(f.c === '-' ? '' : f.c); }
  // new = first ever visit inside the period; returning = came on 2 or more days
  if (f.n === 'new') where.push('(SELECT MIN(day) FROM visits x WHERE x.vid = v.vid) >= ?'), args.push(fromDay);
  if (f.n === 'ret') where.push('(SELECT COUNT(DISTINCT day) FROM visits x WHERE x.vid = v.vid) >= 2');
  const W = where.join(' AND ');
  const count = (extra = '', a = []) => db.prepare(`SELECT COUNT(DISTINCT v.vid) AS n FROM visits v WHERE ${W}${extra}`).get(...args, ...a).n;
  const total = count();
  const by = (col) => db.prepare(`SELECT ${col} AS k, COUNT(DISTINCT v.vid) AS n FROM visits v WHERE ${W} GROUP BY ${col} ORDER BY n DESC`).all(...args);
  const bySrc = by('v.src'), byDev = by('v.dev'), byCtry = by('v.ctry'), byPage = by('v.path');
  // daily chart, stacked by source (top 6, the rest as Other)
  const top = bySrc.slice(0, 6).map((r) => r.k);
  const daily = db.prepare(`SELECT v.day AS d, v.src AS s, COUNT(DISTINCT v.vid) AS n FROM visits v WHERE ${W} AND v.day >= ? GROUP BY v.day, v.src`).all(...args, chartFrom);
  const dayList = []; for (let t = Date.parse(chartFrom + 'T00:00:00Z'); t <= Date.now(); t += 864e5) dayList.push(new Date(t).toISOString().slice(0, 10));
  const grid = Object.fromEntries(dayList.map((d) => [d, {}]));
  daily.forEach((r) => { if (!grid[r.d]) return; const k = top.includes(r.s) ? r.s : '~other'; grid[r.d][k] = (grid[r.d][k] || 0) + r.n; });
  const keys = [...top, ...(daily.some((r) => !top.includes(r.s)) ? ['~other'] : [])];
  const col = (k) => (k === '~other' ? '#55555d' : COLORS[top.indexOf(k) % COLORS.length]);
  const lab = (k) => (k === '~other' ? 'Other' : srcLabel(k));
  const mx = Math.max(1, ...dayList.map((d) => Object.values(grid[d]).reduce((a, b) => a + b, 0)));
  const busiest = dayList.reduce((b, d) => { const n = Object.values(grid[d]).reduce((a, x) => a + x, 0); return n > b.n ? { d, n } : b; }, { d: '', n: 0 });
  const CW = 900, CH = 180, bw = CW / dayList.length;
  let svg = `<svg class="vz-chart" viewBox="0 0 ${CW} ${CH + 18}" preserveAspectRatio="none" role="img" aria-label="Visitors per day by source">`;
  [0.25, 0.5, 0.75].forEach((g) => { svg += `<line x1="0" x2="${CW}" y1="${(CH * g).toFixed(1)}" y2="${(CH * g).toFixed(1)}" class="g"/>`; });
  dayList.forEach((d, i) => {
    let y = CH; const tot = Object.values(grid[d]).reduce((a, b) => a + b, 0);
    keys.forEach((k) => { const n = grid[d][k] || 0; if (!n) return; const h = (n / mx) * (CH - 6); y -= h;
      svg += `<rect x="${(i * bw + bw * 0.12).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw * 0.76).toFixed(1)}" height="${h.toFixed(1)}" fill="${col(k)}"><title>${d} · ${esc(lab(k))}: ${n} (day total ${tot})</title></rect>`; });
    if (i % Math.ceil(dayList.length / 8) === 0) svg += `<text x="${(i * bw).toFixed(1)}" y="${CH + 14}" class="t">${d.slice(5).replace('-', '/')}</text>`;
  });
  svg += '</svg>';
  // campaigns: visitors, sign-ups and paid per source + campaign
  const camp = db.prepare(`SELECT v.src AS s, v.cmp AS c, COUNT(DISTINCT v.vid) AS n FROM visits v WHERE ${W} GROUP BY v.src, v.cmp ORDER BY n DESC LIMIT 30`).all(...args);
  const signRows = db.prepare(`SELECT source AS s, campaign AS c, COUNT(*) AS n, SUM(CASE WHEN plan != '' OR mentor_plan != '' THEN 1 ELSE 0 END) AS paid
    FROM users WHERE is_admin = 0 AND created_at >= ? GROUP BY source, campaign`).all(days ? from : '0000');
  const sk = (s, c) => `${s}|${c}`, signs = Object.fromEntries(signRows.map((r) => [sk(r.s, r.c), r]));
  const opt = (name, cur, list, all) => `<select name="${name}" aria-label="${all}" onchange="this.form.submit()"><option value="">${all}</option>${list.map(([v, l]) => `<option value="${esc(v)}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const allSrc = db.prepare('SELECT DISTINCT src FROM visits').all().map((r) => r.src);
  const allCtry = db.prepare("SELECT DISTINCT ctry FROM visits WHERE ctry != '' ORDER BY ctry").all().map((r) => r.ctry);
  const bars = (rows, name) => { const m = Math.max(1, ...rows.map((r) => r.n)); return rows.length ? rows.slice(0, 7).map((r) => `<div class="vz-b"><span>${esc(name(r.k))}</span><span class="vz-t"><i style="width:${Math.round((r.n / m) * 100)}%"></i></span><b>${total ? Math.round((r.n / total) * 100) : 0}%</b></div>`).join('') : '<p class="muted small">No visits yet.</p>'; };
  const anyFilter = ['vs', 'vp', 'vd', 'vc', 'vn'].some((k) => q[k]);
  return `<section class="card" id="visitors">
    <div class="row between"><h2>Visitors</h2><span class="muted small">Signed-out visitors on Home, Mentorship, Pricing, Sign up and Sign in. No IP addresses stored.</span></div>
    <form method="get" action="/admin/sales#visitors" class="vz-filters">
      <input type="hidden" name="p" value="${esc(q.p || 'all')}">
      ${opt('vs', f.s, allSrc.map((s) => [s || '-', srcLabel(s)]), 'All sources')}
      ${opt('vp', f.pg, Object.entries(TRACKED), 'All pages')}
      ${opt('vd', f.d, Object.entries(DEV), 'Phone, tablet and PC')}
      ${opt('vc', f.c, [...allCtry.map((c) => [c, c]), ['-', 'Unknown']], 'All countries')}
      ${opt('vn', f.n, [['new', 'New visitors'], ['ret', 'Returning visitors']], 'New and returning')}
      ${anyFilter ? `<a class="small" href="/admin/sales?p=${esc(q.p || 'all')}#visitors">Clear filters</a>` : ''}
      <noscript><button class="small">Apply</button></noscript>
    </form>
    <div class="stats vz-kpis">
      <div><span>Visitors</span><strong>${total}</strong></div>
      <div><span>On a phone</span><strong>${total ? Math.round(((byDev.find((r) => r.k === 'phone') || { n: 0 }).n / total) * 100) : 0}%</strong></div>
      <div><span>Top source</span><strong class="sm">${bySrc[0] ? esc(srcLabel(bySrc[0].k)) : '-'}</strong></div>
      <div><span>Busiest day</span><strong class="sm">${busiest.n ? `${busiest.d.slice(5).replace('-', '/')} · ${busiest.n}` : '-'}</strong></div>
    </div>
    <div class="vz-chartbox">
      <div class="row between"><span class="small muted">Visitors per day${days ? '' : ' · last 90 days'}</span><span class="vz-leg">${keys.map((k) => `<span><i style="background:${col(k)}"></i>${esc(lab(k))}</span>`).join('')}</span></div>
      ${svg}
    </div>
    <div class="vz-three">
      <div><h3>Device</h3>${bars(byDev, (k) => DEV[k] || 'Unknown')}</div>
      <div><h3>Country</h3>${bars(byCtry, (k) => k || 'Unknown')}</div>
      <div><h3>Page</h3>${bars(byPage, (k) => TRACKED[k] || k)}</div>
    </div>
    <div class="sd-scroll"><table class="vz-camp"><thead><tr><th>Source</th><th>Campaign</th><th class="right">Visitors</th><th class="right">Sign-ups</th><th class="right">Paid</th><th class="right">Sign-up rate</th></tr></thead><tbody>
      ${camp.map((r) => { const g = signs[sk(r.s, r.c)] || { n: 0, paid: 0 }; return `<tr><td>${esc(srcLabel(r.s))}</td><td class="muted">${r.c ? esc(r.c) : '-'}</td><td class="right">${r.n}</td><td class="right">${g.n || '-'}</td><td class="right">${g.paid || '-'}</td><td class="right">${g.n ? ((g.n / r.n) * 100).toFixed(1) + '%' : '-'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">No visits counted yet.</td></tr>'}
    </tbody></table></div>
    <p class="muted small">Tag each post so it gets its own row: <code>5abifx.com/?utm_source=instagram&amp;utm_campaign=reel-nov10</code>. Instagram, Facebook and TikTok are recognised by themselves even when the app hides the link. The country comes from the visitor's time zone.</p>
  </section>`;
}

module.exports = { deviceOf, appOf, cleanCmp, countryOf, TZ_BEACON, routes, section };
