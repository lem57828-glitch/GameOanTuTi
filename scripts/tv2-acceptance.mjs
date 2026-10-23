import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.loadEnvFile(resolve('.env'));
if (!process.env.npm_execpath) throw new Error('Chạy bằng pnpm tv2:acceptance');
const report = {
  startedAt: new Date().toISOString(),
  containerRuntime: process.env.BOT_CONTAINER_CMD || 'docker',
  steps: [],
};
for (const args of [['build'], ['typecheck'], ['test'], ['test:integration']]) {
  const start = Date.now();
  const code = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
      env: { ...process.env, ARENA_TEST_CONTAINER: '1' },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', resolveExit);
  });
  report.steps.push({ command: `pnpm ${args.join(' ')}`, exitCode: code, elapsedMs: Date.now() - start });
  await writeFile(resolve('docs/TV2_TEST_RESULTS.json'), JSON.stringify(report, null, 2));
  if (code !== 0) {
    process.exitCode = 1;
    break;
  }
}
