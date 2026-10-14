// Worker chạy riêng (máy chạy bot). Dùng khi web đặt EMBEDDED_WORKER=false.
const config = require('./config');
const db = require('./db');
const { Worker } = require('./services/queue');

db.open();
const w = new Worker(require('./handlers')).start();
console.log(`Worker ${w.id}: ${config.CONCURRENCY} trận đồng thời, sandbox=${config.SANDBOX}`);
process.on('SIGINT', () => { w.stop(); process.exit(0); });
