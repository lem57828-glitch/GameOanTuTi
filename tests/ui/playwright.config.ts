import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1100, height: 500 } },
});
