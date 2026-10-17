const path = require('node:path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const { Worker } = require('./services/queue');
const handlers = require('./handlers');

// Ghi lại lỗi làm sập tiến trình (kèm thời điểm) vào data/server.log để truy vết sau.
const fs = require('node:fs');
function logCrash(kind, err) {
  const line = `[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : err}\n`;
  console.error(line);
  try { fs.mkdirSync(config.DATA_DIR, { recursive: true }); fs.appendFileSync(path.join(config.DATA_DIR, 'server.log'), line); } catch { /* bỏ qua */ }
}
process.on('uncaughtException', (e) => { logCrash('uncaughtException', e); process.exit(1); });
process.on('unhandledRejection', (e) => logCrash('unhandledRejection', e));
process.on('exit', (code) => { if (code) logCrash('exit', `tiến trình thoát với mã ${code}`); });

if (process.env.NODE_ENV === 'production' && (config.SECRET === 'dev-secret-change-me' || config.SECRET.length < 32)) {
  throw new Error('Production cần APP_SECRET ngẫu nhiên ít nhất 32 ký tự');
}
db.open();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', /^\d+$/.test(config.TRUST_PROXY) ? Number(config.TRUST_PROXY) : config.TRUST_PROXY);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:");
  next();
});
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/api'));
app.use(express.static(path.join(config.ROOT, 'public'), { maxAge: '5m' }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.ROOT, 'public', 'index.html')));

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`BOT ARENA chạy tại http://localhost:${config.PORT}`);
  if (config.EMBEDDED_WORKER) {
    new Worker(handlers).start();
    console.log(`Worker tích hợp: ${config.CONCURRENCY} trận đồng thời, sandbox=${config.SANDBOX}`);
  }
});
