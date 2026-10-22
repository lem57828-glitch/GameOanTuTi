// TV1 — interface công khai của module tài khoản & đội.
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
  ) {}

  /** Dựng SessionUser từ database. Tài khoản bị khóa hoặc không tồn tại → null (coi như chưa đăng nhập). */
  async sessionUser(accountId: string, demo: boolean): Promise<SessionUser | null> {
    const acc = await this.repo.findAccount(accountId);
    if (!acc || acc.status !== 'active') return null;
    const tournamentId = await this.tournaments.currentId();
    const membership = tournamentId ? await this.repo.findMembership(acc.id, tournamentId) : null;
    return SessionUser.parse({
      id: acc.id,
      displayName: acc.displayName,
      role: Role.parse(acc.role),
      teamId: membership?.teamId ?? null,
      demo,
    });
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

  async team(teamId: string): Promise<TeamView> {
    const t = await this.repo.findTeam(teamId);
    if (!t) throw notFound('đội');
    return TeamView.parse({
      id: t.id,
      name: t.name,
      status: TeamStatus.parse(t.status),
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
