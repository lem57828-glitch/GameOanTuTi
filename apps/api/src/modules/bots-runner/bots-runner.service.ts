// TV2 — interface công khai của module bot & runner: phiên bản bot, job chạy ván, hàng đợi, sức khỏe worker.
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { GameJob } from '@prisma/client';
import {
  BotVersion,
  BotVersionStatus,
  GameRequest,
  JobStatus,
  JobView,
  QueueJobData,
  redisKeys,
  type GameLimits,
  type SessionUser,
} from '@arena/contracts';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { forbidden, notFound } from '../../core/errors.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import type { Tx } from '../../core/prisma.service.js';
import { RedisService } from '../../core/redis.service.js';
import { BotsRunnerRepository } from './bots-runner.repository.js';
import { QUEUE_ADAPTER, type QueueAdapter } from './queue.adapter.js';

/**
 * Giới hạn cho runner MÔ PHỎNG tin cậy ở M0. Không phải hạn mức cho bot thật (DECISIONS: Q10 chưa chốt).
 */
export const DEMO_LIMITS: GameLimits = {
  cpuMsPerMove: 200,
  wallMsPerMove: 1000,
  startupMs: 3000,
  maxPlies: 120,
  maxErrorsPerGame: 3,
};

export const GAME_REQUESTED = 'game.requested';

@Injectable()
export class BotsRunnerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('BotsRunner');
  private sweepTimer: NodeJS.Timeout | null = null;
  readonly recovery = { lastSweepAt: null as string | null, requeued: 0 };

  constructor(
    private readonly repo: BotsRunnerRepository,
    private readonly outbox: OutboxService,
    private readonly redis: RedisService,
    @Inject(QUEUE_ADAPTER) private readonly queue: QueueAdapter,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    // Outbox "game.requested" → hàng đợi. Idempotent: jobId BullMQ = id GameJob.
    this.outbox.register(GAME_REQUESTED, async (event) => {
      const data = QueueJobData.parse(event.payload);
      await this.queue.enqueue(data);
      await this.repo.markDispatched(data.jobId);
    });
    const every = Math.max(5_000, Math.floor(this.cfg.jobRecoveryMs / 4));
    this.sweepTimer = setInterval(() => void this.sweepStale(), every);
    this.sweepTimer.unref();
    void this.sweepStale();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ------------------------------------------------------------ Bot

  /** Sinh viên chỉ xem bot của đội mình; trọng tài/BTC xem tất cả. Mã nguồn không bao giờ nằm trong danh sách. */
  async listBots(user: SessionUser, teamId?: string): Promise<BotVersion[]> {
    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && teamId && teamId !== user.teamId) throw forbidden('Không xem được bot của đội khác.');
    const scope = teamId ?? (staff ? null : user.teamId);
    if (!staff && !scope) return [];
    const rows = await this.repo.listBots(scope);
    return rows.map((b) =>
      BotVersion.parse({
        id: b.id,
        teamId: b.teamId,
        version: b.version,
        label: b.label,
        sourceHash: b.sourceHash,
        rulesetId: b.rulesetId,
        status: BotVersionStatus.parse(b.status),
        createdAt: b.createdAt.toISOString(),
      }),
    );
  }

  /** Bot mô phỏng mới nhất hợp lệ của một đội (chỉ dùng cho luồng demo). */
  async pickDemoBot(teamId: string, tx?: Tx): Promise<{ id: string; policy: string } | null> {
    const b = await this.repo.latestDemoBot(teamId, tx);
    return b?.demoPolicy ? { id: b.id, policy: b.demoPolicy } : null;
  }

  // ------------------------------------------------------------ Job

  /**
   * Tạo GameJob + OutboxEvent trong transaction của bên gọi. requestKey là khóa duy nhất ở database;
   * vi phạm duy nhất do gửi trùng đồng thời sẽ làm transaction của bên gọi rollback.
   */
  async createGameJob(tx: Tx, request: GameRequest, roomId: string): Promise<GameJob> {
    const req = GameRequest.parse(request);
    const job = await this.repo.createJob(tx, {
      requestKey: req.requestKey,
      gameId: req.gameId,
      roomId,
      payload: req,
    });
    await this.outbox.add(tx, GAME_REQUESTED, job.id, { jobId: job.id, requestKey: job.requestKey });
    return job;
  }

  /** Báo dispatcher phát outbox ngay sau khi transaction của bên gọi đã commit. */
  kick(): void {
    this.outbox.poke();
  }

  findJobByRequestKey(requestKey: string) {
    return this.repo.findJobByRequestKey(requestKey);
  }

  findJobByGame(gameId: string, tx?: Tx) {
    return this.repo.findJobByGame(gameId, tx);
  }

  async jobView(id: string): Promise<JobView> {
    const job = await this.repo.findJob(id);
    if (!job) throw notFound('job');
    return toJobView(job);
  }

  // ------------------------------------------------------------ Hàng đợi & worker

  async workerStatus(): Promise<{ alive: boolean; lastSeenAt: string | null; workerId: string | null }> {
    try {
      const raw = await this.redis.client.get(redisKeys(this.cfg.queuePrefix).workerHeartbeat);
      if (!raw) return { alive: false, lastSeenAt: null, workerId: null };
      const hb = JSON.parse(raw) as { workerId?: string; at?: string };
      return { alive: true, lastSeenAt: hb.at ?? null, workerId: hb.workerId ?? null };
    } catch {
      return { alive: false, lastSeenAt: null, workerId: null };
    }
  }

  queueCounts() {
    return this.queue.counts();
  }

  /**
   * Khôi phục job bị kẹt: đã giao cho hàng đợi nhưng không tiến triển, lease đã hết, và BullMQ không còn giữ job
   * (Redis bị xóa, job bị gỡ...). Đưa lại vào hàng đợi; worker idempotent nên không tạo kết quả thứ hai.
   */
  async sweepStale(): Promise<number> {
    let requeued = 0;
    try {
      const stale = await this.repo.findStale(new Date(Date.now() - this.cfg.jobRecoveryMs));
      for (const job of stale) {
        const state = await this.queue.state(job.id);
        if (state === 'missing' || state === 'completed' || state === 'failed') {
          await this.queue.requeue({ jobId: job.id, requestKey: job.requestKey });
          await this.repo.touch(job.id);
          requeued++;
          this.log.warn(
            `Khôi phục job ${job.id} (${job.requestKey}): trạng thái DB=${job.status}, hàng đợi=${state} → đưa lại vào hàng đợi.`,
          );
        }
      }
    } catch (e) {
      this.log.warn(`Quét job kẹt thất bại: ${(e as Error).message}`);
    }
    this.recovery.lastSweepAt = new Date().toISOString();
    this.recovery.requeued += requeued;
    return requeued;
  }
}

export function toJobView(job: GameJob): JobView {
  return JobView.parse({
    id: job.id,
    requestKey: job.requestKey,
    gameId: job.gameId,
    roomId: job.roomId,
    status: JobStatus.parse(job.status),
    attempts: job.attempts,
    lastError: job.lastError,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}
