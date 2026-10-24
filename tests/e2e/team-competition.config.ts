// Kiểm tra UI với API fixture; không cần seed hay thay đổi database đang dùng.
import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: 'team-competition.ui.spec.ts',
  workers: 1,
  use: { baseURL: 'http://localhost:5187', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @arena/web dev --port 5187',
    url: 'http://localhost:5187',
    cwd: resolve('.'),
    reuseExistingServer: false,
  },
});
