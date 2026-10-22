// TV2 — interface công khai của module bot & runner: phiên bản bot, job chạy ván, hàng đợi, sức khỏe worker.
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { GameJob } from '@prisma/client';
import {
  BotSourceDetail,
  BotVersion,
  BotVersionStatus,
  CreateTestRunInput,
  GameRequest,
  JobStatus,
  JobView,
  QueueJobData,
  SubmitBotInput,
  TestRunDetail,
  TestRunStatus,
  redisKeys,
  type GameLimits,
  type SessionUser,
} from '@arena/contracts';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { forbidden, notFound, validationError } from '../../core/errors.js';
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
        duplicateOfId: b.duplicateOfId,
        createdAt: b.createdAt.toISOString(),
      }),
    );
  }

  /**
   * Kiểm tra tĩnh mã nguồn Python cơ bản:
   * - Phải có khai báo hàm make_move
   * - Cảnh báo các module độc hại/bị cấm
   */
  validatePythonSource(source: string): { valid: boolean; log: string } {
    const hasMakeMove = /def\s+make_move\s*\(/.test(source);
    if (!hasMakeMove) {
      return {
        valid: false,
        log: 'Lỗi kiểm tra cú pháp: Mã nguồn thiếu định nghĩa hàm "def make_move(state)".',
      };
    }

    const dangerous = ['subprocess', 'socket', 'urllib', 'requests', 'shutil', 'http.server'];
    const warnings: string[] = [];
    for (const mod of dangerous) {
      const re = new RegExp(`\\bimport\\s+${mod}\\b|\\bfrom\\s+${mod}\\s+import\\b`);
      if (re.test(source)) {
        warnings.push(`Phát hiện import module bị hạn chế trong sandbox: "${mod}".`);
      }
    }

    if (warnings.length > 0) {
      return {
        valid: true,
        log: `Cảnh báo kiểm tra tĩnh:\n- ${warnings.join('\n- ')}\n(Worker sandbox sẽ chặn truy cập các thư viện này).`,
      };
    }

    return {
      valid: true,
      log: 'Kiểm tra tĩnh thành công: Cú pháp hợp lệ, đã xác nhận hàm make_move(state).',
    };
  }

  /**
   * Nộp phiên bản bot mới (TV2):
   * - Kiểm tra quyền nộp vào đội
   * - Tính mã băm SHA-256 bất biến
   * - Kiểm tra trùng mã nguồn với bot khác (Exact Duplicate)
   * - Kiểm tra sơ bộ cú pháp Python
   * - Đánh số phiên bản tự tăng (v1, v2...)
   */
  async submitBot(user: SessionUser, rawInput: unknown): Promise<BotVersion> {
    const input = SubmitBotInput.parse(rawInput);
    const staff = user.role === 'admin' || user.role === 'referee';

    if (!staff && user.teamId !== input.teamId) {
      throw forbidden('Bạn chỉ có thể nộp bot cho đội của mình.');
    }

    const team = await this.repo.findTeam(input.teamId);
    if (!team) throw notFound('Đội thi đấu');

    const cleanCode = input.sourceCode.trim();
    if (cleanCode.length < 10) {
      throw validationError('Mã nguồn bot quá ngắn.');
    }

    // Tính mã băm SHA-256 bất biến
    const sourceHash = createHash('sha256').update(cleanCode).digest('hex');

    // Kiểm tra trùng lặp mã nguồn chính xác
    const existingBot = await this.repo.findBotByHash(sourceHash);
    let duplicateOfId: string | null = null;
    let duplicateNote = '';

    if (existingBot) {
      duplicateOfId = existingBot.id;
      if (existingBot.teamId !== input.teamId) {
        duplicateNote = `\n[Cảnh báo trùng lặp] Mã nguồn trùng khớp 100% với bot của đội khác (ID: ${existingBot.id}, nhãn: ${existingBot.label}).`;
        this.log.warn(`Phát hiện trùng mã: Đội ${input.teamId} nộp trùng bot với ${existingBot.teamId} (hash: ${sourceHash})`);
      } else {
        duplicateNote = `\n[Cảnh báo trùng lặp] Mã nguồn trùng khớp 100% với phiên bản v${existingBot.version} của chính đội bạn.`;
      }
    }

    // Kiểm tra tĩnh Python
    const { valid, log } = this.validatePythonSource(cleanCode);
    const validationLog = log + duplicateNote;
    const status = valid ? 'valid' : 'invalid';

    // Số phiên bản tự tăng theo đội
    const maxV = await this.repo.getMaxVersion(input.teamId);
    const nextVersion = maxV + 1;

    const bot = await this.repo.createBotVersion({
      teamId: input.teamId,
      version: nextVersion,
      label: input.label,
      sourceHash,
      sourceCode: cleanCode,
      submittedById: user.id,
      duplicateOfId,
      validationLog,
      rulesetId: 'demo',
      status,
      isDemo: false,
    });

    this.log.log(`Đã tiếp nhận Bot v${bot.version} cho đội ${bot.teamId} (hash: ${bot.sourceHash.slice(0, 10)}…)`);

    return BotVersion.parse({
      id: bot.id,
      teamId: bot.teamId,
      version: bot.version,
      label: bot.label,
      sourceHash: bot.sourceHash,
      rulesetId: bot.rulesetId,
      status: BotVersionStatus.parse(bot.status),
      duplicateOfId: bot.duplicateOfId,
      createdAt: bot.createdAt.toISOString(),
    });
  }

  /**
   * Xem mã nguồn riêng tư của một phiên bản bot:
   * - Chỉ thành viên trong đội hoặc BTC/Trọng tài mới được xem.
   * - Đội khác xem sẽ bị từ chối 403 Forbidden.
   */
  async getBotSource(user: SessionUser, botId: string): Promise<BotSourceDetail> {
    const bot = await this.repo.findBotVersion(botId);
    if (!bot) throw notFound('Phiên bản bot');

    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && bot.teamId !== user.teamId) {
      throw forbidden('Bạn không có quyền xem mã nguồn của đội khác.');
    }

    return BotSourceDetail.parse({
      id: bot.id,
      teamId: bot.teamId,
      version: bot.version,
      label: bot.label,
      sourceCode: bot.sourceCode ?? '# Mã nguồn chưa được lưu hoặc là bot mô phỏng M0',
      sourceHash: bot.sourceHash,
      status: BotVersionStatus.parse(bot.status),
      submittedById: bot.submittedById,
      duplicateOfId: bot.duplicateOfId,
      validationLog: bot.validationLog,
      createdAt: bot.createdAt.toISOString(),
    });
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
          await this.queue.requeue({ jobId: job.id, requestKey: job.requestKey, kind: 'game' });
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

  // ---- TV2 - Gói việc 4: Test Run (Đấu thử)
  async createTestRun(user: SessionUser, botVersionId: string, rawInput: unknown): Promise<TestRunDetail> {
    const input = CreateTestRunInput.parse(rawInput);
    const bot = await this.repo.findBotVersion(botVersionId);
    if (!bot) throw notFound('Phiên bản bot');

    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && user.teamId !== bot.teamId) {
      throw forbidden('Bạn chỉ có thể đấu thử với bot của đội mình.');
    }

    if (bot.status !== 'valid') {
      throw validationError('Phiên bản bot chưa qua kiểm tra cú pháp hợp lệ.');
    }

    // Tạo bản ghi TestRun ở trạng thái queued
    const run = await this.repo.createTestRun({
      botVersionId: bot.id,
      mySide: input.mySide ?? 'blue',
      opponentType: input.opponentType,
      opponentTarget: input.opponentTarget,
      status: 'queued',
    });

    // Đẩy job vào BullMQ hàng đợi Worker
    await this.queue.enqueue({
      jobId: run.id,
      requestKey: `testrun:${run.id}`,
      kind: 'test_run',
    });

    return {
      id: run.id,
      botVersionId: run.botVersionId,
      status: 'queued',
      mySide: run.mySide as any,
      opponentType: run.opponentType as any,
      opponentTarget: run.opponentTarget,
      createdAt: run.createdAt.toISOString(),
      finishedAt: null,
    };
  }

  async getTestRun(user: SessionUser, runId: string): Promise<TestRunDetail> {
    const run = await this.repo.findTestRun(runId);
    if (!run) throw notFound('Lượt đấu thử');

    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && user.teamId !== run.botVersion.teamId) {
      throw forbidden('Bạn không có quyền xem lượt đấu thử này.');
    }

    return {
      id: run.id,
      botVersionId: run.botVersionId,
      status: run.status as any,
      mySide: run.mySide as any,
      opponentType: run.opponentType as any,
      opponentTarget: run.opponentTarget,
      winner: (run.winner as any) ?? null,
      reason: (run.reason as any) ?? null,
      plies: run.plies ?? 0,
      piecesLeft:
        run.piecesBlue !== null && run.piecesPink !== null
          ? { blue: run.piecesBlue, pink: run.piecesPink }
          : undefined,
      error: run.error,
      logs: run.logs,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      events: (run.events as any[]) ?? [],
    };
  }

  async listTestRuns(user: SessionUser, botVersionId: string): Promise<TestRunDetail[]> {
    const bot = await this.repo.findBotVersion(botVersionId);
    if (!bot) throw notFound('Phiên bản bot');

    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && user.teamId !== bot.teamId) {
      throw forbidden('Bạn chỉ có thể xem danh sách đấu thử của đội mình.');
    }

    const runs = await this.repo.listTestRuns(botVersionId);
    return runs.map((r) => ({
      id: r.id,
      botVersionId: r.botVersionId,
      status: r.status as any,
      mySide: r.mySide as any,
      opponentType: r.opponentType as any,
      opponentTarget: r.opponentTarget,
      winner: (r.winner as any) ?? null,
      reason: (r.reason as any) ?? null,
      plies: r.plies ?? 0,
      piecesLeft:
        r.piecesBlue !== null && r.piecesPink !== null
          ? { blue: r.piecesBlue, pink: r.piecesPink }
          : undefined,
      error: r.error,
      logs: r.logs,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    }));
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
