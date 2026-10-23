import { Injectable } from '@nestjs/common';
import type { Tx } from '../../core/prisma.service.js';
import { PrismaService } from '../../core/prisma.service.js';

@Injectable()
export class AccountsTeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  membershipTransaction<T>(accountId: string, work: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize membership changes by the same account across browser tabs.
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
      return work(tx);
    });
  }

  findAccountByEmail(email: string) {
    return this.prisma.account.findUnique({ where: { email } });
  }

  findAccount(id: string) {
    return this.prisma.account.findUnique({ where: { id } });
  }

  findMembership(accountId: string, tournamentId: string) {
    return this.prisma.membership.findUnique({
      where: { accountId_tournamentId: { accountId, tournamentId } },
    });
  }

  listDemoAccounts(tournamentId: string | null) {
    return this.prisma.account.findMany({
      where: { isDemo: true, status: 'active' },
      orderBy: [{ role: 'desc' }, { displayName: 'asc' }],
      include: {
        memberships: {
          where: { tournamentId: tournamentId ?? '' },
          include: { team: { select: { name: true } } },
        },
      },
    });
  }

  findTeam(id: string) {
    return this.prisma.team.findUnique({
      where: { id },
      include: {
        tournament: true,
        members: {
          include: { account: { select: { id: true, displayName: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
  }

  findTeamNames(ids: string[]) {
    return this.prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }
}
