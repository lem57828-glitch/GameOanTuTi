import { describe, expect, it } from 'vitest';
import {
  decodeSession,
  encodeSession,
  readCookie,
  SESSION_TTL_MS,
} from '../../src/core/auth/session-codec.js';
import { loadConfig } from '../../src/core/config.js';

const secret = 'test-secret-01234567890123456789012345';
describe('session boundary', () => {
  it('rejects tampering, extra segments, expiration and malformed cookies', () => {
    const now = Date.now();
    const token = encodeSession({ sub: 'acc_an', demo: true, iat: now }, secret);
    expect(decodeSession(token, secret, now)?.sub).toBe('acc_an');
    expect(decodeSession(token + '.extra', secret)).toBeNull();
    expect(decodeSession(token, 'other-secret')).toBeNull();
    expect(decodeSession(token, secret, now + SESSION_TTL_MS + 1)).toBeNull();
    expect(readCookie('arena_session=%E0%A4%A', 'arena_session')).toBeUndefined();
  });
  it('refuses production demo mode', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://test',
        REDIS_URL: 'redis://localhost',
        SESSION_SECRET: secret,
        DEMO_MODE: 'true',
      }),
    ).toThrow(/DEMO_MODE/);
  });
});
