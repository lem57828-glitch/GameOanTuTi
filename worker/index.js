// Điểm khởi động worker chạy bot, tách tiến trình web: `npm run worker`. Nghiệp vụ do TV2 viết trong
// server/modules/bots-runner/worker.js.
const { setup } = require('../server/app');
const worker = require('../server/modules/bots-runner/worker');

setup();
try {
  worker.start();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
