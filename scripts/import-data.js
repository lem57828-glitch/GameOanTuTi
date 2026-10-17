const fs = require('node:fs');
const config = require('../src/config');
const { importData } = require('./data-transfer');

let target;
try {
  const file = process.argv[2];
  if (!file) throw new Error('Dùng: node scripts/import-data.js <snapshot.json|--stdin>');
  if (config.DB_DRIVER !== 'turso') throw new Error('Import cloud cần DB_DRIVER=turso');
  if (!/^libsql:\/\//.test(config.TURSO_DATABASE_URL) || !config.TURSO_AUTH_TOKEN) throw new Error('Thiếu URL hoặc token Turso');
  const snapshot = JSON.parse(fs.readFileSync(file === '--stdin' ? 0 : file, 'utf8').replace(/^\uFEFF/, ''));
  target = new (require('libsql'))(config.TURSO_DATABASE_URL, { authToken: config.TURSO_AUTH_TOKEN });
  console.log(JSON.stringify(importData(target, config.DATA_DIR, snapshot)));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  target?.close();
}
