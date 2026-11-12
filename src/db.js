const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'ea-files'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'licenses.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | active | disabled
  max_accounts  INTEGER NOT NULL DEFAULT 10,
  expires_at    TEXT,                               -- NULL = never expires
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,                 -- short id the EA sends, e.g. GOLD_SCALPER
  name        TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT '1.0',
  description TEXT NOT NULL DEFAULT '',
  file_name   TEXT,                                 -- original file name shown to users
  file_path   TEXT,                                 -- stored file name inside data/ea-files
  active      INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which EAs each user is licensed for
CREATE TABLE IF NOT EXISTS user_eas (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ea_id   INTEGER NOT NULL REFERENCES eas(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, ea_id)
);

-- MT5 account numbers a user registered (shared by all of that user's EAs)
CREATE TABLE IF NOT EXISTS accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  label          TEXT NOT NULL DEFAULT '',
  last_check_at  TEXT,
  last_check_ea  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, account_number)
);
CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number);

-- Trades sent by the Trade Journal EA (one row per closed position)
CREATE TABLE IF NOT EXISTS journal_trades (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  position_id    TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  side           TEXT NOT NULL,                     -- BUY | SELL
  lots           REAL, entry REAL, exit REAL, sl REAL, tp REAL, digits INTEGER,
  open_time      TEXT, close_time TEXT,             -- broker time, ISO without zone
  profit REAL, commission REAL, swap REAL, net REAL,
  pips REAL, r REAL, risk_money REAL, risk_pct REAL, pct REAL, balance_after REAL,
  mfe REAL, mae REAL, magic INTEGER, comment TEXT, currency TEXT, broker TEXT, tf TEXT,
  partials       TEXT NOT NULL DEFAULT '[]',        -- JSON [{time, price, lots, profit}]
  candles        TEXT NOT NULL DEFAULT '[]',        -- JSON [[unix, o, h, l, c]]
  setup TEXT NOT NULL DEFAULT '', emotion TEXT NOT NULL DEFAULT '', mistakes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '', rating INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, account_number, position_id)
);
CREATE INDEX IF NOT EXISTS idx_journal_user_close ON journal_trades(user_id, close_time);
`);

// Columns added after the first release
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('journal_key')) db.exec('ALTER TABLE users ADD COLUMN journal_key TEXT');
if (!userCols.includes('card_handle')) db.exec("ALTER TABLE users ADD COLUMN card_handle TEXT NOT NULL DEFAULT ''");
if (!userCols.includes('google_sub')) {   // Google account id for "Sign in with Google"
  db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_sub)');
}
if (!userCols.includes('trial')) db.exec('ALTER TABLE users ADD COLUMN trial INTEGER NOT NULL DEFAULT 0');   // 1 = on the free trial, not paid yet
if (!userCols.includes('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT ''");              // paid plan id (src/plans.js)
if (!userCols.includes('billing')) db.exec("ALTER TABLE users ADD COLUMN billing TEXT NOT NULL DEFAULT ''");        // monthly | annual
if (!userCols.includes('plan_request')) db.exec("ALTER TABLE users ADD COLUMN plan_request TEXT NOT NULL DEFAULT ''"); // "katana:annual" picked on /subscribe, waiting for payment
if (!userCols.includes('ref_code')) { db.exec('ALTER TABLE users ADD COLUMN ref_code TEXT'); db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ref_code ON users(ref_code)'); }
if (!userCols.includes('referred_by')) db.exec('ALTER TABLE users ADD COLUMN referred_by INTEGER');                 // user id of the referrer
if (!userCols.includes('student')) db.exec('ALTER TABLE users ADD COLUMN student INTEGER NOT NULL DEFAULT 0');           // 1 = mentorship student: unlocks student-only tools (Auction Compass)
if (!userCols.includes('ref_rewarded')) db.exec('ALTER TABLE users ADD COLUMN ref_rewarded INTEGER NOT NULL DEFAULT 0'); // 1 = first payment done, referrer rewarded

// Prop firm rules per account for the Insights page (percent of the start balance; start balance optional)
const accCols = db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name);
for (const c of ['prop_daily', 'prop_max', 'prop_target', 'prop_start', 'prop_consistency']) if (!accCols.includes(c)) db.exec(`ALTER TABLE accounts ADD COLUMN ${c} REAL`);
if (!accCols.includes('prop_firm')) db.exec("ALTER TABLE accounts ADD COLUMN prop_firm TEXT NOT NULL DEFAULT ''");   // preset key (src/desk.js FIRMS)
// hours between New York time and the trader's MT5 server clock (most prop servers: NY + 7)
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'ny_offset')) db.exec('ALTER TABLE users ADD COLUMN ny_offset INTEGER NOT NULL DEFAULT 7');

// Journal: 1 = the trader typed the original stop-loss on the trade page, so EA re-sends keep it
const jCols = db.prepare('PRAGMA table_info(journal_trades)').all().map((c) => c.name);
if (!jCols.includes('sl_edited')) db.exec('ALTER TABLE journal_trades ADD COLUMN sl_edited INTEGER NOT NULL DEFAULT 0');
// A stop at entry or in profit (break-even / trailed before the journal saw the first stop)
// is not a risk, so R and risk % cannot be worked out from it.
db.exec(`UPDATE journal_trades SET r = NULL, risk_money = NULL, risk_pct = NULL
  WHERE sl_edited = 0 AND sl IS NOT NULL AND entry IS NOT NULL AND r IS NOT NULL
    AND ((side = 'BUY' AND sl >= entry) OR (side = 'SELL' AND sl <= entry))`);

// Every MT5 account number ever used on a free trial, so one account cannot get a second trial with a new email
db.exec(`CREATE TABLE IF NOT EXISTS trial_accounts (
  account_number TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// Journal accounts the user chose to hide (left out of the account tabs and "All accounts"; trades are kept)
db.exec(`CREATE TABLE IF NOT EXISTS journal_hidden (
  user_id        INTEGER NOT NULL,
  account_number TEXT NOT NULL,
  PRIMARY KEY (user_id, account_number)
)`);

// Sales track record for the Admin dashboard (src/sales.js): one row per trial start, payment or cancel.
// kind: trial | ea | mentorship | cancel. amount = US dollars actually paid (NULL when not known).
db.exec(`CREATE TABLE IF NOT EXISTS sales_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT '',
  billing    TEXT NOT NULL DEFAULT '',
  amount     REAL,
  via        TEXT NOT NULL DEFAULT '',   -- stripe | admin | signup
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_sales_log_at ON sales_log(created_at)');
const logSale = (userId, kind, { plan = '', billing = '', amount = null, via = '' } = {}) => {
  try {
    db.prepare('INSERT INTO sales_log (user_id, kind, plan, billing, amount, via) VALUES (?, ?, ?, ?, ?, ?)')
      .run(Number(userId), kind, plan || '', billing || '', amount == null || Number.isNaN(Number(amount)) ? null : Number(amount), via);
  } catch (e) { console.error('sales_log:', e.message); }   // never break a payment over the log
};

// Unique visitors per day and page (no IP stored: a random id in the visitor's cookie), and where they came from
db.exec(`CREATE TABLE IF NOT EXISTS visits (
  day  TEXT NOT NULL,
  path TEXT NOT NULL,
  vid  TEXT NOT NULL,
  src  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (day, path, vid)
)`);
// visitor details for the sales dashboard filters (src/visitors.js): device, country (from time zone), campaign
const visCols = db.prepare('PRAGMA table_info(visits)').all().map((c) => c.name);
for (const c of ['dev', 'ctry', 'cmp']) if (!visCols.includes(c)) db.exec(`ALTER TABLE visits ADD COLUMN ${c} TEXT NOT NULL DEFAULT ''`);
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'campaign')) db.exec("ALTER TABLE users ADD COLUMN campaign TEXT NOT NULL DEFAULT ''");
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'source')) db.exec("ALTER TABLE users ADD COLUMN source TEXT NOT NULL DEFAULT ''");   // where the sign-up came from (instagram, discord, referral...)

// Economic calendar, sent by the Trade Journal EA from MT5's own calendar (shared by everyone; times in UTC ms)
db.exec(`CREATE TABLE IF NOT EXISTS news_events (
  id        TEXT PRIMARY KEY,           -- event_id:utc
  event_id  TEXT NOT NULL,
  t         INTEGER NOT NULL,           -- release time, UTC milliseconds
  cur       TEXT NOT NULL,
  name      TEXT NOT NULL,
  imp       INTEGER NOT NULL,           -- 1 low, 2 medium, 3 high
  actual    REAL, forecast REAL, previous REAL,
  unit      TEXT NOT NULL DEFAULT '',
  move      REAL,                       -- gold: high-low in the 15 minutes after the release (price)
  dir       INTEGER,                    -- gold: +1 up, -1 down over those 15 minutes
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_news_t ON news_events(t)');
db.exec('CREATE INDEX IF NOT EXISTS idx_news_ev ON news_events(event_id, t)');

module.exports = { db, DATA_DIR, logSale, FILES_DIR: path.join(DATA_DIR, 'ea-files') };
