// Phiên đăng nhập và phân quyền dùng chung.
// - Core chỉ lo: cookie phiên ký HMAC, nạp người dùng hiện tại, chặn theo vai trò.
// - Đăng ký, đăng nhập bằng mật khẩu, xác minh email, khôi phục mật khẩu... thuộc module accounts-teams (TV1).
// - Vai trò toàn cục: student | referee | admin. "Đội trưởng" là quan hệ với đội, do module accounts-teams kiểm tra.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { need } = require('./errors');

const COOKIE = 'arena_session';
const TTL_MS = 7 * 24 * 3600 * 1000;
const ROLES = ['student', 'referee', 'admin'];

const sign = (data) => crypto.createHmac('sha256', config.APP_SECRET).update(data).digest('base64url');

function issueToken(userId) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data.uid : null;
  } catch { return null; }
}

function cookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSession(res, userId) {
  const secure = config.PRODUCTION ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${issueToken(userId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}${secure}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/** Middleware: gắn req.user (hoặc null). Chỉ lấy các cột chung, không bao giờ lấy password_hash. */
function loadUser(req, _res, next) {
  const uid = readToken(cookies(req.headers.cookie)[COOKIE]);
  req.user = uid ? db.get('SELECT id, username, email, display_name, role, status FROM users WHERE id = ?', uid) : null;
  if (req.user && req.user.status === 'disabled') req.user = null;
  next();
}

const requireAuth = (req, _res, next) => { need(req.user, 'UNAUTHENTICATED', 'Cần đăng nhập'); next(); };
const requireRole = (...roles) => (req, _res, next) => {
  need(req.user, 'UNAUTHENTICATED', 'Cần đăng nhập');
  need(roles.includes(req.user.role), 'FORBIDDEN', 'Không có quyền thực hiện');
  next();
};

module.exports = { ROLES, setSession, clearSession, loadUser, requireAuth, requireRole, issueToken, readToken };
