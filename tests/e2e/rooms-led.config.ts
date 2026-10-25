import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/** Isolated UI regression checks. API routes are mocked; no database or worker is started. */
export default defineConfig({
  testDir: '.',
  testMatch: 'rooms-led.spec.ts',
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5187',
    trace: 'off',
    screenshot: 'off',
    reducedMotion: 'no-preference',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @arena/web dev --host 127.0.0.1 --port 5187',
    url: 'http://127.0.0.1:5187',
    cwd: resolve('.'),
    reuseExistingServer: false,
    timeout: 30000,
  },
});
