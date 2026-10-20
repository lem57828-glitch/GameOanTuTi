// Cấu hình đọc từ biến môi trường, kiểm tra một lần lúc khởi động. Không ghi cứng cổng/địa chỉ trong code.
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(3100),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET cần ít nhất 32 ký tự'),
  /** Tiền tố khóa BullMQ trên Redis; kiểm thử tích hợp dùng tiền tố riêng. */
  QUEUE_PREFIX: z.string().min(1).default('arena'),
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(1000),
  /** Job đã giao cho worker mà không tiến triển sau khoảng này sẽ được kiểm tra và đưa lại vào hàng đợi. */
  JOB_RECOVERY_MS: z.coerce.number().int().positive().default(120_000),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  databaseUrl: string;
  redisUrl: string;
  port: number;
  webOrigins: string[];
  demoMode: boolean;
  sessionSecret: string;
  queuePrefix: string;
  outboxPollMs: number;
  jobRecoveryMs: number;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Cấu hình không hợp lệ: ${issues}`);
  }
  const e = parsed.data;
  const demoRequested = e.DEMO_MODE === 'true';
  // Đặc tả M0 mục 6: production phải từ chối khởi động nếu bật chế độ giả lập.
  if (e.NODE_ENV === 'production' && demoRequested) {
    throw new Error('Từ chối khởi động: DEMO_MODE=true không được phép khi NODE_ENV=production.');
  }
  if (e.NODE_ENV === 'production' && /change-me/i.test(e.SESSION_SECRET)) {
    throw new Error('Từ chối khởi động: SESSION_SECRET vẫn là giá trị mẫu.');
  }
  return {
    env: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    port: e.API_PORT,
    webOrigins: e.WEB_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    demoMode: demoRequested,
    sessionSecret: e.SESSION_SECRET,
    queuePrefix: e.QUEUE_PREFIX,
    outboxPollMs: e.OUTBOX_POLL_MS,
    jobRecoveryMs: e.JOB_RECOVERY_MS,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
