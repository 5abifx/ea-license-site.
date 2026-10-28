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
`);

module.exports = { db, DATA_DIR, FILES_DIR: path.join(DATA_DIR, 'ea-files') };
