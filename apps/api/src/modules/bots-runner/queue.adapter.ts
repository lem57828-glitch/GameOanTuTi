// QueueAdapter che giấu hàng đợi cụ thể (BullMQ) khỏi phần còn lại của API (đặc tả M0 mục 5, 8).
// Đổi sang hàng đợi khác chỉ cần một implementation mới; TV3/TV4 không bị ảnh hưởng.
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { redisKeys, type QueueJobData } from '@arena/contracts';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';

export type QueueJobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed' | 'missing' | 'unknown';

export interface QueueAdapter {
  /** Đưa job vào hàng đợi. Gọi lại với cùng jobId không tạo bản sao (idempotent). */
  enqueue(data: QueueJobData): Promise<void>;
  /** Đưa lại job đã rời hàng đợi (hoàn tất/thất bại/mất) để worker xử lý tiếp. */
  requeue(data: QueueJobData): Promise<void>;
  state(jobId: string): Promise<QueueJobState>;
  counts(): Promise<{ waiting: number; active: number; failed: number } | null>;
}

export const QUEUE_ADAPTER = Symbol('QUEUE_ADAPTER');

@Injectable()
export class BullmqQueueAdapter implements QueueAdapter, OnModuleDestroy {
  private readonly queue: Queue<QueueJobData>;
  private readonly connection: Redis;

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
    this.connection = new Redis(cfg.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      commandTimeout: 2000,
    });
    this.connection.on('error', () => undefined);
    this.queue = new Queue<QueueJobData>(redisKeys(cfg.queuePrefix).gameQueue, {
      connection: this.connection,
      prefix: cfg.queuePrefix,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });
  }

  async enqueue(data: QueueJobData): Promise<void> {
    // jobId BullMQ = id GameJob (một job logic cho mỗi requestKey); thêm trùng sẽ bị BullMQ bỏ qua.
    await this.queue.add('run-game', data, {
      jobId: data.jobId,
      priority: data.kind === 'game' ? 1 : data.kind === 'validate_bot' ? 5 : 10,
    });
  }

  async requeue(data: QueueJobData): Promise<void> {
    const existing = await this.queue.getJob(data.jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') return;
      await existing.remove();
    }
    await this.enqueue(data);
  }

  async state(jobId: string): Promise<QueueJobState> {
    const job = await this.queue.getJob(jobId);
    if (!job) return 'missing';
    const s = await job.getState();
    return (
      (['waiting', 'delayed', 'active', 'completed', 'failed'] as const).find((x) => x === s) ??
      (s === 'prioritized' || s === 'waiting-children' ? 'waiting' : 'unknown')
    );
  }

  async counts() {
    try {
      const c = await this.queue.getJobCounts('waiting', 'delayed', 'active', 'failed');
      return { waiting: (c.waiting ?? 0) + (c.delayed ?? 0), active: c.active ?? 0, failed: c.failed ?? 0 };
    } catch {
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
