import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

process.loadEnvFile(resolve('../../.env'));
const require = createRequire(import.meta.url);
const originalUrl = process.env.DATABASE_URL;
const schema = `arena_test_${randomUUID().replaceAll('-', '')}`;
if (!/^arena_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid isolated schema');
const url = new URL(originalUrl);
url.searchParams.set('schema', schema);
const env = { ...process.env, DATABASE_URL: url.href };
const admin = new PrismaClient({ datasourceUrl: originalUrl });
async function run(script, args = []) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveExit() : reject(new Error(`Integration command exited ${code}`)),
    );
  });
}
try {
  await run(require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
  await run(require.resolve('tsx/cli'), ['prisma/seed.ts']);
  await run(require.resolve('vitest/vitest.mjs'), [
    'run',
    '--no-file-parallelism',
    '--dir',
    'test/integration',
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // Only the unique test-owned schema is removed; never the user's public schema.
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
