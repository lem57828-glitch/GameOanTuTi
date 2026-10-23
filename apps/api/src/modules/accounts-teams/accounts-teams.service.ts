import { NotificationsService } from './notifications.service.js';
// TV1 — interface công khai của module tài khoản & đội.
import { assertContestant, assertTeamWindow, normalizeTeamName } from './team-policy.js';
import { randomBytes } from 'node:crypto';
import { TEAM_MEMBER_LIMIT, type CreateTeamRequest } from '@arena/contracts';
import { conflict, forbidden } from '../../core/errors.js';
import { Prisma } from '@prisma/client';
import type { LoginRequest } from '@arena/contracts';
import { verifyPassword } from './password.js';
import { Injectable } from '@nestjs/common';
import { DemoAccount, Role, SessionUser, TeamStatus, TeamView } from '@arena/contracts';
import { AppError, notFound } from '../../core/errors.js';
import { TournamentsService } from '../tournaments/tournaments.service.js';
import { AccountsTeamsRepository } from './accounts-teams.repository.js';

@Injectable()
export class AccountsTeamsService {
  constructor(
    private readonly repo: AccountsTeamsRepository,
    private readonly tournaments: TournamentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Dựng SessionUser từ database. Tài khoản bị khóa hoặc không tồn tại → null (coi như chưa đăng nhập). */
  async sessionUser(accountId: string, demo: boolean, version?: number): Promise<SessionUser | null> {
    const acc = await this.repo.findAccount(accountId);
    if (!acc || acc.status !== 'active' || (version !== undefined && acc.sessionVersion !== version))
      return null;
    const tournamentId = await this.tournaments.currentId();
    const membership = tournamentId ? await this.repo.findMembership(acc.id, tournamentId) : null;
    return SessionUser.parse({
      id: acc.id,
      displayName: acc.displayName,
      role: Role.parse(acc.role),
      teamId: membership?.teamId ?? null,
      demo,
      emailVerified: acc.isDemo || !!acc.emailVerifiedAt,
      profileComplete: !!(acc.displayName && acc.studentId && acc.className && acc.faculty) || acc.isDemo,
    });
  }

  async login(input: LoginRequest): Promise<string> {
    const account = await this.repo.findAccountByEmail(input.email);
    const fallback = 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128);
    const valid = await verifyPassword(input.password, account?.passwordHash ?? fallback);
    if (!account || !valid || account.status !== 'active' || account.isDemo) {
      throw new AppError('UNAUTHENTICATED', 'Email hoặc mật khẩu không đúng.');
    }
    return account.id;
  }

  async demoAccounts(): Promise<DemoAccount[]> {
    const tournamentId = await this.tournaments.currentId();
    const rows = await this.repo.listDemoAccounts(tournamentId);
    return rows.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      role: Role.parse(a.role),
      teamName: a.memberships[0]?.team.name ?? null,
    }));
  }

  /** Chỉ cho đăng nhập mẫu bằng tài khoản seed có cờ isDemo. */
  async assertDemoAccount(accountId: string): Promise<void> {
    const acc = await this.repo.findAccount(accountId);
    if (!acc || !acc.isDemo || acc.status !== 'active')
      throw new AppError('NOT_FOUND', 'Không có tài khoản mẫu này.');
  }

  private async membershipTournament(user: SessionUser): Promise<string> {
    if (user.role !== 'student') throw forbidden('Chỉ thí sinh được lập hoặc tham gia đội.');
    const id = await this.tournaments.currentId();
    if (!id) throw notFound('giải đấu hiện tại');
    return id;
  }

  async createTeam(user: SessionUser, input: CreateTeamRequest): Promise<TeamView> {
    const tournamentId = await this.membershipTournament(user);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const team = await this.repo.membershipTransaction(user.id, async (tx) => {
          await assertContestant(tx, user.id);
          await assertTeamWindow(tx, tournamentId, true);
          const membership = await tx.membership.findUnique({
            where: { accountId_tournamentId: { accountId: user.id, tournamentId } },
          });
          if (membership) throw conflict('Bạn đã có đội trong giải hiện tại.');
          const nameKey = normalizeTeamName(input.name);
          const created = await tx.team.create({
            data: {
              tournamentId,
              name: input.name,
              nameKey,
              captainId: user.id,
              joinCode: randomBytes(5).toString('hex').toUpperCase(),
              members: { create: { accountId: user.id, tournamentId } },
            },
          });
          await this.notifications.team(
            tx,
            created.id,
            `team-created:${created.id}`,
            'Đã lập đội',
            `Bạn đã lập đội ${created.name} và là đội trưởng.`,
          );
          await tx.auditLog.create({ data: { actorId: user.id, action: 'team.create', target: created.id } });
          return created;
        });
        return this.team(team.id);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = error.meta?.target;
          if (Array.isArray(target) && target.includes('joinCode') && attempt < 2) continue;
          throw conflict('Tên đội đã được sử dụng hoặc bạn đã có đội trong giải này.');
        }
        throw error;
      }
    }
    throw conflict('Không tạo được mã đội. Vui lòng thử lại.');
  }

  async joinTeam(user: SessionUser, code: string): Promise<TeamView> {
    const tournamentId = await this.membershipTournament(user);
    const teamId = await this.repo.membershipTransaction(user.id, async (tx) => {
      await assertContestant(tx, user.id);
      await assertTeamWindow(tx, tournamentId, true);
      const membership = await tx.membership.findUnique({
        where: { accountId_tournamentId: { accountId: user.id, tournamentId } },
      });
      if (membership) throw conflict('Bạn đã có đội trong giải hiện tại.');
      // Lock the team before counting to enforce capacity under concurrent joins.
      await tx.$queryRaw`SELECT id FROM "Team" WHERE "joinCode" = ${code} FOR UPDATE`;
      const team = await tx.team.findUnique({
        where: { joinCode: code },
        include: { _count: { select: { members: true } } },
      });
      if (!team || team.tournamentId !== tournamentId) throw notFound('đội với mã này trong giải hiện tại');
      if (team.status === 'locked' || team.status === 'withdrawn')
        throw conflict('Đội đã khóa hoặc đã rút, không thể tham gia.');
      if (team._count.members >= TEAM_MEMBER_LIMIT)
        throw conflict(`Đội đã đủ ${TEAM_MEMBER_LIMIT} thành viên.`);
      await tx.membership.create({ data: { teamId: team.id, accountId: user.id, tournamentId } });
      await this.notifications.team(
        tx,
        team.id,
        `team-joined:${team.id}:${user.id}:${Date.now()}`,
        'Thành viên mới',
        `${user.displayName} vừa tham gia đội ${team.name}.`,
      );
      await tx.auditLog.create({ data: { actorId: user.id, action: 'team.join', target: team.id } });
      return team.id;
    });
    return this.team(teamId);
  }

  async team(teamId: string): Promise<TeamView> {
    const t = await this.repo.findTeam(teamId);
    if (!t) throw notFound('đội');
    return TeamView.parse({
      id: t.id,
      name: t.name,
      joinCode: t.joinCode,
      status: TeamStatus.parse(t.status),
      rosterLocked:
        t.status === 'locked' ||
        t.status === 'withdrawn' ||
        t.tournament.status !== 'registration' ||
        !!(t.tournament.teamLockAt && t.tournament.teamLockAt <= new Date()),
      tournamentId: t.tournamentId,
      members: t.members.map((m) => ({
        id: m.account.id,
        displayName: m.account.displayName,
        isCaptain: m.accountId === t.captainId,
      })),
    });
  }

  async teamNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.repo.findTeamNames(ids);
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
