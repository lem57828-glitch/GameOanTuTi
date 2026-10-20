// Transactional outbox (đặc tả M0 mục 16–17).
//  - Module ghi OutboxEvent CÙNG transaction với thay đổi dữ liệu (ví dụ GameJob) → không mất việc khi tiến trình chết
//    giữa lúc ghi DB và lúc đẩy sang Redis.
//  - Dispatcher quét định kỳ các sự kiện pending và gọi handler theo `type`. Handler phải idempotent vì một sự kiện
//    có thể được phát lại (sau khi API khởi động lại hoặc handler lỗi giữa chừng).
//  - Khi khởi động, số sự kiện còn tồn được ghi log và hiển thị ở trang BTC (replayedOnStartup).
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService, type Tx } from '../prisma.service.js';

export type OutboxHandler = (event: {
  id: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
}) => Promise<void>;

interface Row {
  id: string;
  type: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

const MAX_BATCH = 20;

@Injectable()
export class OutboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Outbox');
  private readonly handlers = new Map<string, OutboxHandler>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;
  replayedOnStartup = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  register(type: string, handler: OutboxHandler): void {
    this.handlers.set(type, handler);
  }

  /** Ghi sự kiện trong transaction của bên gọi. */
  async add(tx: Tx, type: string, aggregateId: string, payload: Prisma.InputJsonValue): Promise<void> {
    await tx.outboxEvent.create({ data: { type, aggregateId, payload } });
  }

  async onApplicationBootstrap(): Promise<void> {
    this.replayedOnStartup = await this.prisma.outboxEvent.count({ where: { status: 'pending' } });
    if (this.replayedOnStartup > 0) {
      this.log.warn(`Khởi động: còn ${this.replayedOnStartup} sự kiện outbox chưa phát, đang phát lại.`);
    }
    this.timer = setInterval(() => this.poke(), this.cfg.outboxPollMs);
    this.timer.unref();
    this.poke();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Yêu cầu quét ngay (gọi sau khi commit transaction có outbox). */
  poke(): void {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    void this.drain()
      .catch((e: Error) => this.log.error(`Lỗi khi phát outbox: ${e.message}`))
      .finally(() => {
        this.running = false;
        if (this.again) {
          this.again = false;
          this.poke();
        }
      });
  }

  async stats(): Promise<{ pending: number; oldestPendingAt: string | null; replayedOnStartup: number }> {
    const [pending, oldest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: 'pending' } }),
      this.prisma.outboxEvent.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      pending,
      oldestPendingAt: oldest?.createdAt.toISOString() ?? null,
      replayedOnStartup: this.replayedOnStartup,
    };
  }

  private async drain(): Promise<void> {
    for (;;) {
      const handled = await this.prisma.$transaction(async (tx) => {
        // SKIP LOCKED: nhiều bản API chạy cùng lúc không phát trùng một hàng trong cùng thời điểm.
        const rows = await tx.$queryRaw<Row[]>`
          SELECT id, type, "aggregateId", payload, attempts FROM "OutboxEvent"
          WHERE status = 'pending' AND "availableAt" <= now()
          ORDER BY "createdAt" LIMIT ${MAX_BATCH} FOR UPDATE SKIP LOCKED`;
        for (const row of rows) await this.dispatch(tx, row);
        return rows.length;
      });
      if (handled < MAX_BATCH) return;
    }
  }

  private async dispatch(tx: Tx, row: Row): Promise<void> {
    const handler = this.handlers.get(row.type);
    try {
      if (!handler) throw new Error(`Chưa có handler cho loại sự kiện ${row.type}`);
      await handler(row);
      await tx.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'dispatched', dispatchedAt: new Date(), attempts: { increment: 1 } },
      });
    } catch (e) {
      const attempts = row.attempts + 1;
      const delayMs = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
      this.log.warn(
        `Phát ${row.type}/${row.aggregateId} thất bại (lần ${attempts}), thử lại sau ${delayMs} ms: ${(e as Error).message}`,
      );
      await tx.outboxEvent.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: (e as Error).message.slice(0, 500),
          availableAt: new Date(Date.now() + delayMs),
        },
      });
    }
  }
}
