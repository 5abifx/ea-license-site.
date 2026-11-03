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

function client(base) {
  let cookies = {};
  const go = async (method, url, body) => {
    const headers = { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') };
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
    r = await tia.post('/subscribe', { plan: 'journal', billing: 'annual' });
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
    r = await tia.get('/help/ea-blocked');
    assert.match(r.text, /<option value="7777" selected/);
    assert.match((await tia.get('/dashboard')).text, /help\/ea-blocked/);
    r = await anon.get('/no-such-page');
    assert.strictEqual(r.status, 404);
    assert.match(r.text, /doesn&#39;t exist|doesn't exist/);
    assert.match((await anon.get('/')).text, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/og\.png"/);
    assert.match((await fetch(base + '/robots.txt').then((x) => x.text())), /Disallow: \//);

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
    const key = r.text.match(/<code class="block">([0-9a-f]{32})<\/code>/)[1];

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

    // Auction Compass: paid plans only, comes with the Journal, works once the account is added
    const fdc = new FormData();
    fdc.append('name', 'Auction Compass'); fdc.append('code', 'COMPASS'); fdc.append('version', '1.1'); fdc.append('active', '1');
    fdc.append('file', new Blob(['FAKE-EX5']), '5ABI_Auction_Compass.ex5');
    assert.match((await admin.post('/admin/eas', fdc)).text, /EA added/);
    assert.strictEqual((await check('COMPASS', '7777')).valid, true);            // Tia: paid KATANA plan, not assigned by hand
    r = await tia.get('/dashboard');
    assert.match(r.text, /Auction Compass/);
    const compassId = r.text.match(/Auction Compass[\s\S]*?href="\/download\/(\d+)"/)[1];
    assert.strictEqual((await tia.get(`/download/${compassId}`)).status, 200);
    process.env.TRIAL_DAYS = '15';
    const tess = client(base);
    await tess.post('/signup', { name: 'Tess', email: 'tess@test.com', password: 'tesspass123' });
    await tess.post('/accounts', { account_number: '8888' });
    process.env.TRIAL_DAYS = '0';
    const tc = await check('COMPASS', '8888');
    assert.strictEqual(tc.valid, false);
    assert.match(tc.message, /not with the free trial/);
    assert.strictEqual((await check('GOLD_SCALPER', '8888')).valid, true);        // other EAs still work on the trial
    r = await tess.get('/dashboard');
    assert.match(r.text, /Included when you subscribe/);
    assert.strictEqual((await tess.get(`/download/${compassId}`)).status, 404);
    assert.match((await client(base).get('/pricing')).text, /Auction Compass indicator/);

    console.log('All smoke tests passed');
  } finally {
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
