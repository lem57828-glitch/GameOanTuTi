// Ghép ứng dụng: core + 4 module. Không chứa nghiệp vụ; nghiệp vụ nằm trong server/modules/<tên>/.
const path = require('node:path');
const express = require('express');
const config = require('./core/config');
const db = require('./core/db');
const auth = require('./core/auth');
const audit = require('./core/audit');
const { h, errorHandler, int } = require('./core/http');
const { need } = require('./core/errors');

// Thứ tự quan trọng khi chạy migration: module sau có thể tham chiếu bảng của module trước.
const MODULES = [
  require('./modules/accounts-teams'),   // TV1
  require('./modules/bots-runner'),      // TV2
  require('./modules/tournaments'),      // TV3
  require('./modules/rooms-matches'),    // TV4
];

/** Mở CSDL, chạy migration của core và các module, gọi init của module. */
function setup(dbFile) {
  db.open(dbFile);
  const applied = [...db.migrate('core', path.join(__dirname, 'core', 'migrations'))];
  for (const m of MODULES) applied.push(...db.migrate(m.name, m.migrations));
  for (const m of MODULES) if (m.init) m.init();
  return applied;
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY === '1' ? 1 : config.TRUST_PROXY);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:");
    next();
  });
  app.use('/api', express.json({ limit: '2mb' }), auth.loadUser);

  // ---------------- API của core ----------------
  app.get('/api/health', h(() => ({ ok: true, time: new Date().toISOString() })));
  // Giờ máy chủ: mọi mốc khóa/đồng hồ tính theo giờ này, không theo đồng hồ trình duyệt.
  app.get('/api/time', h(() => ({ now: new Date().toISOString(), timezone: config.TIMEZONE })));
  app.get('/api/session', h((req) => ({ user: req.user })));
  app.delete('/api/session', h((req, res) => { auth.clearSession(res); return { ok: true }; }));
  app.get('/api/modules', h(() => ({ modules: MODULES.map((m) => m.summary()), devLogin: config.DEV_LOGIN })));
  app.get('/api/audit', auth.requireRole('admin', 'referee'), h((req) => audit.list({ action: req.query.action })));

  // Đăng nhập giả lập: chọn một tài khoản mẫu để làm việc khi module tài khoản (TV1) chưa xong.
  // Chỉ bật khi DEV_LOGIN và không phải production.
  if (config.DEV_LOGIN) {
    app.get('/api/dev/users', h(() => db.all('SELECT id, username, display_name, role FROM users ORDER BY role DESC, id LIMIT 100')));
    app.post('/api/dev/login', h((req, res) => {
      const u = db.get('SELECT id FROM users WHERE id = ?', int(req.body.userId));
      need(u, 'NOT_FOUND', 'Không có tài khoản này');
      auth.setSession(res, u.id);
      return { ok: true };
    }));
  }

  for (const m of MODULES) app.use('/api', m.router);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `Không có API ${req.method} ${req.originalUrl}` } }));

  // ---------------- Giao diện ----------------
  app.use(express.static(path.join(config.ROOT, 'web'), { maxAge: config.PRODUCTION ? '5m' : 0 }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.ROOT, 'web', 'index.html')));
  app.use(errorHandler);
  return app;
}

module.exports = { MODULES, setup, createApp };
