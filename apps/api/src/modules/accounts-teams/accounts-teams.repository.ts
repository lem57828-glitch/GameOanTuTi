import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service.js';

@Injectable()
export class AccountsTeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  listTournamentTeams(tournamentId: string) {
    return this.prisma.team.findMany({
      where: { tournamentId },
      select: { id: true, name: true, status: true, captainId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  countTeams(tournamentId: string) {
    return this.prisma.team.count({ where: { tournamentId } });
  }

  createTeams(
    rows: Array<{ id: string; tournamentId: string; name: string; nameKey: string; captainId: string }>,
  ) {
    return this.prisma.team.createMany({
      data: rows.map((r) => ({ ...r, status: 'approved', isDemo: true })),
      skipDuplicates: true,
    });
  }
}
