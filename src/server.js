// Load settings from .env (Node 20.12+)
try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')); } catch { /* no .env file */ }

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db, FILES_DIR } = require('./db');
const { esc, fmtDate, layout, SITE_NAME, PRICE_TEXT, trialDays } = require('./views');

// ---------- config ----------
const PORT = Number(process.env.PORT || 3000);
// closed = only admin creates users, approval = users sign up but admin must approve, open = instant access
const SIGNUP_MODE = process.env.SIGNUP_MODE || 'approval';
const MAX_ACCOUNTS_DEFAULT = Number(process.env.MAX_ACCOUNTS || 10);
const TRIAL_ACCOUNTS = Number(process.env.TRIAL_ACCOUNTS || 1);   // MT5 accounts a trial user may register
const PAID_DAYS = Number(process.env.PAID_DAYS || 30);           // days added by the admin "Mark as paid" button
const PAYMENT_URL = process.env.PAYMENT_URL || '';               // where customers pay or ask to pay (e.g. Discord invite)
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  console.error('Set SESSION_SECRET (at least 16 random characters) in your environment / .env file.');
  process.exit(1);
}

// First start: create the admin user from ADMIN_EMAIL / ADMIN_PASSWORD
if (!db.prepare('SELECT 1 FROM users WHERE is_admin = 1').get()) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('No admin exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD for the first start.');
    process.exit(1);
  }
  db.prepare(`INSERT INTO users (email, name, password_hash, is_admin, status) VALUES (?, 'Admin', ?, 1, 'active')`)
    .run(ADMIN_EMAIL.trim(), bcrypt.hashSync(ADMIN_PASSWORD, 10));
  console.log(`Admin user created: ${ADMIN_EMAIL}`);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => { req.body = req.body || {}; next(); });
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cookieSession({
  name: 'eals',
  secret: SESSION_SECRET,
  maxAge: 7 * 24 * 3600 * 1000,
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
}));

// Block cross-site form posts (simple CSRF protection on top of SameSite cookies)
app.use((req, res, next) => {
  if (req.method === 'POST' && !req.path.startsWith('/api/')) {
    const origin = req.get('origin');
    let host = null;
    try { host = origin && new URL(origin).host; } catch { host = 'invalid'; }
    if (origin && host !== req.get('host')) return res.status(403).send('Bad origin');
  }
  next();
});

// Load signed-in user
app.use((req, res, next) => {
  req.user = null;
  if (req.session && req.session.uid) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.uid);
    if (u && u.status !== 'disabled') req.user = u;
    else req.session = null;
  }
  next();
});

const flash = (req, type, msg) => { req.session.flash = { type, msg }; };
const page = (req, res, title, body, opts) => res.send(layout(req, title, body, opts));
const requireUser = (req, res, next) => (req.user ? next() : res.redirect('/login'));
const requireAdmin = (req, res, next) =>
  req.user && req.user.is_admin ? next() : res.status(404).send('Not found');

function isExpired(u) {
  return u.expires_at && new Date(u.expires_at + 'Z') < new Date();
}
function cleanAccount(v) {
  const s = String(v || '').trim();
  return /^\d{1,20}$/.test(s) ? s : null;
}
function daysLeft(u) {
  return u.expires_at ? Math.max(0, Math.ceil((new Date(u.expires_at + 'Z') - Date.now()) / 86400000)) : null;
}
function payButton(label) {
  return PAYMENT_URL ? `<a class="btn" href="${esc(PAYMENT_URL)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}
function grantAllActiveEas(userId) {
  db.prepare(`INSERT OR IGNORE INTO user_eas (user_id, ea_id) SELECT ?, id FROM eas WHERE active = 1`).run(userId);
}

// Very small in-memory rate limiter for login / signup
const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  h.n += 1;
  return h.n > max;
}

require('./journal')(app, { db, page, flash, requireUser, isExpired, cleanAccount });

// ---------- auth ----------
app.get('/', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  const signup = SIGNUP_MODE !== 'closed';
  const trial = signup ? trialDays() : 0;
  const join = trial ? 'Start free trial' : 'Create account';
  page(req, res, 'Licensed Expert Advisors', `
  <section class="hero wrap">
    <span class="pill">${trial ? `${trial}-day free trial · then ${esc(PRICE_TEXT)}` : `${esc(SITE_NAME)} Licensing`}</span>
    <h1>Activate. Bind. Trade.</h1>
    <p class="lead">Every ${esc(SITE_NAME)} Expert Advisor, every license and every MT5 account, managed in one clean dashboard.</p>
    <div class="cta">
      ${signup ? `<a class="btn big" href="/signup">${join}</a>` : ''}
      <a class="btn big secondary" href="/login">Sign in</a>
    </div>
  </section>

  <section class="wrap">
    <div class="preview" aria-label="Example of the license dashboard">
      <div class="preview-head"><strong>My licenses</strong><span class="tag">Example</span></div>
      <div class="scroll"><table>
        <thead><tr><th>Expert Advisor</th><th>MT5 account</th><th>Status</th><th>Last EA check</th></tr></thead>
        <tbody>
          <tr><td><strong>Your EA</strong></td><td>51234567</td><td><span class="badge ok">Active</span></td><td class="muted">Checked every hour</td></tr>
          <tr><td><strong>Your EA</strong></td><td>51234568</td><td><span class="badge warn">Awaiting activation</span></td><td class="muted">-</td></tr>
        </tbody>
      </table></div>
    </div>
  </section>

  <section class="wrap why">
    <h2 class="section">Most traders don't lose on their strategy. They lose on execution.</h2>
    <p class="lead left">You know the setup. Then you hesitate on the entry, move your stop "just this once", close a winner too early, or wake up to a move you slept through. An Expert Advisor trades your rules the same way every time, with no fear, no revenge trades and no missed sessions.</p>
    <div class="compare">
      <div class="col bad">
        <h3>Trading by hand</h3>
        <ul>
          <li>Emotions decide when you get in and out</li>
          <li>Stops get moved, then hit bigger</li>
          <li>Setups during Asia or London open are missed while you sleep or work</li>
          <li>Hours a day watching charts</li>
        </ul>
      </div>
      <div class="col good">
        <h3>With a ${esc(SITE_NAME)} EA</h3>
        <ul>
          <li>Entries and exits follow fixed rules</li>
          <li>The same risk rules applied on every trade</li>
          <li>Watches the market 24/5 on your MT5 account</li>
          <li>Set it up once, then check in when you want</li>
        </ul>
      </div>
    </div>
  </section>

  <section id="how" class="band">
    <div class="wrap">
      <h2 class="section">How it works</h2>
      <div class="steps">
        ${trial ? `
        <div><span class="num">1</span><h3>Create your account</h3><p class="muted">Sign up in seconds. Your ${trial}-day free trial starts right away, no payment needed.</p></div>
        <div><span class="num">2</span><h3>Bind and download</h3><p class="muted">Add your MT5 account number, download the EA and start trading.</p></div>
        <div><span class="num">3</span><h3>Keep trading</h3><p class="muted">Liked it? Stay on for ${esc(PRICE_TEXT)} when your trial ends.</p></div>` : `
        <div><span class="num">1</span><h3>Buy your EA</h3><p class="muted">Purchase the ${esc(SITE_NAME)} Expert Advisor that fits how you trade.</p></div>
        <div><span class="num">2</span><h3>Create your account</h3><p class="muted">Sign up with the email you paid with.${SIGNUP_MODE === 'approval' ? ' We activate it as soon as your purchase is confirmed.' : ''}</p></div>
        <div><span class="num">3</span><h3>Bind and download</h3><p class="muted">Add up to ${MAX_ACCOUNTS_DEFAULT} MT5 account numbers, download the EA and start trading.</p></div>`}
      </div>
    </div>
  </section>

  <section class="wrap features">
    <div><h3>Locked to your accounts</h3><p class="muted">The EA only runs on the MT5 account numbers you register, so your license stays yours.</p></div>
    <div><h3>Always the latest build</h3><p class="muted">Download the newest version of every EA you own straight from your dashboard.</p></div>
    <div><h3>Change accounts anytime</h3><p class="muted">Switched broker? Remove an old account and add the new one in seconds.</p></div>
  </section>


  <section id="pricing" class="band">
    <div class="wrap pricing">
      <div class="math">
        <span class="pill">The simple math</span>
        <h2 class="section">Costs less than one stop loss.</h2>
        <p class="lead left">A single 0.10 lot EUR/USD trade stopped out 20 pips away loses about $20. That is the price of a whole month of ${esc(SITE_NAME)}.</p>
        <div class="sl-vs">
          <div><span class="muted">One small stop loss</span><strong>≈ $20</strong><span class="muted">0.10 lot × 20 pips, gone in minutes</span></div>
          <div class="hi"><span>A month of ${esc(SITE_NAME)}</span><strong>${esc(PRICE_TEXT)}</strong><span>Every EA, every trading day</span></div>
        </div>
        <p class="muted small">If disciplined execution saves you from just one avoidable loss a month, it has paid for itself.</p>
      </div>
      <div class="plan">
        <div class="plan-name">${esc(SITE_NAME)} Monthly</div>
        <div class="plan-price">${esc(PRICE_TEXT)}</div>
        ${trial ? `<div class="plan-note">First ${trial} days free. No payment to start.</div>` : ''}
        <ul class="ticks">
          <li>Every ${esc(SITE_NAME)} Expert Advisor</li>
          <li>All updates and new versions included</li>
          <li>License locked to your MT5 account</li>
          <li>Switch broker or account anytime</li>
          <li>Cancel anytime, no contract</li>
        </ul>
        ${signup ? `<a class="btn big full" href="/signup">${join}</a>` : ''}
      </div>
    </div>
  </section>

  <section class="wrap">
    <div class="cta-card">
      <div><h2>Ready to trade with ${esc(SITE_NAME)}?</h2><p>${trial ? `Try every EA free for ${trial} days. After that it is ${esc(PRICE_TEXT)}.` : 'Already bought an EA? Create your account to get started.'}</p></div>
      <div class="cta">
        ${signup ? `<a class="btn big" href="/signup">${join}</a>` : ''}
        <a class="btn big ghost" href="/login">Sign in</a>
      </div>
    </div>
  </section>`, { wide: true });
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  page(req, res, 'Sign in', `
  <div class="auth">
    <div class="auth-intro">
      <h1>Welcome back</h1>
      <p class="muted">Sign in to download your EAs, manage your MT5 accounts and check your license.</p>
    </div>
    <div class="card">
      <h2>Sign in</h2>
      ${googleOn() ? `${googleButton('Sign in with Google')}<p class="or">or with email and password</p>` : ''}
      <form method="post" action="/login">
        <label>Email<input name="email" required autofocus autocomplete="username"></label>
        <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
        <button class="full">Sign in</button>
      </form>
      ${SIGNUP_MODE !== 'closed' ? '<p class="muted">No account yet? <a href="/signup">Create one</a></p>' : ''}
    </div>
  </div>`);
});

app.post('/login', (req, res) => {
  if (rateLimit('login:' + req.ip, 10, 15 * 60 * 1000)) {
    flash(req, 'error', 'Too many attempts. Try again in 15 minutes.');
    return res.redirect('/login');
  }
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(req.body.email || '').trim());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    flash(req, 'error', 'Wrong email or password.');
    return res.redirect('/login');
  }
  if (u.status === 'disabled') {
    flash(req, 'error', 'This account is disabled. Please contact support.');
    return res.redirect('/login');
  }
  req.session.uid = u.id;
  res.redirect(u.is_admin ? '/admin' : '/dashboard');
});

app.post('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

app.get('/signup', (req, res) => {
  if (SIGNUP_MODE === 'closed') return res.redirect('/login');
  const trial = trialDays();
  page(req, res, 'Create account', `
  <div class="auth">
    <div class="auth-intro">
      <h1>${trial ? `Start your ${trial}-day free trial` : 'Create your account'}</h1>
      <p class="muted">${trial ? `Full access to every EA, no payment needed. After the trial it is ${esc(PRICE_TEXT)}.` : 'Use the same email you paid with so we can match your purchase.'}</p>
    </div>
    <div class="card">
      <h2>Create account</h2>
      ${googleOn() ? `${googleButton(trial ? 'Start free trial with Google' : 'Sign up with Google')}
      <p class="muted">We use your Google account to keep one free trial per person. We only receive your name and email.</p>` : `
      <form method="post" action="/signup">
        <label>Name<input name="name" required maxlength="80" autocomplete="name"></label>
        <label>Email<input type="email" name="email" required maxlength="120" autocomplete="email"></label>
        <label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
        <button class="full">${trial ? 'Start free trial' : 'Create account'}</button>
      </form>`}
      ${!trial && SIGNUP_MODE === 'approval' ? '<p class="muted">Your account will be activated after we confirm your purchase.</p>' : ''}
      <p class="muted">Already have an account? <a href="/login">Sign in</a></p>
    </div>
  </div>`);
});

// Creates a customer account: a free trial when TRIAL_DAYS is set, otherwise SIGNUP_MODE decides. Returns the new user id.
function createCustomer(req, { name, email, passwordHash, googleSub = null }) {
  const trial = trialDays();
  let info;
  if (trial) {
    // Free trial: active right away, all EAs, expires after TRIAL_DAYS
    info = db.prepare(`INSERT INTO users (email, name, password_hash, status, max_accounts, expires_at, trial, google_sub)
                       VALUES (?, ?, ?, 'active', ?, datetime('now', ?), 1, ?)`)
      .run(email, name, passwordHash, TRIAL_ACCOUNTS, `+${trial} days`, googleSub);
    grantAllActiveEas(info.lastInsertRowid);
    flash(req, 'ok', `Your ${trial}-day free trial has started. Add your MT5 account below to begin.`);
  } else {
    const status = SIGNUP_MODE === 'open' ? 'active' : 'pending';
    info = db.prepare('INSERT INTO users (email, name, password_hash, status, max_accounts, google_sub) VALUES (?, ?, ?, ?, ?, ?)')
      .run(email, name, passwordHash, status, MAX_ACCOUNTS_DEFAULT, googleSub);
    if (status === 'active') grantAllActiveEas(info.lastInsertRowid);
  }
  return Number(info.lastInsertRowid);
}

app.post('/signup', (req, res) => {
  if (SIGNUP_MODE === 'closed') return res.redirect('/login');
  if (googleOn()) {
    flash(req, 'error', 'Please sign up with your Google account.');
    return res.redirect('/signup');
  }
  if (rateLimit('signup:' + req.ip, 5, 60 * 60 * 1000)) {
    flash(req, 'error', 'Too many sign ups from your network. Try again later.');
    return res.redirect('/signup');
  }
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().slice(0, 120);
  const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    flash(req, 'error', 'Please enter your name, a valid email and a password of at least 8 characters.');
    return res.redirect('/signup');
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    flash(req, 'error', 'That email is already registered. Please sign in.');
    return res.redirect('/login');
  }
  req.session.uid = createCustomer(req, { name, email, passwordHash: bcrypt.hashSync(password, 10) });
  res.redirect('/dashboard');
});

// ---------- Sign in with Google (OpenID Connect, authorization code flow) ----------
// On when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set; new accounts can then only be created with Google.
const googleOn = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const googleRedirectUri = (req) => `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/auth/google/callback`;
function googleButton(label) {
  return `<a class="btn google full" href="/auth/google"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>${esc(label)}</a>`;
}

app.get('/auth/google', (req, res) => {
  if (!googleOn()) return res.redirect('/login');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.gstate = state;
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(req), response_type: 'code',
    scope: 'openid email profile', state, prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q);
});

app.get('/auth/google/callback', async (req, res) => {
  const fail = (msg) => { flash(req, 'error', msg); res.redirect('/login'); };
  const state = req.session.gstate;
  req.session.gstate = null;
  if (!googleOn() || !state || req.query.state !== state || !req.query.code) return fail('Google sign in failed. Please try again.');
  let claims;
  try {
    const r = await fetch(process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(req), grant_type: 'authorization_code',
      }),
    });
    const tok = await r.json();
    // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read without a signature check
    claims = JSON.parse(Buffer.from(String(tok.id_token).split('.')[1], 'base64url').toString());
  } catch (e) {
    console.error('Google token exchange failed:', e.message);
    return fail('Google sign in failed. Please try again.');
  }
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
      || !(claims.exp * 1000 > Date.now()) || !claims.sub) return fail('Google sign in failed. Please try again.');
  if (claims.email_verified !== true || !claims.email) return fail('Your Google email address is not verified.');

  let u = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(claims.sub);
  if (!u) {
    // Existing email account: link it to this Google account (Google has verified the email)
    u = db.prepare('SELECT * FROM users WHERE email = ?').get(claims.email);
    if (u) db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(claims.sub, u.id);
  }
  if (!u) {
    if (SIGNUP_MODE === 'closed') return fail('New sign ups are closed.');
    const id = createCustomer(req, {
      name: String(claims.name || claims.email.split('@')[0]).slice(0, 80), email: claims.email.slice(0, 120),
      passwordHash: bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10), googleSub: claims.sub,
    });
    u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  if (u.status === 'disabled') return fail('This account is disabled. Please contact support.');
  req.session.uid = u.id;
  res.redirect(u.is_admin ? '/admin' : '/dashboard');
});

app.get('/password', requireUser, (req, res) => page(req, res, 'Change password', `
  <div class="card narrow">
    <h1>Change password</h1>
    <form method="post" action="/password">
      <label>Current password<input type="password" name="current" required></label>
      <label>New password<input type="password" name="password" required minlength="8"></label>
      <button>Save</button>
    </form>
  </div>`));

app.post('/password', requireUser, (req, res) => {
  const pw = String(req.body.password || '');
  if (!bcrypt.compareSync(String(req.body.current || ''), req.user.password_hash) || pw.length < 8) {
    flash(req, 'error', 'Current password is wrong or the new one is shorter than 8 characters.');
    return res.redirect('/password');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw, 10), req.user.id);
  flash(req, 'ok', 'Password changed.');
  res.redirect('/dashboard');
});

// ---------- customer dashboard ----------
app.get('/dashboard', requireUser, (req, res) => {
  const u = req.user;
  if (u.status === 'pending') {
    return page(req, res, 'Waiting for approval', `
      <div class="card narrow"><h1>Almost there</h1>
      <p>Your account is waiting for approval. Once it is activated you can download your EAs and register your MT5 accounts here.</p></div>`);
  }
  const eas = db.prepare(`SELECT e.* FROM eas e JOIN user_eas ue ON ue.ea_id = e.id
                          WHERE ue.user_id = ? AND e.active = 1 ORDER BY e.name`).all(u.id);
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at').all(u.id);
  const full = accounts.length >= u.max_accounts;
  const expired = isExpired(u);

  page(req, res, 'My EAs', `
  <h1>Welcome${u.name ? ', ' + esc(u.name) : ''}</h1>
  ${expired ? `<div class="notice error"><div><strong>${u.trial ? 'Your free trial has ended.' : 'Your license has expired.'}</strong>
    Your EAs will stop working until you subscribe. It is ${esc(PRICE_TEXT)}.${PAYMENT_URL ? '' : ' Contact us to renew.'}</div>${payButton('Subscribe')}</div>` : ''}
  ${u.trial && !expired ? `<div class="notice"><div><strong>Free trial: ${daysLeft(u)} day${daysLeft(u) === 1 ? '' : 's'} left</strong>
    (until ${fmtDate(u.expires_at)} UTC). Keep trading after that for ${esc(PRICE_TEXT)}.</div>${payButton('Subscribe now')}</div>` : ''}
  ${u.expires_at && !expired && !u.trial ? `<p class="muted">License valid until ${fmtDate(u.expires_at)} (UTC)</p>` : ''}

  <section class="card">
    <h2>1. Download your EA</h2>
    ${eas.length ? `<div class="ea-list">${eas.map((e) => `
      <div class="ea">
        <div><strong>${esc(e.name)}</strong> <span class="tag">v${esc(e.version)}</span>
        ${e.description ? `<p class="muted">${esc(e.description)}</p>` : ''}</div>
        ${e.file_path ? `<a class="btn" href="/download/${e.id}">Download</a>` : '<span class="muted">Coming soon</span>'}
      </div>`).join('')}</div>`
    : '<p class="muted">No EAs are assigned to your account yet.</p>'}
  </section>

  <section class="card">
    <h2>2. Add your MT5 account numbers <span class="tag">${accounts.length} / ${u.max_accounts}</span></h2>
    <p class="muted">The EA only runs on the account numbers listed here. Find the number in MT5 under File → Login to Trade Account, or at the top of the Navigator window.</p>
    ${full ? '<p class="muted">You have reached the maximum number of accounts. Remove one to add another.</p>' : `
    <form method="post" action="/accounts" class="row">
      <input name="account_number" placeholder="MT5 account number, e.g. 51234567" inputmode="numeric" pattern="[0-9]{1,20}" required>
      <input name="label" placeholder="Note (optional), e.g. IC Markets live" maxlength="60">
      <button>Add account</button>
    </form>`}
    ${accounts.length ? `<table><thead><tr><th>Account</th><th>Note</th><th>Last EA check</th><th></th></tr></thead><tbody>
      ${accounts.map((a) => `<tr><td><strong>${esc(a.account_number)}</strong></td><td>${esc(a.label)}</td>
        <td>${a.last_check_at ? fmtDate(a.last_check_at) : '<span class="muted">never</span>'}</td>
        <td><form method="post" action="/accounts/${a.id}/delete" onsubmit="return confirm('Remove account ${esc(a.account_number)}? The EA will stop on it.')">
        <button class="small danger">Remove</button></form></td></tr>`).join('')}
    </tbody></table>` : ''}
  </section>

  <section class="card">
    <h2>3. Allow the license check in MT5</h2>
    <p>In MetaTrader 5 go to <strong>Tools → Options → Expert Advisors</strong>, tick <strong>Allow WebRequest for listed URL</strong> and add:</p>
    <code class="block">${esc(req.protocol + '://' + req.get('host'))}</code>
  </section>
  ${req.hasJournal ? `<section class="card">
    <h2>4. Trade Journal</h2>
    <p>Every trade you close is logged automatically and turned into share cards. <a href="/journal">Open your journal</a> to get your journal key and set up the Trade Journal EA.</p>
  </section>` : ''}`);
});

app.post('/accounts', requireUser, (req, res) => {
  const u = req.user;
  if (u.status !== 'active') return res.redirect('/dashboard');
  const num = cleanAccount(req.body.account_number);
  if (!num) { flash(req, 'error', 'Account number must contain digits only.'); return res.redirect('/dashboard'); }
  const count = db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?').get(u.id).n;
  if (count >= u.max_accounts) { flash(req, 'error', `You can register at most ${u.max_accounts} accounts.`); return res.redirect('/dashboard'); }
  if (u.trial) {
    const used = db.prepare('SELECT user_id FROM trial_accounts WHERE account_number = ?').get(num);
    if (used && used.user_id !== u.id) {
      flash(req, 'error', `MT5 account ${num} has already used a free trial. Subscribe to keep using it.`);
      return res.redirect('/dashboard');
    }
  }
  const r = db.prepare('INSERT OR IGNORE INTO accounts (user_id, account_number, label) VALUES (?, ?, ?)')
    .run(u.id, num, String(req.body.label || '').trim().slice(0, 60));
  if (u.trial && r.changes) db.prepare('INSERT OR IGNORE INTO trial_accounts (account_number, user_id) VALUES (?, ?)').run(num, u.id);
  flash(req, r.changes ? 'ok' : 'error', r.changes ? `Account ${num} added.` : `Account ${num} is already on your list.`);
  res.redirect('/dashboard');
});

app.post('/accounts/:id/delete', requireUser, (req, res) => {
  const r = db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (r.changes) flash(req, 'ok', 'Account removed.');
  res.redirect('/dashboard');
});

app.get('/download/:id', requireUser, (req, res) => {
  const u = req.user;
  const e = db.prepare(`SELECT e.* FROM eas e JOIN user_eas ue ON ue.ea_id = e.id
                        WHERE e.id = ? AND ue.user_id = ? AND e.active = 1`).get(req.params.id, u.id);
  if (u.status !== 'active' || !e || !e.file_path) return res.status(404).send('Not found');
  res.download(path.join(FILES_DIR, e.file_path), e.file_name);
});

// ---------- license check API (called by the EA) ----------
// GET /api/check?ea=CODE&account=12345678
app.get('/api/check', (req, res) => {
  const code = String(req.query.ea || '').trim();
  const num = cleanAccount(req.query.account);
  const reply = (valid, message, extra = {}) =>
    res.json({ valid, message, ea: code, account: num || '', server_time: new Date().toISOString(), ...extra });

  if (!code || !num) return reply(false, 'Missing ea or account');
  const ea = db.prepare('SELECT * FROM eas WHERE code = ?').get(code);
  if (!ea || !ea.active) return reply(false, 'Unknown or inactive EA');

  const rows = db.prepare(`
    SELECT a.id AS account_id, u.* FROM accounts a
    JOIN users u ON u.id = a.user_id
    JOIN user_eas ue ON ue.user_id = u.id AND ue.ea_id = ?
    WHERE a.account_number = ? AND u.status = 'active'`).all(ea.id, num);
  const ok = rows.find((u) => !isExpired(u));
  if (!ok) {
    return reply(false, rows.length ? 'License expired' : 'Account not registered for this EA',
      { latest_version: ea.version });
  }
  db.prepare(`UPDATE accounts SET last_check_at = datetime('now'), last_check_ea = ? WHERE id = ?`).run(ea.code, ok.account_id);
  reply(true, 'OK', { expires: ok.expires_at || '', latest_version: ea.version });
});

// ---------- admin ----------
const upload = multer({
  dest: FILES_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.get('/admin', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const users = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS n_acc,
           (SELECT GROUP_CONCAT(e.code, ', ') FROM user_eas ue JOIN eas e ON e.id = ue.ea_id WHERE ue.user_id = u.id) AS ea_codes
    FROM users u
    WHERE (? = '' OR u.email LIKE ? OR u.name LIKE ?
           OR u.id IN (SELECT user_id FROM accounts WHERE account_number LIKE ?))
    ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.created_at DESC`)
    .all(q, `%${q}%`, `%${q}%`, `%${q}%`);
  const eas = db.prepare('SELECT * FROM eas ORDER BY name').all();
  const pending = users.filter((u) => u.status === 'pending').length;

  page(req, res, 'Admin', `
  <h1>Admin</h1>
  <div class="tabs"><a class="on" href="/admin">Users</a><a href="/admin/eas">EAs (${eas.length})</a></div>

  <section class="card">
    <div class="row between">
      <h2>Users ${pending ? `<span class="tag warn">${pending} waiting for approval</span>` : ''}</h2>
      <form method="get" action="/admin" class="row"><input name="q" value="${esc(q)}" placeholder="Search email, name or account number"><button class="secondary">Search</button></form>
    </div>
    <table><thead><tr><th>User</th><th>Status</th><th>EAs</th><th>Accounts</th><th>Expires</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr>
      <td><a href="/admin/users/${u.id}"><strong>${esc(u.name || '-')}</strong></a><br><span class="muted">${esc(u.email)}</span>${u.is_admin ? ' <span class="tag">admin</span>' : ''}</td>
      <td><span class="status ${esc(u.status)}">${esc(u.status)}</span>${u.trial ? ' <span class="tag warn">trial</span>' : ''}</td>
      <td>${esc(u.ea_codes || '-')}</td>
      <td>${u.n_acc} / ${u.max_accounts}</td>
      <td>${u.expires_at ? fmtDate(u.expires_at) : 'never'}${isExpired(u) ? ' <span class="tag warn">expired</span>' : ''}</td>
      <td class="nowrap">${u.status === 'pending' ? `<form method="post" action="/admin/users/${u.id}/approve" class="inline"><button class="small">Approve</button></form>` : ''}
        <a class="btn small secondary" href="/admin/users/${u.id}">Manage</a></td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">No users found.</td></tr>'}
    </tbody></table>
  </section>

  <section class="card">
    <h2>Add a user</h2>
    <form method="post" action="/admin/users" class="grid">
      <label>Name<input name="name" required></label>
      <label>Email<input type="email" name="email" required></label>
      <label>Password<input name="password" required minlength="8" placeholder="Give this to the customer"></label>
      <label>Max accounts<input type="number" name="max_accounts" value="${MAX_ACCOUNTS_DEFAULT}" min="0" max="1000"></label>
      <label>Expires (blank = never)<input type="date" name="expires_at"></label>
      <fieldset><legend>EAs</legend>${eas.map((e) => `<label class="check"><input type="checkbox" name="ea" value="${e.id}" ${e.active ? 'checked' : ''}> ${esc(e.name)}</label>`).join('') || '<span class="muted">Add an EA first</span>'}</fieldset>
      <div><button>Create user</button></div>
    </form>
  </section>`);
});

function parseExpiry(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s} 23:59:59` : null;
}
function setUserEas(userId, eaIds) {
  const ids = [].concat(eaIds || []).map(Number).filter(Boolean);
  db.transaction(() => {
    db.prepare('DELETE FROM user_eas WHERE user_id = ?').run(userId);
    const ins = db.prepare('INSERT OR IGNORE INTO user_eas (user_id, ea_id) VALUES (?, ?)');
    ids.forEach((id) => ins.run(userId, id));
  })();
}

app.post('/admin/users', requireAdmin, (req, res) => {
  const email = String(req.body.email || '').trim();
  const pw = String(req.body.password || '');
  if (!email || pw.length < 8) { flash(req, 'error', 'Email and a password of 8+ characters are required.'); return res.redirect('/admin'); }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) { flash(req, 'error', 'That email already exists.'); return res.redirect('/admin'); }
  const info = db.prepare(`INSERT INTO users (email, name, password_hash, status, max_accounts, expires_at) VALUES (?, ?, ?, 'active', ?, ?)`)
    .run(email, String(req.body.name || '').trim(), bcrypt.hashSync(pw, 10),
      Math.max(0, Number(req.body.max_accounts) || 0), parseExpiry(req.body.expires_at));
  setUserEas(info.lastInsertRowid, req.body.ea);
  flash(req, 'ok', `User ${email} created. Send them the website link, their email and password.`);
  res.redirect('/admin');
});

app.post('/admin/users/:id/approve', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (u) {
    db.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).run(u.id);
    const has = db.prepare('SELECT 1 FROM user_eas WHERE user_id = ?').get(u.id);
    if (!has) grantAllActiveEas(u.id);
    flash(req, 'ok', `${u.email} approved and given access to all active EAs.`);
  }
  res.redirect(req.get('referer') || '/admin');
});

app.get('/admin/users/:id', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.redirect('/admin');
  const eas = db.prepare('SELECT e.*, EXISTS(SELECT 1 FROM user_eas WHERE user_id = ? AND ea_id = e.id) AS granted FROM eas e ORDER BY name').all(u.id);
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at').all(u.id);
  const expDate = u.expires_at ? u.expires_at.slice(0, 10) : '';

  page(req, res, u.email, `
  <p><a href="/admin">← All users</a></p>
  <h1>${esc(u.name || u.email)} <span class="status ${esc(u.status)}">${esc(u.status)}</span></h1>
  <p class="muted">${esc(u.email)} · joined ${fmtDate(u.created_at)}</p>

  <section class="card">
    <div class="row between">
      <h2>License ${u.trial ? '<span class="tag warn">free trial</span>' : ''}</h2>
      <form method="post" action="/admin/users/${u.id}/paid" class="inline"><button class="small">Mark as paid (+${PAID_DAYS} days)</button></form>
    </div>
    <form method="post" action="/admin/users/${u.id}" class="grid">
      <label>Name<input name="name" value="${esc(u.name)}"></label>
      <label>Status<select name="status">${['pending', 'active', 'disabled'].map((s) => `<option ${s === u.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Max accounts<input type="number" name="max_accounts" value="${u.max_accounts}" min="0" max="1000"></label>
      <label>Expires (blank = never)<input type="date" name="expires_at" value="${esc(expDate)}"></label>
      <fieldset><legend>EAs this user can download and run</legend>${eas.map((e) => `<label class="check"><input type="checkbox" name="ea" value="${e.id}" ${e.granted ? 'checked' : ''}> ${esc(e.name)} <span class="muted">(${esc(e.code)})</span></label>`).join('') || '<span class="muted">No EAs yet</span>'}</fieldset>
      <div><button>Save</button></div>
    </form>
  </section>

  <section class="card">
    <h2>MT5 accounts <span class="tag">${accounts.length} / ${u.max_accounts}</span></h2>
    <form method="post" action="/admin/users/${u.id}/accounts" class="row">
      <input name="account_number" placeholder="Add account number" pattern="[0-9]{1,20}" required>
      <input name="label" placeholder="Note (optional)">
      <button class="secondary">Add</button>
    </form>
    ${accounts.length ? `<table><thead><tr><th>Account</th><th>Note</th><th>Added</th><th>Last check</th><th></th></tr></thead><tbody>
    ${accounts.map((a) => `<tr><td><strong>${esc(a.account_number)}</strong></td><td>${esc(a.label)}</td><td>${fmtDate(a.created_at)}</td>
      <td>${a.last_check_at ? `${fmtDate(a.last_check_at)} <span class="muted">${esc(a.last_check_ea)}</span>` : '<span class="muted">never</span>'}</td>
      <td><form method="post" action="/admin/accounts/${a.id}/delete"><button class="small danger">Remove</button></form></td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">No accounts registered.</p>'}
  </section>

  <section class="card">
    <h2>Reset password</h2>
    <form method="post" action="/admin/users/${u.id}/password" class="row">
      <input name="password" minlength="8" required placeholder="New password">
      <button class="secondary">Set password</button>
    </form>
  </section>

  ${u.id !== req.user.id ? `<section class="card">
    <h2>Delete user</h2>
    <form method="post" action="/admin/users/${u.id}/delete" onsubmit="return confirm('Delete this user and all their accounts? This cannot be undone.')">
      <button class="danger">Delete user</button>
    </form>
  </section>` : ''}`);
});

// Customer paid: end the trial and extend from today or from the current expiry, whichever is later
app.post('/admin/users/:id/paid', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.redirect('/admin');
  const from = u.expires_at && !isExpired(u) ? u.expires_at : new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`UPDATE users SET trial = 0, status = 'active', expires_at = datetime(?, ?),
              max_accounts = MAX(max_accounts, ?) WHERE id = ?`).run(from, `+${PAID_DAYS} days`, MAX_ACCOUNTS_DEFAULT, u.id);
  if (!db.prepare('SELECT 1 FROM user_eas WHERE user_id = ?').get(u.id)) grantAllActiveEas(u.id);
  const after = db.prepare('SELECT expires_at FROM users WHERE id = ?').get(u.id).expires_at;
  flash(req, 'ok', `${u.email} marked as paid. License now valid until ${after.slice(0, 16)} UTC.`);
  res.redirect(`/admin/users/${u.id}`);
});

app.post('/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = ['pending', 'active', 'disabled'].includes(req.body.status) ? req.body.status : 'pending';
  const self = id === req.user.id;
  db.prepare('UPDATE users SET name = ?, status = ?, max_accounts = ?, expires_at = ? WHERE id = ?')
    .run(String(req.body.name || '').trim(), self ? 'active' : status,
      Math.max(0, Number(req.body.max_accounts) || 0), parseExpiry(req.body.expires_at), id);
  setUserEas(id, req.body.ea);
  flash(req, 'ok', 'Saved.');
  res.redirect(`/admin/users/${id}`);
});

app.post('/admin/users/:id/accounts', requireAdmin, (req, res) => {
  const num = cleanAccount(req.body.account_number);
  if (!num) flash(req, 'error', 'Account number must be digits only.');
  else {
    db.prepare('INSERT OR IGNORE INTO accounts (user_id, account_number, label) VALUES (?, ?, ?)')
      .run(req.params.id, num, String(req.body.label || '').trim().slice(0, 60));
    flash(req, 'ok', `Account ${num} added.`);
  }
  res.redirect(`/admin/users/${req.params.id}`);
});

app.post('/admin/accounts/:id/delete', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (a) db.prepare('DELETE FROM accounts WHERE id = ?').run(a.id);
  res.redirect(a ? `/admin/users/${a.user_id}` : '/admin');
});

app.post('/admin/users/:id/password', requireAdmin, (req, res) => {
  const pw = String(req.body.password || '');
  if (pw.length < 8) flash(req, 'error', 'Password must be at least 8 characters.');
  else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw, 10), req.params.id);
    flash(req, 'ok', 'Password updated. Send the new password to the user.');
  }
  res.redirect(`/admin/users/${req.params.id}`);
});

app.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
  if (Number(req.params.id) !== req.user.id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    flash(req, 'ok', 'User deleted.');
  }
  res.redirect('/admin');
});

// --- EAs ---
app.get('/admin/eas', requireAdmin, (req, res) => {
  const eas = db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM user_eas WHERE ea_id = e.id) AS n_users FROM eas e ORDER BY name`).all();
  const eaForm = (e = {}) => `
    <form method="post" action="${e.id ? `/admin/eas/${e.id}` : '/admin/eas'}" enctype="multipart/form-data" class="grid">
      <label>Name<input name="name" value="${esc(e.name)}" required placeholder="Gold Scalper"></label>
      <label>License code<input name="code" value="${esc(e.code)}" required pattern="[A-Za-z0-9_\\-]{2,40}" placeholder="GOLD_SCALPER"></label>
      <label>Version<input name="version" value="${esc(e.version || '1.0')}" required></label>
      <label>Description<input name="description" value="${esc(e.description)}"></label>
      <label>File (.ex5 or .zip)${e.file_name ? ` <span class="muted">current: ${esc(e.file_name)}</span>` : ''}<input type="file" name="file" accept=".ex5,.zip,.set,.rar"></label>
      <label class="check"><input type="checkbox" name="active" value="1" ${e.id === undefined || e.active ? 'checked' : ''}> Active</label>
      ${e.id ? '' : '<label class="check"><input type="checkbox" name="grant_all" value="1" checked> Give to all active users</label>'}
      <div><button>${e.id ? 'Save' : 'Add EA'}</button></div>
    </form>`;

  page(req, res, 'EAs', `
  <h1>Admin</h1>
  <div class="tabs"><a href="/admin">Users</a><a class="on" href="/admin/eas">EAs (${eas.length})</a></div>
  ${eas.map((e) => `<section class="card">
    <div class="row between"><h2>${esc(e.name)} <span class="tag">v${esc(e.version)}</span> ${e.active ? '' : '<span class="tag warn">inactive</span>'}</h2>
    <span class="muted">${e.n_users} users · code <code>${esc(e.code)}</code></span></div>
    ${eaForm(e)}
    <form method="post" action="/admin/eas/${e.id}/grant-all" class="inline"><button class="small secondary">Give to all active users</button></form>
    <form method="post" action="/admin/eas/${e.id}/delete" class="inline" onsubmit="return confirm('Delete this EA? Customers lose access to it.')"><button class="small danger">Delete EA</button></form>
  </section>`).join('')}
  <section class="card"><h2>Add a new EA</h2>
    <p class="muted">The license code must match <code>EA_CODE</code> in the EA's MQL5 source.</p>
    ${eaForm()}
  </section>`);
});

function saveUpload(file, oldPath) {
  if (!file) return null;
  if (oldPath) fs.rm(path.join(FILES_DIR, oldPath), { force: true }, () => {});
  return { file_path: path.basename(file.path), file_name: path.basename(file.originalname).replace(/[^\w.\- ]/g, '_') };
}

app.post('/admin/eas', requireAdmin, upload.single('file'), (req, res) => {
  const code = String(req.body.code || '').trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(code) || db.prepare('SELECT 1 FROM eas WHERE code = ?').get(code)) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    flash(req, 'error', 'License code must be 2 to 40 letters, digits, _ or -, and unique.');
    return res.redirect('/admin/eas');
  }
  const f = saveUpload(req.file) || {};
  const info = db.prepare('INSERT INTO eas (code, name, version, description, file_name, file_path, active) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(code, String(req.body.name || code).trim(), String(req.body.version || '1.0').trim(),
      String(req.body.description || '').trim(), f.file_name || null, f.file_path || null, req.body.active ? 1 : 0);
  if (req.body.grant_all) {
    db.prepare(`INSERT OR IGNORE INTO user_eas (user_id, ea_id) SELECT id, ? FROM users WHERE status = 'active'`).run(info.lastInsertRowid);
  }
  flash(req, 'ok', 'EA added.');
  res.redirect('/admin/eas');
});

app.post('/admin/eas/:id', requireAdmin, upload.single('file'), (req, res) => {
  const e = db.prepare('SELECT * FROM eas WHERE id = ?').get(req.params.id);
  if (!e) return res.redirect('/admin/eas');
  const code = String(req.body.code || '').trim();
  const clash = db.prepare('SELECT 1 FROM eas WHERE code = ? AND id != ?').get(code, e.id);
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(code) || clash) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    flash(req, 'error', 'License code must be 2 to 40 letters, digits, _ or -, and unique.');
    return res.redirect('/admin/eas');
  }
  const f = saveUpload(req.file, e.file_path) || { file_name: e.file_name, file_path: e.file_path };
  db.prepare(`UPDATE eas SET code = ?, name = ?, version = ?, description = ?, file_name = ?, file_path = ?, active = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(code, String(req.body.name || code).trim(), String(req.body.version || '1.0').trim(),
      String(req.body.description || '').trim(), f.file_name, f.file_path, req.body.active ? 1 : 0, e.id);
  flash(req, 'ok', `${e.name} saved.`);
  res.redirect('/admin/eas');
});

app.post('/admin/eas/:id/grant-all', requireAdmin, (req, res) => {
  const r = db.prepare(`INSERT OR IGNORE INTO user_eas (user_id, ea_id) SELECT id, ? FROM users WHERE status = 'active'`).run(req.params.id);
  flash(req, 'ok', `Access given to ${r.changes} more users.`);
  res.redirect('/admin/eas');
});

app.post('/admin/eas/:id/delete', requireAdmin, (req, res) => {
  const e = db.prepare('SELECT * FROM eas WHERE id = ?').get(req.params.id);
  if (e) {
    if (e.file_path) fs.rm(path.join(FILES_DIR, e.file_path), { force: true }, () => {});
    db.prepare('DELETE FROM eas WHERE id = ?').run(e.id);
    flash(req, 'ok', `${e.name} deleted.`);
  }
  res.redirect('/admin/eas');
});

require('./pages')(app, { page, trialDays, PRICE_TEXT, PAID_DAYS, TRIAL_ACCOUNTS, MAX_ACCOUNTS_DEFAULT });

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    flash(req, 'error', 'Upload failed: ' + err.message);
    return res.redirect('/admin/eas');
  }
  res.status(500).send('Something went wrong.');
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`EA licensing site running on http://localhost:${PORT} (signup mode: ${SIGNUP_MODE})`));
}
module.exports = app;
