const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { exportData, importData } = require('../scripts/data-transfer');

test('snapshot chuyển SQLite và mã bot sang libSQL, kiểm tra hash, khóa ngoại và chống ghi đè', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-transfer-'));
  const sourceFile = path.join(dir, 'source', 'arena.db');
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  const source = new DatabaseSync(sourceFile);
  const content = Buffer.from('# bot tiếng Việt\ndef make_move(state): return state["legal_moves"][0]\n');
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  source.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY, captain_id INTEGER REFERENCES users(id));
    CREATE TABLE users (id INTEGER PRIMARY KEY, team_id INTEGER REFERENCES teams(id), name TEXT);
    CREATE TABLE submissions (id INTEGER PRIMARY KEY, team_id INTEGER REFERENCES teams(id), version INTEGER, path TEXT, sha256 TEXT);
    CREATE TABLE jobs (id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE matches (id INTEGER PRIMARY KEY, status TEXT);
    INSERT INTO teams VALUES (1,NULL); INSERT INTO users VALUES (1,1,'Nguyễn Văn A');
    UPDATE teams SET captain_id = 1;`);
  source.prepare('INSERT INTO submissions VALUES (1,1,1,?,?)').run('D:\\old\\bot.py', sha);
  source.exec("INSERT INTO jobs VALUES (1,'running')");
  const output = path.join(dir, 'snapshot.json');
  assert.throws(() => exportData(sourceFile, output), /đang chạy/);
  source.exec("UPDATE jobs SET status = 'done'");
  source.close();
  const botFile = path.join(dir, 'source', 'bots', 'team_1', 'v1', 'bot.py');
  fs.mkdirSync(path.dirname(botFile), { recursive: true });
  fs.writeFileSync(botFile, content);
  const exported = exportData(sourceFile, output);
  assert.equal(exported.bots, 1);
  assert.throws(() => exportData(sourceFile, output), /đã tồn tại/);
  const snapshot = JSON.parse(fs.readFileSync(output));
  const target = new (require('libsql'))(':memory:');
  const targetDir = path.join(dir, 'target');
  try {
    const tampered = structuredClone(snapshot);
    tampered.bots[0].content = Buffer.from('changed').toString('base64');
    assert.throws(() => importData(target, targetDir, tampered), /SHA-256/);
    const broken = structuredClone(snapshot);
    broken.tables.find((t) => t.name === 'users').rows[0].team_id = 999;
    assert.throws(() => importData(target, targetDir, broken), /liên kết/);
    assert.equal(target.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0, 'rollback cả schema');
    assert.equal(importData(target, targetDir, snapshot).bots, 1);
    assert.equal(target.prepare('SELECT name FROM users').get().name, 'Nguyễn Văn A');
    assert.equal(target.prepare('SELECT path FROM submissions').get().path, 'bots/team_1/v1/bot.py');
    assert.deepEqual(fs.readFileSync(path.join(targetDir, 'bots', 'team_1', 'v1', 'bot.py')), content);
    assert.throws(() => importData(target, targetDir, snapshot), /database trống/);
  } finally {
    target.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('chuyển database chứa mã bot sang libSQL khi không có cache Python', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-code-transfer-'));
  const file = path.join(dir, 'arena.db');
  const source = new DatabaseSync(file);
  const code = 'def make_move(state):\n    return state["legal_moves"][0]\n';
  const sha = crypto.createHash('sha256').update(code).digest('hex');
  source.exec(`CREATE TABLE submissions (id INTEGER PRIMARY KEY, team_id INTEGER, version INTEGER, path TEXT, sha256 TEXT, source_code TEXT);
    CREATE TABLE jobs (status TEXT); CREATE TABLE matches (status TEXT);`);
  source.prepare('INSERT INTO submissions VALUES (1,1,1,?,?,?)').run('old/missing/bot.py', sha, code);
  source.close();
  const output = path.join(dir, 'snapshot.json');
  exportData(file, output);
  const snapshot = JSON.parse(fs.readFileSync(output));
  const target = new (require('libsql'))(':memory:');
  try {
    const broken = structuredClone(snapshot);
    broken.tables.find((t) => t.name === 'submissions').rows[0].source_code = 'tampered';
    assert.throws(() => importData(target, path.join(dir, 'target'), broken), /SHA-256/);
    importData(target, path.join(dir, 'target'), snapshot);
    assert.equal(target.prepare('SELECT source_code FROM submissions').get().source_code, code);
  } finally {
    target.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
