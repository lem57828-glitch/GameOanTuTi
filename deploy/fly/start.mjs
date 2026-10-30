// Tiến trình chính của container demo (Fly.io, Render): Redis (hàng đợi, chỉ trong máy) → API (phục vụ cả web) + worker.
// Một tiến trình dừng thì dừng cả máy để Fly khởi động lại — không để web sống mà worker/Redis đã chết.
import { spawn, spawnSync } from 'node:child_process';
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

// Nền tảng cấp cổng qua PORT (Render...): API nghe đúng cổng đó. Fly dùng API_PORT trong fly.toml.
if (process.env.PORT && !process.env.API_PORT) process.env.API_PORT = process.env.PORT;

// Áp migration ngay khi khởi động (Render gói miễn phí không có bước chạy trước deploy). Chạy lại khi đã áp xong không
// làm gì; tắt bằng RUN_MIGRATIONS=false nếu nền tảng đã chạy migration riêng.
if (process.env.RUN_MIGRATIONS !== 'false') {
  const r = spawnSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    cwd: '/app/apps/api',
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error('[start] Migration thất bại; kiểm tra DATABASE_URL.');
    process.exit(1);
  }
}

// Nạp tài khoản/đội/bot mẫu cho /demo-login. seed.ts chạy lại an toàn (upsert theo id cố định, tự từ chối nếu không
// phải demo) nên chạy mỗi lần khởi động được; lỗi seed không chặn khởi động. Tắt bằng SEED_DEMO=false.
if (process.env.SEED_DEMO !== 'false' && process.env.DEMO_MODE === 'true') {
  const r = spawnSync('node_modules/.bin/tsx', ['prisma/seed.ts'], {
    cwd: '/app/apps/api',
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) console.error('[start] Nạp dữ liệu mẫu thất bại; bỏ qua, vẫn khởi động.');
}

// Giải một thí sinh (tài khoản "Thí sinh demo (BTC tự động)", 7 đội mẫu với bot thật, nút Tiếp theo). Đã có thì bỏ qua
// phần đã tạo; giải đã chơi dở thì lệnh từ chối đổi đội/bot (chỉ ghi log) — không bao giờ xóa dữ liệu. Tắt: SEED_SOLO=false.
if (process.env.SEED_SOLO !== 'false' && process.env.DEMO_MODE === 'true') {
  const r = spawnSync('node_modules/.bin/tsx', ['prisma/demo-experience.ts', '--solo'], {
    cwd: '/app/apps/api',
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) console.error('[start] Nạp giải một thí sinh không thành công (xem log trên); bỏ qua.');
}

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
