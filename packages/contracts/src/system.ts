// Sức khỏe dịch vụ cho trang BTC (đặc tả M0 mục 11, 17).
import { z } from 'zod';
import { IsoDateTime } from './common.js';

export const ServiceHealth = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.boolean(),
  redis: z.boolean(),
  worker: z.object({
    alive: z.boolean(),
    lastSeenAt: IsoDateTime.nullable(),
    workerId: z.string().nullable(),
    workers: z
      .array(z.object({ workerId: z.string(), at: IsoDateTime, concurrency: z.number().int().positive() }))
      .optional(),
  }),
  queue: z
    .object({ waiting: z.number().int(), active: z.number().int(), failed: z.number().int() })
    .nullable(),
  outbox: z.object({
    pending: z.number().int(),
    oldestPendingAt: IsoDateTime.nullable(),
    replayedOnStartup: z.number().int(),
  }),
  demoMode: z.boolean(),
  environment: z.string(),
  serverTime: IsoDateTime,
});
export type ServiceHealth = z.infer<typeof ServiceHealth>;

/** GET /api/v1/health công khai: không lộ chi tiết nội bộ. */
export const PublicHealth = z.object({
  status: z.enum(['ok', 'degraded']),
  /** Worker có đang gửi heartbeat không — để giao diện báo rõ khi worker chưa chạy. */
  workerAlive: z.boolean(),
  demoMode: z.boolean(),
  serverTime: IsoDateTime,
});
export type PublicHealth = z.infer<typeof PublicHealth>;
