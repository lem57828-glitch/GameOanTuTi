import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { STANDARD_LIMITS, STANDARD_RULESET_ID, isStandardFamily } from '@arena/game-engine';
import type { GameRunner } from './runner/game-runner.js';

/** Runtime validation is independent of syntax validation; infrastructure errors remain retryable. */
export async function validateBot(prisma: PrismaClient, runner: GameRunner, id: string): Promise<void> {
  const bot = await prisma.botVersion.findUnique({ where: { id } });
  if (!bot || bot.status !== 'pending') return;
  const owner = randomUUID();
  const claimed = await prisma.botVersion.updateMany({
    where: {
      id,
      status: 'pending',
      OR: [{ validationLeaseUntil: null }, { validationLeaseUntil: { lt: new Date() } }],
    },
    data: { validationOwner: owner, validationLeaseUntil: new Date(Date.now() + 30_000) },
  });
  if (!claimed.count) throw new Error('Bot đang được worker khác kiểm thử.');
  const heartbeat = setInterval(() => {
    void prisma.botVersion
      .updateMany({
        where: { id, status: 'pending', validationOwner: owner },
        data: { validationLeaseUntil: new Date(Date.now() + 30_000) },
      })
      .catch(() => undefined);
  }, 10_000);
  heartbeat.unref();
  try {
    const notes: string[] = [];
    for (const side of ['blue', 'pink'] as const) {
      const outcome = await runner.run(
        {
          contractVersion: 1,
          requestKey: `validation:${id}:${side}`,
          gameId: `validation:${id}`,
          // Bot nhận qua USB ở bán kết/chung kết được kiểm thử ngay trên luật mới của vòng đó.
          rulesetId: isStandardFamily(bot.rulesetId) ? bot.rulesetId : STANDARD_RULESET_ID,
          seed: 317,
          choices: {
            blue: { botVersionId: side === 'blue' ? id : 'demo:greedy', extraType: 'PAPER' },
            pink: { botVersionId: side === 'pink' ? id : 'demo:greedy', extraType: 'PAPER' },
          },
          limits: STANDARD_LIMITS,
        },
        async () => {},
      );
      notes.push(`${side}: ${outcome.reason}, ${outcome.plies} nước. ${outcome.logs ?? ''}`);
      if (outcome.winner !== side && ['errors', 'crash', 'timeout'].includes(outcome.reason)) {
        await prisma.botVersion.updateMany({
          where: { id, status: 'pending', validationOwner: owner },
          data: {
            status: 'invalid',
            validationLog: `${bot.validationLog ?? ''}\nKiểm thử thực thi thất bại:\n${notes.join('\n')}`,
          },
        });
        return;
      }
    }
    await prisma.botVersion.updateMany({
      where: { id, status: 'pending', validationOwner: owner },
      data: {
        status: 'valid',
        validationLog: `${bot.validationLog ?? ''}\nĐã kiểm thử thực thi hai màu:\n${notes.join('\n')}`,
      },
    });
  } finally {
    clearInterval(heartbeat);
    await prisma.botVersion.updateMany({
      where: { id, validationOwner: owner },
      data: { validationOwner: null, validationLeaseUntil: null },
    });
  }
}
