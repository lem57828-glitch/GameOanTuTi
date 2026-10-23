import type { PrismaClient } from '@prisma/client';
import { STANDARD_RULESET_ID } from '@arena/game-engine';
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

    await prisma.botTestRun.update({
      where: { id: testRunId },
      data: { status: 'running' },
    });

    log(`Bắt đầu chạy đấu thử BotTestRun ${testRunId}: Bot ${run.botVersion.label} (${run.mySide}) vs ${run.opponentType}:${run.opponentTarget}`);

    const mySide = (run.mySide === 'pink' ? 'pink' : 'blue') as 'blue' | 'pink';
    const oppSide = mySide === 'blue' ? 'pink' : 'blue';

    const events: Array<{
      seq: number;
      ply: number;
      side: string;
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
              botVersionId: run.mySide === 'blue' ? run.botVersionId : (run.opponentType === 'bot' ? run.opponentTarget : `demo:${run.opponentTarget}`),
              extraType: 'PAPER',
            },
            pink: {
              botVersionId: run.mySide === 'pink' ? run.botVersionId : (run.opponentType === 'bot' ? run.opponentTarget : `demo:${run.opponentTarget}`),
              extraType: 'PAPER',
            },
          },
          rulesetId: STANDARD_RULESET_ID,
          seed: Math.floor(Math.random() * 1000000),
          limits: {
            cpuMsPerMove: 200,
            wallMsPerMove: 1000,
            startupMs: 3000,
            maxPlies: 200,
            maxErrorsPerGame: 3,
          },
        },
        onMove,
      );

      await prisma.botTestRun.update({
        where: { id: testRunId },
        data: {
          status: 'succeeded',
          winner: outcome.winner,
          reason: outcome.reason,
          plies: outcome.plies,
          piecesBlue: outcome.piecesLeft.blue,
          piecesPink: outcome.piecesLeft.pink,
          events: events as any,
          finishedAt: new Date(),
        },
      });

      log(`Đấu thử BotTestRun ${testRunId} thành công. Thắng: ${outcome.winner ?? 'Hòa'}, Lý do: ${outcome.reason}, Số nước: ${outcome.plies}.`);
    } catch (err) {
      const errorMsg = (err as Error).message || String(err);
      log(`Đấu thử BotTestRun ${testRunId} thất bại: ${errorMsg}`);

      await prisma.botTestRun.update({
        where: { id: testRunId },
        data: {
          status: 'failed',
          error: errorMsg,
          finishedAt: new Date(),
        },
      });
    }
  }
}
