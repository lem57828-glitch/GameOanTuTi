// Tạo hoặc nâng quyền quản trị: npm run create-admin -- email@x.com "Họ tên" matkhau
const db = require('../src/db');
const auth = require('../src/auth');

const [email, name, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Cách dùng: npm run create-admin -- <email> "<họ tên>" <mật khẩu ≥ 8 ký tự>');
  process.exit(1);
}
db.open();
const e = email.toLowerCase();
if (db.get('SELECT id FROM users WHERE email = ?', e)) {
  db.run(`UPDATE users SET role = 'admin', password_hash = ? WHERE email = ?`, auth.hashPassword(password), e);
  console.log(`Đã nâng ${e} thành quản trị viên.`);
} else {
  db.run(`INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?, 'admin')`, e, name || 'Quản trị', auth.hashPassword(password));
  console.log(`Đã tạo quản trị viên ${e}.`);
}
