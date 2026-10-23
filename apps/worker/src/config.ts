import { hostname } from 'node:os';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  BOT_SANDBOX_MODE: z.enum(['docker', 'trusted-local']).default('docker'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  QUEUE_PREFIX: z.string().min(1).default('arena'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  WORKER_ID: z.string().min(1).optional(),
  /** Khoảng nghỉ giữa hai nước khi phát trực tiếp, để người xem theo dõi được. 0 = chạy liền. */
  SIM_MOVE_DELAY_MS: z.coerce.number().int().min(0).max(5000).default(150),
  /** Thời hạn lease của worker trên GameJob; worker khác chỉ nhận lại job khi lease đã hết. */
  LEASE_MS: z.coerce.number().int().min(1000).default(30_000),
  /** Thời hạn khóa job của BullMQ và chu kỳ phát hiện job bị bỏ dở (worker chết). */
  WORKER_LOCK_MS: z.coerce.number().int().min(1000).default(30_000),
  WORKER_STALLED_MS: z.coerce.number().int().min(1000).default(30_000),
});

export type WorkerConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Cấu hình worker không hợp lệ: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  const e = parsed.data;
  if (
    (e.NODE_ENV === 'production' && (e.DEMO_MODE === 'true' || e.BOT_SANDBOX_MODE !== 'docker')) ||
    (e.NODE_ENV !== 'production' && e.DEMO_MODE !== 'true')
  ) {
    throw new Error('Worker: production cần DEMO_MODE=false và container; demo M0 cần DEMO_MODE=true.');
  }
  return {
    env: e.NODE_ENV,
    sandboxMode: e.BOT_SANDBOX_MODE,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    queuePrefix: e.QUEUE_PREFIX,
    concurrency: e.WORKER_CONCURRENCY,
    workerId: e.WORKER_ID ?? `${hostname()}-${process.pid}`,
    moveDelayMs: e.SIM_MOVE_DELAY_MS,
    leaseMs: e.LEASE_MS,
    lockMs: e.WORKER_LOCK_MS,
    stalledMs: e.WORKER_STALLED_MS,
  };
}
