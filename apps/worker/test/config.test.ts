import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const demo = {
  NODE_ENV: 'development',
  DEMO_MODE: 'true',
  DATABASE_URL: 'postgresql://localhost/arena',
  REDIS_URL: 'redis://localhost:6379',
};

describe('bot runtime configuration', () => {
  it('accepts explicitly selected local demo mode', () => {
    expect(loadConfig({ ...demo, BOT_SANDBOX_MODE: 'trusted-local' }).sandboxMode).toBe('trusted-local');
  });
  it('keeps Docker as the default when no local mode is selected', () => {
    expect(loadConfig(demo).sandboxMode).toBe('docker');
  });
  it('rejects misspelled runtime modes instead of silently using another runtime', () => {
    expect(() => loadConfig({ ...demo, BOT_SANDBOX_MODE: 'local' })).toThrow('BOT_SANDBOX_MODE');
  });
  it('runs the real flow in development without enabling demo, and still requires containers', () => {
    expect(loadConfig({ ...demo, DEMO_MODE: 'false' }).sandboxMode).toBe('docker');
    expect(() => loadConfig({ ...demo, DEMO_MODE: 'false', BOT_SANDBOX_MODE: 'trusted-local' })).toThrow(
      'container',
    );
  });
});
