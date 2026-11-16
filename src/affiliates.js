// Public profile pages (5abifx.com/@name) and the affiliate program.
//
// Profile: off by default. The member picks a username, short bio, social links and which trades show
// ("Add to my page" on a trade). Account numbers, broker and email are never shown. Money can be hidden
// (cards then show R and % only). The page has a "Join with my link" button = the member's referral link.
//
// Affiliates: every member's referral link (/r/CODE or their public page) is remembered for AFF cookie days.
// A friend who signs up through it gets the friend discount on their first payment (src/referrals.js).
// Every EA plan payment the friend makes (Stripe or Admin "Mark as paid") earns the affiliate a % of what was
// paid; the friend's first mentorship payment earns a flat amount. Commissions count after the hold days
// (refunds / chargebacks), and the owner pays them by hand from Admin > Affiliates ("Mark paid").
// Rates live in the settings table so the owner can change them in Admin.
const { esc, fmtDate } = require('./views');

const DEFAULTS = { aff_ea_pct: 20, aff_mentor_flat: 200, aff_min_payout: 50, aff_hold_days: 14, aff_cookie_days: 60 };
const SOCIALS = [
  ['ig', 'Instagram', (v) => `https://instagram.com/${v}`],
  ['x', 'X', (v) => `https://x.com/${v}`],
  ['fb', 'Facebook', (v) => `https://facebook.com/${v}`],
  ['yt', 'YouTube', (v) => `https://youtube.com/@${v}`],
  ['dc', 'Discord', (v) => `https://discord.gg/${v}`],
];
const SOC_SVG = {
  ig: '<path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0 8.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4zM17.3 5.5a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4zM12 2c-2.7 0-3 0-4.1.1-4 .2-5.6 1.8-5.8 5.8C2 9 2 9.3 2 12s0 3 .1 4.1c.2 4 1.8 5.6 5.8 5.8 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c4-.2 5.6-1.8 5.8-5.8.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c-.2-4-1.8-5.6-5.8-5.8C15 2 14.7 2 12 2zm0 1.8c2.7 0 3 0 4 .1 2.9.1 3.9 1.2 4.1 4.1.1 1 .1 1.3.1 4s0 3-.1 4c-.1 2.9-1.2 3.9-4.1 4.1-1 .1-1.3.1-4 .1s-3 0-4-.1c-2.9-.1-3.9-1.2-4.1-4.1-.1-1-.1-1.3-.1-4s0-3 .1-4C4 5 5.1 4 8 3.9c1-.1 1.3-.1 4-.1z"/>',
  x: '<path d="M17.8 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.3L5.6 21h-3l7.1-8.1L2.2 3h6.2l4.3 5.7L17.8 3zm-1 16.2h1.7L7.3 4.7H5.5l11.3 14.5z"/>',
  fb: '<path d="M14 8V6.3c0-.8.2-1.3 1.4-1.3H17V2h-2.6C11.3 2 10 3.6 10 6.2V8H8v3h2v11h4V11h2.6L17 8h-3z"/>',
  yt: '<path d="M23 7.2a3 3 0 00-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 001 7.2 31 31 0 00.5 12a31 31 0 00.5 4.8 3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1 31 31 0 00.5-4.8 31 31 0 00-.5-4.8zM9.7 15V9l5.8 3-5.8 3z"/>',
  dc: '<path d="M19.6 5.3A16.6 16.6 0 0015.5 4l-.5 1a15 15 0 00-6 0l-.5-1a16.6 16.6 0 00-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7A16.7 16.7 0 006.5 19l1.1-1.7c-.6-.2-1.2-.5-1.7-.8l.4-.3a11.9 11.9 0 0011.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 005.1-2.4c.4-4.3-.6-8-3-11.4zM8.7 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/>',
};
const money = (n) => `$${(Math.round(Number(n || 0) * 100) / 100).toFixed(2)}`;
const cleanHandle = (h) => {
  const s = String(h || '').trim().replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/.test(s) && !/\.\./.test(s) ? s : null;
};
// social links: keep only the username / invite code, never a full URL from the form
const cleanSocial = (k, v) => {
  let s = String(v || '').trim();
  if (k === 'dc') s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?(discord\.gg|discord\.com\/invite)\//i, '');
  else s = s.replace(/^https?:\/\/(www\.)?[^/]+\//i, '').replace(/^@+/, '');
  s = s.split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9._-]{1,40}$/.test(s) ? s : '';
};
// "Rajinder S." -> "Ra•••••" so affiliates never see the full name or email of people they brought
const maskName = (u) => {
  const n = String(u.name || String(u.email || '').split('@')[0] || 'Member').trim();
  return esc(n.slice(0, 2)) + '•'.repeat(Math.max(2, Math.min(6, n.length - 2)));
};
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function setup(app, { db, page, flash, requireUser, requireAdmin, refs }) {
  const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const addU = (c, def) => { if (!ucols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`); };
  addU('handle', 'TEXT');
  addU('profile_on', 'INTEGER NOT NULL DEFAULT 0');
  addU('profile', "TEXT NOT NULL DEFAULT '{}'");          // JSON {name, bio, style, ig, x, fb, yt, dc, stats, money, join}
  addU('payout_method', "TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle COLLATE NOCASE)');
  if (!db.prepare('PRAGMA table_info(journal_trades)').all().some((c) => c.name === 'on_profile')) db.exec('ALTER TABLE journal_trades ADD COLUMN on_profile INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    affiliate_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    kind TEXT NOT NULL,                  -- ea | mentorship
    plan TEXT NOT NULL DEFAULT '',
    paid REAL,                           -- what the member paid (US$)
    amount REAL NOT NULL,                -- the affiliate's share (US$)
    status TEXT NOT NULL DEFAULT 'ok',   -- ok | void (refund, chargeback)
    payout_id INTEGER,
    ready_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_comm_aff ON commissions(affiliate_id)');
  db.exec(`CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, affiliate_id INTEGER NOT NULL, amount REAL NOT NULL,
    method TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE TABLE IF NOT EXISTS ref_clicks (user_id INTEGER NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))');
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  const getSetting = (k) => {
    const v = (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value;
    return v === undefined || v === '' || !Number.isFinite(Number(v)) ? DEFAULTS[k] : Number(v);
  };
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const rates = () => ({ ea: getSetting('aff_ea_pct'), mentor: getSetting('aff_mentor_flat'), min: getSetting('aff_min_payout'),
    hold: getSetting('aff_hold_days'), days: getSetting('aff_cookie_days'), friend: refs.discountPct() });

  const profileOf = (u) => { try { return { stats: 1, join: 1, money: 0, ...JSON.parse(u.profile || '{}') }; } catch { return { stats: 1, join: 1, money: 0 }; } };
  const site = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const shareLink = (req, u) => (u.handle && u.profile_on ? `${site(req)}/@${u.handle}` : `${site(req)}/r/${refs.ensureCode(u)}`);

  // ---------- commissions (called by applyPaid and the mentorship payment) ----------
  const addCommission = (member, kind, plan, paid, amount) => {
    amount = Math.round(amount * 100) / 100;
    if (!(amount > 0)) return '';
    const aff = db.prepare('SELECT id, email, handle, status FROM users WHERE id = ?').get(member.referred_by);
    if (!aff || aff.status === 'disabled' || aff.id === member.id) return '';
    db.prepare("INSERT INTO commissions (affiliate_id, member_id, kind, plan, paid, amount, ready_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))")
      .run(aff.id, member.id, kind, plan || '', paid, amount, `+${Math.max(0, Math.round(rates().hold))} days`);
    return ` Affiliate ${aff.handle ? '@' + aff.handle : aff.email} earns ${money(amount)}.`;
  };
  const onEaPaid = (member, amount, planId) => (member && member.referred_by && amount > 0 ? addCommission(member, 'ea', planId, amount, amount * rates().ea / 100) : '');
  const onMentorPaid = (member, planId) => (member && member.referred_by ? addCommission(member, 'mentorship', planId, null, rates().mentor) : '');

  // money owed to an affiliate: counted, not refunded, not paid yet
  const owedRows = () => db.prepare(`SELECT c.affiliate_id AS id, SUM(c.amount) AS owed, COUNT(DISTINCT c.member_id) AS members, u.email, u.handle, u.payout_method
      FROM commissions c JOIN users u ON u.id = c.affiliate_id
      WHERE c.status = 'ok' AND c.payout_id IS NULL AND c.ready_at <= datetime('now') GROUP BY c.affiliate_id ORDER BY owed DESC`).all();

  // ---------- link visits ----------
  const countClick = (req, uid) => {
    req.session.refSeen = req.session.refSeen || [];
    if (req.session.refSeen.includes(uid) || (req.user && req.user.id === uid)) return;
    req.session.refSeen = [...req.session.refSeen.slice(-20), uid];
    db.prepare("INSERT INTO ref_clicks (user_id, day, n) VALUES (?, date('now'), 1) ON CONFLICT(user_id, day) DO UPDATE SET n = n + 1").run(uid);
  };
  const remember = (req, res, u) => {
    const code = refs.ensureCode(u);
    if (req.user) return;   // members are already signed up
    req.session.ref = code;
    res.cookie('ref', code, { maxAge: Math.max(1, rates().days) * 864e5, httpOnly: true, sameSite: 'lax', secure: req.secure });
    countClick(req, u.id);
  };
  refs.onVisit((req, res, u) => remember(req, res, u));
  refs.setRateText(() => `You earn <b>${rates().ea}%</b> of every plan payment they make, every month.`);   // /r/CODE also counts and sets the long cookie

  // ---------- public page ----------
  app.get('/@:handle', (req, res, next) => {
    const h = cleanHandle(req.params.handle);
    const u = h && db.prepare("SELECT * FROM users WHERE handle = ? COLLATE NOCASE AND profile_on = 1 AND status != 'disabled'").get(h);
    if (!u) return next();
    if (u.handle !== req.params.handle) return res.redirect(301, `/@${u.handle}`);
    remember(req, res, u);
    const p = profileOf(u);
    const hidden = db.prepare('SELECT account_number FROM journal_hidden WHERE user_id = ?').all(u.id).map((r) => r.account_number);
    const notHidden = hidden.length ? `AND account_number NOT IN (${hidden.map(() => '?').join(',')})` : '';
    const st = db.prepare(`SELECT COUNT(*) AS n, SUM(net > 0) AS wins, AVG(r) AS avg_r, MIN(close_time) AS first FROM journal_trades WHERE user_id = ? ${notHidden}`).get(u.id, ...hidden);
    const trades = db.prepare(`SELECT symbol, side, r, pct, net, currency, close_time, entry, exit, candles FROM journal_trades
      WHERE user_id = ? AND on_profile = 1 ${notHidden} ORDER BY close_time DESC LIMIT 24`).all(u.id, ...hidden).map((t) => {
      let c = []; try { c = JSON.parse(t.candles || '[]'); } catch { /* bad json */ }
      return { s: t.symbol, d: t.side, r: t.r, p: t.pct, m: p.money ? t.net : null, cur: t.currency || '', t: (t.close_time || '').slice(0, 10), e: t.entry, x: t.exit,
        c: c.slice(-48).map((k) => [k[1], k[2], k[3], k[4]]) };
    });
    const name = (p.name || '').trim() || '@' + u.handle;
    const initials = (p.name || u.handle).replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '5';
    const url = `${site(req)}/@${u.handle}`;
    const joinUrl = `/r/${refs.ensureCode(u)}?to=signup`;
    const socials = SOCIALS.filter(([k]) => p[k]).map(([k, label, link]) => `<a class="soc" href="${esc(link(p[k]))}" target="_blank" rel="noopener nofollow" aria-label="${label}"><svg viewBox="0 0 24 24">${SOC_SVG[k]}</svg></a>`).join('');
    const winRate = st.n ? Math.round(100 * (st.wins || 0) / st.n) : null;
    const since = new Date(String(u.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const fr = rates().friend;
    const desc = (p.bio || `${name} shares their trades on 5ABI.FX.`).slice(0, 160);
    const json = JSON.stringify(trades).replace(/</g, '\\u003c');
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} (@${esc(u.handle)}) · 5ABI.FX</title>
<meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#050507">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile"><meta property="og:site_name" content="5ABI.FX">
<meta property="og:title" content="${esc(name)} · trades on 5ABI.FX"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(site(req))}/og.png?v=3">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/profile.css">
</head><body class="pf">
<header class="pf-top"><a class="pf-brand" href="/"><img src="/logo.png" alt="" width="34" height="21"><span>5ABI<b>.FX</b></span></a>
${req.user ? (req.user.id === u.id ? '<a class="pf-ghost" href="/profile">Edit my page</a>' : '<a class="pf-ghost" href="/dashboard">My account</a>') : `<a class="pf-ghost" href="${joinUrl}">Join</a>`}</header>
<main class="pf-wrap">
  <div class="pf-cover"><canvas data-cover="${u.id}"></canvas></div>
  <div class="pf-who"><div class="pf-av">${esc(initials)}</div><div class="pf-name"><h1>${esc(name)}</h1><div class="pf-muted">@${esc(u.handle)}</div></div></div>
  <div class="pf-chips">${st.n ? '<span class="pf-chip"><svg viewBox="0 0 24 24" fill="none" stroke="#26c6a0" stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Trades synced from MT5</span>' : ''}${p.style ? `<span class="pf-chip">${esc(p.style)}</span>` : ''}<span class="pf-chip">Member since ${esc(since)}</span></div>
  ${p.bio ? `<p class="pf-bio">${esc(p.bio)}</p>` : ''}
  <div class="pf-row"><div class="pf-socials">${socials}</div>
    <div class="pf-share"><button type="button" class="pf-ghost" data-share="${esc(url)}" data-title="${esc(name)} on 5ABI.FX">Share page ↗</button>
      <a class="pf-ghost pf-ico" href="https://x.com/intent/post?url=${encodeURIComponent(url)}" target="_blank" rel="noopener" aria-label="Share on X"><svg viewBox="0 0 24 24">${SOC_SVG.x}</svg></a>
      <a class="pf-ghost pf-ico" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener" aria-label="Share on Facebook"><svg viewBox="0 0 24 24">${SOC_SVG.fb}</svg></a></div></div>
  ${p.stats && st.n ? `<div class="pf-glass pf-stats">
    <div><b>${winRate}%</b><span>Win rate</span></div>
    <div><b class="${st.avg_r >= 0 ? 'up' : 'down'}">${st.avg_r == null ? '–' : `${st.avg_r >= 0 ? '+' : ''}${st.avg_r.toFixed(2)}R`}</b><span>Average per trade</span></div>
    <div><b>${st.n}</b><span>Trades logged</span></div>
    <div><b>${trades.length}</b><span>Shared here</span></div></div>` : ''}
  <div class="pf-h"><h2>Shared trades</h2><span class="pf-muted">Every trade comes from MT5, not typed in</span></div>
  ${trades.length ? '<div class="pf-cards" id="pf-cards"></div>' : '<p class="pf-muted pf-empty">No trades shared yet.</p>'}
  ${p.join ? `<div class="pf-glass pf-join"><div><h3>Trade with the same tools</h3><p class="pf-muted">KATANA risk manager and the auto journal.${fr ? ` ${fr}% off your first payment with ${esc(p.name ? p.name.split(' ')[0] : '@' + u.handle)}'s link.` : ''}</p></div>
    <a class="pf-pill" href="${joinUrl}">Join with my link <span>→</span></a></div>` : ''}
  <footer class="pf-foot"><span>5abifx.com/@${esc(u.handle)}</span><span>Account details hidden · <a href="/">5ABI.FX</a></span></footer>
</main>
<script id="pf-data" type="application/json">${json}</script>
<script src="/profile.js"></script>
</body></html>`);
  });

  // ---------- member: page settings ----------
  app.get('/profile', requireUser, (req, res) => {
    const u = req.user;
    const p = profileOf(u);
    const suggest = cleanHandle((u.name || u.email.split('@')[0]).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 18)) || '';
    const shared = db.prepare('SELECT id, symbol, side, r, pct, close_time FROM journal_trades WHERE user_id = ? AND on_profile = 1 ORDER BY close_time DESC LIMIT 24').all(u.id);
    const sw = (name, on, title, sub) => `<label class="mp-row"><span><b>${title}</b><small>${sub}</small></span><input type="checkbox" class="mp-sw" name="${name}" value="1"${on ? ' checked' : ''}></label>`;
    const input = (name, label, val, opts = {}) => `<label class="mp-field"><span>${label}</span><span class="mp-inp">${opts.pre ? `<i>${opts.pre}</i>` : ''}<input name="${name}" value="${esc(val || '')}" maxlength="${opts.max || 40}"${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ''}></span></label>`;
    page(req, res, 'My public page', `<link rel="stylesheet" href="/affiliate.css">
<div class="mp">
  <div class="mp-head"><div><h1>Your public page</h1><p class="muted">Off until you turn it on. Only what you pick here is shown.</p></div>
    ${u.profile_on && u.handle ? `<a class="btn" href="/@${esc(u.handle)}" target="_blank" rel="noopener">Open my page ↗</a>` : ''}</div>
  <form method="post" action="/profile" class="mp-grid">
    <section class="mp-glass">
      ${sw('on', u.profile_on, 'Public page', u.handle ? `5abifx.com/@${esc(u.handle)}` : 'Pick a username first')}
      ${input('handle', 'Username', u.handle || suggest, { pre: '5abifx.com/@', max: 24 })}
      <div class="mp-2">${input('name', 'Display name', p.name, { ph: 'Shown on your page', max: 40 })}${input('style', 'Trading style', p.style, { ph: 'e.g. Intraday · Gold', max: 30 })}</div>
      <label class="mp-field"><span>Short bio</span><span class="mp-inp"><textarea name="bio" maxlength="200" rows="3" placeholder="One or two lines about how you trade">${esc(p.bio || '')}</textarea></span></label>
      <div class="mp-2">${input('ig', 'Instagram', p.ig, { pre: '@' })}${input('x', 'X', p.x, { pre: '@' })}${input('fb', 'Facebook', p.fb, { pre: 'facebook.com/' })}${input('yt', 'YouTube', p.yt, { pre: '@' })}</div>
      ${input('dc', 'Discord invite', p.dc, { pre: 'discord.gg/' })}
    </section>
    <div class="mp-col">
      <section class="mp-glass">
        <h2>What people see</h2>
        ${sw('stats', p.stats, 'Stats', 'Win rate, average R, trades logged')}
        ${sw('money', p.money, 'Show money', 'Off = cards show R and % only, never $')}
        ${sw('join', p.join, '"Join with my link" button', 'Your affiliate link, with your friend\'s discount')}
        <p class="mp-lock"><span class="up">●</span> Always hidden: account numbers, broker and email. Accounts you hid in the journal are left out too.</p>
      </section>
      <section class="mp-glass">
        <h2>On your page <small class="muted">${shared.length} trade${shared.length === 1 ? '' : 's'}</small></h2>
        ${shared.length ? shared.map((t) => `<div class="mp-mini"><span><b>${esc(t.symbol)} ${esc(t.side === 'BUY' ? 'Buy' : 'Sell')}</b> <span class="${t.r >= 0 || (t.r == null && t.pct >= 0) ? 'up' : 'down'}">${t.r != null ? `${t.r >= 0 ? '+' : ''}${t.r.toFixed(1)}R` : t.pct != null ? `${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(2)}%` : ''}</span><small>${esc(fmtDate(t.close_time).slice(0, 10))}</small></span>
          <button class="small secondary" formaction="/journal/${t.id}/profile" name="off" value="1">Remove</button></div>`).join('')
        : '<p class="muted">Open any trade in your journal and press <b>Add to my page</b>.</p>'}
      </section>
      <button class="btn">Save my page</button>
    </div>
  </form>
</div>`);
  });

  app.post('/profile', requireUser, (req, res) => {
    const u = req.user;
    const b = req.body;
    const p = { name: String(b.name || '').trim().slice(0, 40), style: String(b.style || '').trim().slice(0, 30), bio: String(b.bio || '').trim().replace(/\s+/g, ' ').slice(0, 200),
      stats: b.stats ? 1 : 0, money: b.money ? 1 : 0, join: b.join ? 1 : 0 };
    for (const [k] of SOCIALS) p[k] = cleanSocial(k, b[k]);
    let handle = u.handle;
    if (String(b.handle || '').trim()) {
      const h = cleanHandle(b.handle);
      if (!h) { flash(req, 'error', 'Username: 3 to 24 letters, numbers, dots or underscores.'); return res.redirect('/profile'); }
      if (h !== (u.handle || '').toLowerCase() && db.prepare('SELECT 1 FROM users WHERE handle = ? COLLATE NOCASE AND id != ?').get(h, u.id)) {
        flash(req, 'error', `@${h} is taken. Try another username.`); return res.redirect('/profile');
      }
      handle = h;
    }
    const on = b.on && handle ? 1 : 0;
    db.prepare('UPDATE users SET handle = ?, profile_on = ?, profile = ? WHERE id = ?').run(handle || null, on, JSON.stringify(p), u.id);
    flash(req, 'ok', on ? `Saved. Your page is live at 5abifx.com/@${handle}` : b.on ? 'Pick a username to turn your page on.' : 'Saved. Your page is off.');
    res.redirect('/profile');
  });

  // "Add to my page" / "Remove" on a trade
  app.post('/journal/:id/profile', requireUser, (req, res) => {
    const t = db.prepare('SELECT id, on_profile FROM journal_trades WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (t) db.prepare('UPDATE journal_trades SET on_profile = ? WHERE id = ?').run(req.body.off ? 0 : 1, t.id);
    if (t && !req.body.off) flash(req, 'ok', req.user.profile_on ? 'Added to your public page.' : 'Added. Turn your public page on in My page to show it.');
    res.redirect(req.body.back === 'trade' ? `/journal/${t ? t.id : ''}` : '/profile');
  });
  // the trade page box
  const tradeBox = (u, t) => `<form method="post" action="/journal/${t.id}/profile" class="row pf-add">
      <input type="hidden" name="back" value="trade">${t.on_profile ? '<input type="hidden" name="off" value="1">' : ''}
      <span class="muted">${t.on_profile ? '✓ On your public page.' : 'Show this trade on your public page.'} ${u.handle && u.profile_on ? `<a href="/@${esc(u.handle)}" target="_blank" rel="noopener">5abifx.com/@${esc(u.handle)}</a>` : '<a href="/profile">Set up my page</a>'}</span>
      <button class="small ${t.on_profile ? 'secondary' : ''}">${t.on_profile ? 'Remove from my page' : 'Add to my page'}</button></form>`;

  // ---------- member: affiliate dashboard ----------
  app.get('/affiliate', requireUser, (req, res) => {
    const u = req.user;
    const R = rates();
    const code = refs.ensureCode(u);
    const link = shareLink(req, u);
    const people = db.prepare(`SELECT u.id, u.name, u.email, u.plan, u.mentor_plan, u.trial, u.expires_at, u.created_at,
        (SELECT COALESCE(SUM(amount), 0) FROM commissions c WHERE c.member_id = u.id AND c.affiliate_id = ? AND c.status = 'ok') AS earned
      FROM users u WHERE u.referred_by = ? ORDER BY u.created_at DESC LIMIT 200`).all(u.id, u.id);
    const live = (p) => p.mentor_plan || (p.plan && (!p.expires_at || p.expires_at > sqlNow()));
    const paying = people.filter(live).length;
    const visits = db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM ref_clicks WHERE user_id = ? AND day >= date('now', '-30 days')").get(u.id).n;
    const month = db.prepare("SELECT COALESCE(SUM(amount), 0) AS a, COUNT(*) AS n FROM commissions WHERE affiliate_id = ? AND status = 'ok' AND created_at >= date('now', 'start of month')").get(u.id);
    const ready = db.prepare("SELECT COALESCE(SUM(amount), 0) AS a FROM commissions WHERE affiliate_id = ? AND status = 'ok' AND payout_id IS NULL AND ready_at <= datetime('now')").get(u.id).a;
    const waiting = db.prepare("SELECT COALESCE(SUM(amount), 0) AS a FROM commissions WHERE affiliate_id = ? AND status = 'ok' AND payout_id IS NULL AND ready_at > datetime('now')").get(u.id).a;
    const pays = db.prepare('SELECT * FROM payouts WHERE affiliate_id = ? ORDER BY created_at DESC LIMIT 24').all(u.id);
    const planTag = (p) => (p.mentor_plan ? '<span class="tag ok">Mentorship</span>' : live(p) ? `<span class="tag ok">${esc(require('./plans').getPlan(p.plan) ? require('./plans').getPlan(p.plan).name : 'Paid')}</span>` : p.trial ? '<span class="tag warn">Free trial</span>' : '<span class="tag">No plan yet</span>');
    const pct = (a, b) => (b ? `${Math.round(100 * a / b)}%` : '–');
    page(req, res, 'Affiliate', `<link rel="stylesheet" href="/affiliate.css">
<div class="mp">
  <section class="mp-glass af-hero">
    <div><h1>Put 5ABI.FX in your bio.<br><em>Get paid every month.</em></h1>
      <p>Earn a share of what the people you bring pay, every month they stay. Your friends get money off too.</p>
      <button type="button" class="pf-pill" data-copy="${esc(link)}">Copy my link <span>→</span></button></div>
    <div class="mp-glass af-rate">
      <small>Your rate</small>
      <div class="af-tiers"><div><b>${R.ea}%</b><span>of every EA plan payment, every month</span></div><div><b>$${R.mentor}</b><span>for each mentorship they buy</span></div><div><b>$${R.min}</b><span>paid out once you reach it</span></div></div>
      <div class="af-code"><span><small>Your link</small><b>${esc(link.replace(/^https?:\/\//, ''))}</b></span><button type="button" class="small secondary" data-copy="${esc(link)}">Copy</button></div>
      ${R.friend ? `<div class="af-code"><span><small>What your friends get</small><b>${R.friend}% off</b> <span class="muted">their first payment, applied by itself</span></span></div>` : ''}
      ${u.profile_on ? '' : '<p class="muted small">Want a page with your trades behind the link? <a href="/profile">Set up My page</a>.</p>'}
    </div>
  </section>
  <div class="af-kpis">
    <div class="mp-glass"><small>Link visits</small><b>${visits}</b><small>last 30 days</small></div>
    <div class="mp-glass"><small>Signed up</small><b>${people.length}</b><small>${pct(people.length, visits)} of visits</small></div>
    <div class="mp-glass"><small>Paying now</small><b>${paying}</b><small>${pct(paying, people.length)} of sign-ups</small></div>
    <div class="mp-glass"><small>Earned this month</small><b class="up">${money(month.a)}</b><small>from ${month.n} payment${month.n === 1 ? '' : 's'}</small></div>
    <div class="mp-glass"><small>Ready to pay out</small><b>${money(ready)}</b><small>${waiting > 0 ? `+${money(waiting)} counting soon` : ready >= R.min ? 'Paid early next month' : `Paid once it reaches $${R.min}`}</small></div>
  </div>
  <div class="mp-grid">
    <section class="mp-glass">
      <h2>People you brought</h2>
      ${people.length ? `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Plan</th><th>Joined</th><th class="r">You earned</th></tr></thead><tbody>
        ${people.map((p) => `<tr><td>${maskName(p)}</td><td>${planTag(p)}</td><td>${esc(fmtDate(p.created_at).slice(0, 10))}</td><td class="r ${p.earned > 0 ? 'up' : 'muted'}">${money(p.earned)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Nobody yet. Share your link in your bio, on your trade cards or in Discord.</p>'}
      <p class="muted small">Names are cut short for their privacy. A payment counts ${R.hold} days after it is made, so refunds and chargebacks don't pay out.</p>
    </section>
    <section class="mp-glass">
      <h2>Payouts</h2>
      <form method="post" action="/affiliate/payout" class="mp-field"><span>Pay me by</span>
        <span class="mp-inp"><input name="payout_method" value="${esc(u.payout_method)}" maxlength="120" placeholder="e.g. Interac e-Transfer · you@email.com"></span>
        <small class="muted">Interac e-Transfer, PayPal or Wise, with the email or username to send to.</small>
        <button class="small">Save</button></form>
      ${pays.length ? `<div class="table-wrap"><table><thead><tr><th>Paid on</th><th class="r">Amount</th><th>To</th></tr></thead><tbody>
        ${pays.map((p) => `<tr><td>${esc(fmtDate(p.created_at).slice(0, 10))}</td><td class="r">${money(p.amount)}</td><td class="muted">${esc(p.method)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payouts yet.</p>'}
    </section>
  </div>
  <div class="af-how">
    <div class="mp-glass"><b>Share your link</b><span class="muted">Put it in your Instagram, X or Discord bio. Your public page carries it too.</span></div>
    <div class="mp-glass"><b>They join</b><span class="muted">Anyone who signs up within ${R.days} days of opening your link is yours. Their discount is applied by itself.</span></div>
    <div class="mp-glass"><b>You get paid</b><span class="muted">Every payment they make adds your share. Paid once a month when you pass $${R.min}.</span></div>
  </div>
</div>
<script src="/affiliate.js"></script>`);
  });

  app.post('/affiliate/payout', requireUser, (req, res) => {
    db.prepare('UPDATE users SET payout_method = ? WHERE id = ?').run(String(req.body.payout_method || '').trim().slice(0, 120), req.user.id);
    flash(req, 'ok', 'Payout details saved.');
    res.redirect('/affiliate');
  });

  // ---------- admin ----------
  app.get('/admin/affiliates', requireAdmin, (req, res) => {
    const R = rates();
    const owed = owedRows();
    const total = owed.filter((o) => o.owed >= R.min).reduce((s, o) => s + o.owed, 0);
    const recent = db.prepare(`SELECT c.*, m.email AS m_email, a.email AS a_email, a.handle AS a_handle FROM commissions c
      LEFT JOIN users m ON m.id = c.member_id LEFT JOIN users a ON a.id = c.affiliate_id ORDER BY c.id DESC LIMIT 60`).all();
    const top = db.prepare(`SELECT a.id, a.email, a.handle, COUNT(*) AS n, SUM(m.plan != '' OR m.mentor_plan != '') AS paid,
        (SELECT COALESCE(SUM(amount), 0) FROM commissions c WHERE c.affiliate_id = a.id AND c.status = 'ok') AS earned
      FROM users m JOIN users a ON a.id = m.referred_by GROUP BY a.id ORDER BY earned DESC, n DESC LIMIT 50`).all();
    const who = (id, email, handle) => `<a href="/admin/users/${id}">${handle ? '@' + esc(handle) : esc(email || 'deleted user')}</a>`;
    const num = (name, label, val, unit, pre) => `<label class="mp-field"><span>${label}</span><span class="mp-inp">${pre ? `<i>${pre}</i>` : ''}<input name="${name}" value="${val}" inputmode="decimal">${unit ? `<i>${unit}</i>` : ''}</span></label>`;
    page(req, res, 'Affiliates', `<link rel="stylesheet" href="/affiliate.css">
<div class="mp">
  <form method="post" action="/admin/affiliates/settings" class="mp-glass">
    <div class="mp-head"><h1>Affiliates</h1><button class="small">Save settings</button></div>
    <div class="af-set">
      ${num('aff_ea_pct', 'Share of EA plan payments', R.ea, '%')}
      ${num('aff_mentor_flat', 'Per mentorship sale', R.mentor, '', '$')}
      ${num('aff_friend_pct', 'Friend\'s discount on first payment', R.friend, '%')}
      ${num('aff_min_payout', 'Minimum payout', R.min, '', '$')}
      ${num('aff_hold_days', 'Hold before it counts', R.hold, 'days')}
      ${num('aff_cookie_days', 'Link remembers a visitor for', R.days, 'days')}
    </div>
    <p class="muted small">Mentorship students already get their EA discount on every payment, so a referral discount never stacks on top of it. The affiliate still earns their share. Changes apply to new payments only.</p>
  </form>
  <section class="mp-glass">
    <div class="mp-head"><h2>To pay now</h2><b>${money(total)}</b></div>
    ${owed.length ? `<div class="table-wrap"><table><thead><tr><th>Affiliate</th><th>Pay by</th><th class="r">Members</th><th class="r">Owed</th><th></th></tr></thead><tbody>
      ${owed.map((o) => `<tr><td>${who(o.id, o.email, o.handle)}</td><td class="muted">${esc(o.payout_method || 'not set yet')}</td><td class="r">${o.members}</td><td class="r">${money(o.owed)}${o.owed < R.min ? ` <small class="muted">under $${R.min}</small>` : ''}</td>
        <td class="r"><form method="post" action="/admin/affiliates/${o.id}/paid" class="inline"><button class="small">Mark ${money(o.owed)} paid</button></form></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Nothing to pay right now.</p>'}
    <p class="muted small">Send the money yourself (e-Transfer, PayPal, Wise), then press Mark paid. The affiliate sees it under Payouts.</p>
  </section>
  <section class="mp-glass">
    <h2>Latest commissions</h2>
    ${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Member</th><th>For</th><th class="r">Paid</th><th>Affiliate</th><th class="r">Share</th><th>Status</th><th></th></tr></thead><tbody>
      ${recent.map((c) => `<tr><td>${esc(fmtDate(c.created_at).slice(0, 10))}</td><td>${c.m_email ? `<a href="/admin/users/${c.member_id}">${esc(c.m_email)}</a>` : 'deleted'}</td><td>${esc(c.kind === 'mentorship' ? 'Mentorship' : (require('./plans').getPlan(c.plan) || {}).name || 'EA plan')}</td>
        <td class="r">${c.paid == null ? '–' : money(c.paid)}</td><td>${who(c.affiliate_id, c.a_email, c.a_handle)}</td><td class="r ${c.status === 'void' ? 'down' : ''}">${money(c.amount)}</td>
        <td>${c.status === 'void' ? '<span class="tag">Refunded</span>' : c.payout_id ? '<span class="tag ok">Paid out</span>' : c.ready_at > sqlNow() ? `<span class="tag warn">Counts ${esc(c.ready_at.slice(0, 10))}</span>` : '<span class="tag ok">Ready</span>'}</td>
        <td>${c.status === 'ok' && !c.payout_id ? `<form method="post" action="/admin/affiliates/c/${c.id}/void" class="inline"><button class="small secondary" title="The member was refunded or charged back">Refunded</button></form>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">No commissions yet. They appear here by themselves when someone who joined through a link pays.</p>'}
  </section>
  <section class="mp-glass">
    <h2>Affiliates</h2>
    ${top.length ? `<div class="table-wrap"><table><thead><tr><th>Affiliate</th><th class="r">Signed up</th><th class="r">Paid</th><th class="r">Earned so far</th></tr></thead><tbody>
      ${top.map((t) => `<tr><td>${who(t.id, t.email, t.handle)}</td><td class="r">${t.n}</td><td class="r">${t.paid || 0}</td><td class="r">${money(t.earned)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nobody has joined through a link yet.</p>'}
  </section>
</div>`);
  });

  app.post('/admin/affiliates/settings', requireAdmin, (req, res) => {
    const lim = { aff_ea_pct: [0, 90], aff_mentor_flat: [0, 5000], aff_friend_pct: [0, 90], aff_min_payout: [0, 10000], aff_hold_days: [0, 120], aff_cookie_days: [1, 365] };
    for (const [k, [lo, hi]] of Object.entries(lim)) {
      const v = Number(String(req.body[k] ?? '').replace(/[^0-9.]/g, ''));
      if (String(req.body[k] ?? '').trim() !== '' && Number.isFinite(v)) setSetting(k, Math.min(hi, Math.max(lo, Math.round(v * 100) / 100)));
    }
    flash(req, 'ok', 'Affiliate settings saved.');
    res.redirect('/admin/affiliates');
  });

  app.post('/admin/affiliates/:id/paid', requireAdmin, (req, res) => {
    const a = db.prepare('SELECT id, email, payout_method FROM users WHERE id = ?').get(Number(req.params.id));
    if (a) {
      db.transaction(() => {
        const ids = db.prepare("SELECT id, amount FROM commissions WHERE affiliate_id = ? AND status = 'ok' AND payout_id IS NULL AND ready_at <= datetime('now')").all(a.id);
        const sum = Math.round(ids.reduce((s, c) => s + c.amount, 0) * 100) / 100;
        if (!ids.length) return;
        const p = db.prepare('INSERT INTO payouts (affiliate_id, amount, method) VALUES (?, ?, ?)').run(a.id, sum, a.payout_method || '');
        db.prepare(`UPDATE commissions SET payout_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(Number(p.lastInsertRowid), ...ids.map((c) => c.id));
        flash(req, 'ok', `${money(sum)} marked as paid to ${a.email}.`);
      })();
    }
    res.redirect('/admin/affiliates');
  });

  app.post('/admin/affiliates/c/:id/void', requireAdmin, (req, res) => {
    db.prepare("UPDATE commissions SET status = 'void' WHERE id = ? AND payout_id IS NULL").run(Number(req.params.id));
    flash(req, 'ok', 'Commission removed (refund).');
    res.redirect('/admin/affiliates');
  });

  // admin user page line
  const adminNote = (u) => {
    const s = db.prepare("SELECT COUNT(*) AS n FROM users WHERE referred_by = ?").get(u.id).n;
    if (!s && !u.handle) return '';
    const e = db.prepare("SELECT COALESCE(SUM(amount), 0) AS a FROM commissions WHERE affiliate_id = ? AND status = 'ok'").get(u.id).a;
    return `<p class="muted">${u.handle ? `Public page: <a href="/@${esc(u.handle)}" target="_blank" rel="noopener">@${esc(u.handle)}</a>${u.profile_on ? '' : ' (off)'} · ` : ''}Brought ${s} member${s === 1 ? '' : 's'} · earned ${money(e)} · <a href="/admin/affiliates">Affiliates</a></p>`;
  };

  return { onEaPaid, onMentorPaid, tradeBox, adminNote, rates, shareLink };
}

module.exports = { setup, cleanHandle, cleanSocial };
