// Tiện ích kiểm thử dùng chung: CSDL tạm riêng cho mỗi tệp test, máy chủ HTTP ở cổng ngẫu nhiên, đăng nhập giả lập.
// Dùng: const t = require('../helpers').setupApp();  (gọi ở đầu tệp test, trước khi require module khác)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function setupApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-test-'));
  process.env.DATA_DIR = dir;
  process.env.DB_DRIVER = 'sqlite';
  const db = require('../server/core/db');
  const { setup, createApp } = require('../server/app');
  setup();
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  test.after(() => { server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  const user = (username, role = 'student') => Number(db.run('INSERT INTO users (username, email, display_name, role) VALUES (?,?,?,?)',
    username, `${username}@test.local`, username, role).lastInsertRowid);
  async function loginAs(userId) {
    const r = await fetch(`${base}/dev/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    return r.headers.get('set-cookie').split(';')[0];
  }
  async function call(method, p, { body, cookie } = {}) {
    const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  return { db, base, user, loginAs, call };
}

module.exports = { setupApp };
