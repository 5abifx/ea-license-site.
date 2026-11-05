// End-to-end smoke test: node test/smoke.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ealic-'));
process.env.SESSION_SECRET = 'test-secret-1234567890';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'adminpass123';
process.env.SIGNUP_MODE = 'approval';
process.env.TRIAL_DAYS = '0';          // trial is switched on further down
const app = require('../src/server');
const { db } = require('../src/db');

function client(base, ip) {
  let cookies = {};
  const go = async (method, url, body) => {
    const headers = { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (ip) headers['x-forwarded-for'] = ip;   // its own network, for the per-network limits
    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(body).toString();
    }
    const r = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); cookies[kv.slice(0, i)] = kv.slice(i + 1); }
    const text = await r.text();
    if (r.status === 302 || r.status === 303) {
      const loc = r.headers.get('location');
      if (loc.startsWith('/')) return go('GET', loc);
    }
    return { status: r.status, text, location: r.headers.get('location') };
  };
  return { get: (u) => go('GET', u), post: (u, b) => go('POST', u, b || {}) };
}

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const check = async (ea, acc) => (await fetch(`${base}/api/check?ea=${ea}&account=${acc}`)).json();
  try {
    const admin = client(base);
    let r = await admin.post('/login', { email: 'admin@test.com', password: 'adminpass123' });
    assert.match(r.text, /Users/);

    const fd = new FormData();
    fd.append('name', 'Gold Scalper'); fd.append('code', 'GOLD_SCALPER'); fd.append('version', '1.2');
    fd.append('active', '1'); fd.append('grant_all', '1');
    fd.append('file', new Blob(['FAKE-EX5']), 'GoldScalper.ex5');
    r = await admin.post('/admin/eas', fd);
    assert.match(r.text, /EA added/);

    r = await admin.post('/admin/users', { name: 'Bob', email: 'bob@test.com', password: 'bobpass123', max_accounts: '10', ea: '1' });
    assert.match(r.text, /User bob@test.com created/);

    const bob = client(base);
    r = await bob.post('/login', { email: 'bob@test.com', password: 'bobpass123' });
    assert.match(r.text, /Gold Scalper/);
    r = await bob.get('/download/1');
    assert.strictEqual(r.text, 'FAKE-EX5');
    // security headers, and a password change signs out other devices
    const hr = await fetch(base + '/login');
    assert.strictEqual(hr.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(hr.headers.get('x-content-type-options'), 'nosniff');
    const bob2 = client(base);
    await bob2.post('/login', { email: 'bob@test.com', password: 'bobpass123' });
    assert.match((await bob2.get('/dashboard')).text, /Gold Scalper/);
    r = await bob.post('/password', { current: 'bobpass123', password: 'bobnewpass1' });
    assert.match(r.text, /Other devices are signed out/);
    assert.doesNotMatch((await bob2.get('/dashboard')).text, /Gold Scalper/);
    assert.match((await bob.get('/dashboard')).text, /Gold Scalper/);
    await bob.post('/password', { current: 'bobnewpass1', password: 'bobpass123' });
    assert.match((await bob.get('/dashboard')).text, /Gold Scalper/);

    assert.strictEqual((await check('GOLD_SCALPER', '1001')).valid, false);
    for (let i = 0; i < 10; i++) await bob.post('/accounts', { account_number: String(1001 + i) });
    r = await bob.post('/accounts', { account_number: '9999' });
    assert.match(r.text, /maximum number of accounts|at most 10/);
    r = await bob.post('/accounts', { account_number: 'abc' });
    const c = await check('GOLD_SCALPER', '1001');
    assert.strictEqual(c.valid, true, JSON.stringify(c));
    assert.strictEqual((await check('GOLD_SCALPER', '9999')).valid, false);
    assert.strictEqual((await check('OTHER_EA', '1001')).valid, false);

    // pending signup cannot download or add accounts
    const eve = client(base);
    r = await eve.post('/signup', { name: 'Eve', email: 'eve@test.com', password: 'evepass123' });
    assert.match(r.text, /waiting for approval/);
    assert.strictEqual((await eve.get('/download/1')).status, 404);
    await eve.post('/accounts', { account_number: '5555' });
    assert.strictEqual((await check('GOLD_SCALPER', '5555')).valid, false);
    assert.strictEqual((await eve.get('/admin')).status, 404);

    // approve → access to all EAs
    r = await admin.get('/admin');
    const eveId = r.text.match(/\/admin\/users\/(\d+)\/approve/)[1];
    await admin.post(`/admin/users/${eveId}/approve`);
    await eve.post('/accounts', { account_number: '5555' });
    assert.strictEqual((await check('GOLD_SCALPER', '5555')).valid, true);

    // expiry and disable
    await admin.post(`/admin/users/${eveId}`, { name: 'Eve', status: 'active', max_accounts: '10', expires_at: '2020-01-01', ea: '1' });
    assert.strictEqual((await check('GOLD_SCALPER', '5555')).message, 'License expired');
    await admin.post(`/admin/users/${eveId}`, { name: 'Eve', status: 'disabled', max_accounts: '10', expires_at: '', ea: '1' });
    assert.strictEqual((await check('GOLD_SCALPER', '5555')).valid, false);
    assert.match((await eve.get('/dashboard')).text, /Sign in/);

    // free trial: instant access, one account, one trial per MT5 account, admin marks paid
    process.env.TRIAL_DAYS = '15';
    assert.match((await client(base).get('/')).text, /15-day free trial/);
    const tia = client(base);
    r = await tia.post('/signup', { name: 'Tia', email: 'tia@test.com', password: 'tiapass123' });
    assert.match(r.text, /Free trial: 15 days left/);
    await tia.post('/accounts', { account_number: '7777' });
    assert.strictEqual((await check('GOLD_SCALPER', '7777')).valid, true);
    r = await tia.post('/accounts', { account_number: '7778' });
    assert.match(r.text, /at most 1 accounts/);
    const tom = client(base);
    await tom.post('/signup', { name: 'Tom', email: 'tom@test.com', password: 'tompass123' });
    r = await tom.post('/accounts', { account_number: '7777' });
    assert.match(r.text, /already used a free trial/);
    r = await admin.get('/admin');
    const tiaId = r.text.match(/href="\/admin\/users\/(\d+)"><strong>Tia/)[1];
    await admin.post(`/admin/users/${tiaId}`, { name: 'Tia', status: 'active', max_accounts: '1', expires_at: '2020-01-01', ea: '1' });
    assert.match((await tia.get('/dashboard')).text, /free trial has ended/);
    assert.strictEqual((await check('GOLD_SCALPER', '7777')).valid, false);
    // pricing: trial-ended banner links to plans; picking a plan is saved for the admin
    assert.match((await tia.get('/dashboard')).text, /href="\/pricing">See plans/);
    r = await client(base).get('/pricing');
    assert.match(r.text, /Most popular/);
    assert.match(r.text, /data-billing="annual" hidden><b>\$15<\/b>/);
    assert.match((await client(base).get('/subscribe?plan=pro')).text, /free trial|Create your account/);   // signed out: sign up first
    r = await tia.get('/subscribe?plan=journal&billing=annual');
    assert.match(r.text, /Journal · Annual/);
    assert.match(r.text, /\$108 USD/);
    assert.match((await tia.post('/subscribe', { plan: 'journal', billing: 'annual' })).text, /accept the Terms of service/);   // no tick, no payment
    r = await tia.post('/subscribe', { plan: 'journal', billing: 'annual', agree: '1' });
    assert.match((await admin.get('/admin')).text, /wants a plan/);
    assert.match((await admin.get(`/admin/users/${tiaId}`)).text, /Requested on the site: <strong>Journal<\/strong>, annual/);
    // Journal plan: 1 account, only the JOURNAL EA, a year added
    r = await admin.post(`/admin/users/${tiaId}/paid`, { plan: 'journal', billing: 'annual' });
    assert.match(r.text, /marked as paid on Journal \(annual\)/);
    let tu = db.prepare('SELECT * FROM users WHERE id = ?').get(tiaId);
    assert.strictEqual(tu.max_accounts, 1);
    assert.strictEqual(tu.plan_request, '');
    assert.ok(Date.parse(tu.expires_at + 'Z') - Date.now() > 360 * 864e5);
    assert.strictEqual((await check('GOLD_SCALPER', '7777')).valid, false);       // not in the Journal plan
    // KATANA plan: every EA, 3 accounts
    r = await admin.post(`/admin/users/${tiaId}/paid`, { plan: 'katana', billing: 'monthly' });
    assert.match(r.text, /marked as paid/);
    assert.strictEqual(db.prepare('SELECT max_accounts FROM users WHERE id = ?').get(tiaId).max_accounts, 3);
    assert.strictEqual((await check('GOLD_SCALPER', '7777')).valid, true);
    assert.doesNotMatch((await tia.get('/dashboard')).text, /Free trial/);

    // referrals: friend signs up through Tia's link, gets 20% off the first payment, Tia gets 30 days when it is paid
    const refLink = (await tia.get('/dashboard')).text.match(/id="ref-link">https?:\/\/[^/]+(\/r\/[A-Z0-9]+)</)[1];
    const ria = client(base);
    await ria.get(refLink);
    assert.match((await ria.get('/pricing')).text, /Referral code [A-Z0-9]+/);
    await ria.post('/signup', { name: 'Ria', email: 'ria@test.com', password: 'secret123' });
    r = await ria.get('/subscribe?plan=katana&billing=monthly');
    assert.match(r.text, /20% off first payment/);
    assert.match(r.text, /\$16\.00 USD/);
    const riaId = db.prepare("SELECT id FROM users WHERE email = 'ria@test.com'").get().id;
    assert.match((await admin.get(`/admin/users/${riaId}`)).text, /Referred by .*tia/);
    const tiaExp = db.prepare('SELECT expires_at FROM users WHERE id = ?').get(tiaId).expires_at;
    r = await admin.post(`/admin/users/${riaId}/paid`, { plan: 'katana', billing: 'monthly' });
    assert.match(r.text, /got 30 free days/);
    const tiaExp2 = db.prepare('SELECT expires_at FROM users WHERE id = ?').get(tiaId).expires_at;
    assert.strictEqual(Math.round((Date.parse(tiaExp2 + 'Z') - Date.parse(tiaExp + 'Z')) / 864e5), 30);
    r = await admin.post(`/admin/users/${riaId}/paid`, { plan: 'katana', billing: 'monthly' });   // second payment: no new reward
    assert.doesNotMatch(r.text, /free days/);
    assert.doesNotMatch((await ria.get('/subscribe?plan=katana')).text, /off first payment/);
    assert.match((await tia.get('/dashboard')).text, /1 joined · 1 paid/);
    process.env.TRIAL_DAYS = '0';

    // public info pages, 404 and link preview tags
    const anon = client(base);
    for (const u of ['/faq', '/terms', '/privacy']) assert.strictEqual((await anon.get(u)).status, 200, u);
    r = await anon.get('/help/ea-blocked');
    assert.strictEqual(r.status, 200);
    assert.match(r.text, /AutoTrading disabled by server/);
    assert.match(r.text, /EA add-on/);
    r = await tia.get('/help/ea-blocked');
    assert.match(r.text, /<option value="7777" selected/);
    assert.match((await tia.get('/dashboard')).text, /help\/ea-blocked/);
    r = await anon.get('/no-such-page');
    assert.strictEqual(r.status, 404);
    assert.match(r.text, /doesn&#39;t exist|doesn't exist/);
    assert.match((await anon.get('/')).text, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/og\.png\?v=3"/);
    assert.match((await anon.get('/mentorship')).text, /property="og:image" content="[^"]+\/og-mentorship\.png\?v=3"/);
    assert.match((await fetch(base + '/robots.txt').then((x) => x.text())), /Disallow: \//);
    const robots = await fetch(base + '/robots.txt').then((x) => x.text());
    assert.match(robots, /User-agent: GPTBot\nDisallow: \//);                     // AI training bots stay out
    assert.match(robots, /User-agent: \*\nAllow: \/\$\nAllow: \/mentorship/);     // search and AI search bots read public pages
    assert.doesNotMatch(robots, /OAI-SearchBot|PerplexityBot/);

    // Sign in with Google: fake token endpoint returns an ID token for a verified Gmail address
    const http = require('http');
    let claims = {};
    const tokenSrv = http.createServer((q, s2) => {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      s2.setHeader('content-type', 'application/json');
      s2.end(JSON.stringify({ id_token: `${b64({ alg: 'RS256' })}.${b64(claims)}.sig` }));
    }).listen(0);
    Object.assign(process.env, { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_TOKEN_URL: `http://127.0.0.1:${tokenSrv.address().port}/token`, TRIAL_DAYS: '15' });
    const gUser = client(base);
    assert.match((await gUser.get('/signup')).text, /Start free trial with Google/);
    r = await gUser.post('/signup', { name: 'Fake', email: 'fake@test.com', password: 'fakepass123' });
    assert.match(r.text, /sign up with your Google account/);
    r = await gUser.get('/auth/google');
    assert.match(r.location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?.*client_id=cid/);
    const state = new URL(r.location).searchParams.get('state');
    r = await gUser.get(`/auth/google/callback?state=wrong&code=abc`);
    assert.match(r.text, /Google sign in failed/);
    await gUser.get('/auth/google');
    claims = { iss: 'https://accounts.google.com', aud: 'cid.apps.googleusercontent.com', sub: 'g-123', email: 'gina@gmail.com', email_verified: true, name: 'Gina', exp: Date.now() / 1000 + 600 };
    const st2 = new URL((await gUser.get('/auth/google')).location).searchParams.get('state');
    r = await gUser.get(`/auth/google/callback?state=${st2}&code=abc`);
    assert.match(r.text, /Free trial: 15 days left/);
    assert.match(r.text, /Welcome, Gina/);
    // signing in again with the same Google account reuses the account, no new trial
    const gAgain = client(base);
    const st3 = new URL((await gAgain.get('/auth/google')).location).searchParams.get('state');
    r = await gAgain.get(`/auth/google/callback?state=${st3}&code=abc`);
    assert.match(r.text, /Welcome, Gina/);
    assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'gina@gmail.com'").get().n, 1);
    // wrong audience is rejected
    claims = { ...claims, aud: 'someone-else', sub: 'g-999', email: 'x@gmail.com' };
    const gBad = client(base);
    const st4 = new URL((await gBad.get('/auth/google')).location).searchParams.get('state');
    assert.match((await gBad.get(`/auth/google/callback?state=${st4}&code=abc`)).text, /Google sign in failed/);
    assert.ok(state);
    tokenSrv.close();
    for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_TOKEN_URL']) delete process.env[k];
    process.env.TRIAL_DAYS = '0';

    // cross-site post blocked
    const xr = await fetch(base + '/accounts', { method: 'POST', headers: { origin: 'https://evil.com' } });
    assert.strictEqual(xr.status, 403);

    // ---------- trade journal ----------
    const fdj = new FormData();
    fdj.append('name', 'Trade Journal'); fdj.append('code', 'JOURNAL'); fdj.append('version', '1.0'); fdj.append('active', '1');
    r = await admin.post('/admin/eas', fdj);
    assert.match(r.text, /EA added/);
    assert.doesNotMatch((await bob.get('/dashboard')).text, /href="\/journal"/);   // not licensed yet
    assert.match((await bob.get('/journal')).text, /not part of your license/);
    r = await admin.get('/admin');
    const bobId = r.text.match(/\/admin\/users\/(\d+)">\s*<strong>Bob/)?.[1] || r.text.match(/href="\/admin\/users\/(\d+)"><strong>Bob/)[1];
    await admin.post(`/admin/users/${bobId}`, [['name', 'Bob'], ['status', 'active'], ['max_accounts', '10'], ['expires_at', ''], ['ea', '1'], ['ea', '2']]);
    r = await bob.get('/journal');
    assert.match(r.text, /No trades yet/);
    const key = r.text.match(/<code class="block" data-key="([0-9a-f]{32})">/)[1];

    const send = (body) => fetch(`${base}/api/journal/trades`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const trade = { position_id: '777', symbol: 'XAUUSD', side: 'BUY', lots: 0.5, entry: 2641.2, exit: 2668.9, sl: 2631.2, tp: 2668.9, digits: 2,
      open_time: '2026-10-28T14:32:00', close_time: '2026-10-28T16:05:00', profit: 1390, commission: -5, swap: 0, net: 1385,
      pips: 277, r: 2.77, risk_money: 500, risk_pct: 1, pct: 2.77, tf: 'M5',
      partials: [{ time: '2026-10-28T15:12:00', price: 2655, lots: 0.25, profit: 345 }, { time: '2026-10-28T16:05:00', price: 2668.9, lots: 0.25, profit: 1045 }],
      candles: [[1793197800, 2640, 2642, 2639, 2641.5], [1793198100, 2641.5, 2650, 2641, 2649]] };
    let jr = await send({ key: 'wrong', account: '1001', trade });
    assert.strictEqual(jr.status, 403);
    jr = await send({ key, account: '424242', trade });
    assert.strictEqual(jr.status, 403);                        // account not registered
    jr = await send({ key, account: '1001', currency: 'USD', trade });
    assert.strictEqual(jr.status, 200, await jr.text());
    jr = await send({ key, account: '1001', currency: 'USD', trade: { ...trade, net: 1390 } });   // resend updates, no duplicate
    assert.strictEqual(jr.status, 200);
    r = await bob.get('/journal');
    assert.match(r.text, /XAUUSD/);
    assert.strictEqual((r.text.match(/href="\/journal\/\d+"/g) || []).length, 1);
    const tid = r.text.match(/href="\/journal\/(\d+)"/)[1];
    r = await bob.post(`/journal/${tid}`, { setup: 'London breakout', emotion: 'Calm', rating: '5', notes: 'Clean <b>setup</b>' });
    assert.match(r.text, /Notes saved/);
    assert.match(r.text, /Clean &lt;b&gt;setup&lt;\/b&gt;/);
    assert.match(r.text, /"partials":\[\{"time":"2026-10-28T15:12:00"/);          // final close is not a partial
    assert.strictEqual((await eve.get(`/journal/${tid}`)).status !== 200 || !(await eve.get(`/journal/${tid}`)).text.includes('XAUUSD'), true);

    // Mentor Mode: only students; Bob shares, asks about a trade, the mentor replies, Bob sees the reply
    assert.doesNotMatch((await bob.get(`/journal/${tid}`)).text, /Mentor review/);     // not a student
    assert.strictEqual((await bob.post(`/journal/${tid}/note`, { body: 'hi' })).status, 404);
    db.prepare("UPDATE users SET student = 1 WHERE email = 'bob@test.com'").run();
    r = await bob.get(`/journal/${tid}`);
    assert.match(r.text, /Share my journal with my mentor/);
    assert.strictEqual((await admin.get(`/mentor/trade/${tid}`)).status, 404);          // not shared yet
    await bob.post('/journal/mentor/share', { share: '1', back: `/journal/${tid}` });
    r = await bob.post(`/journal/${tid}/note`, { body: 'Was my <stop> too tight?' });
    assert.match(r.text, /Sent to your mentor/);
    assert.match(r.text, /Waiting for your mentor/);
    r = await admin.get('/mentor');
    assert.match(r.text, /Was my &lt;stop&gt; too tight\?/);
    assert.match(r.text, /<em class="count">1<\/em>/);
    r = await admin.get(`/mentor/trade/${tid}`);
    assert.match(r.text, /London breakout/);
    assert.match(r.text, /Account ••01/);
    assert.doesNotMatch(r.text, /Account 1001/);
    r = await admin.post(`/mentor/trade/${tid}/note`, { body: 'Stop was fine, entry was early.' });
    assert.match(r.text, /Sent\. The student sees it/);
    assert.doesNotMatch((await admin.get('/mentor')).text, /<em class="count">/);
    r = await bob.get('/journal/mentor');
    assert.match(r.text, /1 new from mentor/);
    assert.match(r.text, /<em class="count">1<\/em>/);
    r = await bob.get(`/journal/${tid}`);
    assert.match(r.text, /Stop was fine, entry was early\./);
    assert.doesNotMatch((await bob.get('/journal/mentor')).text, /new from mentor/);   // read now
    assert.strictEqual((await bob.post(`/mentor/trade/${tid}/note`, { body: 'x' })).status, 404);   // students cannot post as mentor
    await bob.post('/journal/mentor/share', { share: '0' });
    assert.strictEqual((await admin.get(`/mentor/trade/${tid}`)).status, 404);          // stopped sharing
    db.prepare("UPDATE users SET student = 0 WHERE email = 'bob@test.com'").run();

    // insights: locked under 10 trades, then a revenge-trade pattern shows up
    assert.match((await bob.get('/journal')).text, /Insights unlock after 10 closed trades\. 1 so far/);
    for (let i = 0; i < 6; i++) {
      const d = String(10 + i).padStart(2, '0');
      await send({ key, account: '1001', currency: 'USD', trade: { position_id: `L${i}`, symbol: 'EURUSD', side: 'SELL', lots: 1, net: -100, r: -1, open_time: `2026-10-${d}T18:00:00`, close_time: `2026-10-${d}T18:40:00` } });
      await send({ key, account: '1001', currency: 'USD', trade: { position_id: `R${i}`, symbol: 'EURUSD', side: 'SELL', lots: 1, net: -50, r: -0.5, open_time: `2026-10-${d}T18:45:00`, close_time: `2026-10-${d}T19:00:00` } });
    }
    r = await bob.get('/journal');
    assert.match(r.text, /<b>6 revenge trades<\/b>/);
    assert.match(r.text, /Last 90 days · 13 trades/);
    assert.match(r.text, /Edge score/);
    assert.match(r.text, /href="\/journal\/insights"/);
    // full Insights page: score, focus, leaks with a Fix line, charts, prop firm guard per account
    r = await bob.get('/journal/insights');
    assert.match(r.text, /<b>6 revenge trades<\/b>/);
    assert.match(r.text, /This week's focus/);
    assert.match(r.text, /class="fix"/);
    assert.match(r.text, /Equity and drawdown/);
    assert.match(r.text, /Pick one account above/);
    r = await bob.get('/journal/insights?account=1001&days=all');
    assert.match(r.text, /All time/);
    assert.match(r.text, /Prop firm guard/);
    r = await bob.post('/journal/insights/limits', { account: '1001', daily: '5', max: '10', target: '8', start: '10000' });
    assert.match(r.text, /Prop firm limits saved/);
    assert.match(r.text, /Worst day <b>−[\d.]+%<\/b>/);
    assert.match(r.text, /Set KATANA&#39;s daily loss limit to 3%/);
    r = await eve.post('/journal/insights/limits', { account: '1001', daily: '1' });
    assert.doesNotMatch(r.text, /Prop firm limits saved/);
    for (let i = 0; i < 6; i++) for (const p of ['L', 'R']) assert.ok(db.prepare("DELETE FROM journal_trades WHERE position_id = ?").run(p + i).changes);
    // stop moved to break-even before the EA saw it: no fake R, and the trader can type the real stop
    const be = { position_id: 'BE1', symbol: 'XAUUSD', side: 'BUY', lots: 0.1, entry: 3944.16, exit: 3948.03, sl: 3944.37, tp: 3964.62, digits: 2,
      open_time: '2026-11-03T04:17:00', close_time: '2026-11-03T04:56:00', net: 48.37, r: 23.03, risk_money: 2.1, risk_pct: 0.03, balance_after: 10048.37 };
    await send({ key, account: '1001', currency: 'USD', trade: be });
    let beRow = db.prepare("SELECT * FROM journal_trades WHERE position_id = 'BE1'").get();
    assert.strictEqual(beRow.r, null);
    assert.strictEqual(beRow.risk_pct, null);
    r = await bob.get(`/journal/${beRow.id}`);
    assert.match(r.text, /break-even or in profit/);
    r = await bob.post(`/journal/${beRow.id}/sl`, { sl: '3950' });
    assert.match(r.text, /must be below the entry/);
    r = await bob.post(`/journal/${beRow.id}/sl`, { sl: '3940.00' });
    assert.match(r.text, /This trade is \+0\.93R/);
    await send({ key, account: '1001', currency: 'USD', trade: be });          // EA re-send keeps the typed stop
    beRow = db.prepare("SELECT * FROM journal_trades WHERE position_id = 'BE1'").get();
    assert.strictEqual(beRow.sl, 3940);
    assert.ok(Math.abs(beRow.r - 0.93) < 0.01);
    assert.ok(Math.abs(beRow.risk_money - 52) < 0.5 && beRow.risk_pct > 0.5 && beRow.risk_pct < 0.53);
    assert.match((await bob.get(`/journal/${beRow.id}`)).text, /\(edited\)/);
    assert.strictEqual(db.prepare("DELETE FROM journal_trades WHERE position_id = 'BE1'").run().changes, 1);

    // calendar: the trade's day is on the October 2026 calendar
    r = await bob.get('/journal');
    assert.match(r.text, /October 2026/);
    assert.match(r.text, /data-day="2026-10-28"/);
    // hiding an account: out of the tabs and "All accounts", trades kept, can be shown again
    r = await bob.get('/journal?account=1001');
    assert.match(r.text, /Hide this account/);
    r = await bob.post('/journal/accounts/1001/hide?back=%2Fjournal', {});
    assert.match(r.text, /Account 1001 is hidden/);
    assert.match(r.text, /Hidden accounts/);
    assert.doesNotMatch(r.text, /href="\/journal\/\d+"/);
    assert.doesNotMatch((await bob.get('/journal/insights')).text, /\?account=1001/);
    r = await bob.get('/journal?hidden=1');
    assert.match(r.text, /\?account=1001/);
    r = await bob.get('/journal?account=1001');
    assert.match(r.text, /This account is hidden/);
    assert.match(r.text, /href="\/journal\/\d+"/);
    assert.strictEqual((await bob.post('/journal/accounts/1001/hide?back=https%3A%2F%2Fevil.com', {})).status, 200);   // open redirect refused
    r = await bob.post('/journal/accounts/1001/show?back=%2Fjournal', {});
    assert.match(r.text, /href="\/journal\/\d+"/);
    assert.doesNotMatch(r.text, /Hidden accounts/);
    // removing the account keeps its trades in a separate Removed tab, out of "All accounts"
    const accId = (await bob.get('/dashboard')).text.match(/action="\/accounts\/(\d+)\/delete"/)[1];
    await bob.post(`/accounts/${accId}/delete`, {});
    r = await bob.get('/journal');
    assert.match(r.text, /Removed/);
    assert.doesNotMatch(r.text, /href="\/journal\/\d+"/);                         // not shown under All accounts
    r = await bob.get('/journal?account=1001');
    assert.match(r.text, /no longer on/);
    assert.match(r.text, /href="\/journal\/\d+"/);
    r = await bob.post('/journal/accounts/1001/delete', {});
    assert.match(r.text, /Deleted 1 trade of/);

    // Auction Compass: students only. Paid plans and EA ticks do not unlock it; the admin's Student switch does
    const fdc = new FormData();
    fdc.append('name', 'Auction Compass'); fdc.append('code', 'COMPASS'); fdc.append('version', '1.1'); fdc.append('active', '1');
    fdc.append('file', new Blob(['FAKE-EX5']), '5ABI_Auction_Compass.ex5');
    assert.match((await admin.post('/admin/eas', fdc)).text, /EA added/);          // adding an EA ticks it for every active user
    let tc = await check('COMPASS', '7777');                                         // Tia: paid KATANA plan, not a student
    assert.strictEqual(tc.valid, false);
    assert.match(tc.message, /Only for 5ABI\.FX students/);
    r = await tia.get('/dashboard');
    assert.doesNotMatch(r.text, /Auction Compass/);
    const compassId = db.prepare("SELECT id FROM eas WHERE code = 'COMPASS'").get().id;
    assert.strictEqual((await tia.get(`/download/${compassId}`)).status, 404);
    assert.doesNotMatch((await client(base).get('/pricing')).text, /Compass/);
    // the admin marks Tia as a student: Compass unlocks on her account and shows on her dashboard
    const tiaRow = db.prepare('SELECT * FROM users WHERE id = ?').get(tiaId);
    r = await admin.get(`/admin/users/${tiaId}`);
    assert.match(r.text, /name="student"/);
    const tiaForm = { name: tiaRow.name, status: 'active', max_accounts: String(tiaRow.max_accounts), expires_at: tiaRow.expires_at.slice(0, 10), ea: '1' };
    await admin.post(`/admin/users/${tiaId}`, { ...tiaForm, student: '1' });
    assert.strictEqual((await check('COMPASS', '7777')).valid, true);
    assert.match((await admin.get('/admin')).text, /student<\/span>/);
    r = await tia.get('/dashboard');
    assert.match(r.text, /Auction Compass/);
    assert.match(r.text, /5ABI\.FX%20Compass\.tpl/);
    assert.strictEqual((await tia.get(`/download/${compassId}`)).status, 200);
    // switching it off locks it again
    await admin.post(`/admin/users/${tiaId}`, tiaForm);
    assert.strictEqual((await check('COMPASS', '7777')).valid, false);
    // a trial user who is not a student does not get it; other EAs still work on the trial
    process.env.TRIAL_DAYS = '15';
    const tess = client(base);
    await tess.post('/signup', { name: 'Tess', email: 'tess@test.com', password: 'tesspass123' });
    await tess.post('/accounts', { account_number: '8888' });
    process.env.TRIAL_DAYS = '0';
    tc = await check('COMPASS', '8888');
    assert.strictEqual(tc.valid, false);
    assert.strictEqual((await check('GOLD_SCALPER', '8888')).valid, true);
    r = await tess.get('/dashboard');
    assert.doesNotMatch(r.text, /Auction Compass/);
    assert.strictEqual((await tess.get(`/download/${compassId}`)).status, 404);

    // bulk tools: early members (no expiry, no trial, no plan) become students in one click
    await admin.post('/admin/users', { name: 'Early', email: 'early@test.com', password: 'earlypass1', max_accounts: '10', expires_at: '', ea: '1' });
    const earlyId = db.prepare("SELECT id FROM users WHERE email = 'early@test.com'").get().id;
    r = await admin.get('/admin');
    assert.match(r.text, /not marked as student yet/);
    r = await admin.post('/admin/users/early-students', {});
    assert.match(r.text, /marked as student/);
    assert.strictEqual(db.prepare('SELECT student FROM users WHERE id = ?').get(earlyId).student, 1);
    assert.strictEqual(db.prepare("SELECT student FROM users WHERE email = 'tess@test.com'").get().student, 0);   // trial user untouched
    assert.doesNotMatch((await admin.get('/admin')).text, /not marked as student yet/);
    r = await admin.post('/admin/users/bulk', `action=expiry&expires_at=2030-01-31&ids=${earlyId}&ids=${tiaId}`);
    assert.match(r.text, /2 users set to expire on 2030-01-31/);
    assert.strictEqual(db.prepare('SELECT expires_at FROM users WHERE id = ?').get(earlyId).expires_at, '2030-01-31 23:59:59');
    r = await admin.post('/admin/users/bulk', `action=student_off&ids=${earlyId}`);
    assert.match(r.text, /1 user no longer students/);
    r = await admin.post('/admin/users/bulk', `action=never&ids=${earlyId}`);
    assert.strictEqual(db.prepare('SELECT expires_at FROM users WHERE id = ?').get(earlyId).expires_at, null);

    // free trial for an existing user: bulk and from the user page
    r = await admin.post('/admin/users/bulk', `action=trial&trial_days=7&ids=${earlyId}`);
    assert.match(r.text, /1 user started a 7-day free trial/);
    let er = db.prepare('SELECT * FROM users WHERE id = ?').get(earlyId);
    assert.strictEqual(er.trial, 1);
    assert.ok(Math.abs(new Date(er.expires_at + 'Z') - Date.now() - 7 * 86400000) < 120000);
    assert.match((await admin.get(`/admin/users/${earlyId}`)).text, /Restart free trial/);
    r = await admin.post(`/admin/users/${earlyId}/trial`, { trial_days: '3' });
    assert.match(r.text, /3-day free trial started/);
    er = db.prepare('SELECT * FROM users WHERE id = ?').get(earlyId);
    assert.ok(Math.abs(new Date(er.expires_at + 'Z') - Date.now() - 3 * 86400000) < 120000);

    // Stripe: checkout for the picked plan, then the signed webhook switches the plan on
    {
      const http = require('http');
      const crypto = require('crypto');
      const calls = [];
      const fake = http.createServer((q, s2) => {
        let body = '';
        q.on('data', (c) => { body += c; });
        q.on('end', () => {
          calls.push({ method: q.method, url: q.url, body: new URLSearchParams(body), auth: q.headers.authorization });
          s2.setHeader('content-type', 'application/json');
          if (q.url === '/v1/checkout/sessions') return s2.end(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }));
          if (q.url === '/v1/subscriptions/sub_1') return s2.end(JSON.stringify({ id: 'sub_1', metadata: { user_id: String(payId), plan: 'pro', billing: 'annual' } }));
          if (q.url === '/v1/coupons') return s2.end(JSON.stringify({ id: 'co_1' }));
          if (q.url === '/v1/subscriptions/sub_m') return s2.end(JSON.stringify({ id: 'sub_m', metadata: { kind: 'mentorship', user_id: String(payId), mplan: 'full' } }));
          if (q.url === '/v1/billing_portal/sessions') return s2.end(JSON.stringify({ url: 'https://billing.stripe.com/p/session/x' }));
          s2.statusCode = 404; s2.end('{}');
        });
      }).listen(0);
      Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_API_BASE: `http://127.0.0.1:${fake.address().port}` });
      await admin.post('/admin/users', { name: 'Payer', email: 'payer@test.com', password: 'payerpass1', max_accounts: '1', expires_at: '2020-01-01', ea: '1' });
      const payId = db.prepare("SELECT id FROM users WHERE email = 'payer@test.com'").get().id;
      const payer = client(base);
      await payer.post('/login', { email: 'payer@test.com', password: 'payerpass1' });
      r = await payer.get('/subscribe?plan=pro&billing=annual');
      assert.match(r.text, /Pay \$348 by card/);
      r = await payer.post('/subscribe', { plan: 'pro', billing: 'annual', agree: '1' });
      assert.strictEqual(r.location, 'https://checkout.stripe.com/c/pay/cs_1');
      const cs = calls.find((c) => c.url === '/v1/checkout/sessions');
      assert.strictEqual(cs.auth, 'Bearer sk_test_x');
      assert.strictEqual(cs.body.get('mode'), 'subscription');
      assert.strictEqual(cs.body.get('line_items[0][price_data][unit_amount]'), '34800');
      assert.strictEqual(cs.body.get('line_items[0][price_data][recurring][interval]'), 'year');
      assert.strictEqual(cs.body.get('subscription_data[metadata][user_id]'), String(payId));
      assert.strictEqual(cs.body.get('customer_email'), 'payer@test.com');

      const hook = async (ev, secret = 'whsec_x') => {
        const raw = JSON.stringify(ev);
        const t = Math.floor(Date.now() / 1000);
        const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
        return fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: raw });
      };
      assert.strictEqual((await hook({ id: 'evt_bad', type: 'invoice.paid', data: { object: {} } }, 'wrong')).status, 400);
      assert.strictEqual((await hook({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { client_reference_id: String(payId), customer: 'cus_1', subscription: 'sub_1' } } })).status, 200);
      const periodEnd = Math.floor(Date.now() / 1000) + 365 * 86400;
      const inv = { id: 'evt_2', type: 'invoice.paid', data: { object: { customer: 'cus_1', amount_paid: 34800,
        parent: { subscription_details: { subscription: 'sub_1' } }, lines: { data: [{ period: { end: periodEnd } }] } } } };
      assert.strictEqual((await hook(inv)).status, 200);
      let pu = db.prepare('SELECT * FROM users WHERE id = ?').get(payId);
      assert.strictEqual(pu.plan, 'pro');
      assert.strictEqual(pu.billing, 'annual');
      assert.strictEqual(pu.max_accounts, 10);
      assert.strictEqual(pu.stripe_customer, 'cus_1');
      assert.strictEqual(pu.stripe_sub, 'sub_1');
      const exp1 = pu.expires_at;
      assert.ok(new Date(exp1 + 'Z') >= new Date((periodEnd + 86400) * 1000));
      assert.strictEqual((await hook(inv)).status, 200);                                 // replayed event changes nothing
      assert.strictEqual(db.prepare('SELECT expires_at FROM users WHERE id = ?').get(payId).expires_at, exp1);
      r = await payer.get('/dashboard');
      assert.match(r.text, /Manage billing/);
      r = await payer.post('/billing', {});
      assert.strictEqual(r.location, 'https://billing.stripe.com/p/session/x');
      assert.match((await payer.get('/subscribe?plan=pro&billing=annual')).text, /already have an active subscription/);
      await hook({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
      pu = db.prepare('SELECT * FROM users WHERE id = ?').get(payId);
      assert.strictEqual(pu.stripe_sub, null);
      assert.strictEqual(pu.expires_at, exp1);                                             // keeps what was paid

      // card trial: sign up gives no access until a card is added; Stripe trial starts the free trial
      process.env.TRIAL_DAYS = '15';
      delete process.env.GOOGLE_CLIENT_ID;
      const ct = client(base);
      // (another IP: the sign up rate limit is used up by earlier tests)
      const su = await fetch(`${base}/signup`, { method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.9.9.9' },
        body: new URLSearchParams({ name: 'Cara', email: 'cara@test.com', password: 'carapass123' }).toString() });
      assert.strictEqual(su.status, 302);
      r = await ct.post('/login', { email: 'cara@test.com', password: 'carapass123' });
      assert.match(r.text, /Start your 15-day free trial/);
      const caraId = db.prepare("SELECT id FROM users WHERE email = 'cara@test.com'").get().id;
      await ct.post('/accounts', { account_number: '4242' });
      assert.strictEqual((await check('GOLD_SCALPER', '4242')).valid, false);          // no card yet: nothing works
      r = await ct.get('/subscribe?plan=journal&billing=monthly');
      assert.match(r.text, /Due today<\/span><b>\$0 USD/);
      assert.match(r.text, /Add card and start free trial/);
      calls.length = 0;
      r = await ct.post('/subscribe', { plan: 'journal', billing: 'monthly', agree: '1' });
      const cs2 = calls.find((c) => c.url === '/v1/checkout/sessions');
      assert.strictEqual(cs2.body.get('subscription_data[trial_period_days]'), '15');
      assert.strictEqual(cs2.body.get('payment_method_collection'), 'always');
      assert.strictEqual(cs2.body.get('metadata[trial]'), '1');
      await hook({ id: 'evt_t1', type: 'checkout.session.completed', data: { object: { client_reference_id: String(caraId), customer: 'cus_2', subscription: 'sub_2',
        metadata: { user_id: String(caraId), plan: 'journal', billing: 'monthly', trial: '1' } } } });
      let cu = db.prepare('SELECT * FROM users WHERE id = ?').get(caraId);
      assert.strictEqual(cu.trial, 1);
      assert.strictEqual(cu.trial_used, 1);
      assert.ok(Math.abs(new Date(cu.expires_at + 'Z') - Date.now() - 16 * 86400000) < 120000);
      assert.strictEqual((await check('GOLD_SCALPER', '4242')).valid, true);           // trial running
      assert.ok(db.prepare("SELECT 1 FROM trial_accounts WHERE account_number = '4242'").get());
      // the $0 trial invoice does not end the trial
      await hook({ id: 'evt_t2', type: 'invoice.paid', data: { object: { customer: 'cus_2', amount_paid: 0, billing_reason: 'subscription_create',
        subscription: { id: 'sub_2', status: 'trialing', trial_end: 1, metadata: { user_id: String(caraId), plan: 'journal', billing: 'monthly' } } } } });
      assert.strictEqual(db.prepare('SELECT trial FROM users WHERE id = ?').get(caraId).trial, 1);
      // first real charge after the trial switches the plan on
      await hook({ id: 'evt_t3', type: 'invoice.paid', data: { object: { customer: 'cus_2', amount_paid: 1200, billing_reason: 'subscription_cycle',
        subscription: { id: 'sub_2', status: 'active', metadata: { user_id: String(caraId), plan: 'journal', billing: 'monthly' } } } } });
      cu = db.prepare('SELECT * FROM users WHERE id = ?').get(caraId);
      assert.strictEqual(cu.trial, 0);
      assert.strictEqual(cu.plan, 'journal');
      assert.doesNotMatch((await ct.get('/dashboard')).text, /Start your 15-day free trial/);   // no second card trial
      // Mentorship: prices only for members, waitlist, mystery discount, one-time and 3-part checkout, EA discount
      const anon = client(base);
      r = await anon.get('/mentorship');
      assert.match(r.text, /Sign up free to see prices/);
      assert.doesNotMatch(r.text, /\$2,797/);
      assert.match((await anon.get('/signup?next=mentorship')).text, /See the mentorship prices/);
      r = await ct.get('/mentorship');
      assert.match(r.text, /\$2,797/);
      assert.match(r.text, /Pay in 3 parts/);
      await ct.post('/mentorship/waitlist', {});
      assert.match((await ct.get('/mentorship')).text, /on the list/);
      r = await admin.post('/admin/mentorship/promo', { pct: '10', ends: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16) });
      assert.match(r.text, /Mystery discount on: 10% off/);
      assert.match((await anon.get('/mentorship')).text, /id="mys"/);
      r = await ct.get('/mentorship');
      assert.doesNotMatch(r.text, /id="mys"/);                                       // pop-up is for signed-out visitors only
      assert.match(r.text, /href="\/mentorship\/claim"/);                               // the price section still offers the claim
      r = await ct.get('/mentorship/claim');
      assert.match(r.text, /Mystery discount unlocked/);
      assert.match(r.text, /\$2,880/);                                                    // 3,200 less 10%
      calls.length = 0;
      r = await ct.post('/mentorship/checkout', { plan: 'full', pay: 'once' });
      assert.match(r.text, /Mentorship Agreement/);                                  // no tick, no payment
      r = await ct.post('/mentorship/checkout', { plan: 'full', pay: 'once', agree: '1' });
      assert.strictEqual(r.location, 'https://checkout.stripe.com/c/pay/cs_1');
      const ms = calls.find((c) => c.url === '/v1/checkout/sessions');
      assert.strictEqual(ms.body.get('mode'), 'payment');
      assert.strictEqual(ms.body.get('line_items[0][price_data][unit_amount]'), '288000');
      assert.strictEqual(ms.body.get('metadata[kind]'), 'mentorship');
      const caraPlan = db.prepare('SELECT plan FROM users WHERE id = ?').get(caraId).plan;
      await hook({ id: 'evt_m1', type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'paid', customer: 'cus_2',
        client_reference_id: String(caraId), metadata: { kind: 'mentorship', user_id: String(caraId), mplan: 'full', parts: '1' } } } });
      cu = db.prepare('SELECT * FROM users WHERE id = ?').get(caraId);
      assert.strictEqual(cu.mentor_plan, 'full');
      assert.strictEqual(cu.plan, caraPlan);                                               // EA plan untouched
      assert.strictEqual(cu.student, 0);                                                   // indicator waits for graduation
      assert.ok(new Date(cu.expires_at + 'Z') - Date.now() > 170 * 86400000);              // KATANA + Journal for 6 months
      assert.match((await ct.get('/mentorship')).text, /You're in/);
      r = await admin.get('/admin/mentorship');
      assert.match(r.text, /cara@test\.com/);
      await admin.post(`/admin/mentorship/${caraId}/graduate`, {});
      assert.strictEqual(db.prepare('SELECT student FROM users WHERE id = ?').get(caraId).student, 1);
      // a student who paid directly gets 30% off every EA payment
      r = await admin.post('/admin/mentorship/add', { email: 'payer@test.com', plan: 'mentorship' });
      assert.match(r.text, /added as a Mentorship student/);
      calls.length = 0;
      await payer.post('/subscribe', { plan: 'journal', billing: 'monthly', agree: '1' });
      const co = calls.find((c) => c.url === '/v1/coupons');
      assert.strictEqual(co.body.get('percent_off'), '30');
      assert.strictEqual(co.body.get('duration'), 'forever');
      // 3 monthly parts: a subscription that is cancelled after the 3rd payment; paying upgrades to Full
      calls.length = 0;
      await payer.post('/mentorship/checkout', { plan: 'full', pay: 'parts', agree: '1' });
      const mp = calls.find((c) => c.url === '/v1/checkout/sessions');
      assert.strictEqual(mp.body.get('mode'), 'subscription');
      assert.strictEqual(mp.body.get('line_items[0][price_data][unit_amount]'), '109900');
      assert.strictEqual(mp.body.get('subscription_data[metadata][kind]'), 'mentorship');
      await hook({ id: 'evt_m2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_m', customer: 'cus_1',
        metadata: { kind: 'mentorship', user_id: String(payId), mplan: 'full', parts: '3' } } } });
      const cancel = calls.find((c) => c.url === '/v1/subscriptions/sub_m' && c.method === 'POST');
      assert.ok(Number(cancel.body.get('cancel_at')) > Date.now() / 1000 + 60 * 86400);
      assert.strictEqual(db.prepare('SELECT stripe_sub FROM users WHERE id = ?').get(payId).stripe_sub, null);   // not an EA subscription
      await hook({ id: 'evt_m3', type: 'invoice.paid', data: { object: { customer: 'cus_1', amount_paid: 109900, parent: { subscription_details: { subscription: 'sub_m' } } } } });
      pu = db.prepare('SELECT * FROM users WHERE id = ?').get(payId);
      assert.strictEqual(pu.mentor_plan, 'full');
      assert.strictEqual(pu.plan, 'pro');

      process.env.TRIAL_DAYS = '0';
      fake.close();
      for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_API_BASE']) delete process.env[k];
    }

    // bot check (Cloudflare Turnstile): off without keys; on: sign-up needs it, sign-in after 3 wrong passwords
    {
      const http = require('http');
      const ts = http.createServer((q, s2) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => {
        const p = new URLSearchParams(b); s2.setHeader('content-type', 'application/json');
        s2.end(JSON.stringify({ success: p.get('secret') === 'sec' && p.get('response') === 'good' })); }); });
      await new Promise((ok) => ts.listen(0, ok));
      assert.doesNotMatch((await fetch(base + '/signup').then((x) => x.text())), /cf-turnstile/);
      Object.assign(process.env, { TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'sec', TURNSTILE_API: `http://127.0.0.1:${ts.address().port}/` });
      const vis = client(base, '10.9.0.1');
      r = await vis.get('/signup');
      assert.match(r.text, /class="cf-turnstile" data-sitekey="site-key"/);
      r = await vis.post('/signup', { name: 'Bot', email: 'bot@test.com', password: 'botpass123' });
      assert.match(r.text, /complete the quick check/);
      assert.strictEqual(db.prepare("SELECT 1 FROM users WHERE email = 'bot@test.com'").get(), undefined);
      const guess = client(base, '10.9.0.2');
      assert.doesNotMatch((await guess.get('/login')).text, /cf-turnstile/);
      for (let i = 0; i < 3; i++) await guess.post('/login', { email: 'bob@test.com', password: 'wrong-one' });
      r = await guess.get('/login');
      assert.match(r.text, /cf-turnstile/);
      r = await guess.post('/login', { email: 'bob@test.com', password: 'bobpass123' });
      assert.match(r.text, /complete the quick check/);                                  // right password, no check: refused
      r = await guess.post('/login', { email: 'bob@test.com', password: 'bobpass123', 'cf-turnstile-response': 'bad' });
      assert.match(r.text, /complete the quick check/);
      r = await guess.post('/login', { email: 'bob@test.com', password: 'bobpass123', 'cf-turnstile-response': 'good' });
      assert.match(r.text, /Gold Scalper/);                                               // passed: signed in, counter reset
      assert.doesNotMatch((await client(base, '10.9.0.3').get('/login')).text, /cf-turnstile/);
      ts.close();
      for (const k of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_API']) delete process.env[k];
    }

    console.log('All smoke tests passed');
  } finally {
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
