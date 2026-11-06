// Admin > Security: the 6-digit sign-in code (Google Authenticator or any authenticator app)
// and the nightly backup status. Sign-ins of anyone with the code turned on stop at /login/code.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { esc } = require('./views');

// ---- TOTP (RFC 6238: 30-second steps, 6 digits, SHA-1, what every authenticator app uses) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(s) {
  let bits = 0, val = 0; const out = [];
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const stepNow = () => Math.floor(Date.now() / 30000);
// Returns the matching step (one step of clock drift allowed), or 0. A step already used is refused.
function checkCode(secret, code, lastStep = 0) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return 0;
  for (const s of [stepNow() - 1, stepNow(), stepNow() + 1]) {
    if (s > lastStep && crypto.timingSafeEqual(Buffer.from(totp(secret, s)), Buffer.from(c))) return s;
  }
  return 0;
}
const hashCode = (c) => crypto.createHash('sha256').update(String(c).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
const newRecovery = () => Array.from({ length: 8 }, () => {
  const s = crypto.randomBytes(5).toString('hex');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
});

module.exports = function security(app, { db, page, flash, requireAdmin, rateLimit, finishSignIn, backup, SITE_NAME }) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('totp_secret')) db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');          // set = code turned on
  if (!cols.includes('totp_pending')) db.exec('ALTER TABLE users ADD COLUMN totp_pending TEXT');        // during set-up only
  if (!cols.includes('totp_step')) db.exec('ALTER TABLE users ADD COLUMN totp_step INTEGER NOT NULL DEFAULT 0');   // last used code, so it cannot be used twice
  if (!cols.includes('totp_recovery')) db.exec("ALTER TABLE users ADD COLUMN totp_recovery TEXT NOT NULL DEFAULT '[]'");

  // Lost phone and recovery codes: put the account's email in TOTP_RESET_EMAIL on Render, deploy,
  // sign in with the password only, then remove the variable and set the code up again.
  const reset = String(process.env.TOTP_RESET_EMAIL || '').trim();
  if (reset) {
    const r = db.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_recovery = '[]' WHERE email = ?").run(reset);
    if (r.changes) console.log(`Sign-in code turned off for ${reset} (TOTP_RESET_EMAIL). Remove that variable now.`);
  }

  // ---- the second step of signing in ----
  const pending = (req) => {
    const p = req.session && req.session.code2;
    return p && Date.now() - p.at < 10 * 60 * 1000 ? db.prepare('SELECT * FROM users WHERE id = ?').get(p.uid) : null;
  };
  app.get('/login/code', (req, res) => {
    if (!pending(req)) return res.redirect('/login');
    page(req, res, 'Sign-in code', `
    <div class="card narrow">
      <h1>Enter your sign-in code</h1>
      <p class="muted">Open your authenticator app and type the 6-digit code for ${esc(SITE_NAME)}.</p>
      <form method="post" action="/login/code">
        <label>6-digit code<input name="code" required autofocus inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}|[A-Za-z0-9-]{10,11}" maxlength="11"></label>
        <button>Sign in</button>
      </form>
      <p class="muted small">Lost your phone? Type one of your recovery codes instead.</p>
    </div>`);
  });
  app.post('/login/code', (req, res) => {
    const u = pending(req);
    if (!u) return res.redirect('/login');
    if (rateLimit('code:' + u.id, 6, 15 * 60 * 1000)) {
      flash(req, 'error', 'Too many tries. Wait 15 minutes, then sign in again.');
      req.session.code2 = null;
      return res.redirect('/login');
    }
    const code = String(req.body.code || '').trim();
    const step = checkCode(u.totp_secret, code, u.totp_step);
    let ok = false;
    if (step) {
      db.prepare('UPDATE users SET totp_step = ? WHERE id = ?').run(step, u.id);
      ok = true;
    } else {
      const list = JSON.parse(u.totp_recovery || '[]');
      const i = list.indexOf(hashCode(code));
      if (code.replace(/\W/g, '').length === 10 && i >= 0) {
        list.splice(i, 1);
        db.prepare('UPDATE users SET totp_recovery = ? WHERE id = ?').run(JSON.stringify(list), u.id);
        ok = true;
        flash(req, 'ok', `Recovery code used. ${list.length} left. Set up a new phone in Admin > Security.`);
      }
    }
    if (!ok) { flash(req, 'error', 'That code is not right. Codes change every 30 seconds.'); return res.redirect('/login/code'); }
    req.session.code2 = null;
    finishSignIn(req, res, u, true);
  });

  // ---- Admin > Security ----
  const tabs = '<div class="tabs"><a href="/admin/sales">Dashboard</a><a href="/admin">Users</a><a href="/admin/eas">EAs</a><a href="/admin/mentorship">Mentorship</a><a class="on" href="/admin/security">Security</a></div>';
  const when = (iso) => iso ? new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Vancouver', dateStyle: 'medium', timeStyle: 'short' }) + ' (Vancouver)' : 'never';

  function codeCard(u, recovery) {
    if (recovery) {
      return `<section class="card"><h2>Sign-in code is ON ✓</h2>
      <p><strong>Save these recovery codes now</strong> (screenshot or write them down). Each one works once if you lose your phone. They are not shown again.</p>
      <pre class="rec-codes">${recovery.map(esc).join('\n')}</pre>
      <a class="btn" href="/admin/security">Done, I saved them</a></section>`;
    }
    if (u.totp_secret) {
      const left = JSON.parse(u.totp_recovery || '[]').length;
      return `<section class="card"><h2>Sign-in code <span class="tag ok">ON</span></h2>
      <p>Your password alone no longer opens this account. Every sign-in also asks for the 6-digit code from your authenticator app. ${left} recovery code${left === 1 ? '' : 's'} left.</p>
      <details><summary>New phone or turn it off</summary>
        <form method="post" action="/admin/security/code/off" class="grid">
          <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
          <label>Code from the app now<input name="code" required inputmode="numeric" maxlength="7"></label>
          <div><button class="secondary">Turn off</button></div>
        </form>
        <p class="muted small">To move to a new phone, turn it off here and set it up again.</p>
      </details></section>`;
    }
    if (u.totp_pending) {
      const label = encodeURIComponent(`${SITE_NAME}:${u.email}`);
      const link = `otpauth://totp/${label}?secret=${u.totp_pending}&issuer=${encodeURIComponent(SITE_NAME)}&digits=6&period=30`;
      return `<section class="card"><h2>Set up your sign-in code</h2>
      <ol>
        <li>Install <strong>Google Authenticator</strong> (or Microsoft Authenticator / Authy) on your phone.</li>
        <li><strong>On the phone:</strong> tap <a href="${esc(link)}">Add to authenticator app</a>.<br>
          <span class="muted">Or in the app tap + → <em>Enter a setup key</em>, name it ${esc(SITE_NAME)}, and type this key:</span>
          <code class="setup-key">${u.totp_pending.match(/.{1,4}/g).join(' ')}</code></li>
        <li>Type the 6-digit code the app now shows:</li>
      </ol>
      <form method="post" action="/admin/security/code/confirm" class="row">
        <input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" aria-label="6-digit code">
        <button>Turn on</button>
      </form>
      <form method="post" action="/admin/security/code/cancel"><button class="link">Cancel</button></form></section>`;
    }
    return `<section class="card notice"><h2>Sign-in code <span class="tag warn">OFF</span></h2>
      <p>Right now your password alone opens Admin. Turn on a 6-digit code from an app on your phone, so a stolen password is not enough. It takes 2 minutes.</p>
      <form method="post" action="/admin/security/code/start"><button>Set up sign-in code</button></form></section>`;
  }

  function backupCard() {
    const s = backup.status();
    const size = s.size ? `${(s.size / 1048576).toFixed(s.size > 1048576 ? 1 : 2)} MB` : '';
    const state = !s.cloudOn ? '<span class="tag warn">NOT SET UP</span>' : s.healthy ? '<span class="tag ok">WORKING</span>' : '<span class="tag bad">LATE</span>';
    return `<section class="card"><h2>Nightly backup ${state}</h2>
      ${s.cloudOn ? `<p>Every night the whole database (members, licences, journals, payments) is copied, locked with your backup password and sent to your cloud storage. The last 30 nights are kept, older ones are replaced automatically.</p>
      <table><tbody>
        <tr><th>Last backup</th><td>${esc(when(s.lastOk))}${size ? ` · ${size}` : ''}</td></tr>
        ${s.key ? `<tr><th>File</th><td><code>${esc(s.key)}</code></td></tr>` : ''}
        ${s.error ? `<tr><th>Last problem</th><td class="err">${esc(s.error)}</td></tr>` : ''}
      </tbody></table>
      <form method="post" action="/admin/security/backup" class="row"><button class="secondary">Back up now</button></form>`
      : `<p>Backups are not switched on yet, so there is only one copy of your data (on the Render disk). Add these on Render → Environment, then deploy:</p>
      <ul>
        <li>${s.lockOn ? '✓' : '○'} <code>BACKUP_PASSWORD</code>: a long password only you know (12+ characters). Keep it in your password manager: without it a backup cannot be opened.</li>
        <li>○ <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code>, <code>R2_SECRET_ACCESS_KEY</code>, <code>R2_BUCKET</code>: from Cloudflare R2.</li>
      </ul>`}
      ${s.lockOn ? '<p><a class="btn small secondary" href="/admin/security/download">Download a locked copy now</a> <span class="muted small">Opens only with your backup password.</span></p>' : ''}
    </section>`;
  }

  const show = (req, res, recovery) => page(req, res, 'Security', `<h1>Admin</h1>${tabs}${codeCard(req.user, recovery)}${backupCard()}`);
  app.get('/admin/security', requireAdmin, (req, res) => show(req, res));
  app.post('/admin/security/code/start', requireAdmin, (req, res) => {
    db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(b32encode(crypto.randomBytes(20)), req.user.id);
    res.redirect('/admin/security');
  });
  app.post('/admin/security/code/cancel', requireAdmin, (req, res) => {
    db.prepare('UPDATE users SET totp_pending = NULL WHERE id = ?').run(req.user.id);
    res.redirect('/admin/security');
  });
  app.post('/admin/security/code/confirm', requireAdmin, (req, res) => {
    const u = req.user;
    const step = u.totp_pending && checkCode(u.totp_pending, req.body.code);
    if (!step) { flash(req, 'error', 'That code is not right. Check the app and try the newest code.'); return res.redirect('/admin/security'); }
    const codes = newRecovery();
    db.prepare('UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_step = ?, totp_recovery = ? WHERE id = ?')
      .run(step, JSON.stringify(codes.map(hashCode)), u.id);
    req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    show(req, res, codes);
  });
  app.post('/admin/security/code/off', requireAdmin, (req, res) => {
    const u = req.user;
    if (rateLimit('codeoff:' + u.id, 5, 15 * 60 * 1000) || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)
        || !checkCode(u.totp_secret, req.body.code, u.totp_step)) {
      flash(req, 'error', 'Password or code is not right.');
      return res.redirect('/admin/security');
    }
    db.prepare("UPDATE users SET totp_secret = NULL, totp_recovery = '[]' WHERE id = ?").run(u.id);
    flash(req, 'ok', 'Sign-in code turned off.');
    res.redirect('/admin/security');
  });
  app.post('/admin/security/backup', requireAdmin, async (req, res) => {
    const r = await backup.run();
    flash(req, r.ok ? 'ok' : 'error', r.ok ? 'Backup sent to your storage.' : `Backup failed: ${r.error}`);
    res.redirect('/admin/security');
  });
  app.get('/admin/security/download', requireAdmin, async (req, res) => {
    if (!backup.lockOn()) return res.redirect('/admin/security');
    const file = await backup.snapshot();
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="5abifx-backup-${new Date().toISOString().slice(0, 10)}.5abi"`, 'Cache-Control': 'no-store' });
    res.send(file);
  });
};
module.exports.totp = totp;
module.exports.checkCode = checkCode;
module.exports.b32encode = b32encode;
module.exports.b32decode = b32decode;
