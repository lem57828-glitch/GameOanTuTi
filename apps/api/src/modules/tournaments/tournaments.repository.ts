import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service.js';
import type { Tx } from '../../core/prisma.service.js';
import type { Prisma } from '@prisma/client';
export type TournamentRow = Prisma.TournamentGetPayload<{ include: { stages: true } }>;

@Injectable()
export class TournamentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Giải "hiện tại": giải chưa kết thúc được tạo gần nhất. */
  findCurrent() {
    return this.prisma.tournament.findFirst({
      where: { status: { in: ['registration', 'running'] } },
      orderBy: { createdAt: 'desc' },
      include: { stages: { orderBy: { ord: 'asc' } } },
    });
  }

  list() {
    return this.prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: { stages: { orderBy: { ord: 'asc' } } },
    });
  }

  transaction<T>(id: string, fn: (tx: Tx, row: TournamentRow | null) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${id} FOR UPDATE`;
      const row = await tx.tournament.findUnique({
        where: { id },
        include: { stages: { orderBy: { ord: 'asc' } } },
      });
      return fn(tx, row);
    });
  }

  create<T>(fn: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(fn);
  }
}
