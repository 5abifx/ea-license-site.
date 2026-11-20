// Pre-PR screenshots: exactly 3 per page (wide PC 2560, laptop 1366, phone 390) + a layout check.
//   node scripts/shots.js /journal /appearance          signed in as a seeded admin with ~90 demo trades
//   node scripts/shots.js --public / /mentorship        signed out
//   node scripts/shots.js --look ph-gt /journal           same, with a members Appearance background (names: BG list in src/look.js)
//   node scripts/shots.js --out /mnt/project-files/shots/my-change /journal
// Starts its own server on a throwaway database (never touches real data). Needs Playwright (preinstalled in cloud sessions).
// Prints FAIL lines when content is not centred on wide screens, a round icon is off-centre, or a phone page scrolls sideways.
const fs = require('fs'), os = require('os'), path = require('path');

const args = process.argv.slice(2);
const pub = args.includes('--public');
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : path.join(os.tmpdir(), 'shots');
const li = args.indexOf('--look');
const look = li >= 0 ? args[li + 1] : '';
const pages = args.filter((a, i) => a.startsWith('/') && !(oi >= 0 && i === oi + 1) && !(li >= 0 && i === li + 1));
if (!pages.length) { console.log('usage: node scripts/shots.js [--public] [--out dir] /page [/page ...]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-db-'));
process.env.SESSION_SECRET = 'shots-secret-1234567890';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'adminpass123';
process.env.RATE_LIMIT_PER_MIN = '100000';
const app = require('../src/server');
const { db } = require('../src/db');

const uid = db.prepare("SELECT id FROM users WHERE email = 'admin@test.com'").get().id;
if (look) db.prepare('UPDATE users SET look = ? WHERE id = ?').run(JSON.stringify({ bg: look }), uid);
// clean shots: an MT5 account for the demo trades, no welcome screen or tour on top
db.prepare("INSERT INTO accounts (user_id, account_number, label) VALUES (?, '1234567', 'Demo')").run(uid);
for (const sql of ["UPDATE users SET intro_welcome = 0, intro_reveal = 'never' WHERE id = ?", "UPDATE users SET tour = 'done' WHERE id = ?"]) {
  try { db.prepare(sql).run(uid); } catch (e) { /* column not in this version */ }
}

// demo trades so the journal, calendar and insights have something to show
const ins = db.prepare(`INSERT INTO journal_trades (user_id, account_number, position_id, symbol, side, lots, entry, exit, sl, tp, digits,
  open_time, close_time, profit, net, r, currency, broker) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
let n = 0, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let d = 40; d >= 0; d--) {
  const day = new Date(Date.now() - d * 864e5); if ([0, 6].includes(day.getDay())) continue;
  for (let k = 0; k < 3; k++) {
    const r = rnd() < 0.55 ? 1 + rnd() * 1.5 : -1, t = day.toISOString().slice(0, 10) + `T1${k}:00:00`;
    ins.run(uid, '1234567', 'p' + n++, 'XAUUSD', k % 2 ? 'BUY' : 'SELL', 0.5, 2650, 2655, 2645, 2660, 2, t, t.replace(':00:00', ':30:00'), r * 100, r * 100, r, 'USD', 'Demo');
  }
}

const SIZES = [['pc-2560', 2560, 1300], ['laptop-1366', 1366, 768], ['phone-390', 390, 844]];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  let fails = 0;
  try {
    for (const [name, w, h] of SIZES) {
      const phone = w < 500;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
      await ctx.addInitScript(() => { try { sessionStorage.setItem('plx', '1'); } catch (e) {} });   // skip the journal's profit loading screen
      const p = await ctx.newPage();
      if (!pub) {
        await p.goto(base + '/login');
        await p.fill('input[name=email]', 'admin@test.com'); await p.fill('input[name=password]', 'adminpass123');
        await Promise.all([p.waitForNavigation(), p.press('input[name=password]', 'Enter')]);
      }
      for (const u of pages) {
        await p.goto(base + u, { waitUntil: 'networkidle' }).catch(() => {});
        await p.waitForTimeout(1500);   // loaders and rise-in animations
        const m = await p.evaluate(() => {
          const res = {};
          const body = document.querySelector('.app-main > .app-body') || document.querySelector('main');
          if (body) { const b = body.getBoundingClientRect(); res.left = Math.round(b.left); res.right = Math.round(innerWidth - b.right); }
          res.sideways = document.documentElement.scrollWidth > innerWidth + 1;
          res.icons = [...document.querySelectorAll('.tb-round, .menu-btn')].filter((e) => e.offsetParent && e.querySelector('i, svg')).map((btn) => {
            const bb = btn.getBoundingClientRect(), is = [...btn.querySelectorAll(':scope > i, :scope > svg')].map((i) => i.getBoundingClientRect());
            if (!is.length) return 0;
            const cx = (Math.min(...is.map((i) => i.left)) + Math.max(...is.map((i) => i.right))) / 2;
            return Math.round(Math.abs(cx - (bb.left + bb.width / 2)));
          });
          return res;
        });
        const bad = [];
        if (m.left != null && Math.abs(m.left - m.right) > 2) bad.push(`content not centred (left ${m.left}px, right ${m.right}px)`);
        if (m.sideways) bad.push('page scrolls sideways');
        if (m.icons.some((x) => x > 1)) bad.push(`round icon off-centre by ${Math.max(...m.icons)}px`);
        const file = path.join(out, `${u.replace(/^\/$/, '/home').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${name}.png`);
        await p.screenshot({ path: file });
        console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name} ${u}${bad.length ? '  ' + bad.join('; ') : ''}  -> ${file}`);
        fails += bad.length ? 1 : 0;
      }
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  console.log(fails ? `${fails} check(s) failed` : 'all layout checks passed');
  process.exit(fails ? 1 : 0);
});
