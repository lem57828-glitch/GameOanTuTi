import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readProfile } from './runtime-profile.mjs';

test('launch configuration refuses shared database, cookie, secret and ports', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-profile-test-'));
  try {
    const demo = readFileSync(new URL('../.env.demo.example', import.meta.url), 'utf8').replace(
      'GENERATE_UNIQUE_SECRET',
      'd'.repeat(64),
    );
    const official = readFileSync(new URL('../.env.official.example', import.meta.url), 'utf8').replace(
      'GENERATE_UNIQUE_SECRET',
      'o'.repeat(64),
    );
    writeFileSync(join(root, '.env.demo'), demo);
    writeFileSync(join(root, '.env.official'), official);
    assert.equal(readProfile(root, 'demo').values.QUEUE_PREFIX, 'arena-demo');
    assert.equal(readProfile(root, 'official').values.SESSION_COOKIE_NAME, 'arena_official_session');
    for (const invalid of [
      official.replace('schema=arena_official', 'schema=public'),
      official.replace('redis://localhost:6379/1', 'redis://localhost:6379/0'),
      official.replace('arena-official', 'arena-demo'),
      official.replace('o'.repeat(64), 'd'.repeat(64)),
      official.replace('API_PORT=3101', 'API_PORT=3100'),
      official.replace('BOT_SANDBOX_MODE=docker', 'BOT_SANDBOX_MODE=trusted-local'),
    ]) {
      writeFileSync(join(root, '.env.official'), invalid);
      assert.throws(() => readProfile(root, 'official'));
    }
  } finally {
    assert.ok(
      resolve(root).startsWith(resolve(tmpdir()) + '\\') || resolve(root).startsWith(resolve(tmpdir()) + '/'),
    );
    assert.ok(root.includes('arena-profile-test-'));
    rmSync(root, { recursive: true, force: true });
  }
});

test('profile preload does not silently fall back to the legacy .env', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', new URL('./load-env.mjs', import.meta.url).href, '-e', ''],
    {
      env: { ...process.env, ARENA_PROFILE: 'official', ARENA_ENV_FILE: '' },
      encoding: 'utf8',
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /không tự dùng .env cũ/);
});
