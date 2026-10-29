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
    return { status: r.status, text };
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
    r = await admin.post(`/admin/users/${tiaId}/paid`);
    assert.match(r.text, /marked as paid/);
    assert.strictEqual((await check('GOLD_SCALPER', '7777')).valid, true);
    assert.doesNotMatch((await tia.get('/dashboard')).text, /Free trial/);
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

    console.log('All smoke tests passed');
  } finally {
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
