// Cấu hình dùng chung. Mọi module đọc cấu hình từ đây, không tự đọc process.env rải rác.
const path = require('node:path');

const env = (name, def) => (process.env[name] !== undefined && process.env[name] !== '' ? process.env[name] : def);
const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.resolve(env('DATA_DIR', path.join(ROOT, 'data')));
const PRODUCTION = env('NODE_ENV', 'development') === 'production';

const config = {
  ROOT,
  DATA_DIR,
  PRODUCTION,
  PORT: Number(env('PORT', 3000)),
  // sqlite: node:sqlite tệp cục bộ · libsql: libsql tệp cục bộ · turso: libsql từ xa (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)
  DB_DRIVER: env('DB_DRIVER', 'sqlite'),
  // Tệp riêng cho bản xây lại, không đụng CSDL của bản cũ (legacy-v1 dùng arena.db).
  DB_FILE: path.join(DATA_DIR, 'arena-v2.db'),
  TURSO_DATABASE_URL: env('TURSO_DATABASE_URL', ''),
  TURSO_AUTH_TOKEN: env('TURSO_AUTH_TOKEN', ''),
  APP_SECRET: env('APP_SECRET', PRODUCTION ? '' : 'dev-secret-chi-dung-khi-phat-trien'),
  TRUST_PROXY: env('TRUST_PROXY', 'loopback'),
  // Đăng nhập giả lập để các module làm song song khi TV1 chưa xong tài khoản. Luôn tắt khi production.
  DEV_LOGIN: !PRODUCTION && env('DEV_LOGIN', 'true') === 'true',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
};

if (PRODUCTION && config.APP_SECRET.length < 32) {
  throw new Error('APP_SECRET phải có ít nhất 32 ký tự khi chạy production');
}

module.exports = config;
