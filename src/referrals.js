// Referral codes: each customer gets a link /r/CODE (and their public page /@name, src/affiliates.js).
// A friend who signs up through it gets the friend discount (Admin > Affiliates, default REF_DISCOUNT %) off
// their first payment. The referrer earns a share of the friend's payments (commissions, src/affiliates.js).
const crypto = require('crypto');
const { esc } = require('./views');

const REF_DISCOUNT = Math.max(0, Math.min(90, Number(process.env.REF_DISCOUNT ?? 20)));
const REF_REWARD_DAYS = 0;   // free-day rewards were replaced by the affiliate program (cash share of payments)
const cleanCode = (c) => (/^[A-Z0-9]{4,16}$/.test(String(c || '').toUpperCase()) ? String(c).toUpperCase() : null);

function setup(app, { db, page }) {
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  // the friend's discount on their first payment: Admin > Affiliates setting, else REF_DISCOUNT
  const discountPct = () => {
    const v = (db.prepare("SELECT value FROM settings WHERE key = 'aff_friend_pct'").get() || {}).value;
    return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Math.min(90, Number(v))) : REF_DISCOUNT;
  };
  let visitHook = null;
  let rateText = () => '';
  const cookieRef = (req) => { const m = /(?:^|;\s*)ref=([A-Z0-9]{4,16})(?:;|$)/i.exec(req.headers.cookie || ''); return m ? m[1] : null; };
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
    const r = byCode(req.params.code);
    if (r) { req.session.ref = cleanCode(req.params.code); if (visitHook) visitHook(req, res, r); }
    res.redirect(req.query.to === 'signup' && !req.user ? '/signup' : req.query.to === 'pricing' ? '/pricing' : '/');
  });

  // called by createCustomer
  const attach = (req, userId) => {
    const r = byCode((req.session && req.session.ref) || cookieRef(req));
    if (r && r.id !== userId) db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(r.id, userId);
    if (req.session) req.session.ref = null;
  };

  // a referred customer who has not paid yet gets the discount once
  const discountFor = (u) => (u && u.referred_by && !u.ref_rewarded && !u.plan ? discountPct() : 0);

  // first payment done: the friend discount is used up (the referrer's share is added by src/affiliates.js)
  const rewardOnPaid = (u) => {
    if (u.referred_by && !u.ref_rewarded) db.prepare('UPDATE users SET ref_rewarded = 1 WHERE id = ?').run(u.id);
    return '';
  };

  // dashboard card
  const card = (req, u) => {
    const code = ensureCode(u);
    const link = `${req.protocol}://${req.get('host')}/r/${code}`;
    const n = db.prepare('SELECT COUNT(*) AS n, SUM(ref_rewarded) AS paid FROM users WHERE referred_by = ?').get(u.id);
    return `<section class="card ref">
      <div class="row between"><h2>Invite a friend, get paid</h2><span class="muted small">${n.n} joined · ${n.paid || 0} paid · <a href="/affiliate">Affiliate</a></span></div>
      <p>${discountPct() ? `Your friend gets <b>${discountPct()}% off</b> their first payment. ` : ''}${rateText()}</p>
      <div class="row ref-link"><code class="block" id="ref-link">${esc(link)}</code><button type="button" class="small" data-copy-ref>Copy link</button></div>
      <script>document.querySelector('[data-copy-ref]').addEventListener('click',function(){var b=this,t=document.getElementById('ref-link').textContent;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(function(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();}).finally(function(){b.textContent='Copied ✓';setTimeout(function(){b.textContent='Copy link'},1600)})});</script>
    </section>`;
  };

  // admin user page line
  const adminNote = (u) => {
    if (!u.referred_by) return '';
    const r = db.prepare('SELECT id, email FROM users WHERE id = ?').get(u.referred_by);
    return `<p class="muted">Referred by ${r ? `<a href="/admin/users/${r.id}">${esc(r.email)}</a>` : 'a deleted user'} · ${u.ref_rewarded || u.plan ? 'first payment done' : `<strong>${discountPct()}% off the first payment</strong>`}</p>`;
  };

  return { attach, discountFor, rewardOnPaid, card, adminNote, ensureCode, discountPct,
    onVisit: (fn) => { visitHook = fn; }, setRateText: (fn) => { rateText = fn; } };
}

module.exports = { setup, REF_DISCOUNT, REF_REWARD_DAYS };
