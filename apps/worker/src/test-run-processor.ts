import type { PrismaClient } from '@prisma/client';
import { PieceType } from '@arena/contracts';
import { SandboxGameRunner } from './runner/sandbox-game-runner.js';

export interface TestRunProcessorDeps {
  prisma: PrismaClient;
  runner: SandboxGameRunner;
  log: (msg: string) => void;
}

export class TestRunProcessor {
  constructor(private readonly deps: TestRunProcessorDeps) {}

  async process(testRunId: string): Promise<void> {
    const { prisma, runner, log } = this.deps;

    const run = await prisma.botTestRun.findUnique({
      where: { id: testRunId },
      include: { botVersion: true },
    });

    if (!run) {
      log(`Không tìm thấy BotTestRun id=${testRunId}`);
      return;
    }

    if (run.status === 'succeeded' || run.status === 'failed') {
      log(`BotTestRun ${testRunId} đã kết thúc trước đó (${run.status}).`);
      return;
    }

    const owner = `${process.pid}:${crypto.randomUUID()}`;
    const claim = await prisma.botTestRun.updateMany({
      where: {
        id: testRunId,
        status: { in: ['queued', 'running'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        status: 'running',
        attempts: { increment: 1 },
        leaseOwner: owner,
        leaseUntil: new Date(Date.now() + 30_000),
      },
    });
    if (!claim.count) throw new Error('Lượt đấu thử đang được worker khác xử lý.');
    const lease = setInterval(() => {
      void prisma.botTestRun
        .updateMany({
          where: { id: testRunId, leaseOwner: owner, status: 'running' },
          data: { leaseUntil: new Date(Date.now() + 30_000) },
        })
        .catch((e) => log(String(e)));
    }, 10_000);
    lease.unref();

    log(
      `Bắt đầu chạy đấu thử BotTestRun ${testRunId}: Bot ${run.botVersion.label} (${run.mySide}) vs ${run.opponentType}:${run.opponentTarget}`,
    );

    const events: Array<{
      seq: number;
      ply: number;
      side: 'blue' | 'pink';
      type: 'ROCK' | 'PAPER' | 'SCISSORS';
      from: string;
      to: string;
      capture?: string | null;
    }> = [];

    const onMove = async (move: {
      type: 'ROCK' | 'PAPER' | 'SCISSORS';
      side: 'blue' | 'pink';
      ply: number;
      from: string;
      to: string;
      capture: 'ROCK' | 'PAPER' | 'SCISSORS' | null;
    }) => {
      events.push({
        seq: events.length + 1,
        ply: move.ply,
        side: move.side,
        type: move.type,
        from: move.from,
        to: move.to,
        capture: move.capture ?? null,
      });
    };

    try {
      const outcome = await runner.run(
        {
          contractVersion: 1,
          requestKey: `testrun:${testRunId}`,
          gameId: `game:${testRunId}`,
          choices: {
            blue: {
              botVersionId:
                run.mySide === 'blue'
                  ? run.botVersionId
                  : run.opponentType === 'bot'
                    ? run.opponentTarget
                    : `demo:${run.opponentTarget}`,
              extraType: PieceType.parse(run.mySide === 'blue' ? run.extraType : run.opponentExtraType),
            },
            pink: {
              botVersionId:
                run.mySide === 'pink'
                  ? run.botVersionId
                  : run.opponentType === 'bot'
                    ? run.opponentTarget
                    : `demo:${run.opponentTarget}`,
              extraType: PieceType.parse(run.mySide === 'pink' ? run.extraType : run.opponentExtraType),
            },
          },
          rulesetId: run.rulesetId,
          seed: run.seed,
          limits: {
            cpuMsPerMove: 200,
            wallMsPerMove: 1000,
            startupMs: 3000,
            maxPlies: run.maxPlies,
            maxErrorsPerGame: 3,
          },
        },
        onMove,
      );

      await prisma.botTestRun.updateMany({
        where: { id: testRunId, leaseOwner: owner, status: 'running' },
        data: {
          status: 'succeeded',
          leaseOwner: null,
          leaseUntil: null,
          logs: outcome.logs,
          winner: outcome.winner,
          reason: outcome.reason,
          plies: outcome.plies,
          piecesBlue: outcome.piecesLeft.blue,
          piecesPink: outcome.piecesLeft.pink,
          events,
          finishedAt: new Date(),
        },
      });

      log(
        `Đấu thử BotTestRun ${testRunId} thành công. Thắng: ${outcome.winner ?? 'Hòa'}, Lý do: ${outcome.reason}, Số nước: ${outcome.plies}.`,
      );
    } catch (err) {
      const errorMsg = (err as Error).message || String(err);
      log(`Đấu thử BotTestRun ${testRunId} thất bại: ${errorMsg}`);

      await prisma.botTestRun.updateMany({
        where: { id: testRunId, leaseOwner: owner, status: 'running' },
        data: { error: errorMsg, leaseOwner: null, leaseUntil: null },
      });
      throw err;
    } finally {
      clearInterval(lease);
    }
  }
}
