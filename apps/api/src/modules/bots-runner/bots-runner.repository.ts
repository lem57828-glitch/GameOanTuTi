import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../core/prisma.service.js';

@Injectable()
export class BotsRunnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  listBots(teamId: string | null) {
    return this.prisma.botVersion.findMany({
      where: teamId ? { teamId } : {},
      orderBy: [{ teamId: 'asc' }, { version: 'desc' }],
    });
  }

  latestDemoBot(teamId: string, tx: Tx = this.prisma) {
    return tx.botVersion.findFirst({
      where: { teamId, status: 'valid', demoPolicy: { not: null } },
      orderBy: { version: 'desc' },
    });
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
}
