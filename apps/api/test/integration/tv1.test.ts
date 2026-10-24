import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@arena/contracts';
import { PrismaService } from '../../src/core/prisma.service.js';
import { loadConfig } from '../../src/core/config.js';
import { AccountsTeamsRepository } from '../../src/modules/accounts-teams/accounts-teams.repository.js';
import { AccountsTeamsService } from '../../src/modules/accounts-teams/accounts-teams.service.js';
import { IdentityService } from '../../src/modules/accounts-teams/identity.service.js';
import { MailService } from '../../src/modules/accounts-teams/mail.service.js';
import { NotificationsService } from '../../src/modules/accounts-teams/notifications.service.js';
import { TeamManagementService } from '../../src/modules/accounts-teams/team-management.service.js';
import { CommunityService } from '../../src/modules/accounts-teams/community.service.js';
import type { TournamentsService } from '../../src/modules/tournaments/tournaments.service.js';

const db = new PrismaService();
const prefix = `tv1-${randomUUID()}`;
const tournamentId = prefix;
const cfg = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  MAIL_TRANSPORT: 'local',
  EMAIL_ALLOWED_DOMAINS: 'vnu.edu.vn',
});
const mail = new MailService(db, cfg);
const notifications = new NotificationsService(db, mail);
const identity = new IdentityService(db, mail, cfg);
const tournaments = { currentId: async () => tournamentId } as TournamentsService;
const accounts = new AccountsTeamsService(new AccountsTeamsRepository(db), tournaments, notifications);
const teams = new TeamManagementService(db, tournaments, notifications);
const community = new CommunityService(db, notifications);
const ids: string[] = [];
const emails: string[] = [];
let captain: SessionUser;
let member: SessionUser;
let third: SessionUser;
let fourth: SessionUser;
let fifth: SessionUser;
let teamId: string;
async function add(index: number) {
  const email = `${prefix}-${index}@vnu.edu.vn`;
  emails.push(email);
  await identity.requestRegistrationCode(email);
  const otpMail = await db.emailMessage.findFirstOrThrow({
    where: { to: email, subject: 'Mã xác minh đăng ký Bot Arena' },
    orderBy: { createdAt: 'desc' },
  });
  const verificationCode = otpMail.text.match(/\b(\d{6})\b/)![1]!;
  const id = await identity.register({
    fullName: `Thí sinh ${index}`,
    verificationCode,
    className: 'CNTT01',
    faculty: 'CNTT',
    email,
    password: 'Password-123',
  });
  ids.push(id);
  expect((await identity.profile(id)).emailVerified).toBe(true);
  // Exercise legacy verification for accounts that predate OTP registration.
  await db.account.update({ where: { id }, data: { emailVerifiedAt: null } });
  await identity.request(email, 'verify');
  const message = await db.emailMessage.findFirstOrThrow({
    where: { to: email, subject: 'Xác minh email Bot Arena' },
    orderBy: { createdAt: 'desc' },
  });
  const token = message.text.match(/token=([a-f0-9]{64})/)![1]!;
  return { id, email, token };
}
beforeAll(async () => {
  await db.tournament.create({ data: { id: tournamentId, name: prefix, status: 'registration' } });
});
afterAll(async () => {
  const testTeams = await db.team.findMany({ where: { tournamentId }, select: { id: true } });
  await db.teamInvitation.deleteMany({ where: { teamId: { in: testTeams.map((t) => t.id) } } });
  await db.gameResult.deleteMany({ where: { game: { roomId: prefix } } });
  await db.game.deleteMany({ where: { roomId: prefix } });
  await db.match.deleteMany({ where: { roomId: prefix } });
  await db.room.deleteMany({ where: { id: prefix } });
  await db.stage.deleteMany({ where: { tournamentId } });
  await db.membership.deleteMany({ where: { tournamentId } });
  await db.team.deleteMany({ where: { tournamentId } });
  await db.authToken.deleteMany({ where: { accountId: { in: ids } } });
  await db.notification.deleteMany({
    where: { OR: [{ accountId: { in: ids } }, { sourceKey: { startsWith: prefix } }] },
  });
  await db.emailMessage.deleteMany({ where: { to: { in: emails } } });
  await db.registrationCode.deleteMany({ where: { email: { in: emails } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { target: tournamentId }] } });
  await db.publication.deleteMany({ where: { authorId: { in: ids } } });
  await db.account.deleteMany({ where: { id: { in: ids } } });
  await db.tournament.deleteMany({ where: { id: tournamentId } });
  await db.$disconnect();
});
describe('TV1 account lifecycle, teams and notifications', () => {
  it('restricts the exact school domain and prevents unverified team creation', async () => {
    await expect(
      identity.register({
        fullName: 'Test',
        verificationCode: '123456',
        className: 'C',
        faculty: 'F',
        email: 'test@vnu.edu.vn.evil.com',
        password: 'Password-123',
      }),
    ).rejects.toThrow('Chỉ chấp nhận');
    const a = await add(1);
    const pending = (await accounts.sessionUser(a.id, false))!;
    await expect(accounts.createTeam(pending, { name: prefix })).rejects.toThrow('xác minh');
    const token = await db.authToken.findUniqueOrThrow({
      where: { tokenHash: createHash('sha256').update(a.token).digest('hex') },
    });
    expect(token.tokenHash).not.toBe(a.token);
    await identity.redeem(a.token, 'verify');
    await expect(identity.redeem(a.token, 'verify')).rejects.toThrow('hết hạn');
    captain = (await accounts.sessionUser(a.id, false))!;
    expect(captain.emailVerified).toBe(true);
    teamId = (await accounts.createTeam(captain, { name: prefix })).id;
    const b = await add(2);
    await identity.redeem(b.token, 'verify');
    member = (await accounts.sessionUser(b.id, false))!;
    const c = await add(3);
    await identity.redeem(c.token, 'verify');
    third = (await accounts.sessionUser(c.id, false))!;
    const d = await add(4);
    await identity.redeem(d.token, 'verify');
    fourth = (await accounts.sessionUser(d.id, false))!;
    const e = await add(5);
    await identity.redeem(e.token, 'verify');
    fifth = (await accounts.sessionUser(e.id, false))!;
  });
  it('joins only by code and protects member and captain permissions', async () => {
    expect(
      await db.emailMessage.count({ where: { dedupeKey: { startsWith: `team-created:${teamId}` } } }),
    ).toBe(0);
    const code = (await accounts.team(teamId)).joinCode;
    await accounts.joinTeam(member, code);
    expect(
      await db.emailMessage.count({ where: { dedupeKey: { startsWith: `team-joined:${teamId}` } } }),
    ).toBe(0);
    await expect(teams.transfer(member, captain.id)).rejects.toThrow('đội trưởng');
    await expect(teams.remove(member, captain.id)).rejects.toThrow('đội trưởng');
    await expect(teams.transfer(captain, third.id)).rejects.toThrow('thành viên');
    await teams.remove(member, member.id);
    expect((await accounts.team(teamId)).members).toHaveLength(1);
    await accounts.joinTeam(member, code);
    await accounts.joinTeam(third, code);
    await accounts.joinTeam(fourth, code);
    expect((await accounts.team(teamId)).members).toHaveLength(4);
    await expect(accounts.joinTeam(fifth, code)).rejects.toThrow('đủ 4');
    await expect(teams.remove(captain, captain.id)).rejects.toThrow('chuyển đội trưởng');
    await teams.transfer(captain, member.id);
    await expect(teams.remove(captain, third.id)).rejects.toThrow('đội trưởng');
    await teams.remove(member, third.id);
    await teams.remove(member, fourth.id);
    expect((await accounts.team(teamId)).joinCode).toBe(code);
    await teams.remove(captain, captain.id);
    expect((await accounts.team(teamId)).members).toHaveLength(1);
    await accounts.registerTeam(member, tournamentId);
    await db.tournament.update({ where: { id: tournamentId }, data: { teamLockAt: new Date(0) } });
    await expect(teams.remove(member, member.id)).rejects.toThrow('Đội hình đã khóa');
    await expect(
      community.updateTeam({ ...member, role: 'admin' }, teamId, {
        status: 'draft',
        reason: 'Thử mở sau hạn',
      }),
    ).rejects.toThrow('sau hạn khóa');
    await db.tournament.update({ where: { id: tournamentId }, data: { teamLockAt: null } });
  });
  it('handles profile uniqueness, expired resets and revokes every prior session', async () => {
    const profile = await identity.profile(captain.id);
    await identity.updateProfile(captain.id, {
      fullName: 'Tên mới',
      username: profile.username,
      studentId: profile.studentId,
      className: 'CNTT02',
      faculty: 'Khoa mới',
    });
    expect((await identity.profile(captain.id)).className).toBe('CNTT02');
    const other = await identity.profile(member.id);
    await expect(
      identity.updateProfile(captain.id, {
        fullName: 'Test',
        username: other.username,
        studentId: profile.studentId,
        className: 'C',
        faculty: 'F',
      }),
    ).rejects.toThrow('đã được sử dụng');
    expect(await identity.request(`${prefix}-missing@vnu.edu.vn`, 'reset')).toEqual(
      await identity.request(emails[0]!, 'reset'),
    );
    const resetMail = await db.emailMessage.findFirstOrThrow({
      where: { to: emails[0]!, subject: 'Khôi phục mật khẩu Bot Arena' },
      orderBy: { createdAt: 'desc' },
    });
    const token = resetMail.text.match(/token=([a-f0-9]{64})/)![1]!;
    const hash = createHash('sha256').update(token).digest('hex');
    await db.authToken.update({ where: { tokenHash: hash }, data: { expiresAt: new Date(0) } });
    await expect(identity.redeem(token, 'reset', 'Changed-123')).rejects.toThrow('hết hạn');
    await db.authToken.update({
      where: { tokenHash: hash },
      data: { expiresAt: new Date(Date.now() + 60000) },
    });
    const version = await identity.version(captain.id);
    await identity.redeem(token, 'reset', 'Changed-123');
    expect(await accounts.sessionUser(captain.id, false, version)).toBeNull();
    await expect(identity.redeem(token, 'reset', 'Another-123')).rejects.toThrow('hết hạn');
    await expect(accounts.login({ email: emails[0]!, password: 'Password-123' })).rejects.toThrow(
      'không đúng',
    );
    expect(await accounts.login({ email: emails[0]!, password: 'Changed-123' })).toBe(captain.id);
    await expect(identity.changePassword(captain.id, 'wrong', 'Another-123')).rejects.toThrow('không đúng');
    await identity.changePassword(captain.id, 'Changed-123', 'Another-123');
    expect(await accounts.sessionUser(captain.id, false, version + 1)).toBeNull();
  });
  it('deduplicates event delivery and keeps draft publications private', async () => {
    await community.event(prefix, [captain.id], 'Lịch mới', 'Đây là lịch mới', '/tournament');
    await community.event(prefix, [captain.id], 'Lịch mới', 'Đây là lịch mới', '/tournament');
    expect(
      await db.notification.count({ where: { accountId: captain.id, sourceKey: `external:${prefix}` } }),
    ).toBe(1);
    expect(await db.emailMessage.count({ where: { dedupeKey: { startsWith: `external:${prefix}` } } })).toBe(
      0,
    );
    const post = await community.savePublication(captain, undefined, {
      title: prefix,
      body: 'Tài liệu hướng dẫn',
      kind: 'document',
      published: false,
      linkUrl: '',
    });
    expect((await community.publications()).some((p) => p.id === post.id)).toBe(false);
    // Do not broadcast to real users during tests: edit a private draft and check optimistic concurrency.
    await community.savePublication(captain, post.id, {
      title: prefix,
      body: 'Bản mới',
      kind: 'document',
      published: false,
      linkUrl: '',
      expectedRevision: 0,
    });
    await expect(
      community.savePublication(captain, post.id, {
        title: prefix,
        body: 'Bản cũ',
        kind: 'document',
        published: false,
        linkUrl: '',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('đã thay đổi');
    await community.deletePublication(captain, post.id);
    await mail.drain();
    expect(await db.emailMessage.count({ where: { to: { in: emails }, status: 'local' } })).toBeGreaterThan(
      0,
    );
  });
  it('publishes BTC content with notification delivery, and audits role/status changes', async () => {
    const original = notifications.deliver.bind(notifications);
    const spy = vi
      .spyOn(notifications, 'deliver')
      .mockImplementation((tx, recipients, key, title, body, href) =>
        original(
          tx,
          recipients.filter((id) => ids.includes(id)),
          key,
          title,
          body,
          href,
        ),
      );
    try {
      const post = await community.savePublication(captain, undefined, {
        title: prefix + ' public',
        body: 'Thông báo kiểm thử',
        kind: 'announcement',
        published: true,
        linkUrl: '',
      });
      expect((await community.publications()).some((p) => p.id === post.id)).toBe(true);
      expect(
        await db.notification.count({
          where: { sourceKey: `publication:${post.id}:0`, accountId: captain.id },
        }),
      ).toBe(1);
      await community.deletePublication(captain, post.id);
    } finally {
      spy.mockRestore();
    }
    await expect(
      community.updateAccount(captain, captain.id, {
        role: 'student',
        status: 'disabled',
        reason: 'Thử tự khóa',
      }),
    ).rejects.toThrow('chính mình');
    await community.updateAccount(captain, fourth.id, {
      role: 'admin',
      status: 'disabled',
      reason: 'Kiểm thử khóa quyền',
    });
    expect(await accounts.sessionUser(fourth.id, false)).toBeNull();
    expect(await db.auditLog.count({ where: { target: fourth.id, action: 'account.admin.update' } })).toBe(1);
    await community.updateAccount(captain, fourth.id, {
      role: 'student',
      status: 'active',
      reason: 'Mở tài khoản kiểm thử',
    });
  });
  it('receives schedule, new-game and result events and reminders without duplicates', async () => {
    await db.auditLog.create({
      data: { actorId: member.id, action: 'tournament.configure', target: tournamentId },
    });
    const stage = await db.stage.create({
      data: {
        tournamentId,
        ord: 1,
        kind: 'qualifier',
        name: 'Vòng kiểm thử',
        startsAt: new Date(Date.now() + 3600000),
      },
    });
    await db.room.create({
      data: { id: prefix, code: prefix, title: 'TV1 fixture', teamAId: teamId, teamBId: teamId },
    });
    const match = await db.match.create({ data: { roomId: prefix } });
    const game = await db.game.create({
      data: {
        roomId: prefix,
        matchId: match.id,
        no: 1,
        rulesetId: 'test',
        seed: 1,
        maxPlies: 1,
        status: 'finished',
        blueTeamId: teamId,
        pinkTeamId: teamId,
      },
    });
    const result = await db.gameResult.create({
      data: {
        gameId: game.id,
        attemptId: prefix,
        requestKey: prefix,
        reason: 'draw',
        plies: 1,
        piecesBlue: 1,
        piecesPink: 1,
        rulesetId: 'test',
      },
    });
    await notifications.tick();
    await notifications.tick();
    expect(
      await db.notification.count({ where: { accountId: member.id, sourceKey: `game:${game.id}` } }),
    ).toBe(1);
    expect(
      await db.notification.count({ where: { accountId: member.id, sourceKey: `result:${result.id}` } }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: {
          accountId: member.id,
          sourceKey: { startsWith: `reminder:${tournamentId}:stage:${stage.id}` },
        },
      }),
    ).toBe(1);
  });
});
