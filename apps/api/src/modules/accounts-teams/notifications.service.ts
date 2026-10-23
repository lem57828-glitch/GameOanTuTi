import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { MailService } from './mail.service.js';

@Injectable()
export class NotificationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly log = new Logger('Notifications');
  constructor(
    private readonly db: PrismaService,
    private readonly mail: MailService,
  ) {}
  async deliver(tx: Tx, accountIds: string[], sourceKey: string, title: string, body: string, href?: string) {
    const accounts = await tx.account.findMany({
      where: { id: { in: [...new Set(accountIds)] }, status: 'active' },
    });
    for (const account of accounts) {
      await tx.notification.upsert({
        where: { accountId_sourceKey: { accountId: account.id, sourceKey } },
        create: { accountId: account.id, sourceKey, title, body, href },
        update: {},
      });
    }
  }
  async team(tx: Tx, teamId: string, sourceKey: string, title: string, body: string) {
    const members = await tx.membership.findMany({ where: { teamId } });
    await this.deliver(
      tx,
      members.map((m) => m.accountId),
      sourceKey,
      title,
      body,
      '/team',
    );
  }
  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 5000);
    this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.events();
      await this.gameEvents();
      await this.reminders();
      await this.mail.drain();
    } catch (error) {
      this.log.warn(`Thông báo sẽ được xử lý lại: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
  private async events() {
    await this.db.$transaction(
      async (tx) => {
        await tx.notificationCursor.upsert({
          where: { name: 'audit' },
          create: { name: 'audit', at: new Date(0) },
          update: {},
        });
        await tx.$queryRaw`SELECT name FROM "NotificationCursor" WHERE name = 'audit' FOR UPDATE`;
        const cursor = await tx.notificationCursor.findUniqueOrThrow({ where: { name: 'audit' } });
        const rows = await tx.auditLog.findMany({
          where: {
            AND: [{ OR: [{ action: { startsWith: 'tournament.' } }, { action: { startsWith: 'stage.' } }] }],
            OR: [{ createdAt: { gt: cursor.at } }, { createdAt: cursor.at, id: { gt: cursor.lastId } }],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 20,
        });
        for (const row of rows) {
          const tournament = row.target
            ? await tx.tournament.findUnique({ where: { id: row.target } })
            : null;
          if (tournament) {
            const accounts =
              row.action === 'tournament.publish'
                ? await tx.account.findMany({
                    where: { role: 'student', status: 'active', isDemo: false },
                    select: { id: true },
                  })
                : (await tx.membership.findMany({ where: { tournamentId: tournament.id } })).map((m) => ({
                    id: m.accountId,
                  }));
            await this.deliver(
              tx,
              accounts.map((a) => a.id),
              `audit:${row.id}`,
              'Cập nhật lịch giải đấu',
              `Giải ${tournament.name} vừa cập nhật. Xem lịch và các mốc đăng ký, khóa đội tại trang giải đấu.`,
              '/tournament',
            );
          }
          await tx.notificationCursor.update({
            where: { name: 'audit' },
            data: { at: row.createdAt, lastId: row.id },
          });
        }
      },
      { timeout: 20000 },
    );
    await this.db.$transaction(
      async (tx) => {
        await tx.notificationCursor.upsert({
          where: { name: 'results' },
          create: { name: 'results', at: new Date(0) },
          update: {},
        });
        await tx.$queryRaw`SELECT name FROM "NotificationCursor" WHERE name = 'results' FOR UPDATE`;
        const cursor = await tx.notificationCursor.findUniqueOrThrow({ where: { name: 'results' } });
        const rows = await tx.gameResult.findMany({
          where: {
            OR: [{ createdAt: { gt: cursor.at } }, { createdAt: cursor.at, id: { gt: cursor.lastId } }],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 20,
          include: { game: true },
        });
        for (const row of rows) {
          const members = await tx.membership.findMany({
            where: {
              teamId: { in: [row.game.blueTeamId, row.game.pinkTeamId].filter((v): v is string => !!v) },
            },
          });
          await this.deliver(
            tx,
            members.map((m) => m.accountId),
            `result:${row.id}`,
            'Đã có kết quả hiệp đấu',
            `Hiệp ${row.game.no} đã hoàn tất. Kết quả: ${row.winner ? `bên ${row.winner === 'blue' ? 'xanh' : 'hồng'} thắng` : 'hòa'}. Đây là kết quả hiệp; kết quả chính thức theo quyết định BTC.`,
            `/rooms/${row.game.roomId}`,
          );
          await tx.notificationCursor.update({
            where: { name: 'results' },
            data: { at: row.createdAt, lastId: row.id },
          });
        }
      },
      { timeout: 20000 },
    );
  }
  private async gameEvents() {
    await this.db.$transaction(
      async (tx) => {
        await tx.notificationCursor.upsert({
          where: { name: 'games' },
          create: { name: 'games', at: new Date(0) },
          update: {},
        });
        await tx.$queryRaw`SELECT name FROM "NotificationCursor" WHERE name = 'games' FOR UPDATE`;
        const cursor = await tx.notificationCursor.findUniqueOrThrow({ where: { name: 'games' } });
        const rows = await tx.game.findMany({
          where: {
            OR: [{ createdAt: { gt: cursor.at } }, { createdAt: cursor.at, id: { gt: cursor.lastId } }],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 20,
        });
        for (const game of rows) {
          const members = await tx.membership.findMany({
            where: { teamId: { in: [game.blueTeamId, game.pinkTeamId].filter((id): id is string => !!id) } },
          });
          await this.deliver(
            tx,
            members.map((m) => m.accountId),
            `game:${game.id}`,
            'Hiệp đấu mới',
            `Hiệp ${game.no} đã được tạo. Mở phòng đấu để xem trạng thái và theo dõi diễn biến.`,
            `/rooms/${game.roomId}`,
          );
          await tx.notificationCursor.update({
            where: { name: 'games' },
            data: { at: game.createdAt, lastId: game.id },
          });
        }
      },
      { timeout: 20000 },
    );
  }
  private async reminders() {
    const now = new Date();
    const soon = new Date(Date.now() + 86400000);
    const tournaments = await this.db.tournament.findMany({
      where: { status: { in: ['registration', 'running'] } },
      include: { stages: true },
    });
    for (const tournament of tournaments) {
      for (const [kind, date, label] of [
        ['registration', tournament.registrationClosesAt, 'đóng đăng ký'],
        ['team-lock', tournament.teamLockAt, 'khóa đội hình'],
        ...tournament.stages.map((stage) => [`stage:${stage.id}`, stage.startsAt, `bắt đầu ${stage.name}`]),
      ] as [string, Date | null, string][]) {
        if (!date || date <= now || date > soon) continue;
        await this.db.$transaction(async (tx) => {
          const members = await tx.membership.findMany({ where: { tournamentId: tournament.id } });
          await this.deliver(
            tx,
            members.map((m) => m.accountId),
            `reminder:${tournament.id}:${kind}:${date.toISOString()}`,
            'Nhắc lịch giải đấu',
            `${tournament.name}: ${label} lúc ${date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
            '/tournament',
          );
        });
      }
    }
  }
}
