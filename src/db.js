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
if (!userCols.includes('trial')) db.exec('ALTER TABLE users ADD COLUMN trial INTEGER NOT NULL DEFAULT 0');   // 1 = on the free trial, not paid yet

// Every MT5 account number ever used on a free trial, so one account cannot get a second trial with a new email
db.exec(`CREATE TABLE IF NOT EXISTS trial_accounts (
  account_number TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
)`);

module.exports = { db, DATA_DIR, FILES_DIR: path.join(DATA_DIR, 'ea-files') };
