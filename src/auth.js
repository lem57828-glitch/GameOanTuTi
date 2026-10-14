// Đăng nhập: mật khẩu băm scrypt, phiên là token ký HMAC lưu trong cookie httpOnly.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');

const COOKIE = 'arena_session';
const TTL_MS = 7 * 24 * 3600 * 1000;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

const sign = (data) => crypto.createHmac('sha256', config.SECRET).update(data).digest('base64url');

function issueToken(userId) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() ? data.uid : null;
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSession(res, userId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${issueToken(userId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}${secure}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function loadUser(req, _res, next) {
  const uid = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  req.user = uid ? db.get('SELECT id, email, name, student_id, school, role, team_id FROM users WHERE id = ?', uid) : null;
  req.team = req.user && req.user.team_id ? db.get('SELECT * FROM teams WHERE id = ?', req.user.team_id) : null;
  next();
}

const fail = (res, status, error) => res.status(status).json({ error });
const requireUser = (req, res, next) => (req.user ? next() : fail(res, 401, 'Cần đăng nhập'));
const requireTeam = (req, res, next) => (!req.user ? fail(res, 401, 'Cần đăng nhập') : req.team ? next() : fail(res, 403, 'Bạn chưa thuộc đội nào'));
const requireCaptain = (req, res, next) =>
  (req.team && req.team.captain_id === req.user.id ? next() : fail(res, 403, 'Chỉ đội trưởng được thực hiện'));
const requireAdmin = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : fail(res, 403, 'Chỉ quản trị viên'));

module.exports = { hashPassword, checkPassword, setSession, clearSession, loadUser, requireUser, requireTeam, requireCaptain, requireAdmin };
