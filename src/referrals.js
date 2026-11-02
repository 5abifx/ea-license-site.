// Referral codes: each customer gets a link /r/CODE. A friend who signs up through it gets REF_DISCOUNT % off
// their first payment; when the admin marks that first payment as paid, the referrer gets REF_REWARD_DAYS free.
const crypto = require('crypto');
const { esc } = require('./views');

const REF_DISCOUNT = Math.max(0, Math.min(90, Number(process.env.REF_DISCOUNT ?? 20)));
const REF_REWARD_DAYS = Math.max(0, Number(process.env.REF_REWARD_DAYS ?? 30));
const cleanCode = (c) => (/^[A-Z0-9]{4,16}$/.test(String(c || '').toUpperCase()) ? String(c).toUpperCase() : null);

function setup(app, { db, page }) {
  const ensureCode = (u) => {
    if (u.ref_code) return u.ref_code;
    const base = (u.name || u.email).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6) || 'TRADER';
    for (;;) {
      const code = base + crypto.randomInt(100, 1000);
      if (!db.prepare('SELECT 1 FROM users WHERE ref_code = ?').get(code)) {
        db.prepare('UPDATE users SET ref_code = ? WHERE id = ?').run(code, u.id);
        return (u.ref_code = code);
      }
    }
  };
  const byCode = (code) => (cleanCode(code) ? db.prepare('SELECT id, name, email FROM users WHERE ref_code = ?').get(cleanCode(code)) : null);

  // /r/CODE remembers the code for this browser, then sends the visitor to the landing page
  app.get('/r/:code', (req, res) => {
    if (byCode(req.params.code)) req.session.ref = cleanCode(req.params.code);
    res.redirect('/');
  });

  // called by createCustomer
  const attach = (req, userId) => {
    const r = byCode(req.session && req.session.ref);
    if (r && r.id !== userId) db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(r.id, userId);
    if (req.session) req.session.ref = null;
  };

  // a referred customer who has not paid yet gets the discount once
  const discountFor = (u) => (u && u.referred_by && !u.ref_rewarded && !u.plan ? REF_DISCOUNT : 0);

  // admin "Mark as paid": reward the referrer on the friend's first payment. Returns a note for the flash, or ''.
  const rewardOnPaid = (u) => {
    if (!u.referred_by || u.ref_rewarded || u.plan || !REF_REWARD_DAYS) return '';
    const r = db.prepare('SELECT * FROM users WHERE id = ?').get(u.referred_by);
    db.prepare('UPDATE users SET ref_rewarded = 1 WHERE id = ?').run(u.id);
    if (!r) return '';
    const from = r.expires_at && Date.parse(r.expires_at.replace(' ', 'T') + 'Z') > Date.now() ? r.expires_at : new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (r.expires_at) db.prepare('UPDATE users SET expires_at = datetime(?, ?) WHERE id = ?').run(from, `+${REF_REWARD_DAYS} days`, r.id);
    return ` Referrer ${r.email} got ${REF_REWARD_DAYS} free days${r.expires_at ? '' : ' (their license never expires, so nothing changed)'}.`;
  };

  // dashboard card
  const card = (req, u) => {
    const code = ensureCode(u);
    const link = `${req.protocol}://${req.get('host')}/r/${code}`;
    const n = db.prepare('SELECT COUNT(*) AS n, SUM(ref_rewarded) AS paid FROM users WHERE referred_by = ?').get(u.id);
    return `<section class="card ref">
      <div class="row between"><h2>Invite a friend</h2><span class="muted small">${n.n} joined · ${n.paid || 0} paid</span></div>
      <p>Your friend gets <b>${REF_DISCOUNT}% off</b> their first payment. You get <b>${REF_REWARD_DAYS} free days</b> when they pay.</p>
      <div class="row ref-link"><code class="block" id="ref-link">${esc(link)}</code><button type="button" class="small" data-copy-ref>Copy link</button></div>
      <script>document.querySelector('[data-copy-ref]').addEventListener('click',function(){var b=this,t=document.getElementById('ref-link').textContent;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(function(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();}).finally(function(){b.textContent='Copied ✓';setTimeout(function(){b.textContent='Copy link'},1600)})});</script>
    </section>`;
  };

  // admin user page line
  const adminNote = (u) => {
    if (!u.referred_by) return '';
    const r = db.prepare('SELECT id, email FROM users WHERE id = ?').get(u.referred_by);
    return `<p class="muted">Referred by ${r ? `<a href="/admin/users/${r.id}">${esc(r.email)}</a>` : 'a deleted user'} · ${u.ref_rewarded || u.plan ? 'first payment done' : `<strong>${REF_DISCOUNT}% off the first payment</strong>`}</p>`;
  };

  return { attach, discountFor, rewardOnPaid, card, adminNote, ensureCode };
}

module.exports = { setup, REF_DISCOUNT, REF_REWARD_DAYS };
