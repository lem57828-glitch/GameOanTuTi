import { NotificationsService } from '../../src/modules/accounts-teams/notifications.service.js';
import { MailService } from '../../src/modules/accounts-teams/mail.service.js';
import { loadConfig } from '../../src/core/config.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionUser } from '@arena/contracts';
import { PrismaService } from '../../src/core/prisma.service.js';
import { AccountsTeamsRepository } from '../../src/modules/accounts-teams/accounts-teams.repository.js';
import { AccountsTeamsService } from '../../src/modules/accounts-teams/accounts-teams.service.js';
import type { TournamentsService } from '../../src/modules/tournaments/tournaments.service.js';

const db = new PrismaService();
const id = `team-test-${randomUUID()}`;
const service = new AccountsTeamsService(
  new AccountsTeamsRepository(db),
  {
    currentId: async () => id,
  } as TournamentsService,
  new NotificationsService(
    db,
    new MailService(db, loadConfig({ ...process.env, NODE_ENV: 'test', MAIL_TRANSPORT: 'local' })),
  ),
);
const users: SessionUser[] = Array.from({ length: 8 }, (_, i) => ({
  id: `${id}-${i}`,
  displayName: `Member ${i}`,
  role: 'student',
  teamId: null,
  demo: false,
  emailVerified: true,
  profileComplete: true,
}));

beforeAll(async () => {
  await db.tournament.create({ data: { id, name: id, status: 'registration' } });
  await db.account.createMany({
    data: users.map((user) => ({
      id: user.id,
      username: user.id,
      email: `${user.id}@example.com`,
      displayName: user.displayName,
      studentId: user.id,
      className: 'Test',
      faculty: 'Test',
      emailVerifiedAt: new Date(),
    })),
  });
});
afterAll(async () => {
  await db.membership.deleteMany({ where: { tournamentId: id } });
  await db.team.deleteMany({ where: { tournamentId: id } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await db.notification.deleteMany({ where: { accountId: { in: users.map((u) => u.id) } } });
  await db.emailMessage.deleteMany({ where: { to: { in: users.map((u) => `${u.id}@example.com`) } } });
  await db.account.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await db.tournament.deleteMany({ where: { id } });
  await db.$disconnect();
});

describe('team membership with PostgreSQL transactions', () => {
  it('assigns the creator as captain and admits only three concurrent joiners', async () => {
    const captain = users[0]!;
    const team = await service.createTeam(captain, { name: 'Capacity test' });
    expect(team.joinCode).toMatch(/^[A-F0-9]{10}$/);
    expect(team.members).toEqual([{ id: captain.id, displayName: captain.displayName, isCaptain: true }]);
    await expect(service.createTeam(captain, { name: 'Second team' })).rejects.toThrow('Bạn đã có đội');
    const results = await Promise.allSettled(
      users.slice(1, 5).map((u) => service.joinTeam(u, team.joinCode)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await service.team(team.id)).members).toHaveLength(4);
    await expect(service.joinTeam(captain, team.joinCode)).rejects.toThrow('Bạn đã có đội');
  });
  it('rejects invalid codes, nonstudents and locked teams; prevents duplicate membership races', async () => {
    const captain = users[5]!;
    await expect(service.joinTeam(captain, '0000000000')).rejects.toThrow('Không tìm thấy');
    await expect(service.createTeam({ ...captain, role: 'admin' }, { name: 'Admin' })).rejects.toThrow(
      'Chỉ thí sinh',
    );
    const team = await service.createTeam(captain, { name: 'Locked test' });
    await db.team.update({ where: { id: team.id }, data: { status: 'locked' } });
    await expect(service.joinTeam(users[6]!, team.joinCode)).rejects.toThrow('Đội đã khóa');
    await db.team.update({ where: { id: team.id }, data: { status: 'draft' } });
    const joins = await Promise.allSettled([
      service.joinTeam(users[6]!, team.joinCode),
      service.joinTeam(users[6]!, team.joinCode),
    ]);
    expect(joins.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.team(team.id)).members).toHaveLength(2);
    const creates = await Promise.allSettled([
      service.createTeam(users[7]!, { name: 'Race A' }),
      service.createTeam(users[7]!, { name: 'Race B' }),
    ]);
    expect(creates.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
