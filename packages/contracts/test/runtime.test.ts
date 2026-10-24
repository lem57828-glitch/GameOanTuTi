import { describe, expect, it } from 'vitest';
import { assertRuntimeProfile } from '../src/runtime.js';

const official = {
  ARENA_PROFILE: 'official',
  DEMO_MODE: 'false',
  DATABASE_URL: 'postgresql://user:pass@localhost/arena?schema=arena_official',
  REDIS_URL: 'redis://localhost:6379/1',
  QUEUE_PREFIX: 'arena-official',
  BOT_SANDBOX_MODE: 'docker',
};
describe('runtime profile boundary', () => {
  it('accepts isolated official and legacy test environments', () => {
    expect(() => assertRuntimeProfile(official)).not.toThrow();
    expect(() => assertRuntimeProfile({ NODE_ENV: 'test' })).not.toThrow();
  });
  it.each([
    { DEMO_MODE: 'true' },
    { DATABASE_URL: 'postgresql://localhost/arena?schema=public' },
    { DATABASE_URL: 'postgresql://localhost/arena?schema=arena_demo' },
    { REDIS_URL: 'redis://localhost:6379/0' },
    { QUEUE_PREFIX: 'arena-demo' },
    { SESSION_COOKIE_NAME: 'arena_demo_session' },
    { BOT_SANDBOX_MODE: 'trusted-local' },
  ])('rejects cross-environment configuration %j', (override) => {
    expect(() => assertRuntimeProfile({ ...official, ...override })).toThrow();
  });
});
