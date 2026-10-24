import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type SessionUser } from '@arena/contracts';
import { PrismaService, type Tx, isUniqueViolation } from '../../core/prisma.service.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { TournamentsService } from '../tournaments/tournaments.service.js';
import { NotificationsService } from './notifications.service.js';
import { assertContestant, assertTeamWindow, findTeamMembership } from './team-policy.js';

@Injectable()
export class TeamManagementService {
  constructor(
    private readonly db: PrismaService,
    private readonly tournaments: TournamentsService,
    private readonly notifications: NotificationsService,
  ) {}
  private async mutate(
    user: SessionUser,
    captain: boolean,
    action: string,
    work: (
      tx: Tx,
      team: { id: string; captainId: string; name: string; tournamentId: string | null },
    ) => Promise<void>,
  ) {
    const tournamentId = await this.tournaments.currentId();
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${user.id} FOR UPDATE`;
        await assertContestant(tx, user.id);
        const membership = await findTeamMembership(tx, user.id, tournamentId);
        if (!membership) throw notFound('đội của bạn');
        await assertTeamWindow(tx, membership.tournamentId);
        await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${membership.teamId} FOR UPDATE`;
        const team = await tx.team.findUniqueOrThrow({ where: { id: membership.teamId } });
        if (team.tournamentId !== membership.tournamentId)
          throw conflict('Đội vừa đăng ký giải. Tải lại và thử lại.');
        if (team.status === 'locked' || team.status === 'withdrawn')
          throw conflict('Đội đã khóa hoặc đã rút.');
        if (captain && team.captainId !== user.id)
          throw forbidden('Chỉ đội trưởng được thực hiện thao tác này.');
        await work(tx, team);
        await tx.auditLog.create({ data: { actorId: user.id, action, target: team.id } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Tên đội đã tồn tại.');
      throw error;
    }
    return { message: 'Đã cập nhật đội.' };
  }
  transfer(user: SessionUser, accountId: string) {
    return this.mutate(user, true, 'team.captain.transfer', async (tx, team) => {
      if (accountId === user.id) throw conflict('Bạn đang là đội trưởng.');
      const member = await tx.membership.findUnique({
        where: { teamId_accountId: { teamId: team.id, accountId } },
      });
      if (!member) throw notFound('thành viên trong đội');
      await assertContestant(tx, accountId);
      await tx.team.update({ where: { id: team.id }, data: { captainId: accountId } });
      await this.notifications.team(
        tx,
        team.id,
        `captain:${randomUUID()}`,
        'Đội trưởng mới',
        'Đội của bạn vừa chuyển quyền đội trưởng.',
      );
    });
  }
  remove(user: SessionUser, accountId: string) {
    return this.mutate(user, accountId !== user.id, 'team.member.leave', async (tx, team) => {
      const member = await tx.membership.findUnique({
        where: { teamId_accountId: { teamId: team.id, accountId } },
      });
      if (!member) throw notFound('thành viên');
      const count = await tx.membership.count({ where: { teamId: team.id } });
      if (team.captainId === accountId && count > 1)
        throw conflict('Hãy chuyển đội trưởng trước khi rời đội.');
      await tx.membership.delete({ where: { teamId_accountId: { teamId: team.id, accountId } } });
      if (count === 1) {
        await tx.team.update({ where: { id: team.id }, data: { status: 'withdrawn' } });
      }
      await this.notifications.deliver(
        tx,
        [accountId],
        `member-left:${randomUUID()}`,
        'Đã rời đội',
        `Bạn không còn thuộc đội ${team.name}.`,
        '/team',
      );
    });
  }
}
