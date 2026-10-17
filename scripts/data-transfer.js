// Snapshot riêng tư chứa cả hash mật khẩu và mã bot. Không đưa vào Git.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const quote = (s) => `"${s.replaceAll('"', '""')}"`;
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');

function exportData(sourceFile, outputFile) {
  if (fs.existsSync(outputFile)) throw new Error('Tệp đích đã tồn tại; chọn tên snapshot mới');
  const source = new DatabaseSync(sourceFile, { readOnly: true });
  try {
    source.exec('BEGIN');
    if (source.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'running'").get().n ||
        source.prepare("SELECT COUNT(*) AS n FROM matches WHERE status = 'running'").get().n) {
      throw new Error('Còn tác vụ đang chạy; chờ hoàn tất và dừng server trước khi export');
    }
    const schema = source.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name").all();
    const tables = schema.filter((s) => s.type === 'table').map(({ name }) => ({
      name, rows: source.prepare(`SELECT * FROM ${quote(name)}`).all().map((r) => ({ ...r })),
    }));
    const submissions = tables.find((t) => t.name === 'submissions').rows;
    const bots = submissions.map((sub) => {
      const file = path.join(path.dirname(sourceFile), 'bots', `team_${sub.team_id}`, `v${sub.version}`, 'bot.py');
      const data = sub.source_code == null ? fs.readFileSync(file) : Buffer.from(sub.source_code, 'utf8');
      if (hash(data) !== sub.sha256) throw new Error(`Mã bot #${sub.id} không khớp SHA-256`);
      // Không mang đường dẫn tuyệt đối của máy phát triển lên cloud.
      sub.path = `bots/team_${sub.team_id}/v${sub.version}/bot.py`;
      return { submissionId: sub.id, content: data.toString('base64') };
    });
    const snapshot = { format: 'bot-arena-v1', createdAt: new Date().toISOString(), schema, tables, bots };
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
    source.exec('COMMIT');
    return { tables: tables.length, bots: bots.length, sha256: hash(fs.readFileSync(outputFile)) };
  } finally {
    source.close();
  }
}

function importData(target, dataDir, snapshot) {
  if (snapshot.format !== 'bot-arena-v1') throw new Error('Định dạng snapshot không hợp lệ');
  if (target.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().n) {
    throw new Error('Chỉ import vào database trống; không ghi đè database đang có dữ liệu');
  }
  const submissions = snapshot.tables.find((t) => t.name === 'submissions')?.rows;
  if (!submissions || snapshot.bots.length !== submissions.length) throw new Error('Snapshot thiếu bot');
  const botMap = new Map(snapshot.bots.map((b) => [b.submissionId, b]));
  const files = submissions.map((sub) => {
    if (!Number.isSafeInteger(sub.team_id) || sub.team_id < 1 || !Number.isSafeInteger(sub.version) || sub.version < 1) {
      throw new Error('Đội hoặc phiên bản bot không hợp lệ');
    }
    const bot = botMap.get(sub.id);
    if (!bot) throw new Error(`Thiếu bot #${sub.id}`);
    const data = Buffer.from(bot.content, 'base64');
    if (hash(data) !== sub.sha256) throw new Error(`Bot #${sub.id} không khớp SHA-256`);
    if (sub.source_code != null && hash(sub.source_code) !== sub.sha256) throw new Error(`Mã nguồn bot #${sub.id} trong database không khớp SHA-256`);
    const file = path.join(dataDir, 'bots', `team_${sub.team_id}`, `v${sub.version}`, 'bot.py');
    if (fs.existsSync(file) && hash(fs.readFileSync(file)) !== sub.sha256) throw new Error(`Tệp bot đã tồn tại với nội dung khác: #${sub.id}`);
    return { file, data };
  });
  // Kiểm tra và ghi đủ mã bot trước khi commit CSDL; lần import lỗi có thể chạy lại.
  for (const { file, data } of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
  }
  target.exec('PRAGMA foreign_keys = ON');
  target.exec('BEGIN IMMEDIATE');
  try {
    target.exec('PRAGMA defer_foreign_keys = ON');
    for (const item of snapshot.schema) target.exec(item.sql);
    for (const { name, rows } of snapshot.tables) {
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const batchSize = Math.max(1, Math.min(20, Math.floor(900 / columns.length)));
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
        target.prepare(`INSERT INTO ${quote(name)} (${columns.map(quote).join(',')}) VALUES ${values}`)
          .run(...batch.flatMap((row) => columns.map((c) => row[c])));
      }
      const actual = target.prepare(`SELECT COUNT(*) AS n FROM ${quote(name)}`).get().n;
      if (actual !== rows.length) throw new Error(`Sai số lượng bản ghi bảng ${name}`);
    }
    if (target.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Snapshot có liên kết dữ liệu không hợp lệ');
    target.exec('COMMIT');
  } catch (err) {
    target.exec('ROLLBACK');
    throw err;
  }
  return { tables: snapshot.tables.length, bots: files.length };
}

module.exports = { exportData, importData };
