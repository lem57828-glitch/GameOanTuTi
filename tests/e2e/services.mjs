import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

process.loadEnvFile(resolve('.env'));
const children = ['api', 'worker'].map((app) =>
  spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve('apps', app),
    env: { ...process.env, SIM_MOVE_DELAY_MS: '50' },
    stdio: 'inherit',
  }),
);
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
