import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../core/prisma.service.js';

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) { }

  listRooms() {
    return this.prisma.room.findMany({ orderBy: [{ isDemo: 'desc' }, { createdAt: 'asc' }] });
  }

  findRoom(id: string, tx: Tx = this.prisma) {
    return tx.room.findUnique({ where: { id } });
  }

  findDefaultDemoRoom() {
    return this.prisma.room.findFirst({ where: { isDemo: true }, orderBy: { createdAt: 'asc' } });
  }

  findGame(id: string, tx: Tx = this.prisma) {
    return tx.game.findUnique({ where: { id }, include: { result: true } });
  }

  listEvents(gameId: string, afterSeq = 0, tx: Tx = this.prisma) {
    return tx.gameEvent.findMany({ where: { gameId, seq: { gt: afterSeq } }, orderBy: { seq: 'asc' } });
  }

  claimRoom(tx: Tx, roomId: string, gameId: string) {
    return tx.room.updateMany({
      where: { id: roomId, status: { notIn: ['waiting', 'running'] } },
      data: { status: 'waiting', currentGameId: gameId },
    });
  }

  createMatch(tx: Tx, roomId: string) {
    return tx.match.create({ data: { roomId, status: 'running' } });
  }

  createGame(tx: Tx, data: Prisma.GameUncheckedCreateInput) {
    return tx.game.create({ data });
  }

  createChoices(tx: Tx, rows: Prisma.GameChoiceCreateManyInput[]) {
    return tx.gameChoice.createMany({ data: rows });
  }

  createEvent(tx: Tx, data: Prisma.GameEventUncheckedCreateInput) {
    return tx.gameEvent.create({ data });
  }

  /** TV4: Khóa hoặc cập nhật lựa chọn trước khi chạy (GameChoice) */
  upsertChoice(tx: Tx, data: {
    gameId: string;
    side: 'blue' | 'pink';
    teamId: string;
    botVersionId: string;
    extraType?: string;
  }) {
    return tx.gameChoice.upsert({
      where: {
        gameId_side: { gameId: data.gameId, side: data.side },
      },
      update: {
        teamId: data.teamId,
        botVersionId: data.botVersionId,
        extraType: data.extraType,
        lockedAt: new Date(),
      },
      create: {
        gameId: data.gameId,
        side: data.side,
        teamId: data.teamId,
        botVersionId: data.botVersionId,
        extraType: data.extraType,
      },
    });
  }

  /** TV4: Lưu kết quả hiệu lực duy nhất cho mỗi ván (GameResult) */
  saveGameResult(tx: Tx, data: {
    gameId: string;
    attemptId: string;
    requestKey: string;
    winner?: 'blue' | 'pink' | null;
    winnerTeamId?: string;
    reason: string;
    plies: number;
    piecesBlue: number;
    piecesPink: number;
    rulesetId: string;
  }) {
    return tx.gameResult.upsert({
      where: { gameId: data.gameId },
      update: {
        attemptId: data.attemptId,
        requestKey: data.requestKey,
        winner: data.winner,
        winnerTeamId: data.winnerTeamId,
        reason: data.reason,
        plies: data.plies,
        piecesBlue: data.piecesBlue,
        piecesPink: data.piecesPink,
        rulesetId: data.rulesetId,
        resultVersion: { increment: 1 },
      },
      create: data,
    });
  }
}