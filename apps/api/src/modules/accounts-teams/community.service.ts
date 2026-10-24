import { TEAM_MEMBER_LIMIT } from '@arena/contracts';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  AdminAccountRequest,
  AdminTeamRequest,
  PublicationRequest,
  SessionUser,
  z,
} from '@arena/contracts';
import { PrismaService } from '../../core/prisma.service.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { NotificationsService } from './notifications.service.js';
import { assertContestant } from './team-policy.js';

@Injectable()
export class CommunityService {
  constructor(
    private readonly db: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
  async publications(admin = false) {
    return this.db.publication.findMany({
      where: admin ? {} : { published: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }
  async savePublication(
    user: SessionUser,
    id: string | undefined,
    input: z.infer<typeof PublicationRequest>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const data = {
          title: input.title,
          body: input.body,
          kind: input.kind,
          linkUrl: input.linkUrl || null,
          published: input.published,
        };
        if (id) {
          const changed = await tx.publication.updateMany({
            where: { id, revision: input.expectedRevision ?? -1 },
            data: { ...data, revision: { increment: 1 } },
          });
          if (!changed.count) throw conflict('Nội dung đã thay đổi. Tải lại trước khi lưu.');
        }
        const row = id
          ? await tx.publication.findUniqueOrThrow({ where: { id } })
          : await tx.publication.create({ data: { ...data, authorId: user.id } });
        if (row.published) {
          const accounts = await tx.account.findMany({
            where: { status: 'active', role: 'student' },
            select: { id: true },
          });
          await this.notifications.deliver(
            tx,
            accounts.map((a) => a.id),
            `publication:${row.id}:${row.revision}`,
            row.title,
            row.body.slice(0, 1000),
            `/news#${row.id}`,
          );
        }
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: id ? 'publication.update' : 'publication.create',
            target: row.id,
          },
        });
        return row;
      },
      { timeout: 30000 },
    );
  }
  async deletePublication(user: SessionUser, id: string) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.publication.findUnique({ where: { id } });
      if (!row) throw notFound('nội dung');
      await tx.publication.delete({ where: { id } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'publication.delete', target: id, data: { title: row.title } },
      });
      return { message: 'Đã xóa nội dung.' };
    });
  }
  async accounts(search: string, page: number) {
    const where = {
      OR: ['email', 'displayName', 'studentId', 'username'].map((key) => ({
        [key]: { contains: search, mode: 'insensitive' as const },
      })),
    };
    const [rows, total] = await Promise.all([
      this.db.account.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 25,
        take: 25,
        select: {
          id: true,
          displayName: true,
          email: true,
          username: true,
          studentId: true,
          className: true,
          faculty: true,
          role: true,
          status: true,
          isDemo: true,
          emailVerifiedAt: true,
        },
      }),
      this.db.account.count({ where }),
    ]);
    return {
      items: rows.map((a) => ({
        ...a,
        fullName: a.displayName,
        studentId: a.studentId ?? '',
        className: a.className ?? '',
        faculty: a.faculty ?? '',
        emailVerified: !!a.emailVerifiedAt || a.isDemo,
      })),
      total,
      page,
    };
  }
  async updateAccount(user: SessionUser, id: string, input: z.infer<typeof AdminAccountRequest>) {
    if (user.id === id) throw forbidden('Không tự thay đổi quyền hoặc trạng thái của chính mình.');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(7842101)`;
      const row = await tx.account.findUnique({ where: { id } });
      if (!row) throw notFound('tài khoản');
      if (row.isDemo) throw forbidden('Không thay đổi tài khoản mẫu.');
      if (
        row.role === 'admin' &&
        row.status === 'active' &&
        (input.role !== 'admin' || input.status !== 'active') &&
        (await tx.account.count({ where: { role: 'admin', status: 'active', isDemo: false } })) <= 1
      )
        throw conflict('Cần giữ lại ít nhất một quản trị viên thật đang hoạt động.');
      await tx.account.update({
        where: { id },
        data: { role: input.role, status: input.status, sessionVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'account.admin.update',
          target: id,
          reason: input.reason,
          data: {
            before: { role: row.role, status: row.status },
            after: { role: input.role, status: input.status },
          },
        },
      });
      return { message: 'Đã cập nhật tài khoản và vô hiệu hóa các phiên cũ.' };
    });
  }
  async teams() {
    const rows = await this.db.team.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { members: { include: { account: { select: { displayName: true } } } } },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      captainId: t.captainId,
      tournamentId: t.tournamentId,
      members: t.members.map((m) => ({ accountId: m.accountId, displayName: m.account.displayName })),
    }));
  }
  async updateTeam(user: SessionUser, id: string, input: z.infer<typeof AdminTeamRequest>) {
    await this.db.$transaction(async (tx) => {
      const initial = await tx.team.findUnique({ where: { id } });
      if (!initial) throw notFound('đội');
      await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${initial.tournamentId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${id} FOR UPDATE`;
      const team = await tx.team.findUniqueOrThrow({
        where: { id },
        include: { tournament: true, members: true },
      });
      if (team.status === 'withdrawn') throw conflict('Đội đã rút không thể đổi trạng thái.');
      if (
        ['draft', 'approved'].includes(input.status) &&
        team.tournament &&
        (team.tournament.status !== 'registration' ||
          (team.tournament.teamLockAt && team.tournament.teamLockAt <= new Date()))
      )
        throw conflict('Không thể mở lại đội hình sau hạn khóa.');
      if (['approved', 'locked'].includes(input.status)) {
        if (team.members.length < 2 || team.members.length > TEAM_MEMBER_LIMIT)
          throw conflict(`Đội phải có từ 2 đến ${TEAM_MEMBER_LIMIT} thành viên.`);
        for (const member of team.members) await assertContestant(tx, member.accountId);
      }
      if (input.status === 'withdrawn' && team.members.length)
        throw conflict('Đội còn thành viên. Dùng trạng thái khóa để ngừng thay đổi đội hình.');
      await tx.team.update({ where: { id }, data: { status: input.status } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'team.admin.update',
          target: id,
          reason: input.reason,
          data: { before: team.status, after: input.status },
        },
      });
      await this.notifications.team(
        tx,
        id,
        `admin-team:${randomUUID()}`,
        'Cập nhật trạng thái đội',
        `BTC đổi trạng thái đội ${team.name}: ${input.status}. Lý do: ${input.reason}`,
      );
    });
    return { message: 'Đã cập nhật trạng thái đội.' };
  }
  async event(sourceKey: string, accountIds: string[], title: string, body: string, href: string) {
    await this.db.$transaction(
      async (tx) => {
        await this.notifications.deliver(tx, accountIds, `external:${sourceKey}`, title, body, href);
      },
      { timeout: 30000 },
    );
    return { message: 'Đã ghi nhận thông báo.' };
  }
}
