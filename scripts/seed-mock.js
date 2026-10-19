// Dữ liệu mẫu dùng chung cho cả nhóm khi phát triển (mốc M0: "mock data").
//   npm run seed            -> thêm dữ liệu mẫu nếu CSDL chưa có
//   npm run seed -- --reset -> xóa data/arena.db rồi tạo lại
// Tài khoản mẫu không có mật khẩu: đăng nhập bằng "Đăng nhập giả lập" trên giao diện (chỉ khi phát triển).
// Ghi trực tiếp vào bảng đề xuất của các module; khi lược đồ đổi, người đổi cập nhật luôn tệp này.
const fs = require('node:fs');
const config = require('../server/core/config');

if (config.PRODUCTION) {
  console.error('Không chạy dữ liệu mẫu khi NODE_ENV=production.');
  process.exit(1);
}
if (process.argv.includes('--reset')) {
  for (const f of [config.DB_FILE, `${config.DB_FILE}-wal`, `${config.DB_FILE}-shm`]) fs.rmSync(f, { force: true });
}

const db = require('../server/core/db');
const { setup } = require('../server/app');
setup();

if (db.get('SELECT 1 FROM users LIMIT 1')) {
  console.log('CSDL đã có dữ liệu. Dùng --reset để tạo lại.');
  process.exit(0);
}

db.tx(() => {
  const user = (username, name, role = 'student') => Number(db.run(
    'INSERT INTO users (username, email, display_name, role) VALUES (?,?,?,?)', username, `${username}@mock.local`, name, role).lastInsertRowid);
  user('btc', 'Ban tổ chức (mẫu)', 'admin');
  user('trongtai', 'Trọng tài (mẫu)', 'referee');

  const tid = Number(db.run(`INSERT INTO tournaments (name, description, status, registration_deadline, config) VALUES (?,?,?,?,?)`,
    'BOT ARENA — giải mẫu', 'Dữ liệu mẫu để phát triển', 'registration', new Date(Date.now() + 14 * 86400000).toISOString(), '{}').lastInsertRowid);

  // 4 đội × 2 thành viên + 1 thí sinh chưa có đội.
  for (let t = 1; t <= 4; t++) {
    const a = user(`sv${t}a`, `Sinh viên ${t}A`);
    const b = user(`sv${t}b`, `Sinh viên ${t}B`);
    const team = Number(db.run('INSERT INTO teams (tournament_id, name, name_key, captain_id, invite_code, status) VALUES (?,?,?,?,?,?)',
      tid, `Đội mẫu ${t}`, `doi mau ${t}`, a, `MOCK${t}`, 'approved').lastInsertRowid);
    for (const u of [a, b]) db.run('INSERT INTO team_members (team_id, user_id, tournament_id) VALUES (?,?,?)', team, u, tid);
  }
  user('svle', 'Sinh viên chưa có đội');

  db.run(`INSERT INTO stages (tournament_id, ord, kind, name, team_target, rounds, status) VALUES (?,?,?,?,?,?,?)`,
    tid, 1, 'qualifier', 'Mức 1 (mẫu)', 2, 3, 'planned');
  db.run('INSERT INTO settings (key, value) VALUES (?, ?)', 'tournaments.current_id', String(tid));
});

console.log('Đã tạo dữ liệu mẫu: btc (admin), trongtai (referee), sv1a..sv4b (4 đội, đội trưởng là svNa), svle (chưa có đội).');
