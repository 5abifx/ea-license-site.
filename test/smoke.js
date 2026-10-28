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

    // cross-site post blocked
    const xr = await fetch(base + '/accounts', { method: 'POST', headers: { origin: 'https://evil.com' } });
    assert.strictEqual(xr.status, 403);

    console.log('All smoke tests passed');
  } finally {
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
