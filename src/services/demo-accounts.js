// Tạo dữ liệu thí sinh mẫu theo yêu cầu admin, không reset hoặc chạy giải.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const auth = require('../auth');
const config = require('../config');
const queue = require('./queue');
const subs = require('./submissions');

function create({ mode = 'teams', count, members = 2, password, withBots = true }, adminId) {
  const n = Number(count), size = Number(members);
  if (!['teams', 'accounts'].includes(mode)) throw new subs.UserError('Chọn kiểu tạo dữ liệu hợp lệ');
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new subs.UserError('Số lượng phải từ 1 đến 100');
  if (mode === 'teams' && (!Number.isInteger(size) || size < 2 || size > 4)) throw new subs.UserError('Mỗi đội có 2–4 thành viên');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new subs.UserError('Mật khẩu cần 8–128 ký tự');
  if (typeof withBots !== 'boolean') throw new subs.UserError('Tùy chọn bot không hợp lệ');
  if (mode === 'teams' && (db.get("SELECT status FROM phases WHERE key = 'swiss'").status !== 'pending' || db.setting('teams_open', 'true') !== 'true')) {
    throw new subs.UserError('Đang khóa lập đội; hãy mở lập đội trước khi Swiss bắt đầu hoặc chỉ tạo tài khoản', 409);
  }
  if (mode === 'teams' && withBots && db.setting('submissions_open') !== 'true') throw new subs.UserError('Đang khóa nhận bài; bỏ chọn nộp bot mẫu hoặc mở nhận bài', 409);
  const kinds = Object.keys(subs.SAMPLE_BOTS);
  const bots = mode === 'teams' && withBots ? kinds.map((kind) => ({ kind, code: fs.readFileSync(subs.samplePath(kind), 'utf8') })) : [];
  const environment = bots.length ? subs.environmentVersion() : null;
  const batch = crypto.randomBytes(6).toString('hex');
  const passwordHash = auth.hashPassword(password);
  return db.tx(() => {
      // Kiểm tra lại dưới khóa ghi, tránh thay đổi trạng thái trong lúc chuẩn bị bot.
      if (mode === 'teams' && (db.get("SELECT status FROM phases WHERE key = 'swiss'").status !== 'pending' || db.setting('teams_open', 'true') !== 'true')) throw new subs.UserError('Đã khóa lập đội', 409);
      if (bots.length && db.setting('submissions_open') !== 'true') throw new subs.UserError('Đã khóa nhận bài', 409);
      const accounts = [];
      for (let i = 1; i <= n; i++) {
        const users = [];
        const teamName = mode === 'teams' ? `Demo ${batch} - ${i}` : null;
        for (let k = 1; k <= (mode === 'teams' ? size : 1); k++) {
          const email = `sv${batch}_${i}_${k}@demo.local`;
          const name = `Thí sinh mẫu ${i}.${k}`;
          const id = Number(db.run('INSERT INTO users (email,name,student_id,school,password_hash) VALUES (?,?,?,?,?)',
            email, name, `DEMO-${batch}-${i}-${k}`, 'Trường Demo', passwordHash).lastInsertRowid);
          users.push(id);
          accounts.push({ id, email, name, teamName, captain: mode === 'teams' && k === 1 });
        }
        if (mode !== 'teams') continue;
        const teamId = Number(db.run('INSERT INTO teams (name,captain_id,invite_code) VALUES (?,?,?)',
          teamName, users[0], crypto.randomBytes(12).toString('hex')).lastInsertRowid);
        for (const id of users) db.run('UPDATE users SET team_id = ? WHERE id = ?', teamId, id);
        if (bots.length) {
          const { kind, code } = bots[(i - 1) % bots.length];
          const dir = path.join(config.BOT_DIR, `team_${teamId}`, 'v1');
          const file = path.join(dir, 'bot.py');
          const subId = Number(db.run(`INSERT INTO submissions (team_id,user_id,version,filename,sha256,size,path,source_code,phase_key,env_version)
            VALUES (?,?,1,?,?,?,?,?, 'main',?)`, teamId, users[0], `${kind}.py`, crypto.createHash('sha256').update(code).digest('hex'),
          Buffer.byteLength(code), file, code, environment).lastInsertRowid);
          queue.enqueue('validate', subId, queue.PRIORITY.validate);
        }
      }
      const result = { batch, users: accounts.length, teams: mode === 'teams' ? n : 0, bots: bots.length ? n : 0, accounts };
      db.audit(adminId, 'create_demo_accounts', { batch, users: result.users, teams: result.teams, bots: result.bots });
      return result;
  });
}

module.exports = { create };
