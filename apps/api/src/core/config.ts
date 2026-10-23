// Cấu hình đọc từ biến môi trường, kiểm tra một lần lúc khởi động. Không ghi cứng cổng/địa chỉ trong code.
import { z } from 'zod';

const Env = z.object({
  EMAIL_ALLOWED_DOMAINS: z
    .string()
    .default('vnu.edu.vn')
    .refine(
      (value) =>
        value
          .split(',')
          .every((d) =>
            /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(d.trim().replace(/^@/, '')),
          ),
      'EMAIL_ALLOWED_DOMAINS phải là các miền email hợp lệ, ngăn cách bằng dấu phẩy.',
    ),
  MAIL_TRANSPORT: z.enum(['local', 'smtp']).default('local'),
  MAIL_FROM: z.string().default('Bot Arena <noreply@localhost>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
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
  /** Thời gian chọn kín bot/quân thứ 10 trước mỗi hiệp (thể lệ 2.0: tối đa 10 phút). */
  MATCH_SELECT_SECONDS: z.coerce.number().int().min(1).max(3600).default(600),
});

export interface AppConfig {
  emailDomains: string[];
  mailTransport: 'local' | 'smtp';
  mailFrom: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
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
  matchSelectSeconds: number;
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
  if (e.NODE_ENV === 'production' && e.MAIL_TRANSPORT === 'local')
    throw new Error('Production yêu cầu MAIL_TRANSPORT=smtp.');
  if (e.MAIL_TRANSPORT === 'smtp' && !e.SMTP_HOST) throw new Error('SMTP_HOST là bắt buộc.');
  return {
    emailDomains: e.EMAIL_ALLOWED_DOMAINS.split(',')
      .map((d) => d.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean),
    mailTransport: e.MAIL_TRANSPORT,
    mailFrom: e.MAIL_FROM,
    smtpHost: e.SMTP_HOST,
    smtpPort: e.SMTP_PORT,
    smtpSecure: e.SMTP_SECURE === 'true',
    smtpUser: e.SMTP_USER,
    smtpPassword: e.SMTP_PASSWORD,
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
    matchSelectSeconds: e.MATCH_SELECT_SECONDS,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
