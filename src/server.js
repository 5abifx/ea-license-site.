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
const { esc, fmtDate, layout, authShell, SITE_NAME, PRICE_TEXT, trialDays } = require('./views');
const { PLANS, BILLING, getPlan, cleanBilling, maxSave } = require('./plans');
const { cinePage } = require('./cine');
const { cardStepHtml } = require('./cardstep');
const referrals = require('./referrals');
const botCheck = require('./turnstile');

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

// Main domain: send people who open the old address (or www) to it. EA licence
// calls (/api/...) are never redirected, so EAs built with the old address keep working.
const CANONICAL_HOST = (process.env.CANONICAL_HOST || '').trim().toLowerCase();
app.use((req, res, next) => {
  const host = String(req.get('host') || '').toLowerCase();
  if (!CANONICAL_HOST || host === CANONICAL_HOST || host.startsWith('localhost') || host.startsWith('127.')
    || req.path.startsWith('/api/') || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
});
// Security headers: no framing (clickjacking), no MIME sniffing, HTTPS only once on the live site
app.use((req, res, next) => {
  res.set({
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
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
// On HTTPS (the live site behind Render's proxy) the sign-in cookie is always marked Secure
app.use((req, res, next) => { if (req.secure && req.sessionOptions) req.sessionOptions.secure = true; next(); });

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
    // a password change signs out every other device: the session remembers which password it was made with
    if (u && u.status !== 'disabled' && (!req.session.pv || req.session.pv === pwTag(u))) {
      req.user = u;
      if (!req.session.pv) req.session.pv = pwTag(u);
    } else req.session = null;
  }
  next();
});

function pwTag(u) { return crypto.createHash('sha256').update(String(u.password_hash || '')).digest('hex').slice(0, 12); }
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };
const page = (req, res, title, body, opts) => res.send(layout(req, title, body, opts));
const refs = referrals.setup(app, { db, page });
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
// Tools only for the owner's mentorship students (e.g. the Auction Compass indicator).
// They are never sold in a plan: the admin ticks "Student" on the user's page, and only then
// does /api/check unlock them (the Journal EA relay passes that on to the indicator).
const STUDENT_ONLY = String(process.env.STUDENT_ONLY_EAS || 'COMPASS').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
const isStudentOnly = (e) => STUDENT_ONLY.includes(String(e.code || e).toUpperCase());
const isStudent = (u) => !!(u && (u.student || u.is_admin));
// Students get every student-only tool without the admin assigning them one by one
function studentEas(u) {
  if (!isStudent(u) || !STUDENT_ONLY.length) return [];
  return db.prepare(`SELECT * FROM eas WHERE active = 1 AND UPPER(code) IN (${STUDENT_ONLY.map(() => '?').join(', ')})`).all(...STUDENT_ONLY);
}

function studentOnlyNames() {
  if (!STUDENT_ONLY.length) return '';
  return db.prepare(`SELECT name FROM eas WHERE UPPER(code) IN (${STUDENT_ONLY.map(() => '?').join(', ')}) ORDER BY name`).all(...STUDENT_ONLY).map((e) => e.name).join(', ');
}

function grantAllActiveEas(userId) {
  db.prepare(`INSERT OR IGNORE INTO user_eas (user_id, ea_id) SELECT ?, id FROM eas WHERE active = 1`).run(userId);
}

// Wrong passwords per network in the last 15 minutes: after 3 the sign-in form asks for the bot check
const LOGIN_FAILS = 3;
const fails = new Map();
const failCount = (ip) => { const f = fails.get(ip); return f && f.reset > Date.now() ? f.n : 0; };
const addFail = (ip) => { const n = failCount(ip) + 1; fails.set(ip, { n, reset: Date.now() + 15 * 60 * 1000 }); };
// Very small in-memory rate limiter for login / signup
const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  h.n += 1;
  return h.n > max;
}

// Where to go after sign in / sign up: /signup?next=mentorship brings people back to the mentorship prices
const NEXT_PAGES = { mentorship: '/mentorship#price' };
function rememberNext(req) { if (NEXT_PAGES[req.query.next]) req.session.next = req.query.next; }
function takeNext(req, fallback) {
  const n = req.session && NEXT_PAGES[req.session.next];
  if (req.session) req.session.next = null;
  return n || fallback;
}

const { studentBox: mentorBox } = require('./mentor')(app, { db, page, flash, requireUser, requireAdmin });
require('./journal')(app, { db, page, flash, requireUser, isExpired, cleanAccount, mentorBox });

// ---------- auth ----------
// Signed-out home: the cinematic page (src/cine-pages/home.html + public/cine/home.*). Signed in: the dashboard.
app.get('/', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  const signup = SIGNUP_MODE !== 'closed';
  const trial = signup ? trialDays() : 0;
  const join = trial ? 'Start free trial' : 'Create account';
  const tiers = PLANS.map((p) => {
    const items = [
      ...(p.extrasTitle ? [['', esc(p.extrasTitle.replace(/, plus$/, ''))]] : []),
      ...p.features.map((f) => [p.extrasTitle ? 'hl' : '', esc(f)]),
    ];
    return `<article class="tier${p.popular ? ' top' : ''}">${p.popular ? '<span class="badge">Most popular</span>' : ''}<h3>${esc(p.name)}</h3><p class="for">${esc(p.tagline.charAt(0).toUpperCase() + p.tagline.slice(1))}</p>
<div class="amt"><span class="mem"><b data-m="$${p.monthly}" data-y="$${p.annual}">$${p.monthly}</b><i>/ month</i></span></div>
<ul>${items.map(([c, t]) => `<li${c ? ` class="${c}"` : ''}>${t}</li>`).join('')}</ul>
<div class="act"><a class="pb${p.popular ? ' pri' : ''}" href="/pricing?plan=${p.id}">${trial ? 'Start free trial' : `Choose ${esc(p.name)}`}</a></div></article>`;
  }).join('');
  const price = `<section class="band g" id="price">
  <div class="in">
    <div class="phead">
      <div><p class="k rv">Plans · USD${trial ? ` · ${trial}-day free trial` : ''}</p><h2 class="rv">One licence.<br><span class="m">The whole toolkit.</span></h2></div>
      <div class="view" role="group" aria-label="Billing"><button type="button" data-b="m" aria-pressed="true">Monthly</button><button type="button" data-b="y" aria-pressed="false">Annual · save ${maxSave()}%</button></div>
    </div>
    <div class="tiers rv" id="tiers">${tiers}</div>
    <p class="pfine">${trial ? `Every plan starts with a ${trial}-day free trial of all EAs. Cancel anytime.` : 'Cancel anytime.'}</p>
  </div>
</section>`;
  res.send(cinePage(req, 'home', {
    KICKER: `MT5 risk manager · trade journal${trial ? ` · ${trial}-day free trial` : ''}`,
    JOINBTN: signup ? `<a class="go pri" href="/signup">${join}</a>` : '',
    PRICE: price,
    CTA: signup ? `<a class="cta" href="/signup">${join}</a>` : '<a class="cta" href="/login">Sign in</a>',
  }, { title: `${SITE_NAME} · Risk manager & trade journal for MT5` }));
});

app.get('/login', (req, res) => {
  rememberNext(req);
  if (req.user) return res.redirect(takeNext(req, '/dashboard'));
  page(req, res, 'Sign in', authShell('Secure sign-in', 'Welcome back', 'Sign in to download your EAs, manage your MT5 accounts and open your journal.', `
    ${googleOn() ? `${googleButton('Sign in with Google')}<p class="or">or with email and password</p>` : ''}
    <form method="post" action="/login">
      <label>Email<input name="email" required autofocus autocomplete="username"></label>
      <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
      ${failCount(req.ip) >= LOGIN_FAILS ? botCheck.widget() : ''}
      <button>Continue</button>
    </form>
    ${SIGNUP_MODE !== 'closed' ? '<p class="muted">No account yet? <a href="/signup">Create one</a></p>' : ''}`));
});

app.post('/login', async (req, res) => {
  if (rateLimit('login:' + req.ip, 10, 15 * 60 * 1000)) {
    flash(req, 'error', 'Too many attempts. Try again in 15 minutes.');
    return res.redirect('/login');
  }
  if (failCount(req.ip) >= LOGIN_FAILS && !(await botCheck.passed(req))) {
    flash(req, 'error', 'Please complete the quick check above the button, then sign in again.');
    return res.redirect('/login');
  }
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(req.body.email || '').trim());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    addFail(req.ip);
    flash(req, 'error', 'Wrong email or password.');
    return res.redirect('/login');
  }
  if (u.status === 'disabled') {
    flash(req, 'error', 'This account is disabled. Please contact support.');
    return res.redirect('/login');
  }
  fails.delete(req.ip);
  req.session.pv = null;
  req.session.uid = u.id;
  res.redirect(takeNext(req, u.is_admin ? '/admin' : '/dashboard'));
});

app.post('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

app.get('/signup', (req, res) => {
  if (SIGNUP_MODE === 'closed') return res.redirect('/login');
  rememberNext(req);
  if (req.user) return res.redirect(takeNext(req, '/dashboard'));
  const trial = trialDays();
  if (req.session.next === 'mentorship') {
    // from the mentorship page: a free account to see the prices, no card needed
    return page(req, res, 'Create account', authShell('5ABI.FX Mentorship', 'See the mentorship prices', 'Create a free account. No card needed. You go straight back to the plans.', `
    ${googleOn() ? googleButton('Continue with Google') : `
    <form method="post" action="/signup">
      <label>Name<input name="name" required maxlength="80" autocomplete="name"></label>
      <label>Email<input type="email" name="email" required maxlength="120" autocomplete="email"></label>
      <label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
      ${botCheck.widget()}
      <button>See the prices</button>
    </form>`}
    <p class="muted">Already have an account? <a href="/login?next=mentorship">Sign in</a></p>`));
  }
  page(req, res, 'Create account', authShell(
    trial ? `${trial}-day free trial` : 'New account',
    trial ? `Start your ${trial}-day free trial` : 'Create your account',
    trial ? (stripe.cardTrial() ? `Full access to every EA. Add a card to start, you are not charged for ${trial} days. Cancel anytime before.` : `Full access to every EA, no payment needed. After the trial, plans start at ${PRICE_TEXT}.`) : 'Use the same email you paid with so we can match your purchase.', `
    ${googleOn() ? `${googleButton(trial ? 'Start free trial with Google' : 'Sign up with Google')}
    <p class="muted">We use your Google account to keep one free trial per person. We only receive your name and email.</p>` : `
    <form method="post" action="/signup">
      <label>Name<input name="name" required maxlength="80" autocomplete="name"></label>
      <label>Email<input type="email" name="email" required maxlength="120" autocomplete="email"></label>
      <label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
      ${botCheck.widget()}
      <button>${trial ? 'Start free trial' : 'Create account'}</button>
    </form>`}
    ${!trial && SIGNUP_MODE === 'approval' ? '<p class="muted">Your account will be activated after we confirm your purchase.</p>' : ''}
    <p class="muted">Already have an account? <a href="/login">Sign in</a></p>`));
});

// Creates a customer account: a free trial when TRIAL_DAYS is set, otherwise SIGNUP_MODE decides. Returns the new user id.
function createCustomer(req, { name, email, passwordHash, googleSub = null }) {
  const trial = trialDays();
  let info;
  if (trial && stripe.cardTrial()) {
    // Card trial: the account exists but nothing works until a card is added in Stripe Checkout,
    // which starts the TRIAL_DAYS free trial (first charge after the trial)
    info = db.prepare(`INSERT INTO users (email, name, password_hash, status, max_accounts, expires_at, trial, google_sub)
                       VALUES (?, ?, ?, 'active', ?, datetime('now'), 0, ?)`)
      .run(email, name, passwordHash, TRIAL_ACCOUNTS, googleSub);
    grantAllActiveEas(info.lastInsertRowid);
    flash(req, 'ok', req.session.next === 'mentorship' ? 'Account created. Here are the mentorship prices.'
      : `Account created. Pick a plan and add a card to start your ${trial}-day free trial. You are not charged until the trial ends.`);
  } else if (trial) {
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
  refs.attach(req, Number(info.lastInsertRowid));
  return Number(info.lastInsertRowid);
}

app.post('/signup', async (req, res) => {
  if (SIGNUP_MODE === 'closed') return res.redirect('/login');
  if (googleOn()) {
    flash(req, 'error', 'Please sign up with your Google account.');
    return res.redirect('/signup');
  }
  if (rateLimit('signup:' + req.ip, 5, 60 * 60 * 1000)) {
    flash(req, 'error', 'Too many sign ups from your network. Try again later.');
    return res.redirect('/signup');
  }
  if (!(await botCheck.passed(req))) {
    flash(req, 'error', 'Please complete the quick check above the button, then try again.');
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
  req.session.pv = null;
  req.session.uid = createCustomer(req, { name, email, passwordHash: bcrypt.hashSync(password, 10) });
  res.redirect(takeNext(req, '/dashboard'));
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
  fails.delete(req.ip);
  req.session.pv = null;
  req.session.uid = u.id;
  res.redirect(takeNext(req, u.is_admin ? '/admin' : '/dashboard'));
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
  const hash = bcrypt.hashSync(pw, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  req.session.pv = pwTag({ password_hash: hash });   // this device stays signed in, others are signed out
  flash(req, 'ok', 'Password changed. Other devices are signed out.');
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
                          WHERE ue.user_id = ? AND e.active = 1 ORDER BY e.name`).all(u.id)
    .filter((e) => !isStudentOnly(e));
  eas.push(...studentEas(u));
  const student = isStudent(u);
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at').all(u.id);
  const full = accounts.length >= u.max_accounts;
  const needsCard = stripe.needsCardTrial(u);
  const expired = isExpired(u) && !needsCard;

  page(req, res, 'My EAs', `
  <h1>Welcome${u.name ? ', ' + esc(u.name) : ''}</h1>
  ${needsCard ? cardStepHtml({ trial: trialDays() }) : ''}
  ${expired ? `<div class="notice error"><div><strong>${u.trial ? 'Your free trial has ended.' : 'Your license has expired.'}</strong>
    Your EAs will stop working until you pick a plan. Plans start at $${PLANS[0].monthly}/month.</div><a class="btn" href="/pricing">See plans</a></div>` : ''}
  ${u.trial && !expired ? `<div class="notice"><div><strong>Free trial: ${daysLeft(u)} day${daysLeft(u) === 1 ? '' : 's'} left</strong>
    (until ${fmtDate(u.expires_at)} UTC). Pick a plan to keep trading after that.</div><a class="btn" href="/pricing">See plans</a></div>` : ''}
  ${u.expires_at && !expired && !u.trial && !needsCard ? `<p class="muted">${getPlan(u.plan) ? `${esc(getPlan(u.plan).name)} plan (${esc(BILLING[cleanBilling(u.billing)].label.toLowerCase())}) · ` : ''}License valid until ${fmtDate(u.expires_at)} (UTC) · <a href="/pricing">Plans</a></p>` : ''}

  ${req.query.paid && u.plan_request ? '<div class="notice"><div><strong>Thanks for your payment!</strong> Your plan switches on in a moment. Refresh this page if it does not show yet.</div></div>' : ''}
  ${u.stripe_customer ? `<form method="post" action="/billing" class="row"><span class="muted">${u.stripe_sub ? 'Card subscription active.' : 'Card subscription ended.'}</span><button class="small secondary">Manage billing</button></form>` : ''}
  <section class="card dash-eas">
    <h2>1. Download your EA</h2>
    ${eas.length ? `<div class="ea-list">${eas.map((e) => `
      <div class="ea">
        <div><strong>${esc(e.name)}</strong> <span class="tag">v${esc(e.version)}</span>
        ${e.description ? `<p class="muted">${esc(e.description)}</p>` : ''}</div>
        ${e.file_path ? `<a class="btn" href="/download/${e.id}">Download</a>` : '<span class="muted">Coming soon</span>'}
      </div>`).join('')}</div>`
    : '<p class="muted">No EAs are assigned to your account yet.</p>'}
  </section>

  <div class="dash-split">
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
    <p class="muted">Want the 5ABI.FX look on your charts? Download the chart template <a href="/templates/5ABI.FX.tpl" download>5ABI.FX.tpl</a> ${student ? '(or <a href="/templates/5ABI.FX%20Compass.tpl" download>with Auction Compass</a>)' : ''}, put it in <strong>File → Open Data Folder → MQL5 → Profiles → Templates</strong>, then right-click a chart → <strong>Templates</strong>.</p>
    <p class="muted">Prop firm account says <strong>"AutoTrading disabled by server"</strong>? <a href="/help/ea-blocked">Get a ready-to-send email for their support</a>.</p>
  </section>
  </div>
  <div class="dash-split">
  ${req.hasJournal ? `<section class="card">
    <h2>4. Trade Journal</h2>
    <p>Every trade you close is logged automatically and turned into share cards. <a href="/journal">Open your journal</a> to get your journal key and set up the Trade Journal EA.</p>
    ${student && eas.some(isStudentOnly) ? '<p class="muted">Indicators like Auction Compass unlock by themselves while the Trade Journal EA runs on any chart in the same MT5. Put indicators in <strong>MQL5 → Indicators</strong>.</p>' : ''}
  </section>` : ''}
  ${u.is_admin ? '' : refs.card(req, u)}
  </div>`);
});

app.post('/accounts', requireUser, (req, res) => {
  const u = req.user;
  if (u.status !== 'active') return res.redirect('/dashboard');
  const num = cleanAccount(req.body.account_number);
  if (!num) { flash(req, 'error', 'Account number must contain digits only.'); return res.redirect('/dashboard'); }
  const count = db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?').get(u.id).n;
  if (count >= u.max_accounts) { flash(req, 'error', `You can register at most ${u.max_accounts} accounts.`); return res.redirect('/dashboard'); }
  if (u.trial || stripe.needsCardTrial(u)) {
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
                        WHERE e.id = ? AND ue.user_id = ? AND e.active = 1`).get(req.params.id, u.id)
    || studentEas(u).find((x) => String(x.id) === String(req.params.id));
  if (u.status !== 'active' || !e || !e.file_path || (isStudentOnly(e) && !isStudent(u))) return res.status(404).send('Not found');
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

  // A student-only tool (Auction Compass) works only for users the admin marked as a student
  // (or an admin), on any account they added. Plans and per-user EA ticks do not unlock it.
  const studentOnly = isStudentOnly(ea);
  const rows = studentOnly
    ? db.prepare(`
      SELECT a.id AS account_id, u.* FROM accounts a
      JOIN users u ON u.id = a.user_id
      WHERE a.account_number = ? AND u.status = 'active' AND (u.student = 1 OR u.is_admin = 1)`).all(num)
    : db.prepare(`
      SELECT a.id AS account_id, u.* FROM accounts a
      JOIN users u ON u.id = a.user_id
      JOIN user_eas ue ON ue.user_id = u.id AND ue.ea_id = ?
      WHERE a.account_number = ? AND u.status = 'active'`).all(ea.id, num);
  const ok = rows.find((u) => !isExpired(u));
  if (!ok) {
    return reply(false, rows.length ? 'License expired' : studentOnly ? 'Only for 5ABI.FX students' : 'Account not registered for this EA',
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
  const early = earlyNonStudents().length;

  page(req, res, 'Admin', `
  <h1>Admin</h1>
  <div class="tabs"><a class="on" href="/admin">Users</a><a href="/admin/eas">EAs (${eas.length})</a><a href="/admin/mentorship">Mentorship</a></div>

  <section class="card">
    <div class="row between">
      <h2>Users ${pending ? `<span class="tag warn">${pending} waiting for approval</span>` : ''}</h2>
      <form method="get" action="/admin" class="row"><input name="q" value="${esc(q)}" placeholder="Search email, name or account number"><button class="secondary">Search</button></form>
    </div>
    ${early ? `<form method="post" action="/admin/users/early-students" class="notice" onsubmit="return confirm('Mark ${early} user${early === 1 ? '' : 's'} with no expiry date as students?')">
      <span><strong>${early} user${early === 1 ? '' : 's'} with no expiry date ${early === 1 ? 'is' : 'are'} not marked as student yet</strong> (early members, not on a trial or a paid plan).</span>
      <button class="small">Mark them all as students</button></form>` : ''}
    <form method="post" action="/admin/users/bulk" id="bulk" class="row bulk-bar">
      <span class="muted">With the ticked users:</span>
      <select name="action" aria-label="Bulk action">
        <option value="student_on">Make student</option>
        <option value="student_off">Remove student</option>
        <option value="expiry">Set expiry date to</option>
        <option value="never">Never expire</option>
        <option value="trial">Start a free trial of</option>
      </select>
      <input type="date" name="expires_at" aria-label="Expiry date">
      <label class="row-inline"><input type="number" name="trial_days" value="${trialDays() || 15}" min="1" max="365" style="width:5em" aria-label="Trial days"> days (trial)</label>
      <button class="small secondary">Apply</button>
    </form>
    <table class="user-list"><thead><tr><th><input type="checkbox" aria-label="Tick all" onclick="document.querySelectorAll('input[form=bulk][name=ids]').forEach((c) => { c.checked = this.checked; })"></th><th>User</th><th>Status</th><th>EAs</th><th>Accounts</th><th>Expires</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr>
      <td class="ul-tick"><input type="checkbox" form="bulk" name="ids" value="${u.id}" aria-label="Tick ${esc(u.email)}"></td>
      <td class="ul-user"><a href="/admin/users/${u.id}"><strong>${esc(u.name || '-')}</strong></a><br><span class="muted">${esc(u.email)}</span>${u.is_admin ? ' <span class="tag">admin</span>' : ''}${u.student ? ' <span class="tag">student</span>' : ''}</td>
      <td data-l="Status"><span class="status ${esc(u.status)}">${esc(u.status)}</span>${u.trial ? ' <span class="tag warn">trial</span>' : ''}${u.plan && !u.trial ? ` <span class="tag">${esc((getPlan(u.plan) || {}).name || u.plan)}</span>` : ''}${u.plan_request ? ' <span class="tag warn">wants a plan</span>' : ''}</td>
      <td data-l="EAs">${esc((u.ea_codes || '').split(', ').filter((c) => c && !isStudentOnly(c)).join(', ') || '-')}</td>
      <td data-l="Accounts">${u.n_acc} / ${u.max_accounts}</td>
      <td data-l="Expires">${stripe.needsCardTrial(u) ? '<span class="tag" title="Signed up but has not added a card yet, so the free trial has not started">no card yet</span>'
        : `${u.expires_at ? fmtDate(u.expires_at) : 'never'}${isExpired(u) ? ' <span class="tag warn">expired</span>' : ''}`}</td>
      <td class="nowrap ul-act">${u.status === 'pending' ? `<form method="post" action="/admin/users/${u.id}/approve" class="inline"><button class="small">Approve</button></form>` : ''}
        <a class="btn small secondary" href="/admin/users/${u.id}">Manage</a></td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">No users found.</td></tr>'}
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

// Put an existing user on a free trial: active, every active EA, expires in `days` days from now.
// Clears any paid plan. Their MT5 accounts are recorded as trial accounts, like a new sign-up's.
const cleanTrialDays = (v) => Math.min(365, Math.max(1, Math.round(Number(v)) || trialDays() || 15));
function startTrial(userId, days) {
  const r = db.prepare(`UPDATE users SET trial = 1, status = 'active', plan = '', billing = '', plan_request = '',
    expires_at = datetime('now', ?) WHERE id = ? AND is_admin = 0`).run(`+${days} days`, userId);
  if (!r.changes) return 0;
  grantAllActiveEas(userId);
  db.prepare('INSERT OR IGNORE INTO trial_accounts (account_number, user_id) SELECT account_number, user_id FROM accounts WHERE user_id = ?').run(userId);
  return 1;
}
app.post('/admin/users/:id/trial', requireAdmin, (req, res) => {
  const days = cleanTrialDays(req.body.trial_days);
  const ok = startTrial(Number(req.params.id), days);
  flash(req, ok ? 'ok' : 'error', ok ? `${days}-day free trial started.` : 'Admins cannot be put on a trial.');
  res.redirect(`/admin/users/${req.params.id}`);
});

// Early members: active, never expire, not on a trial, no paid plan, not an admin
function earlyNonStudents() {
  return db.prepare(`SELECT id FROM users WHERE student = 0 AND is_admin = 0 AND trial = 0 AND plan = ''
    AND expires_at IS NULL AND status = 'active'`).all();
}
app.post('/admin/users/early-students', requireAdmin, (req, res) => {
  const ids = earlyNonStudents().map((u) => u.id);
  const upd = db.prepare('UPDATE users SET student = 1 WHERE id = ?');
  db.transaction(() => ids.forEach((id) => upd.run(id)))();
  flash(req, 'ok', `${ids.length} user${ids.length === 1 ? '' : 's'} marked as student${ids.length === 1 ? '' : 's'}.`);
  res.redirect('/admin');
});
app.post('/admin/users/bulk', requireAdmin, (req, res) => {
  const ids = [].concat(req.body.ids || []).map(Number).filter(Boolean);
  const action = String(req.body.action || '');
  if (!ids.length) { flash(req, 'error', 'Tick at least one user first.'); return res.redirect('/admin'); }
  let stmt, arg, done;
  if (action === 'student_on') { stmt = 'UPDATE users SET student = 1 WHERE id = ?'; done = 'marked as student'; }
  else if (action === 'student_off') { stmt = 'UPDATE users SET student = 0 WHERE id = ?'; done = 'no longer students'; }
  else if (action === 'never') { stmt = 'UPDATE users SET expires_at = NULL WHERE id = ?'; done = 'set to never expire'; }
  else if (action === 'expiry') {
    arg = parseExpiry(req.body.expires_at);
    if (!arg) { flash(req, 'error', 'Pick an expiry date.'); return res.redirect('/admin'); }
    stmt = 'UPDATE users SET expires_at = ? WHERE id = ? AND is_admin = 0'; done = `set to expire on ${arg.slice(0, 10)} (admins skipped)`;
  } else if (action === 'trial') {
    const days = cleanTrialDays(req.body.trial_days);
    let n = 0;
    db.transaction(() => ids.forEach((id) => { n += startTrial(id, days); }))();
    flash(req, 'ok', `${n} user${n === 1 ? '' : 's'} started a ${days}-day free trial (admins skipped).`);
    return res.redirect('/admin');
  } else { flash(req, 'error', 'Pick an action.'); return res.redirect('/admin'); }
  const upd = db.prepare(stmt);
  let n = 0;
  db.transaction(() => ids.forEach((id) => { n += (arg ? upd.run(arg, id) : upd.run(id)).changes; }))();
  flash(req, 'ok', `${n} user${n === 1 ? '' : 's'} ${done}.`);
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
      <h2>License ${u.trial ? '<span class="tag warn">free trial</span>' : ''}${stripe.needsCardTrial(u) ? ' <span class="tag">no card yet</span>' : ''}</h2>
      <form method="post" action="/admin/users/${u.id}/paid" class="row paid-form">
        ${(() => { const [rp, rb] = (u.plan_request || '').split(':'); const cp = rp || u.plan || 'katana', cb = rb || u.billing || 'monthly';
          return `<select name="plan" aria-label="Plan">${PLANS.map((p) => `<option value="${p.id}" ${p.id === cp ? 'selected' : ''}>${esc(p.name)} (${p.accounts} acct)</option>`).join('')}</select>
          <select name="billing" aria-label="Billing">${Object.entries(BILLING).map(([k, b]) => `<option value="${k}" ${k === cb ? 'selected' : ''}>${b.label} (+${k === 'annual' ? b.days : PAID_DAYS} days)</option>`).join('')}</select>`; })()}
        <button class="small">Mark as paid</button></form>
    </div>
    ${u.is_admin ? '' : `<form method="post" action="/admin/users/${u.id}/trial" class="row" onsubmit="return confirm('Start a free trial for this user? Their expiry date changes and any paid plan is cleared.')">
      <span class="muted">Free trial:</span>
      <input type="number" name="trial_days" value="${trialDays() || 15}" min="1" max="365" style="width:5em" aria-label="Trial days"> <span class="muted">days from today</span>
      <button class="small secondary">${u.trial ? 'Restart free trial' : 'Start free trial'}</button></form>`}
    ${stripe.needsCardTrial(u) ? `<p class="notice"><span>Signed up but has not added a card yet, so the ${trialDays()}-day free trial has not started. Nothing runs until they pick a plan and add a card (or you start a trial or mark them paid).</span></p>` : ''}
    ${u.plan_request ? `<p class="notice"><span>Requested on the site: <strong>${esc((getPlan(u.plan_request.split(':')[0]) || {}).name || u.plan_request)}</strong>, ${esc(u.plan_request.split(':')[1] || '')}. Check the payment, then press Mark as paid.</span></p>` : ''}
    ${refs.adminNote(u)}
    ${u.plan ? `<p class="muted">Current plan: <strong>${esc((getPlan(u.plan) || {}).name || u.plan)}</strong> · ${esc(u.billing)}</p>` : ''}
    <div>
    </div>
    <form method="post" action="/admin/users/${u.id}" class="grid">
      <label>Name<input name="name" value="${esc(u.name)}"></label>
      <label>Status<select name="status">${['pending', 'active', 'disabled'].map((s) => `<option ${s === u.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Max accounts<input type="number" name="max_accounts" value="${u.max_accounts}" min="0" max="1000"></label>
      <label>Expires (blank = never)<input type="date" name="expires_at" value="${esc(expDate)}"></label>
      <fieldset><legend>Mentorship</legend><label class="check"><input type="checkbox" name="student" value="1" ${u.student ? 'checked' : ''}> Student: unlocks ${esc(studentOnlyNames() || 'the student-only tools')} on all their MT5 accounts</label></fieldset>
      <fieldset><legend>EAs this user can download and run</legend>${eas.filter((e) => !isStudentOnly(e)).map((e) => `<label class="check"><input type="checkbox" name="ea" value="${e.id}" ${e.granted ? 'checked' : ''}> ${esc(e.name)} <span class="muted">(${esc(e.code)})</span></label>`).join('') || '<span class="muted">No EAs yet</span>'}</fieldset>
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
  const plan = getPlan(req.body && req.body.plan);
  const billing = cleanBilling(req.body && req.body.billing);
  const refNote = applyPaid(u, plan, billing);
  const after = db.prepare('SELECT expires_at FROM users WHERE id = ?').get(u.id).expires_at;
  flash(req, 'ok', `${u.email} marked as paid${plan ? ` on ${plan.name} (${billing})` : ''}. License now valid until ${after.slice(0, 16)} UTC.${refNote}`);
  res.redirect(`/admin/users/${u.id}`);
});

// A payment came in (admin "Mark as paid" or Stripe): end the trial, apply the plan, extend the licence
// from today or from the current expiry, whichever is later. `until` (UTC 'YYYY-MM-DD HH:MM:SS', e.g. the
// end of the Stripe billing period) is used instead when it is later. Returns the referral note ('' if none).
function applyPaid(u, plan, billing, until = null) {
  const days = plan && billing === 'annual' ? BILLING.annual.days : PAID_DAYS;
  const from = u.expires_at && !isExpired(u) ? u.expires_at : new Date().toISOString().slice(0, 19).replace('T', ' ');
  let refNote = '';
  db.transaction(() => {
    refNote = refs.rewardOnPaid(u);
    db.prepare(`UPDATE users SET trial = 0, status = 'active', expires_at = datetime(?, ?), plan_request = '' WHERE id = ?`).run(from, `+${days} days`, u.id);
    if (until) db.prepare('UPDATE users SET expires_at = MAX(expires_at, ?) WHERE id = ?').run(until, u.id);
    if (plan) {
      // the plan decides the account limit and which EAs the customer gets
      db.prepare('UPDATE users SET plan = ?, billing = ?, max_accounts = ? WHERE id = ?').run(plan.id, billing, plan.accounts, u.id);
      db.prepare('DELETE FROM user_eas WHERE user_id = ?').run(u.id);
      if (plan.eas === 'all') grantAllActiveEas(u.id);
      else db.prepare(`INSERT OR IGNORE INTO user_eas (user_id, ea_id) SELECT ?, id FROM eas WHERE active = 1 AND code IN (${plan.eas.map(() => '?').join(', ')})`).run(u.id, ...plan.eas);
    } else {
      db.prepare('UPDATE users SET max_accounts = MAX(max_accounts, ?) WHERE id = ?').run(MAX_ACCOUNTS_DEFAULT, u.id);
      if (!db.prepare('SELECT 1 FROM user_eas WHERE user_id = ?').get(u.id)) grantAllActiveEas(u.id);
    }
  })();
  return refNote;
}

app.post('/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = ['pending', 'active', 'disabled'].includes(req.body.status) ? req.body.status : 'pending';
  const self = id === req.user.id;
  db.prepare('UPDATE users SET name = ?, status = ?, max_accounts = ?, expires_at = ?, student = ? WHERE id = ?')
    .run(String(req.body.name || '').trim(), self ? 'active' : status,
      Math.max(0, Number(req.body.max_accounts) || 0), parseExpiry(req.body.expires_at), req.body.student ? 1 : 0, id);
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
  <div class="tabs"><a href="/admin">Users</a><a class="on" href="/admin/eas">EAs (${eas.length})</a><a href="/admin/mentorship">Mentorship</a></div>
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

require('./help')(app, { db, page });
const mentor = require('./mentorship')(app, { db, page, flash, requireUser, requireAdmin, grantAllActiveEas, PAYMENT_URL });
const stripe = require('./stripe')(app, { db, flash, requireUser, applyPaid, startTrial, refs, mentor });
require('./pricing')(app, { db, page, requireUser, trialDays, PAYMENT_URL, CONTACT_URL: process.env.CONTACT_URL || '', refs, stripe });
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
