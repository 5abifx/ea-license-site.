// Guided first run after sign-up (Google or email): one question per screen, a "trader file" filling in beside it,
// a with-vs-without risk screen, then the card step when the trial needs a card. Answers live in users.profile (JSON),
// can be changed on /profile, and feed the journal: the name, the prop firm guard of new accounts, the goal on Insights.
const { esc } = require('./views');

const Q = [
  { id: 'style', k: 'Style', h: 'How do you trade?', opts: [
    ['scalp', 'Scalping', 'bolt', 'In and out in minutes'], ['day', 'Day trading', 'clock', 'Flat before the session ends'],
    ['swing', 'Swing', 'wave', 'Holds for days'], ['position', 'Position', 'mount', 'Holds for weeks']] },
  { id: 'market', k: 'Market', h: 'What do you trade most?', multi: 1, hint0: 'Pick all that apply.', opts: [
    ['gold', 'Gold', 'gold', 'XAUUSD'], ['forex', 'Forex', 'fx', 'EURUSD, GBPUSD and friends'], ['indices', 'Indices', 'idx', 'NAS100, US30, GER40'],
    ['futures', 'Futures', 'fut', 'NQ, ES, GC on a futures broker'], ['crypto', 'Crypto', 'btc', 'BTC, ETH'], ['other', 'Other', 'dots', 'Anything else']] },
  { id: 'edge', k: 'Edge', h: "What's your edge?", opts: [
    ['pa', 'Price action', 'cand', 'Candles, levels, structure'], ['ict', 'ICT / SMC', 'ict', 'Liquidity, order blocks, BOS'],
    ['flow', 'Volume & order flow', 'bar', 'Footprint, profile, heatmap'], ['breakout', 'Breakout', 'brk', 'Trade the range break'],
    ['own', 'My own', 'pen', 'Your own rules'], ['learning', 'Still learning', 'q', 'No fixed setup yet']] },
  { id: 'acct', k: 'Account', h: 'Whose money are you trading?', opts: [
    ['eval', 'Prop firm challenge', 'eval', 'Passing an evaluation'], ['funded', 'Funded account', 'fund', 'Already passed, now paid out'],
    ['own', 'My own account', 'shield', 'Personal capital'], ['both', 'Both', 'both', 'Prop and personal'], ['demo', 'Demo for now', 'no', 'Practising first']] },
  { id: 'goal', k: 'Here to', h: 'What are you here to do?', opts: [
    ['pass', 'Pass a prop eval', 'eval', 'Hit target, never touch the limits'], ['consistency', 'Find consistency', 'tgt', 'Same process every day'],
    ['revenge', 'Stop revenge trading', 'fire', 'No second trade out of anger'], ['grow', 'Grow my account', 'up', 'Steady compounding'],
    ['discipline', 'Build discipline', 'anchor', 'Rules before feelings'], ['track', 'Track performance', 'chart', 'Know your real numbers'],
    ['fulltime', 'Go full-time', 'star', 'Trading as the job']] },
  { id: 'pain', k: 'Biggest leak', h: 'What hurts your account <em>most</em>?', opts: [
    ['size', 'Risking too much', 'fire', 'One trade wipes a week'], ['stop', 'Moving my stop', 'pen', 'Hoping it comes back'],
    ['over', 'Too many trades', 'bar', 'Overtrading on slow days'], ['nojournal', 'Not journaling', 'chart', 'Same mistakes repeat'],
    ['unsure', 'Not sure', 'q', 'That is what the journal will show']] },
];
// prop firms: keys match src/desk.js FIRMS so the guard can be filled in
const FIRMS = [['fundednext', 'FundedNext'], ['ftmo', 'FTMO'], ['fundingpips', 'FundingPips'], ['the5ers', 'The5ers'], ['other', 'Other']];
const PROP = ['eval', 'funded', 'both'];
// what the goal means on Insights
const GOAL_TIP = {
  pass: 'Watch the Prop firm tab first: the daily limit matters more than the target.',
  consistency: 'Look at your Edge score week by week, not single days.',
  revenge: 'Check the leak list for trades taken soon after a loss.',
  grow: 'Keep risk per trade flat and let the edge compound.',
  discipline: 'One rule at a time: start with this week\'s focus.',
  track: 'Your real numbers are below. Review them every weekend.',
  fulltime: 'Full-time needs steady months: watch your worst week, not your best day.',
};

function clean(raw) {
  const out = {};
  Q.forEach((q) => {
    const keys = q.opts.map((o) => o[0]);
    const v = raw[q.id];
    if (q.multi) {
      const l = [].concat(v || []).flatMap((x) => String(x).split(',')).filter((x) => keys.includes(x));
      if (l.length) out[q.id] = [...new Set(l)];
    } else if (keys.includes(String(v))) out[q.id] = String(v);
  });
  if (PROP.includes(out.acct) && FIRMS.some((f) => f[0] === raw.firm)) out.firm = String(raw.firm);
  return out;
}
const read = (u) => { try { return JSON.parse(u.profile || '{}') || {}; } catch (e) { return {}; } };
const label = (id, v) => {
  if (id === 'firm') return (FIRMS.find((f) => f[0] === v) || [])[1] || '';
  const q = Q.find((x) => x.id === id);
  return [].concat(v || []).map((k) => (q.opts.find((o) => o[0] === k) || [])[1]).filter(Boolean).join(', ');
};

module.exports = function onboard(app, { db, page, flash, requireUser, stripe, trialDays }) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('profile')) db.exec("ALTER TABLE users ADD COLUMN profile TEXT NOT NULL DEFAULT '{}'");   // onboarding answers (JSON)
  // 0 = new sign-up, show the guided set-up once; 1 = done or skipped. Members from before this feature count as done.
  if (!cols.includes('onboard')) db.exec('ALTER TABLE users ADD COLUMN onboard INTEGER NOT NULL DEFAULT 1');

  // new sign-ups land in the set-up the first time they reach the dashboard
  // (once per session, so nobody gets stuck: the set-up stays open at /start until it is finished or skipped)
  app.get('/dashboard', (req, res, next) => {
    const u = req.user;
    if (!u || u.onboard !== 0 || u.status !== 'active' || u.is_admin || req.session.obShown) return next();
    req.session.obShown = 1;
    res.redirect('/start');
  });

  app.get('/start', requireUser, (req, res) => {
    const u = req.user;
    const needsCard = Boolean(stripe && stripe.on() && stripe.needsCardTrial(u));
    const data = { q: Q, firms: FIRMS, prop: PROP, a: read(u), name: String(u.name || '').trim().split(/\s+/)[0].slice(0, 30),
      google: Boolean(u.google_sub), card: needsCard ? trialDays() : 0, again: u.onboard === 1 };
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Set up your desk · 5ABI.FX</title><link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/onboard.css?v=1"></head><body>
<div class="top"><a class="brand" href="/dashboard"><img src="/logo.png" alt=""><span>5ABI<b>.</b>FX</span></a><button class="sk" data-skipall>Skip</button></div>
<div class="bar"><i id="pb"></i><b id="pt"></b><span class="burst" id="pbu"></span></div>
<div class="amb"><i></i><i></i><i></i></div>
<div class="wrap"><aside class="rec" id="rec"></aside><main class="q" id="q"></main></div>
<script id="ob-data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script src="/onboard.js?v=1"></script></body></html>`);
  });

  // saves answers; done=1 also ends the set-up (Skip saves what was answered so far)
  app.post('/start', requireUser, (req, res) => {
    const u = req.user;
    const prof = { ...read(u), ...clean(req.body) };
    if (req.body.reset) Q.forEach((q) => { if (!(q.id in clean(req.body))) delete prof[q.id]; });
    if (!PROP.includes(prof.acct)) delete prof.firm;
    const name = String(req.body.name || '').trim().slice(0, 80);
    db.prepare('UPDATE users SET profile = ?, name = CASE WHEN ? != \'\' THEN ? ELSE name END, onboard = CASE WHEN ? THEN 1 ELSE onboard END WHERE id = ?')
      .run(JSON.stringify(prof), name, name, req.body.done ? 1 : 0, u.id);
    if (req.get('accept') && req.get('accept').includes('json')) return res.json({ ok: true });
    res.redirect('/dashboard');
  });

  // Profile settings: the same answers as chips, all on one page
  app.get('/profile', requireUser, (req, res) => {
    const u = req.user, a = read(u);
    const chips = (q) => q.opts.map(([k, l]) => `<label class="pchip"><input type="${q.multi ? 'checkbox' : 'radio'}" name="${q.id}" value="${k}"${[].concat(a[q.id] || []).includes(k) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('');
    page(req, res, 'Profile', `
    <div class="row between page-head"><h1>Profile</h1><a class="btn small secondary" href="/start">Run the guided set-up again</a></div>
    <p class="muted">Your journal uses these answers: your name in greetings, your prop firm rules when you add an account, and your goal on Insights.</p>
    <form method="post" action="/start" class="card prof-form">
      <input type="hidden" name="done" value="1"><input type="hidden" name="reset" value="1">
      <label class="pq"><span class="pk">Name</span><input name="name" value="${esc(u.name || '')}" maxlength="80"></label>
      ${Q.map((q) => `<fieldset class="pq"><legend class="pk">${esc(q.k)}</legend><div class="pchips">${chips(q)}</div>
        ${q.id === 'acct' ? `<div class="pchips pfirm"><span class="muted small">Prop firm:</span>${FIRMS.map(([k, l]) => `<label class="pchip"><input type="radio" name="firm" value="${k}"${a.firm === k ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>` : ''}</fieldset>`).join('')}
      <button>Save profile</button>
    </form>
    <style>
      .prof-form{display:grid;gap:18px;max-width:760px}.pq{border:0;padding:0;margin:0;display:grid;gap:8px}.pk{font-size:13px;color:var(--muted,#8a8a94)}
      .pq input[name=name]{max-width:320px}.pchips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .pchip input{position:absolute;opacity:0;pointer-events:none}.pchip span{display:inline-block;padding:7px 13px;border-radius:10px;font-size:14px;cursor:pointer;
        background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.09);box-shadow:inset 0 1px 0 rgba(255,255,255,.12);color:#cfcfd6;transition:.15s}
      .pchip span:hover{color:#fff}.pchip input:checked+span{background:#fff;color:#000;border-color:#fff}.pchip input:focus-visible+span{outline:2px solid #ff5a1f}
      .pfirm{margin-top:4px}
    </style>`);
  });

  // a short line about the trader's goal, for the top of Insights
  const goalHtml = (u) => {
    const a = read(u);
    if (!a.goal) return '';
    return `<div class="card ins-goal"><span class="kicker">Your goal</span><p><strong>${esc(label('goal', a.goal))}.</strong> ${esc(GOAL_TIP[a.goal] || '')} <a href="/profile">Change</a></p></div>`;
  };

  // when a trader on a prop account adds their first MT5 account, fill in the firm's guard (they can edit it in Insights)
  const FIRM_RULES = require('./desk').FIRMS;
  const prefillProp = (u, accountId) => {
    const a = read(u);
    const f = FIRM_RULES[a.firm];
    if (!f || !PROP.includes(a.acct)) return;
    db.prepare(`UPDATE accounts SET prop_daily = ?, prop_max = ?, prop_target = ?, prop_firm = ?
      WHERE id = ? AND prop_daily IS NULL AND prop_max IS NULL AND prop_target IS NULL`).run(f.daily, f.max, a.acct === 'eval' ? f.target : null, a.firm, accountId);
  };

  return { goalHtml, prefillProp, read, label };
};
