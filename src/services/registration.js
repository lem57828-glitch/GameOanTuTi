const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const mail = require('./mail');
const { UserError } = require('./submissions');

const TTL = 120000;
const fail = (message, status = 400) => { throw new UserError(message, status); };
function validateEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9]{8}@vnu\.edu\.vn$/.test(email)) {
    fail('Email không hợp lệ');
  }
  return email;
}
const hash = (email, code) => crypto.createHmac('sha256', config.SECRET).update(`${email}:${code}`).digest('hex');

async function requestCode(email) {
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const codeHash = hash(email, code);
  db.tx(() => {
    const previous = db.get('SELECT * FROM registration_codes WHERE email = ?', email);
    if (previous && Date.now() - previous.sent_at < TTL) fail('Vui lòng chờ 120 giây trước khi gửi lại mã.', 429);
    db.run('DELETE FROM registration_codes WHERE sent_at < ?', Date.now() - 86400000);
    db.run(`INSERT INTO registration_codes (email,code_hash,expires_at,sent_at) VALUES (?,?,0,?)
      ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=0, sent_at=excluded.sent_at, attempts=0`,
    email, codeHash, Date.now());
  });
  try {
    await mail.sendVerification(email, code);
    const expiresAt = Date.now() + TTL;
    db.run('UPDATE registration_codes SET expires_at = ? WHERE email = ? AND code_hash = ?', expiresAt, email, codeHash);
    return { ok: true, expiresAt, expiresIn: 120 };
  } catch (e) {
    db.run('DELETE FROM registration_codes WHERE email = ? AND code_hash = ?', email, codeHash);
    throw e;
  }
}

// Call inside the same transaction as user creation; return errors so failed attempts are committed.
function verify(email, code) {
  const row = db.get('SELECT * FROM registration_codes WHERE email = ?', email);
  if (!row || row.expires_at <= Date.now()) return 'Mã xác minh đã hết hạn hoặc chưa được gửi. Vui lòng yêu cầu mã mới.';
  if (row.attempts >= 5) return 'Đã nhập sai mã quá 5 lần. Vui lòng yêu cầu mã mới.';
  const candidate = hash(email, String(code ?? '').trim());
  if (!crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(row.code_hash, 'hex'))) {
    db.run('UPDATE registration_codes SET attempts = attempts + 1 WHERE email = ?', email);
    return 'Mã xác minh không chính xác.';
  }
  db.run('DELETE FROM registration_codes WHERE email = ?', email);
  return null;
}

module.exports = { validateEmail, requestCode, verify };
