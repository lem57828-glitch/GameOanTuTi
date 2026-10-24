// Used by API/worker entry points. A selected profile never falls back to the legacy .env.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = process.env.ARENA_ENV_FILE || resolve(root, '.env');
if (process.env.ARENA_PROFILE && !process.env.ARENA_ENV_FILE)
  throw new Error('Profile phải được chạy bằng scripts/runtime.mjs, không tự dùng .env cũ.');
if (existsSync(envFile)) process.loadEnvFile(envFile);
else if (process.env.ARENA_ENV_FILE) throw new Error('Không tìm thấy file cấu hình profile.');
