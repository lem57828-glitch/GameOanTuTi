import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../core/prisma.service.js';

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Sự kiện của một ván theo thứ tự seq; `afterSeq` để lấy phần còn thiếu. */
  listEvents(gameId: string, afterSeq = 0, tx: Tx = this.prisma) {
    return tx.gameEvent.findMany({ where: { gameId, seq: { gt: afterSeq } }, orderBy: { seq: 'asc' } });
  }

  /** Giữ phòng cho ván mới: chỉ thành công khi phòng không có ván đang chờ/chạy (chống tạo song song). */
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
}
