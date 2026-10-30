// Tiến trình chính của máy Fly: Redis (hàng đợi, chỉ trong máy) → API (phục vụ cả web đã build) + worker.
// Một tiến trình dừng thì dừng cả máy để Fly khởi động lại — không để web sống mà worker/Redis đã chết.
import { spawn } from 'node:child_process';
import { connect } from 'node:net';

const children = [];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 5000).unref();
}

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    if (!stopping) console.error(`[start] ${name} dừng (mã ${code ?? signal}); khởi động lại máy.`);
    stop(code ?? 1);
  });
  children.push(child);
}

const redisReady = () =>
  new Promise((resolve) => {
    const s = connect(6379, '127.0.0.1')
      .once('connect', () => {
        s.end();
        resolve(true);
      })
      .once('error', () => resolve(false));
  });

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

// Chỉ nghe trong máy, không ghi đĩa: hàng đợi mất khi khởi động lại thì bộ quét job kẹt đưa lại từ PostgreSQL.
run(
  'redis',
  'redis-server',
  ['--bind', '127.0.0.1', '--port', '6379', '--save', '', '--appendonly', 'no'],
  '/',
);
for (let i = 0; i < 50 && !(await redisReady()); i++) await new Promise((r) => setTimeout(r, 200));

const node = (dir) => [process.execPath, ['--import', '../../scripts/load-env.mjs', 'dist/main.js'], dir];
run('api', ...node('/app/apps/api'));
run('worker', ...node('/app/apps/worker'));
