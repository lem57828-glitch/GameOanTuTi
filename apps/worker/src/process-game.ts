// Xử lý một job chạy ván — IDEMPOTENT (đặc tả M0 mục 16–17).
//
// BullMQ có thể giao lại một job (worker chết, mất kết nối, retry). Không giả định "đúng một lần":
//  1. Job đã succeeded → trả lại kết quả cũ, không chạy lại.
//  2. Lease trên GameJob: chỉ một worker giữ quyền ghi tại một thời điểm; lease hết hạn thì worker khác nhận lại.
//  3. Mỗi lần nhận là một RunAttempt mới; lần thử cũ còn "running" bị đánh dấu superseded.
//  4. Chạy lại theo ĐÚNG seed và lựa chọn đã khóa trong GameJob.payload. Nước đã lưu từ lần trước được đối chiếu
//     (phải trùng khớp) chứ không ghi lại; GameEvent duy nhất theo (gameId, type, ply).
//  5. GameResult duy nhất theo gameId → tối đa một kết quả hiệu lực.
//  6. Sau mỗi lần commit, publish tín hiệu {roomId, gameId} để API phát cho người xem.
import { Prisma, type PrismaClient } from '@prisma/client';
import { GameRequest, MoveRecord, type QueueJobData } from '@arena/contracts';
import { PermanentRunError, type GameRunner } from './runner/game-runner.js';

type Tx = Prisma.TransactionClient;

export interface ProcessorDeps {
  prisma: PrismaClient;
  runner: GameRunner;
  signal: (roomId: string, gameId: string) => Promise<void>;
  workerId: string;
  leaseMs: number;
  moveDelayMs: number;
  log: (msg: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface ProcessOutcome {
  status: 'succeeded' | 'already_succeeded';
  gameId: string;
  resultId: string;
  attemptId: string | null;
}

/** Worker khác đang giữ lease còn hạn → thử lại sau (BullMQ backoff). */
export class LeaseBusyError extends Error {}
/** Mất lease giữa chừng (quá hạn và worker khác đã nhận) → dừng, không ghi thêm. */
export class LeaseLostError extends Error {}

const streamIdOf = (gameId: string) => `game:${gameId}`;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GameProcessor {
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly d: ProcessorDeps) {
    this.sleep = d.sleep ?? defaultSleep;
  }

  async process(data: QueueJobData): Promise<ProcessOutcome> {
    const { prisma } = this.d;
    const job = await prisma.gameJob.findUnique({ where: { id: data.jobId } });
    if (!job || job.requestKey !== data.requestKey)
      throw new PermanentRunError(`Không có GameJob ${data.jobId} khớp requestKey.`);

    if (job.status === 'succeeded') {
      const result = await prisma.gameResult.findUnique({ where: { gameId: job.gameId } });
      if (result) {
        this.d.log(`Job ${job.id} đã hoàn tất trước đó → trả kết quả cũ ${result.id}.`);
        return {
          status: 'already_succeeded',
          gameId: job.gameId,
          resultId: result.id,
          attemptId: result.attemptId,
        };
      }
    }
    const request = GameRequest.parse(job.payload);

    // ---- Nhận lease.
    const now = new Date();
    const claimed = await prisma.gameJob.updateMany({
      where: {
        id: job.id,
        status: { not: 'succeeded' },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseOwner: this.d.workerId,
        leaseUntil: new Date(now.getTime() + this.d.leaseMs),
        status: 'running',
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 0) {
      const again = await prisma.gameJob.findUnique({ where: { id: job.id } });
      if (again?.status === 'succeeded') return this.process(data);
      throw new LeaseBusyError(`Job ${job.id} đang được worker ${again?.leaseOwner} xử lý.`);
    }
    const { attempts: attemptNo } = await prisma.gameJob.findUniqueOrThrow({
      where: { id: job.id },
      select: { attempts: true },
    });

    // ---- Mở lần thử mới.
    const run = await prisma.$transaction(async (tx) => {
      await this.assertLease(tx, job.id, attemptNo);
      await tx.runAttempt.updateMany({
        where: { jobId: job.id, status: 'running' },
        data: { status: 'superseded', finishedAt: now },
      });
      const run = await tx.runAttempt.create({
        data: { jobId: job.id, attemptNo, workerId: this.d.workerId },
      });
      await this.appendEvent(tx, request.gameId, 'game.started', null, {
        gameId: request.gameId,
        attemptId: run.id,
        attemptNo,
      });
      await tx.game.update({ where: { id: request.gameId }, data: { status: 'running' } });
      await tx.room.updateMany({
        where: { id: job.roomId, currentGameId: request.gameId },
        data: { status: 'running' },
      });
      return run;
    });
    if (attemptNo > 1)
      this.d.log(`Job ${job.id}: lần thử ${attemptNo} (chạy lại cùng seed ${request.seed}).`);
    await this.d.signal(job.roomId, request.gameId);

    try {
      // ---- Nước đã lưu từ lần thử trước (nếu có): đối chiếu thay vì ghi lại.
      const stored = await prisma.gameEvent.findMany({
        where: { gameId: request.gameId, type: 'game.move' },
        orderBy: { ply: 'asc' },
      });
      const storedByPly = new Map(
        stored.map((e) => [e.ply!, MoveRecord.parse((e.payload as { move: unknown }).move)]),
      );
      let leaseUntil = Date.now() + this.d.leaseMs;

      const outcome = await this.d.runner.run(request, async (move) => {
        if (Date.now() > leaseUntil - this.d.leaseMs / 2)
          leaseUntil = await this.renewLease(job.id, attemptNo);
        const prev = storedByPly.get(move.ply);
        if (prev) {
          if (JSON.stringify(prev) !== JSON.stringify(move))
            throw new PermanentRunError(
              `Nước ply ${move.ply} lệch so với lần chạy trước — runner không xác định.`,
            );
          return;
        }
        if (Date.now() > leaseUntil - this.d.leaseMs / 2)
          leaseUntil = await this.renewLease(job.id, attemptNo);
        if (this.d.moveDelayMs > 0) await this.sleep(this.d.moveDelayMs);
        await prisma.$transaction(async (tx) => {
          await this.assertLease(tx, job.id, attemptNo);
          await this.appendEvent(tx, request.gameId, 'game.move', move.ply, { gameId: request.gameId, move });
        });
        await this.d.signal(job.roomId, request.gameId);
      });

      // ---- Kết quả: một bản ghi hiệu lực cho mỗi ván.
      const game = await prisma.game.findUniqueOrThrow({
        where: { id: request.gameId },
        select: { blueTeamId: true, pinkTeamId: true },
      });
      const winnerTeamId =
        outcome.winner === 'blue' ? game.blueTeamId : outcome.winner === 'pink' ? game.pinkTeamId : null;
      const result = await prisma.$transaction(async (tx) => {
        await this.assertLease(tx, job.id, attemptNo);
        let result = await tx.gameResult.findUnique({ where: { gameId: request.gameId } });
        if (!result) {
          result = await tx.gameResult.create({
            data: {
              gameId: request.gameId,
              attemptId: run.id,
              requestKey: request.requestKey,
              winner: outcome.winner,
              winnerTeamId,
              reason: outcome.reason,
              plies: outcome.plies,
              piecesBlue: outcome.piecesLeft.blue,
              piecesPink: outcome.piecesLeft.pink,
              rulesetId: request.rulesetId,
            },
          });
          await this.appendEvent(tx, request.gameId, 'game.finished', null, {
            gameId: request.gameId,
            winner: outcome.winner,
            winnerTeamId,
            reason: outcome.reason,
            plies: outcome.plies,
            piecesLeft: outcome.piecesLeft,
          });
        }
        await tx.game.update({
          where: { id: request.gameId },
          data: { status: 'finished', finishedAt: new Date() },
        });
        await tx.room.updateMany({
          where: { id: job.roomId, currentGameId: request.gameId },
          data: { status: 'finished' },
        });
        await tx.match.updateMany({
          where: { games: { some: { id: request.gameId } } },
          data: { status: 'finished' },
        });
        await tx.gameJob.update({
          where: { id: job.id },
          data: { status: 'succeeded', leaseOwner: null, leaseUntil: null, lastError: null },
        });
        await tx.runAttempt.update({
          where: { id: run.id },
          data: { status: 'succeeded', finishedAt: new Date(), diagnostics: outcome.logs },
        });
        return result;
      });
      await this.d.signal(job.roomId, request.gameId);
      return { status: 'succeeded', gameId: request.gameId, resultId: result.id, attemptId: run.id };
    } catch (e) {
      if (!(e instanceof LeaseLostError)) {
        await prisma.$transaction([
          prisma.runAttempt.update({
            where: { id: run.id },
            data: { status: 'failed', finishedAt: new Date(), error: (e as Error).message.slice(0, 500) },
          }),
          // Nhả lease để lần thử sau nhận ngay.
          prisma.gameJob.updateMany({
            where: {
              id: job.id,
              leaseOwner: this.d.workerId,
              attempts: attemptNo,
              status: { not: 'succeeded' },
            },
            data: { leaseOwner: null, leaseUntil: null, lastError: (e as Error).message.slice(0, 500) },
          }),
        ]);
      }
      throw e;
    }
  }

  /** Hết số lần thử: đánh dấu job/ván/phòng thất bại và phát game.failed. */
  async markFailed(data: QueueJobData, error: string): Promise<void> {
    const { prisma } = this.d;
    const job = await prisma.gameJob.findUnique({ where: { id: data.jobId } });
    if (!job || job.status === 'succeeded' || job.status === 'failed') return;
    if (job.leaseOwner && job.leaseUntil && job.leaseUntil > new Date()) {
      // Bản giao trùng hết lượt thử trong khi worker khác vẫn đang chạy hợp lệ → không đánh dấu thất bại.
      this.d.log(`Bỏ qua đánh dấu thất bại job ${job.id}: worker ${job.leaseOwner} đang giữ lease.`);
      return;
    }
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: string; leaseUntil: Date | null }>
      >`SELECT status, "leaseUntil" FROM "GameJob" WHERE id = ${job.id} FOR UPDATE`;
      const current = rows[0];
      if (
        !current ||
        current.status === 'succeeded' ||
        current.status === 'failed' ||
        (current.leaseUntil && current.leaseUntil > new Date())
      )
        return;
      await tx.gameJob.update({
        where: { id: job.id },
        data: { status: 'failed', lastError: error.slice(0, 500), leaseOwner: null, leaseUntil: null },
      });
      await tx.game.update({ where: { id: job.gameId }, data: { status: 'failed' } });
      await tx.room.updateMany({
        where: { id: job.roomId, currentGameId: job.gameId },
        data: { status: 'failed' },
      });
      // Không đưa stack trace/chi tiết nội bộ ra kênh khán giả.
      await this.appendEvent(tx, job.gameId, 'game.failed', null, {
        gameId: job.gameId,
        error: 'Ván mô phỏng không chạy được. BTC xem chi tiết ở trang quản trị.',
      });
    });
    await this.d.signal(job.roomId, job.gameId);
  }

  private async appendEvent(
    tx: Tx,
    gameId: string,
    type: string,
    ply: number | null,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    // Tăng lastSeq trên hàng Game (khóa hàng) → seq liên tục, không trùng giữa các tiến trình.
    const { lastSeq } = await tx.game.update({
      where: { id: gameId },
      data: { lastSeq: { increment: 1 } },
      select: { lastSeq: true },
    });
    await tx.gameEvent.create({
      data: { gameId, streamId: streamIdOf(gameId), seq: lastSeq, type, ply, payload },
    });
  }

  private async assertLease(tx: Tx, jobId: string, attemptNo: number): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{ leaseOwner: string | null; attempts: number; leaseUntil: Date | null }>
    >`SELECT "leaseOwner", attempts, "leaseUntil" FROM "GameJob" WHERE id = ${jobId} FOR UPDATE`;
    const row = rows[0];
    if (
      row?.leaseOwner !== this.d.workerId ||
      row.attempts !== attemptNo ||
      !row.leaseUntil ||
      row.leaseUntil <= new Date()
    )
      throw new LeaseLostError(`Worker ${this.d.workerId} đã mất lease của job ${jobId}.`);
  }

  private async renewLease(jobId: string, attemptNo: number): Promise<number> {
    const until = Date.now() + this.d.leaseMs;
    const r = await this.d.prisma.gameJob.updateMany({
      where: { id: jobId, leaseOwner: this.d.workerId, attempts: attemptNo, leaseUntil: { gt: new Date() } },
      data: { leaseUntil: new Date(until) },
    });
    if (r.count === 0) throw new LeaseLostError(`Worker ${this.d.workerId} đã mất lease của job ${jobId}.`);
    return until;
  }
}
