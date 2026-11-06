// Open a locked backup made by the site (Admin > Security, or the nightly copy in R2).
//   node scripts/backup-decrypt.js backup-day-07.5abi licenses.db
// It asks for BACKUP_PASSWORD (or reads it from the environment). The output file is a normal
// SQLite database: put it at DATA_DIR/licenses.db (site stopped) to restore.
const fs = require('fs');
const readline = require('readline');
const { decrypt } = require('../src/backup');

const [file, out] = process.argv.slice(2);
if (!file || !out) { console.log('Usage: node scripts/backup-decrypt.js <backup file> <output .db>'); process.exit(1); }

(async () => {
  let pw = process.env.BACKUP_PASSWORD;
  if (!pw) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    pw = await new Promise((r) => rl.question('Backup password: ', (a) => { rl.close(); r(a); }));
  }
  try {
    fs.writeFileSync(out, decrypt(fs.readFileSync(file), pw));
    console.log(`Done: ${out}`);
  } catch (e) {
    console.error(/auth|unable/i.test(e.message) ? 'Wrong password, or the file is damaged.' : e.message);
    process.exit(1);
  }
})();
