// Kết nối CSDL và chạy migration theo từng module.
// Mỗi module tự quản lý migration trong thư mục migrations/ của mình (NNN_ten.sql); không sửa migration của module khác.
// Migration đã chạy được ghi vào bảng _migrations, nên chỉ được THÊM tệp mới, không sửa tệp đã chạy.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

let db = null;

function connect(file = config.DB_FILE) {
  const driver = config.DB_DRIVER;
  if (driver === 'turso') {
    if (!/^libsql:\/\//.test(config.TURSO_DATABASE_URL) || !config.TURSO_AUTH_TOKEN) {
      throw new Error('DB_DRIVER=turso cần TURSO_DATABASE_URL (libsql://...) và TURSO_AUTH_TOKEN');
    }
    return new (require('libsql'))(config.TURSO_DATABASE_URL, { authToken: config.TURSO_AUTH_TOKEN });
  }
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  if (driver === 'libsql') return new (require('libsql'))(file);
  if (driver === 'sqlite') return new (require('node:sqlite').DatabaseSync)(file);
  throw new Error('DB_DRIVER phải là sqlite, libsql hoặc turso');
}

function open(file) {
  if (db) return db;
  db = connect(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (config.DB_DRIVER !== 'turso') db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    module TEXT NOT NULL, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (module, name))`);
  return db;
}

/** Chạy các tệp .sql chưa chạy trong `dir`, theo thứ tự tên tệp. */
function migrate(moduleName, dir) {
  if (!fs.existsSync(dir)) return [];
  const done = new Set(all('SELECT name FROM _migrations WHERE module = ?', moduleName).map((r) => r.name));
  const applied = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    tx(() => {
      db.exec(sql);
      run('INSERT INTO _migrations (module, name) VALUES (?, ?)', moduleName, name);
    });
    applied.push(`${moduleName}/${name}`);
  }
  return applied;
}

const plain = (row) => (row ? { ...row } : row);
const get = (sql, ...p) => plain(db.prepare(sql).get(...p));
const all = (sql, ...p) => db.prepare(sql).all(...p).map(plain);
const run = (sql, ...p) => db.prepare(sql).run(...p);

let depth = 0;
/** Giao dịch; gọi lồng nhau thì chỉ giao dịch ngoài cùng có hiệu lực. */
function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

function close() { if (db) { db.close(); db = null; } }

module.exports = { open, migrate, get, all, run, tx, close };
