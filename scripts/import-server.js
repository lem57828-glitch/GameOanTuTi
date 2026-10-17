// Chỉ bật tạm khi chuyển dữ liệu sang một database Turso trống.
const express = require('express');
const crypto = require('node:crypto');
const config = require('../src/config');
const { importData } = require('./data-transfer');

const token = process.env.MIGRATION_TOKEN || '';
if (token.length < 32) throw new Error('MIGRATION_TOKEN phải ngẫu nhiên, ít nhất 32 ký tự');
if (config.DB_DRIVER !== 'turso' || !/^libsql:\/\//.test(config.TURSO_DATABASE_URL) || !config.TURSO_AUTH_TOKEN) {
  throw new Error('Chế độ import cần DB_DRIVER=turso, URL và token Turso');
}
const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => res.json({ ok: true, mode: 'import' }));
app.post('/import', (req, res, next) => {
  const got = crypto.createHash('sha256').update(req.headers.authorization || '').digest();
  const expected = crypto.createHash('sha256').update(`Bearer ${token}`).digest();
  if (!crypto.timingSafeEqual(got, expected)) return res.sendStatus(403);
  next();
}, express.json({ limit: '100mb' }), (req, res) => {
  let target;
  try {
    target = new (require('libsql'))(config.TURSO_DATABASE_URL, { authToken: config.TURSO_AUTH_TOKEN });
    res.json(importData(target, config.DATA_DIR, req.body));
  } catch (err) {
    console.error('Import failed:', err.message);
    res.status(409).json({ error: 'Import chưa hoàn tất. Xem log Railway để kiểm tra; database đích phải trống.' });
  } finally {
    target?.close();
  }
});
app.listen(config.PORT, '0.0.0.0', () => console.log('Migration mode: waiting for authenticated snapshot upload'));
