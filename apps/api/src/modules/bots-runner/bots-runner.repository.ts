import { conflict, forbidden, notFound, validationError } from '../../core/errors.js';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { eligibleForCompetition } from './submission-policy.js';

@Injectable()
export class BotsRunnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  listBots(teamId: string | null) {
    return this.prisma.botVersion.findMany({
      where: teamId ? { teamId } : {},
      orderBy: [{ teamId: 'asc' }, { version: 'desc' }],
    });
  }

  findBotVersion(id: string) {
    return this.prisma.botVersion.findUnique({ where: { id } });
  }

  /**
   * Xóa hẳn một phiên bản bot cùng các lượt đấu thử của nó. Từ chối nếu bot đã vào bộ bot của một giai đoạn
   * hoặc đã được chọn/chạy trong trận chính thức (giữ lại để xem lại ván, kháng nghị, kiểm tra trùng mã).
   */
  deleteBotVersion(id: string, teamId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${teamId}))`;
      const [choices, selections, stages, levels] = await Promise.all([
        tx.gameChoice.count({ where: { botVersionId: id } }),
        tx.matchSelection.count({ where: { botVersionId: id } }),
        tx.botStageSelection.count({ where: { botVersionIds: { has: id } } }),
        // Bot đội chọn cho mức sơ loại chưa xong: xóa thì khi khóa mức hệ thống lặng lẽ dùng bot dự phòng.
        tx.levelBot.findMany({
          where: { botVersionId: id, level: { status: { in: ['planned', 'locked', 'running', 'cutting'] } } },
          select: { level: { select: { name: true } } },
        }),
      ]);
      if (choices || selections)
        throw conflict('Bot đã thi đấu trong giải nên được giữ lại để xem lại ván và giải quyết kháng nghị.');
      if (stages)
        throw conflict('Bot đang nằm trong bộ bot đã chọn cho một giai đoạn. Bỏ bot khỏi bộ trước khi xóa.');
      if (levels.length)
        throw conflict(
          `Bot đang được chọn cho ${levels.map((l) => l.level.name).join(', ')}. Chọn bot khác cho mức trước khi xóa.`,
        );
      const runs = await tx.botTestRun.deleteMany({ where: { botVersionId: id } });
      await tx.botVersion.delete({ where: { id } });
      return { testRuns: runs.count };
    });
  }

  findBotByHash(sourceHash: string) {
    return this.prisma.botVersion.findFirst({
      where: { sourceHash },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMaxVersion(teamId: string): Promise<number> {
    const agg = await this.prisma.botVersion.aggregate({
      where: { teamId },
      _max: { version: true },
    });
    return agg._max.version ?? 0;
  }

  findTeam(teamId: string) {
    return this.prisma.team.findUnique({ where: { id: teamId } });
  }

  createBotVersion(data: {
    teamId: string;
    label: string;
    sourceHash: string;
    sourceCode: string;
    githubRepo?: string;
    commitSha?: string;
    sourcePath?: string;
    submittedById: string | null;
    duplicateOfId?: string | null;
    validationLog?: string | null;
    rulesetId: string;
    status: string;
    isDemo?: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.teamId}))`;
      const latest = await tx.botVersion.aggregate({
        where: { teamId: data.teamId },
        _max: { version: true },
      });
      const bot = await tx.botVersion.create({ data: { ...data, version: (latest._max.version ?? 0) + 1 } });
      if (bot.status === 'pending')
        await tx.outboxEvent.create({
          data: {
            type: 'bot.validation.requested',
            aggregateId: bot.id,
            payload: { jobId: bot.id, requestKey: `validation:${bot.id}`, kind: 'validate_bot' },
          },
        });
      return bot;
    });
  }

  async saveSelection(
    teamId: string,
    stageId: string,
    botVersionIds: string[],
    lock: boolean,
    demoMode = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Stage" WHERE id = ${stageId} FOR UPDATE`;
      const stage = await tx.stage.findUnique({ where: { id: stageId } });
      const team = await tx.team.findUnique({ where: { id: teamId } });
      if (!stage || !team) throw notFound('Đội/giai đoạn');
      if (stage.tournamentId !== team.tournamentId) throw forbidden('Đội không thuộc giải này.');
      const current = await tx.botStageSelection.findUnique({
        where: { teamId_stageId: { teamId, stageId } },
      });
      const frozen = Boolean(
        current?.locked ||
          (current?.freezeAt && current.freezeAt <= new Date()) ||
          (stage.lockAt && stage.lockAt <= new Date()),
      );
      if (frozen && (!current || current.botVersionIds.join('|') !== botVersionIds.join('|'))) {
        throw conflict('Bộ bot của giai đoạn đã khóa.');
      }
      if (stage.kind === 'qualifier' && botVersionIds.length !== 1)
        throw validationError('Sơ loại chỉ chọn một bot.');
      const bots = await tx.botVersion.findMany({
        where: { id: { in: botVersionIds }, teamId, status: 'valid' },
      });
      if (bots.length !== botVersionIds.length) throw validationError('Chỉ chọn bot hợp lệ thuộc đội.');
      if (bots.some((bot) => !eligibleForCompetition(bot, demoMode)))
        throw validationError(
          'Thi chính thức phải dùng bot nộp qua GitHub với commit SHA cố định. Bot tải file/dán code chỉ dùng tập luyện.',
        );
      if (frozen && current) return { ...current, locked: true };
      return tx.botStageSelection.upsert({
        where: { teamId_stageId: { teamId, stageId } },
        create: { teamId, stageId, botVersionIds, locked: lock, freezeAt: stage.lockAt },
        update: { botVersionIds, locked: lock, freezeAt: stage.lockAt },
      });
    });
  }

  async selection(teamId: string, stageId: string) {
    const stage = await this.prisma.stage.findUnique({ where: { id: stageId } });
    if (!stage) throw notFound('Giai đoạn');
    const row = await this.prisma.botStageSelection.findUnique({
      where: { teamId_stageId: { teamId, stageId } },
    });
    return row
      ? {
          ...row,
          locked:
            row.locked ||
            Boolean((row.freezeAt ?? stage.lockAt) && (row.freezeAt ?? stage.lockAt)! <= new Date()),
        }
      : null;
  }

  duplicateReport() {
    return this.prisma.botVersion.findMany({
      where: { duplicateOfId: { not: null } },
      select: { id: true, teamId: true, label: true, sourceHash: true, duplicateOfId: true, createdAt: true },
    });
  }

  latestDemoBot(teamId: string, tx: Tx = this.prisma) {
    return tx.botVersion.findFirst({
      where: { teamId, status: 'valid', demoPolicy: { not: null } },
      orderBy: { version: 'desc' },
    });
  }

  gameTeams(id: string, tx: Tx) {
    return tx.game.findUnique({ where: { id }, select: { blueTeamId: true, pinkTeamId: true } });
  }
  createJob(
    tx: Tx,
    data: { requestKey: string; gameId: string; roomId: string; payload: Prisma.InputJsonValue },
  ) {
    return tx.gameJob.create({ data });
  }

  findJob(id: string) {
    return this.prisma.gameJob.findUnique({ where: { id } });
  }

  findJobByRequestKey(requestKey: string) {
    return this.prisma.gameJob.findUnique({ where: { requestKey } });
  }

  findJobByGame(gameId: string, tx: Tx = this.prisma) {
    return tx.gameJob.findUnique({ where: { gameId } });
  }

  markDispatched(id: string) {
    return this.prisma.gameJob.updateMany({
      where: { id, status: 'queued' },
      data: { status: 'dispatched' },
    });
  }

  /** Job đã giao cho hàng đợi nhưng không tiến triển quá `olderThan`. */
  findStale(olderThan: Date) {
    return this.prisma.gameJob.findMany({
      where: {
        status: { in: ['dispatched', 'running'] },
        updatedAt: { lt: olderThan },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      take: 50,
    });
  }

  touch(id: string) {
    return this.prisma.gameJob.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  createDemoBots(
    rows: Array<{
      id: string;
      teamId: string;
      label: string;
      sourceHash: string;
      rulesetId: string;
      demoPolicy: string;
    }>,
  ) {
    return this.prisma.botVersion.createMany({
      data: rows.map((r) => ({ ...r, version: 1, status: 'valid', isDemo: true })),
      skipDuplicates: true,
    });
  }

  demoPolicies(teamIds: string[]) {
    return this.prisma.botVersion.findMany({
      where: { teamId: { in: teamIds }, status: 'valid', demoPolicy: { not: null } },
      orderBy: { version: 'desc' },
      select: { teamId: true, demoPolicy: true },
    });
  }

  findPendingValidation(olderThan: Date) {
    return this.prisma.botVersion.findMany({
      where: { status: 'pending', createdAt: { lt: olderThan } },
      take: 50,
    });
  }
  async diagnostics(gameId: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    const job = await this.prisma.gameJob.findUnique({ where: { gameId } });
    if (!game || !job) return null;
    const runs = await this.prisma.runAttempt.findMany({
      where: { jobId: job.id },
      select: { id: true, attemptNo: true, status: true, diagnostics: true },
      orderBy: { attemptNo: 'asc' },
    });
    return { game, runs };
  }
  findStaleTestRuns(olderThan: Date) {
    return this.prisma.botTestRun.findMany({
      where: { status: { in: ['queued', 'running'] }, updatedAt: { lt: olderThan } },
      take: 50,
    });
  }

  // ---- TV2 - Gói việc 4: Test Runs
  createTestRun(data: {
    botVersionId: string;
    mySide: string;
    opponentType: string;
    opponentTarget: string;
    extraType: string;
    opponentExtraType: string;
    seed: number;
    rulesetId: string;
    initialBoard: Prisma.InputJsonValue;
    status: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.botTestRun.create({ data });
      await tx.outboxEvent.create({
        data: {
          type: 'test_run.requested',
          aggregateId: run.id,
          payload: { jobId: run.id, requestKey: `testrun:${run.id}`, kind: 'test_run' },
        },
      });
      return run;
    });
  }

  findTestRun(id: string) {
    return this.prisma.botTestRun.findUnique({
      where: { id },
      include: { botVersion: true },
    });
  }

  listTestRuns(botVersionId: string) {
    return this.prisma.botTestRun.findMany({
      where: { botVersionId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  updateTestRun(
    id: string,
    data: {
      status: string;
      winner?: string | null;
      reason?: string | null;
      plies?: number | null;
      piecesBlue?: number | null;
      piecesPink?: number | null;
      events?: Prisma.InputJsonValue;
      error?: string | null;
      logs?: string | null;
      finishedAt?: Date | null;
    },
  ) {
    return this.prisma.botTestRun.update({
      where: { id },
      data,
    });
  }

  botLabels(ids: string[]) {
    return this.prisma.botVersion.findMany({
      where: { id: { in: ids } },
      select: { id: true, label: true, version: true },
    });
  }
}
