// Truy cập dữ liệu trận nhiều hiệp của TV4: Match, MatchSelection, và Room/Game của trận.
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../core/prisma.service.js';

export type MatchRow = Prisma.MatchGetPayload<{
  include: { selections: true; games: { include: { result: true; choices: true } } };
}>;

const withGames = {
  selections: true,
  games: { include: { result: true, choices: true }, orderBy: { no: 'asc' } },
} as const;

@Injectable()
export class MatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Khóa hàng Match trong transaction → hai tiến trình không cùng chuyển một trận sang hiệp mới. */
  async lock(tx: Tx, matchId: string): Promise<MatchRow | null> {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    return tx.match.findUnique({ where: { id: matchId }, include: withGames });
  }

  find(matchId: string, tx: Tx = this.prisma) {
    return tx.match.findUnique({ where: { id: matchId }, include: withGames });
  }

  /** Trận hiệu lực mới nhất, gồm trận BTC đã phân xử để phòng hiển thị đúng quyết định. */
  latestOfRoom(roomId: string, tx: Tx = this.prisma) {
    return tx.match.findFirst({
      where: {
        roomId,
        kind: { not: 'demo' },
        OR: [
          { status: { not: 'cancelled' } },
          { status: 'cancelled', pauseReason: { startsWith: 'BTC phân xử:' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: withGames,
    });
  }

  /** Trận cần bộ hẹn giờ xử lý: hết hạn chọn, hoặc đang chạy (kiểm tra ván hiện tại đã xong chưa). */
  due(now: Date) {
    return this.prisma.match.findMany({
      where: {
        OR: [{ status: 'selecting', deadlineAt: { lte: now } }, { status: 'running' }],
      },
      select: { id: true },
      take: 200,
    });
  }

  /** Trận đã xong của cặp đấu nhưng chưa bàn giao kết quả cho TV3. */
  unreported() {
    return this.prisma.match.findMany({
      where: { status: 'completed', reportedAt: null, pairId: { not: null } },
      select: { id: true },
      take: 100,
    });
  }

  statuses(ids: string[]) {
    return this.prisma.match.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, currentNo: true },
    });
  }

  selecting(roomIds?: string[]) {
    return this.prisma.match.findMany({
      where: { status: 'selecting', ...(roomIds ? { roomId: { in: roomIds } } : {}) },
      select: { id: true, roomId: true },
    });
  }

  findRoom(id: string, tx: Tx = this.prisma) {
    return tx.room.findUnique({ where: { id } });
  }

  upsertRoom(tx: Tx, data: Prisma.RoomUncheckedCreateInput & { id: string }) {
    return tx.room.upsert({
      where: { id: data.id },
      create: data,
      update: { title: data.title, status: data.status, isDemo: data.isDemo },
    });
  }

  upsertSelection(
    tx: Tx,
    key: { matchId: string; gameNo: number; teamId: string },
    data: { botVersionId: string; extraType: string; ready: boolean; auto?: boolean },
  ) {
    return tx.matchSelection.upsert({
      where: { matchId_gameNo_teamId: key },
      create: { ...key, ...data },
      update: data,
    });
  }
}
