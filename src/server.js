const path = require('node:path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const { Worker } = require('./services/queue');
const handlers = require('./handlers');

db.open();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:");
  next();
});
app.use('/api', require('./routes/api'));
app.use(express.static(path.join(config.ROOT, 'public'), { maxAge: '5m' }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.ROOT, 'public', 'index.html')));

app.listen(config.PORT, () => {
  console.log(`BOT ARENA chạy tại http://localhost:${config.PORT}`);
  if (config.EMBEDDED_WORKER) {
    new Worker(handlers).start();
    console.log(`Worker tích hợp: ${config.CONCURRENCY} trận đồng thời, sandbox=${config.SANDBOX}`);
  }
});
