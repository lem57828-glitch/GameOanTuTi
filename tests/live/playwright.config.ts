import { defineConfig } from '@playwright/test';

// Run against an already running local demo API/web/worker and seeded database.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 800 } },
});
