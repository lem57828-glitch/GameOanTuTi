import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node tests/e2e/services.mjs',
      url: 'http://localhost:3100/api/v1/health',
      cwd: resolve('.'),
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter @arena/web dev',
      url: 'http://localhost:5173',
      cwd: resolve('.'),
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
