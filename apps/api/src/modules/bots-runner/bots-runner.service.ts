import { randomInt } from 'node:crypto';
import { fetchGithubSource } from './github-source.js';
import { eligibleForCompetition, submissionMethod } from './submission-policy.js';
import { createStandardBoard, STANDARD_RULESET_ID, STANDARD_LIMITS } from '@arena/game-engine';
// TV2 — interface công khai của module bot & runner: phiên bản bot, job chạy ván, hàng đợi, sức khỏe worker.
import { execFile } from 'node:child_process';
import { parse } from '../../core/http.js';
import { createHash } from 'node:crypto';
import { DEMO_RULESET_ID } from '@arena/game-engine';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { GameJob } from '@prisma/client';
import {
  BotSelectionInput,
  BotSelectionView,
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
export const DEMO_LIMITS: GameLimits = { ...STANDARD_LIMITS };

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
    this.outbox.register('test_run.requested', async (event) => {
      await this.queue.enqueue(QueueJobData.parse(event.payload));
    });
    this.outbox.register('bot.validation.requested', async (event) => {
      await this.queue.enqueue(QueueJobData.parse(event.payload));
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
        submissionMethod: submissionMethod(b),
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
  async validatePythonSource(source: string): Promise<{ valid: boolean; log: string }> {
    const script = `import ast, sys, json
try:
 tree = ast.parse(sys.stdin.read())
 funcs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "make_move"]
 if not funcs:
  raise ValueError('thiếu định nghĩa hàm "def make_move(state)"')
 f = funcs[-1]
 if len(f.args.posonlyargs + f.args.args) != 1 or f.args.vararg or f.args.kwarg or f.args.kwonlyargs or f.decorator_list:
  raise ValueError('make_move phải nhận đúng một tham số state, không dùng decorator')
 print(json.dumps({"valid": True, "log": "Cú pháp hợp lệ; cần đấu thử để kiểm tra hành vi."}))
except (SyntaxError, ValueError) as e:
 print(json.dumps({"valid": False, "log": str(e)}))
`;
    return new Promise((resolve, reject) => {
      const child = execFile(
        process.env.PYTHON_CMD || 'python',
        ['-I', '-X', 'utf8', '-c', script],
        {
          encoding: 'utf8',
          timeout: 3000,
          maxBuffer: 64 * 1024,
        },
        (error, stdout) => {
          if (error)
            return reject(
              validationError('Không khởi chạy được trình kiểm tra Python. Báo BTC kiểm tra PYTHON_CMD.'),
            );
          try {
            resolve(JSON.parse(stdout) as { valid: boolean; log: string });
          } catch {
            reject(validationError('Trình kiểm tra Python trả kết quả không hợp lệ.'));
          }
        },
      );
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(source);
    });
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
    const input = parse(SubmitBotInput, rawInput);
    const staff = user.role === 'admin' || user.role === 'referee';

    if (!staff && user.teamId !== input.teamId) {
      throw forbidden('Bạn chỉ có thể nộp bot cho đội của mình.');
    }

    const team = await this.repo.findTeam(input.teamId);
    if (!team) throw notFound('Đội thi đấu');

    const source = input.githubRepo
      ? await fetchGithubSource(
          { githubRepo: input.githubRepo, commitSha: input.commitSha!, sourcePath: input.sourcePath },
          input.teamId,
        )
      : { sourceCode: input.sourceCode!, githubRepo: undefined, commitSha: undefined, sourcePath: undefined };
    const cleanCode = source.sourceCode.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
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
        duplicateNote = `\n[Cảnh báo trùng lặp] Mã nguồn trùng khớp 100% với bot của đội khác (BTC sẽ kiểm tra).`;
        this.log.warn(
          `Phát hiện trùng mã: Đội ${input.teamId} nộp trùng bot với ${existingBot.teamId} (hash: ${sourceHash})`,
        );
      } else {
        duplicateNote = `\n[Cảnh báo trùng lặp] Mã nguồn trùng khớp 100% với phiên bản v${existingBot.version} của chính đội bạn.`;
      }
    }

    // Kiểm tra tĩnh Python
    const { valid, log } = await this.validatePythonSource(cleanCode);
    const validationLog = log + duplicateNote;
    const status = valid ? 'pending' : 'invalid';

    // Số phiên bản tự tăng theo đội

    const bot = await this.repo.createBotVersion({
      teamId: input.teamId,
      label: input.label,
      sourceHash,
      sourceCode: cleanCode,
      githubRepo: source.githubRepo,
      commitSha: source.commitSha,
      sourcePath: source.sourcePath,
      submittedById: user.id,
      duplicateOfId,
      validationLog,
      rulesetId: 'standard-32-4',
      status,
      isDemo: false,
    });

    this.outbox.poke();
    this.log.log(
      `Đã tiếp nhận Bot v${bot.version} cho đội ${bot.teamId} (hash: ${bot.sourceHash.slice(0, 10)}…)`,
    );

    return BotVersion.parse({
      id: bot.id,
      teamId: bot.teamId,
      version: bot.version,
      label: bot.label,
      sourceHash: bot.sourceHash,
      rulesetId: bot.rulesetId,
      status: BotVersionStatus.parse(bot.status),
      submissionMethod: submissionMethod(bot),
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
      githubRepo: bot.githubRepo,
      commitSha: bot.commitSha,
      sourcePath: bot.sourcePath,
      sourceCode: bot.sourceCode ?? '# Mã nguồn chưa được lưu hoặc là bot mô phỏng M0',
      sourceHash: bot.sourceHash,
      status: BotVersionStatus.parse(bot.status),
      submittedById: bot.submittedById,
      duplicateOfId: bot.duplicateOfId,
      validationLog: bot.validationLog,
      createdAt: bot.createdAt.toISOString(),
    });
  }

  /** Thành viên đội (hoặc BTC) xóa một phiên bản bot không dùng nữa. Bot mô phỏng của hệ thống không xóa được. */
  async deleteBot(user: SessionUser, botId: string): Promise<{ id: string; testRuns: number }> {
    const bot = await this.repo.findBotVersion(botId);
    if (!bot) throw notFound('Phiên bản bot');
    if (user.role !== 'admin' && bot.teamId !== user.teamId)
      throw forbidden('Bạn chỉ có thể xóa bot của đội mình.');
    if (bot.isDemo) throw forbidden('Bot mô phỏng của hệ thống không xóa được.');
    const { testRuns } = await this.repo.deleteBotVersion(bot.id, bot.teamId);
    this.log.log(
      `Đã xóa Bot v${bot.version} của đội ${bot.teamId} (${testRuns} lượt đấu thử) theo yêu cầu của ${user.id}`,
    );
    return { id: bot.id, testRuns };
  }

  async saveSelection(user: SessionUser, stageId: string, raw: unknown, lock = false) {
    const input = parse(BotSelectionInput, raw);
    const staff = user.role === 'admin' || user.role === 'referee';
    const team = await this.repo.findTeam(input.teamId);
    if (!team) throw notFound('Đội');
    if (!staff && (user.teamId !== team.id || team.captainId !== user.id))
      throw forbidden('Chỉ đội trưởng được chọn bộ bot.');
    if (lock && !staff) throw forbidden('Chỉ BTC được chốt bộ bot sớm.');
    const row = await this.repo.saveSelection(team.id, stageId, input.botVersionIds, lock, this.cfg.demoMode);
    return BotSelectionView.parse({ ...row, updatedAt: row.updatedAt.toISOString() });
  }
  async selection(user: SessionUser, teamId: string, stageId: string) {
    if (user.role !== 'admin' && user.role !== 'referee' && user.teamId !== teamId) throw forbidden();
    const row = await this.repo.selection(teamId, stageId);
    return row ? BotSelectionView.parse({ ...row, updatedAt: row.updatedAt.toISOString() }) : null;
  }
  /**
   * TV4: bot một đội được dùng trong trận. Có bộ bot đã khóa của giai đoạn thì chỉ dùng bộ đó;
   * chưa khóa thì chỉ chế độ demo cho dùng mọi bot hợp lệ của đội (giải thật: đội phải khóa bộ bot trước).
   */
  async botsForMatch(
    teamId: string,
    stageId: string | null,
  ): Promise<{ locked: boolean; bots: Array<{ id: string; label: string; version: number }> }> {
    const valid = (await this.repo.listBots(teamId)).filter(
      (b) => b.status === 'valid' && eligibleForCompetition(b, this.cfg.demoMode),
    );
    const sel = stageId ? await this.repo.selection(teamId, stageId) : null;
    const pick = (b: { id: string; label: string; version: number }) => ({
      id: b.id,
      label: b.label,
      version: b.version,
    });
    if (sel?.locked)
      return { locked: true, bots: valid.filter((b) => sel.botVersionIds.includes(b.id)).map(pick) };
    return { locked: false, bots: this.cfg.demoMode ? valid.map(pick) : [] };
  }

  /** Nhãn hiển thị của các bot (để công bố lựa chọn đã khóa trong phòng). */
  async botLabels(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.repo.botLabels(ids);
    return new Map(rows.map((b) => [b.id, `v${b.version} · ${b.label}`]));
  }

  async lockedBotIds(teamId: string, stageId: string): Promise<string[]> {
    const row = await this.repo.selection(teamId, stageId);
    if (!row?.locked) throw validationError('Bộ bot chưa khóa.');
    const eligible = (await this.repo.listBots(teamId)).filter(
      (bot) => bot.status === 'valid' && eligibleForCompetition(bot, this.cfg.demoMode),
    );
    if (row.botVersionIds.some((id) => !eligible.some((bot) => bot.id === id)))
      throw validationError(
        'Bộ bot đã khóa có phiên bản không đủ điều kiện. Hãy dùng bot GitHub hợp lệ cho thi chính thức.',
      );
    return row.botVersionIds;
  }
  async diagnostics(user: SessionUser, gameId: string) {
    const data = await this.repo.diagnostics(gameId);
    if (!data) throw notFound('Ván');
    const staff = user.role === 'admin' || user.role === 'referee';
    const side =
      data.game.blueTeamId === user.teamId ? 'blue' : data.game.pinkTeamId === user.teamId ? 'pink' : null;
    if (!staff && !side) throw forbidden();
    return data.runs.map((r) => ({
      ...r,
      diagnostics: staff
        ? r.diagnostics
        : r.diagnostics
            ?.split('\n')
            .filter((line) => line.startsWith(`${side}:`))
            .join('\n') || null,
    }));
  }
  duplicateReport() {
    return this.repo.duplicateReport();
  }

  /** Bot mô phỏng mới nhất hợp lệ của một đội (chỉ dùng cho luồng demo). */
  async pickDemoBot(teamId: string, tx?: Tx): Promise<{ id: string; policy: string } | null> {
    const b = await this.repo.latestDemoBot(teamId, tx);
    return b?.demoPolicy ? { id: b.id, policy: b.demoPolicy } : null;
  }

  /** Chính sách bot mô phỏng mới nhất của từng đội (chỉ dùng cho mô phỏng demo). */
  async demoPolicies(teamIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const r of await this.repo.demoPolicies(teamIds))
      if (!out.has(r.teamId) && r.demoPolicy) out.set(r.teamId, r.demoPolicy);
    return out;
  }

  /** DEMO: gắn một bot mô phỏng hợp lệ cho mỗi đội mẫu mới tạo (chính sách xoay vòng random/greedy/rusher). */
  async createDemoBots(teamIds: string[]): Promise<void> {
    const policies = ['random', 'greedy', 'rusher'];
    await this.repo.createDemoBots(
      teamIds.map((teamId, i) => {
        const policy = policies[i % policies.length]!;
        return {
          id: `bot_${teamId}`,
          teamId,
          label: `Bot mô phỏng (${policy})`,
          sourceHash: createHash('sha256').update(`demo-bot:${teamId}:${policy}`).digest('hex'),
          rulesetId: DEMO_RULESET_ID,
          demoPolicy: policy,
        };
      }),
    );
  }

  // ------------------------------------------------------------ Job

  /**
   * Tạo GameJob + OutboxEvent trong transaction của bên gọi. requestKey là khóa duy nhất ở database;
   * vi phạm duy nhất do gửi trùng đồng thời sẽ làm transaction của bên gọi rollback.
   */
  async createGameJob(tx: Tx, request: GameRequest, roomId: string): Promise<GameJob> {
    const req = GameRequest.parse(request);
    if (!this.cfg.demoMode && !req.stageId)
      throw validationError('Ván chính thức phải có stageId và bộ bot đã khóa.');
    if (req.stageId) {
      const teams = await this.repo.gameTeams(req.gameId, tx);
      if (!teams?.blueTeamId || !teams.pinkTeamId) throw validationError('Ván chưa khóa màu đội.');
      for (const side of ['blue', 'pink'] as const) {
        const teamId = side === 'blue' ? teams.blueTeamId : teams.pinkTeamId;
        const ids = await this.lockedBotIds(teamId, req.stageId);
        if (!ids.includes(req.choices[side].botVersionId))
          throw validationError('Bot không thuộc bộ đã khóa của đội.');
      }
    }
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

  async workerStatus(): Promise<{
    alive: boolean;
    lastSeenAt: string | null;
    workerId: string | null;
    workers?: Array<{ workerId: string; at: string; concurrency: number }>;
  }> {
    try {
      const raw = await this.redis.client.get(redisKeys(this.cfg.queuePrefix).workerHeartbeat);
      if (!raw) return { alive: false, lastSeenAt: null, workerId: null };
      const hb = JSON.parse(raw) as { workerId?: string; at?: string };
      const key = redisKeys(this.cfg.queuePrefix).workerHeartbeat;
      const active = await this.redis.client.zrangebyscore(`${key}:times`, Date.now() - 10_000, '+inf');
      const values = active.length ? await this.redis.client.hmget(`${key}:registry`, ...active) : [];
      const workers = values
        .filter((v): v is string => Boolean(v))
        .map((v) => JSON.parse(v) as { workerId: string; at: string; concurrency: number });
      return { alive: true, lastSeenAt: hb.at ?? null, workerId: hb.workerId ?? null, workers };
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
      for (const bot of await this.repo.findPendingValidation(
        new Date(Date.now() - this.cfg.jobRecoveryMs),
      )) {
        const state = await this.queue.state(bot.id);
        if (state === 'missing' || state === 'failed' || state === 'completed') {
          await this.queue.requeue({
            jobId: bot.id,
            requestKey: `validation:${bot.id}`,
            kind: 'validate_bot',
          });
          requeued++;
        }
      }
      const practice = await this.repo.findStaleTestRuns(new Date(Date.now() - this.cfg.jobRecoveryMs));
      for (const run of practice) {
        const state = await this.queue.state(run.id);
        if (state === 'missing' || state === 'completed' || state === 'failed') {
          await this.queue.requeue({ jobId: run.id, requestKey: `testrun:${run.id}`, kind: 'test_run' });
          requeued++;
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
    const input = parse(CreateTestRunInput, rawInput);
    const bot = await this.repo.findBotVersion(botVersionId);
    if (!bot) throw notFound('Phiên bản bot');

    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && user.teamId !== bot.teamId) {
      throw forbidden('Bạn chỉ có thể đấu thử với bot của đội mình.');
    }

    if (bot.status !== 'valid') {
      throw validationError('Phiên bản bot chưa qua kiểm tra cú pháp hợp lệ.');
    }

    if (input.botVersionId !== botVersionId) throw validationError('ID bot không khớp đường dẫn.');
    if (input.opponentType === 'bot') {
      const opponent = await this.repo.findBotVersion(input.opponentTarget);
      if (!opponent || (!staff && opponent.teamId !== user.teamId))
        throw forbidden('Chỉ được đấu thử với bot thuộc đội mình.');
      if (opponent.status !== 'valid') throw validationError('Bot đối thủ chưa hợp lệ.');
    } else if (!['random', 'greedy', 'rusher'].includes(input.opponentTarget))
      throw validationError('Bot mẫu không tồn tại.');
    // Tạo bản ghi TestRun ở trạng thái queued
    const run = await this.repo.createTestRun({
      botVersionId: bot.id,
      mySide: input.mySide ?? 'blue',
      opponentType: input.opponentType,
      opponentTarget: input.opponentTarget,
      extraType: input.extraType,
      opponentExtraType: input.opponentExtraType,
      rulesetId: STANDARD_RULESET_ID,
      seed: randomInt(0, 2 ** 31 - 1),
      initialBoard: createStandardBoard(
        input.mySide === 'blue' ? input.extraType : input.opponentExtraType,
        input.mySide === 'pink' ? input.extraType : input.opponentExtraType,
      ),
      status: 'queued',
    });

    this.outbox.poke();

    return TestRunDetail.parse({
      id: run.id,
      botVersionId: run.botVersionId,
      status: 'queued',
      mySide: run.mySide,
      opponentType: run.opponentType,
      opponentTarget: run.opponentTarget,
      createdAt: run.createdAt.toISOString(),
      finishedAt: null,
    });
  }

  async getTestRun(user: SessionUser, runId: string): Promise<TestRunDetail> {
    const run = await this.repo.findTestRun(runId);
    if (!run) throw notFound('Lượt đấu thử');

    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && user.teamId !== run.botVersion.teamId) {
      throw forbidden('Bạn không có quyền xem lượt đấu thử này.');
    }

    return TestRunDetail.parse({
      id: run.id,
      botVersionId: run.botVersionId,
      status: run.status,
      mySide: run.mySide,
      opponentType: run.opponentType,
      opponentTarget: run.opponentTarget,
      winner: run.winner ?? null,
      reason: run.reason ?? null,
      plies: run.plies ?? 0,
      piecesLeft:
        run.piecesBlue !== null && run.piecesPink !== null
          ? { blue: run.piecesBlue, pink: run.piecesPink }
          : undefined,
      error: run.error,
      logs: run.logs,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      rulesetId: run.rulesetId,
      seed: run.seed,
      extraType: run.extraType,
      opponentExtraType: run.opponentExtraType,
      initialBoard: run.initialBoard ?? undefined,
      maxPlies: run.maxPlies,
      events: run.events ?? [],
    });
  }

  async listTestRuns(user: SessionUser, botVersionId: string): Promise<TestRunDetail[]> {
    const bot = await this.repo.findBotVersion(botVersionId);
    if (!bot) throw notFound('Phiên bản bot');

    const staff = user.role === 'admin' || user.role === 'referee';
    if (!staff && user.teamId !== bot.teamId) {
      throw forbidden('Bạn chỉ có thể xem danh sách đấu thử của đội mình.');
    }

    const runs = await this.repo.listTestRuns(botVersionId);
    return runs.map((r) =>
      TestRunDetail.parse({
        id: r.id,
        botVersionId: r.botVersionId,
        status: r.status,
        mySide: r.mySide,
        opponentType: r.opponentType,
        opponentTarget: r.opponentTarget,
        winner: r.winner ?? null,
        reason: r.reason ?? null,
        plies: r.plies ?? 0,
        piecesLeft:
          r.piecesBlue !== null && r.piecesPink !== null
            ? { blue: r.piecesBlue, pink: r.piecesPink }
            : undefined,
        error: r.error,
        logs: r.logs,
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      }),
    );
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
