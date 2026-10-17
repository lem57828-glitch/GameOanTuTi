const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-bot-storage-'));
process.env.DATA_DIR = dir;
const db = require('../src/db');
const auth = require('../src/auth');
const subs = require('../src/services/submissions');
const { runMatch } = require('../src/runner/match');
const { exportData } = require('../scripts/data-transfer');
const config = require('../src/config');
const code = '# mã bot tiếng Việt\ndef make_move(state):\n    return state["legal_moves"][0]\n';

test.after(async () => {
  db.close();
  await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test('bot lưu trong DB, phục hồi cache, migrate bot cũ và xuất DB khi không còn file Python', async () => {
  db.open();
  const uid = Number(db.run('INSERT INTO users (email,name,password_hash) VALUES (?,?,?)', 'storage@test.local', 'Test', auth.hashPassword('password123')).lastInsertRowid);
  const tid = Number(db.run('INSERT INTO teams (name,captain_id,invite_code) VALUES (?,?,?)', 'Storage Team', uid, 'STORAGE').lastInsertRowid);
  db.run('UPDATE users SET team_id = ? WHERE id = ?', tid, uid);
  const team = db.get('SELECT * FROM teams WHERE id = ?', tid);
  const id = subs.submit({ user: { id: uid }, team, filename: 'bot.py', code });
  let sub = db.get('SELECT * FROM submissions WHERE id = ?', id);
  assert.equal(sub.source_code, code);
  assert.equal(fs.existsSync(sub.path), false, 'nộp bài không cần ghi file trước khi lưu DB');
  assert.equal(subs.readSource(sub), code);
  const file = subs.botPath(sub);
  assert.equal(fs.readFileSync(file, 'utf8'), code);
  fs.writeFileSync(file, 'tampered');
  assert.equal(subs.botPath(sub), file);
  assert.equal(fs.readFileSync(file, 'utf8'), code, 'file bị sửa phải khôi phục theo DB');
  fs.unlinkSync(file);
  assert.equal(subs.readSource(sub), code, 'xem mã không phụ thuộc file');
  const res = await runMatch({ botA: subs.botPath(sub), botB: subs.samplePath('random_bot'), ruleset: db.CLASSIC,
    games: 2, extraGames: 0, maxPlies: 10, decisive: false, seed: 42 });
  assert.equal(res.games.length, 2);
  assert.ok(res.games.every((g) => g.errors.blue === 0 && g.errors.pink === 0));
  assert.throws(() => subs.readSource({ ...sub, source_code: 'modified' }), /SHA-256/);
  // Mô phỏng CSDL trước nâng cấp: chưa có cột source_code, mã chỉ ở file.
  db.open().exec('ALTER TABLE submissions DROP COLUMN source_code');
  db.close();
  db.open();
  sub = db.get('SELECT * FROM submissions WHERE id = ?', id);
  assert.equal(sub.source_code, code, 'migration phải nạp mã bot cũ vào DB');
  assert.deepEqual(db.backfillBotSources(), { migrated: 0, missing: 0 });
  fs.unlinkSync(file);
  const output = path.join(dir, 'snapshot.json');
  // export dùng node:sqlite, cùng tương thích với database libSQL local.
  assert.equal(exportData(config.DB_FILE, output).bots, 1);
  const snapshot = JSON.parse(fs.readFileSync(output));
  assert.equal(snapshot.tables.find((t) => t.name === 'submissions').rows[0].source_code, code);
  assert.equal(Buffer.from(snapshot.bots[0].content, 'base64').toString('utf8'), code);
  // Thiếu cả file lẫn mã DB được báo cáo, không giả lập mã thay thế.
  db.run('UPDATE submissions SET source_code = NULL WHERE id = ?', id);
  assert.deepEqual(db.backfillBotSources(), { migrated: 0, missing: 1 });
  assert.throws(() => subs.readSource(db.get('SELECT * FROM submissions WHERE id = ?', id)), /Không tìm thấy/);
});
