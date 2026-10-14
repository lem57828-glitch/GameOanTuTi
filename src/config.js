// Cấu hình hệ thống. Mọi giá trị là "đề xuất để đo thử" theo đề án; ghi đè bằng biến môi trường.
const path = require('node:path');

const env = (name, def) => (process.env[name] !== undefined ? process.env[name] : def);
const num = (name, def) => Number(env(name, def));

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(env('DATA_DIR', path.join(ROOT, 'data')));

module.exports = {
  ROOT,
  DATA_DIR,
  DB_FILE: path.join(DATA_DIR, 'arena.db'),
  BOT_DIR: path.join(DATA_DIR, 'bots'),
  PORT: num('PORT', 3000),
  SECRET: env('APP_SECRET', 'dev-secret-change-me'),
  // Worker chạy chung tiến trình web (true) hoặc tách bằng `npm run worker`.
  EMBEDDED_WORKER: env('EMBEDDED_WORKER', 'true') === 'true',
  CONCURRENCY: num('MATCH_CONCURRENCY', 4),

  PYTHON_BIN: env('PYTHON_BIN', process.platform === 'win32' ? 'python' : 'python3'),
  // 'process': tiến trình con có giới hạn (dev). 'docker': container --network none (khuyến nghị khi thi thật).
  SANDBOX: env('BOT_SANDBOX', 'process'),
  DOCKER_IMAGE: env('BOT_DOCKER_IMAGE', 'python:3.11-slim'),

  limits: {
    codeBytes: 1024 * 1024,         // 1 MB mã nộp
    memoryMb: 256,                  // RAM mỗi bot
    cpuMsPerTurn: 100,              // CPU mỗi lượt
    wallMsPerTurn: 1000,            // chờ tối đa mỗi lượt
    startupMs: 3000,                // khởi động
    logBytes: 1024 * 1024,          // log mỗi bot/trận
    practicePerDay: num('PRACTICE_PER_DAY', 20),
  },

  match: {
    turns: num('MATCH_TURNS', 100),       // lượt/trận
    extraTurns: num('EXTRA_TURNS', 100),  // đấu phụ khi hòa ở vòng loại trực tiếp
    validationTurns: 20,
  },

  swiss: {
    rounds: num('SWISS_ROUNDS', 10),
    cut: 32,
    win: 3, draw: 1, loss: 0, bye: 3,
  },
};
