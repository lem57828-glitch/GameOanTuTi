import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/** Test giao diện độc lập, không thay đổi database demo đang dùng. */
export default defineConfig({
  testDir: '.',
  testMatch: 'demo-entry.ui.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5189' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @arena/web dev --host 127.0.0.1 --port 5189',
    url: 'http://127.0.0.1:5189',
    cwd: resolve('.'),
    reuseExistingServer: false,
  },
});
