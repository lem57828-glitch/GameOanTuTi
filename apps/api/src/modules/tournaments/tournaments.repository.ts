import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service.js';

@Injectable()
export class TournamentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Giải "hiện tại": giải chưa kết thúc được tạo gần nhất. */
  findCurrent() {
    return this.prisma.tournament.findFirst({
      where: { status: { not: 'finished' } },
      orderBy: { createdAt: 'desc' },
      include: { stages: { orderBy: { ord: 'asc' } } },
    });
  }
}
