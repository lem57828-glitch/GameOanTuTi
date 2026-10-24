import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProfile } from './runtime-profile.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [profile, action = 'dev'] = process.argv.slice(2);
const allowed = ['dev', 'worker', 'start', 'migrate', 'seed', 'bootstrap-admin', 'experience'];
const children = new Set();
let stopping = false;
function stop() {
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function main() {
  if (!allowed.includes(action)) throw new Error('Lệnh profile không hợp lệ.');
  if (profile === 'official' && action === 'seed') throw new Error('Không seed dữ liệu mẫu vào official.');
  if (profile !== 'demo' && action === 'experience') throw new Error('Giải trải nghiệm chỉ dùng cho demo.');
  if (profile !== 'official' && action === 'bootstrap-admin')
    throw new Error('Tạo BTC thật chỉ dùng cho official.');
  const { path, values } = readProfile(root, profile);
  const env = { ...process.env, ...values, ARENA_ENV_FILE: path };
  // No inherited secrets from the shell or .env may silently supply missing profile configuration.
  for (const key of [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'MAIL_FROM',
    'GITHUB_BOT_TOKEN',
    'GITHUB_BOT_PRIVATE_REPOS',
  ])
    env[key] = values[key] ?? '';
  if (action === 'start') {
    if (profile !== 'official') throw new Error('Demo chạy bằng dev:demo.');
    env.NODE_ENV = 'production';
    env.SERVE_WEB = 'true';
    env.API_PORT = values.WEB_PORT;
  }
  const run = (args) =>
    new Promise((resolveExit, reject) => {
      const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
        cwd: root,
        env,
        stdio: 'inherit',
        windowsHide: true,
      });
      children.add(child);
      child.once('error', (error) => {
        children.delete(child);
        reject(error);
      });
      child.once('exit', (code) => {
        children.delete(child);
        if (code === 0 || stopping) resolveExit();
        else reject(new Error(`Tiến trình ${args.join(' ')} dừng với mã ${code}.`));
      });
    });
  if (!process.env.npm_execpath) throw new Error('Chạy qua các lệnh pnpm trong README.');
  console.log(`Bot Arena · ${profile} · ${action} · cấu hình .env.${profile}`);
  if (action === 'migrate') return run(['db:migrate']);
  if (action === 'seed') return run(['db:seed']);
  if (action === 'experience')
    return run([
      '--filter',
      '@arena/api',
      'db:demo-experience',
      ...process.argv.slice(4).filter((a) => a !== '--'),
    ]);
  if (action === 'bootstrap-admin')
    return run(['--filter', '@arena/api', 'exec', 'tsx', 'prisma/bootstrap-admin.ts']);
  if (action === 'dev' || action === 'worker') await run(['--filter', '@arena/game-engine...', 'build']);
  if (action === 'worker') return run(['dev:worker']);
  if (action === 'dev') {
    await Promise.all([
      run(['--filter', '@arena/api', 'dev']),
      run(['--filter', '@arena/web', 'dev', '--mode', profile]),
      run(['--filter', '@arena/worker', 'dev']),
    ]);
  } else {
    await Promise.all([
      run(['--filter', '@arena/api', 'start']),
      run(['--filter', '@arena/worker', 'start']),
    ]);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
  stop();
});
