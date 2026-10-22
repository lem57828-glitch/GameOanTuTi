const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const mail = require('../src/services/mail');
const registration = require('../src/services/registration');

test('đăng ký: giới hạn email VNU, mã đúng, hạn 2 phút, gửi lại và chống dò mã', async () => {
  db.open(':memory:');
  const originalSend = mail.sendVerification;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const delivered = new Map();
  mail.sendVerification = async (email, code) => { delivered.set(email, code); };
  const server = require('express')().use('/api', require('../src/routes/api')).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = async (path, body) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  const account = (email, code) => ({ email, code, name: 'Sinh viên', password: 'test-password', school: 'Công nghệ thông tin' });
  try {
    for (const email of ['sv@gmail.com', 'sv@fakevnu.edu.vn', '12345678@vnu.edu.vn.fake.com', '12345678@vnu.edu.vn@evil.com', 'sv@-uet.vnu.edu.vn', '1234567@vnu.edu.vn', '123456789@vnu.edu.vn', '1234567a@vnu.edu.vn', '12345678@uet.vnu.edu.vn', '12345678@gmail.com', 'sv@vnu.edu.vn']) {
      const rejected = await post('/auth/register/code', { email });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.error, 'Email không hợp lệ');
      assert.equal((await post('/auth/register', account(email, '123456'))).status, 400);
    }
    assert.equal(registration.validateEmail(' 00123456@VNU.EDU.VN '), '00123456@vnu.edu.vn');
    const email = '12345678@vnu.edu.vn';
    assert.equal((await post('/auth/register', account(email, '123456'))).status, 400);
    const sent = await post('/auth/register/code', { email: email.toUpperCase() });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.expiresAt, now + 120000);
    assert.equal(sent.body.code, undefined);
    const code = delivered.get(email);
    assert.match(code, /^\d{6}$/);
    assert.notEqual(db.get('SELECT code_hash FROM registration_codes WHERE email = ?', email).code_hash, code);
    assert.equal(db.get('SELECT id FROM users WHERE email = ?', email), undefined);
    assert.equal((await post('/auth/register/code', { email })).status, 429);
    assert.equal((await post('/auth/register', account('12345679@vnu.edu.vn', code))).status, 400);
    assert.equal((await post('/auth/register', account(email, code === '000000' ? '111111' : '000000'))).status, 400);
    assert.equal(db.get('SELECT attempts FROM registration_codes WHERE email = ?', email).attempts, 1);
    now += 119999;
    const registered = await post('/auth/register', account(email, code));
    assert.equal(registered.status, 200);
    assert.ok(registered.cookie);
    assert.equal(db.get('SELECT school FROM users WHERE email = ?', email).school, 'Công nghệ thông tin');
    assert.equal(db.get('SELECT * FROM registration_codes WHERE email = ?', email), undefined);
    assert.equal((await post('/auth/register', account(email, code))).status, 409);

    const expired = '12345680@vnu.edu.vn';
    await post('/auth/register/code', { email: expired });
    now += 120000;
    assert.equal((await post('/auth/register', account(expired, delivered.get(expired)))).status, 400);
    assert.equal(db.get('SELECT id FROM users WHERE email = ?', expired), undefined);

    const attempts = '12345681@vnu.edu.vn';
    await post('/auth/register/code', { email: attempts });
    const validCode = delivered.get(attempts);
    for (let i = 0; i < 5; i++) assert.equal((await post('/auth/register', account(attempts, validCode === '000000' ? '111111' : '000000'))).status, 400);
    assert.equal((await post('/auth/register', account(attempts, validCode))).status, 400);
    now += 60000;
    assert.equal((await post('/auth/register/code', { email: attempts })).status, 429);
    now += 60000;
    const crypto = require('node:crypto');
    const randomInt = crypto.randomInt;
    crypto.randomInt = () => validCode === '000001' ? 2 : 1;
    try { assert.equal((await post('/auth/register/code', { email: attempts })).status, 200); }
    finally { crypto.randomInt = randomInt; }
    assert.equal((await post('/auth/register', account(attempts, validCode))).status, 400);
    assert.equal((await post('/auth/register', account(attempts, delivered.get(attempts)))).status, 200);

    mail.sendVerification = async () => { throw new (require('../src/services/submissions').UserError)('Không gửi được email', 503); };
    assert.equal((await post('/auth/register/code', { email: '12345682@vnu.edu.vn' })).status, 503);
    assert.equal(db.get('SELECT * FROM registration_codes WHERE email = ?', '12345682@vnu.edu.vn'), undefined);
  } finally {
    mail.sendVerification = originalSend;
    Date.now = originalNow;
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test('gửi mail: thiếu mật khẩu ứng dụng thì báo chưa cấu hình', async () => {
  const password = process.env.SMTP_APP_PASSWORD;
  delete process.env.SMTP_APP_PASSWORD;
  try {
    await assert.rejects(mail.sendVerification('12345678@vnu.edu.vn', '123456'), /chưa cấu hình/);
  } finally {
    if (password !== undefined) process.env.SMTP_APP_PASSWORD = password;
  }
});
