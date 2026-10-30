// Đưa bản demo lên Internet từ máy này qua Cloudflare Quick Tunnel (không cần tài khoản Cloudflare):
//   1. mở tunnel tới web demo (Vite, WEB_PORT) và lấy link https://<ngẫu nhiên>.trycloudflare.com
//   2. thêm link vào WEB_ORIGIN của .env.demo (API chỉ nhận Origin trong danh sách; Vite cho phép tên miền này)
//   3. chạy bản demo như `pnpm dev:demo` (web + API + worker)
// Ctrl+C: dừng tunnel và demo, trả WEB_ORIGIN về như cũ. Link đổi mỗi lần chạy lại.
//
//   pnpm tunnel:demo
// Cần: cloudflared trong PATH (hoặc biến CLOUDFLARED), PostgreSQL/Redis đang chạy, đã `pnpm build` và migrate demo.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = `${root}.env.demo`;
const original = readFileSync(envFile, 'utf8');
const read = (key) => new RegExp(`^${key}=(.*)$`, 'm').exec(original)?.[1]?.replace(/^['"]|['"]$/g, '');
const port = read('WEB_PORT') || '5173';
const baseOrigin = (read('WEB_ORIGIN') || `http://localhost:${port}`)
  .split(',')
  .filter((o) => !o.includes('trycloudflare.com'))
  .join(',');

// Bản demo đang chạy sẵn (pnpm dev:demo) sẽ giữ cổng: báo rõ trước khi mở tunnel.
const apiPort = read('API_PORT') || '3100';
for (const p of [port, apiPort]) {
  const free = await new Promise((resolve) => {
    const srv = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true)))
      .listen(Number(p));
  });
  if (!free) {
    console.error(
      `Cổng ${p} đang bị dùng — có thể bản demo (pnpm dev:demo) đang chạy. Dừng nó (Ctrl+C ở cửa sổ đó) rồi chạy lại.`,
    );
    process.exit(1);
  }
}

const children = new Set();
let stopping = false;
function restoreEnv() {
  const now = readFileSync(envFile, 'utf8');
  writeFileSync(envFile, now.replace(/^WEB_ORIGIN=.*$/m, `WEB_ORIGIN=${baseOrigin}`));
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  restoreEnv();
  console.log('\nĐã dừng tunnel và bản demo, WEB_ORIGIN trả về như cũ.');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const tunnel = spawn(
  process.env.CLOUDFLARED || 'cloudflared',
  ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`],
  { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);
children.add(tunnel);
tunnel.on('error', (e) => {
  console.error(`Không chạy được cloudflared: ${e.message}. Cài cloudflared hoặc đặt biến CLOUDFLARED.`);
  stop(1);
});
tunnel.on('exit', (code) => {
  if (!stopping) {
    console.error(`cloudflared đã dừng (mã ${code}).`);
    stop(1);
  }
});

const url = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 60_000);
  const onData = (chunk) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk));
    if (m) {
      clearTimeout(timer);
      resolve(m[0]);
    }
  };
  tunnel.stdout.on('data', onData);
  tunnel.stderr.on('data', onData);
});
if (!url) {
  console.error('Không lấy được link tunnel sau 60 giây (kiểm tra kết nối Internet).');
  stop(1);
} else {
  // Link công khai đứng đầu: email/thư demo tạo liên kết theo origin đầu tiên.
  writeFileSync(envFile, original.replace(/^WEB_ORIGIN=.*$/m, `WEB_ORIGIN=${url},${baseOrigin}`));
  // Log đi qua pipe thay vì ghi thẳng vào cửa sổ: console Windows bị tạm dừng khi bấm/bôi đen chữ (QuickEdit)
  // sẽ chặn tiến trình đang ghi log — web treo cho người xem qua tunnel. Qua pipe, chỉ phần hiển thị bị chậm.
  const demo = spawn(process.execPath, [`${root}scripts/runtime.mjs`, 'demo', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  demo.stdout.on('data', (b) => process.stdout.write(b));
  demo.stderr.on('data', (b) => process.stderr.write(b));
  children.add(demo);
  demo.on('exit', (code) => stop(code ?? 0));
  const line = '═'.repeat(64);
  console.log(`\n${line}\n Bản demo công khai: ${url}\n Đăng nhập mẫu:     ${url}/demo-login\n${line}`);
  console.log(' Chờ vài chục giây để web/API/worker khởi động. Ctrl+C để dừng.\n');
}
