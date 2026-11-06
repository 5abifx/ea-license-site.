// Nightly database backup, fully automatic.
// Every night the whole database is copied, zipped and locked with BACKUP_PASSWORD
// (AES-256-GCM), then sent to Cloudflare R2 (or any S3-compatible storage).
// Files are named by day of the month (backup-day-01 ... backup-day-31), so storage always
// holds about the last 30 nights and old ones are replaced without any clean-up job.
// To open a backup: node scripts/backup-decrypt.js <file> <out.db> (asks for BACKUP_PASSWORD).
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MAGIC = Buffer.from('5ABIBK1\n');

const env = () => ({
  password: process.env.BACKUP_PASSWORD || '',
  account: process.env.R2_ACCOUNT_ID || '',
  keyId: process.env.R2_ACCESS_KEY_ID || '',
  secret: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  endpoint: (process.env.BACKUP_S3_ENDPOINT || '').replace(/\/+$/, ''),   // optional: another S3-compatible store
  region: process.env.BACKUP_S3_REGION || 'auto',
  hour: Number(process.env.BACKUP_HOUR_UTC || 10),                         // 10:00 UTC = 2-3 AM Pacific
});
const lockOn = () => env().password.length >= 12;
const cloudOn = () => { const e = env(); return Boolean(lockOn() && (e.account || e.endpoint) && e.keyId && e.secret && e.bucket); };

// ---- lock / unlock ----
function encrypt(plain, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(plain)), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(file, password) {
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a 5ABI.FX backup file');
  let o = MAGIC.length;
  const salt = file.subarray(o, o += 16);
  const iv = file.subarray(o, o += 12);
  const tag = file.subarray(o, o += 16);
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(password, salt, 32), iv);
  d.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([d.update(file.subarray(o)), d.final()]));
}

// ---- S3 upload (AWS Signature V4, no extra packages) ----
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
function signV4({ method, host, path: p, query = '', headers = {}, payloadHash, keyId, secret, region, service = 's3', amzDate }) {
  const day = amzDate.slice(0, 8);
  const h = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...headers };
  const names = Object.keys(h).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const signed = names.join(';');
  const canonical = [method, p, query, names.map((n) => `${n}:${lower[n]}\n`).join(''), signed, payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const kSign = hmac(hmac(hmac(hmac('AWS4' + secret, day), region), service), 'aws4_request');
  const sig = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signed}, Signature=${sig}` };
}
async function putObject(key, body) {
  const e = env();
  const base = e.endpoint || `https://${e.account}.r2.cloudflarestorage.com`;
  const u = new URL(base);
  const p = `${u.pathname.replace(/\/$/, '')}/${encodeURIComponent(e.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const headers = signV4({
    method: 'PUT', host: u.host, path: p, headers: { 'content-type': 'application/octet-stream' },
    payloadHash: sha(body), keyId: e.keyId, secret: e.secret, region: e.region,
    amzDate: new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
  });
  delete headers.host;
  const r = await fetch(`${u.protocol}//${u.host}${p}`, { method: 'PUT', headers, body });
  if (!r.ok) throw new Error(`Storage said ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
}

module.exports = function setupBackup(db, dataDir) {
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const get = (k) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value || '';
  const set = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

  // A locked copy of the database as it is right now
  async function snapshot() {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-')), 'copy.db');
    try {
      await db.backup(tmp);   // safe while the site is running
      return encrypt(fs.readFileSync(tmp), env().password);
    } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
  }

  let running = false;
  async function run() {
    if (running) return { ok: false, error: 'A backup is already running' };
    running = true;
    set('backup_last_try', new Date().toISOString());
    try {
      if (!cloudOn()) throw new Error('Backup storage is not set up on Render yet');
      const file = await snapshot();
      const key = `backups/backup-day-${String(new Date().getUTCDate()).padStart(2, '0')}.5abi`;
      await putObject(key, file);
      set('backup_last_ok', new Date().toISOString());
      set('backup_last_size', file.length);
      set('backup_last_key', key);
      set('backup_last_err', '');
      return { ok: true, key, size: file.length };
    } catch (e) {
      set('backup_last_err', e.message);
      console.error('Backup failed:', e.message);
      return { ok: false, error: e.message };
    } finally { running = false; }
  }

  function status() {
    const lastOk = get('backup_last_ok');
    const ageH = lastOk ? (Date.now() - Date.parse(lastOk)) / 3600000 : null;
    return {
      lockOn: lockOn(), cloudOn: cloudOn(), lastOk, ageH, lastTry: get('backup_last_try'),
      size: Number(get('backup_last_size') || 0), key: get('backup_last_key'), error: get('backup_last_err'),
      healthy: cloudOn() && ageH != null && ageH < 30,
    };
  }

  // Check every 10 minutes: once a day, after the backup hour, send tonight's copy
  function due() {
    if (!cloudOn()) return false;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (get('backup_last_ok').slice(0, 10) === today) return false;
    const lastTry = Date.parse(get('backup_last_try') || 0) || 0;
    if (Date.now() - lastTry < 60 * 60 * 1000) return false;                // a failed try waits an hour before the next
    const lastOkAge = Date.now() - (Date.parse(get('backup_last_ok') || 0) || 0);
    return now.getUTCHours() >= env().hour || lastOkAge > 26 * 3600000;     // also catch up if the site was down at backup time
  }
  if (process.env.NODE_ENV !== 'test') {
    const t = setInterval(() => { if (due()) run(); }, 10 * 60 * 1000);
    t.unref();
  }

  return { run, status, snapshot, lockOn, cloudOn, due };
};
module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;
module.exports.signV4 = signV4;
