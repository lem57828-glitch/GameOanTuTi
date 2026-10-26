// Truy cập dữ liệu thi đấu của TV3: QualifierLevel, Pairing, BracketRound, Appeal (và cột thi đấu của Tournament/Stage).
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../core/prisma.service.js';

export type LevelRow = Prisma.QualifierLevelGetPayload<object>;
export type PairingRow = Prisma.PairingGetPayload<object>;
export type CompetitionTournament = Prisma.TournamentGetPayload<{
  include: { stages: true; levels: true; bracketRounds: true };
}>;

const fullTournament = {
  stages: { orderBy: { ord: 'asc' } },
  levels: { orderBy: { ord: 'asc' } },
  bracketRounds: { orderBy: { ord: 'asc' } },
} as const;

@Injectable()
export class CompetitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Mọi thao tác thi đấu của một giải chạy tuần tự: khóa hàng Tournament trong transaction. */
  transaction<T>(tournamentId: string, fn: (tx: Tx, t: CompetitionTournament | null) => Promise<T>) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
        const t = await tx.tournament.findUnique({ where: { id: tournamentId }, include: fullTournament });
        return fn(tx, t);
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  findTournament(id: string, tx: Tx = this.prisma) {
    return tx.tournament.findUnique({ where: { id }, include: fullTournament });
  }

  pairings(tournamentId: string, where: Prisma.PairingWhereInput = {}, tx: Tx = this.prisma) {
    return tx.pairing.findMany({
      where: { tournamentId, ...where },
      orderBy: [{ kind: 'asc' }, { round: 'asc' }, { slot: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Bài nộp USB bán kết/chung kết kèm thông tin phiên bản bot (hash, trạng thái kiểm tra). */
  async finalSubmissions(tournamentId: string, tx: Tx = this.prisma) {
    const subs = await tx.finalSubmission.findMany({ where: { tournamentId }, orderBy: { receivedAt: 'asc' } });
    const bots = await tx.botVersion.findMany({
      where: { id: { in: subs.map((s) => s.botVersionId) } },
      select: { id: true, version: true, sourceHash: true, status: true, validationLog: true },
    });
    const byId = new Map(bots.map((b) => [b.id, b]));
    return subs.flatMap((s) => {
      const bot = byId.get(s.botVersionId);
      return bot ? [{ ...s, bot }] : [];
    });
  }

  /** Transaction ngắn không khóa giải (vd. ghi thông báo nhắc lịch). */
  run<T>(fn: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(fn);
  }

  /** Mức còn "planned" có mốc khóa bot trong khoảng (from, to] — để nhắc đội chọn bot. */
  levelsLockingSoon(from: Date, to: Date) {
    return this.prisma.qualifierLevel.findMany({
      where: {
        status: 'planned',
        botLockAt: { gt: from, lte: to },
        tournament: { status: { in: ['registration', 'running'] } },
      },
      orderBy: { ord: 'asc' },
    });
  }

  levelBots(where: Prisma.LevelBotWhereInput, tx: Tx = this.prisma) {
    return tx.levelBot.findMany({ where });
  }

  findPairing(id: string, tx: Tx = this.prisma) {
    return tx.pairing.findUnique({ where: { id } });
  }

  openAppealCounts(pairingIds: string[], tx: Tx = this.prisma) {
    return tx.appeal.groupBy({
      by: ['pairingId'],
      where: { pairingId: { in: pairingIds }, status: 'open' },
      _count: true,
    });
  }

  countOpenAppeals(where: Prisma.PairingWhereInput, tx: Tx = this.prisma) {
    return tx.appeal.count({ where: { status: 'open', pairing: where } });
  }

  appeals(where: Prisma.AppealWhereInput, tx: Tx = this.prisma) {
    return tx.appeal.findMany({
      where,
      include: { pairing: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
    });
  }

  findAppeal(id: string, tx: Tx = this.prisma) {
    return tx.appeal.findUnique({ where: { id }, include: { pairing: true } });
  }

  /** Giải đã công bố có mức chờ khóa và đã tới mốc khóa bot (cho bộ hẹn giờ tự khóa). */
  dueLevels(now: Date) {
    return this.prisma.qualifierLevel.findMany({
      where: {
        status: 'planned',
        botLockAt: { lte: now },
        tournament: { status: { in: ['registration', 'running'] } },
      },
      select: { tournamentId: true, ord: true },
      orderBy: { ord: 'asc' },
    });
  }
}
