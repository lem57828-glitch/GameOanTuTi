// Database là nguồn mã bot chính; file Python chỉ là bản để runner thực thi.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');

const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
const cachePath = (sub) => path.join(config.BOT_DIR, `team_${sub.team_id}`, `v${sub.version}`, 'bot.py');

function readSource(sub) {
  let code = sub.source_code;
  if (code == null) {
    // Chỉ dùng cho dữ liệu cũ chưa migrate, kể cả đường dẫn Windows cũ.
    const file = [cachePath(sub), sub.path].find((p) => p && fs.existsSync(p));
    if (!file) throw new Error(`Không tìm thấy mã nguồn bot #${sub.id}`);
    code = fs.readFileSync(file, 'utf8');
  }
  if (digest(code) !== sub.sha256) throw new Error(`Mã nguồn bot #${sub.id} không khớp SHA-256`);
  return code;
}

function materialize(sub) {
  const code = readSource(sub);
  const file = cachePath(sub);
  if (fs.existsSync(file) && digest(fs.readFileSync(file)) === sub.sha256) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, code, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return file;
}

module.exports = { readSource, materialize, cachePath };
