import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  z,
  ProfileUpdateRequest,
  EmailRequest,
  TokenRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  TransferCaptainRequest,
  AdminAccountRequest,
  AdminTeamRequest,
  PublicationRequest,
  type SessionUser,
} from '@arena/contracts';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { Authenticated, CurrentUser, Roles } from '../../core/auth/guards.js';
import { clearSessionCookie } from '../../core/auth/session-codec.js';
import { forbidden, notFound } from '../../core/errors.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { PrismaService } from '../../core/prisma.service.js';
import { IdentityService } from './identity.service.js';
import { TeamManagementService } from './team-management.service.js';
import { CommunityService } from './community.service.js';

const EventRequest = z
  .object({
    sourceKey: z.string().min(1).max(150),
    accountIds: z.array(z.string().min(1)).min(1).max(300),
    kind: z.enum(['schedule', 'round', 'result']),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000),
    href: z
      .string()
      .max(200)
      .regex(/^\/(?!\/)/)
      .refine((v) => !v.includes('\\')),
  })
  .strict();
@Controller()
export class Tv1Controller {
  private readonly limiter = new RateLimiter(8, 60000);
  constructor(
    private readonly identity: IdentityService,
    private readonly teams: TeamManagementService,
    private readonly community: CommunityService,
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}
  @Get('auth/options') options() {
    return ok({
      emailDomains: this.cfg.emailDomains,
      localMailbox: this.cfg.env !== 'production' && this.cfg.mailTransport === 'local',
    });
  }
  @Post('auth/forgot-password')
  @HttpCode(200)
  async forgot(@Body() body: unknown, @Req() req: ArenaRequest) {
    this.limiter.check(`forgot:${req.ip}`);
    return ok(await this.identity.request(parse(EmailRequest, body).email, 'reset'));
  }
  @Post('auth/resend-verification')
  @Authenticated()
  @HttpCode(200)
  async resend(@CurrentUser() user: SessionUser) {
    this.limiter.check(`verify:${user.id}`);
    const profile = await this.identity.profile(user.id);
    return ok(await this.identity.request(profile.email, 'verify'));
  }
  @Post('auth/verify-email')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Req() req: ArenaRequest) {
    this.limiter.check(`token:${req.ip}`);
    return ok(await this.identity.redeem(parse(TokenRequest, body).token, 'verify'));
  }
  @Post('auth/reset-password')
  @HttpCode(200)
  async reset(@Body() body: unknown, @Req() req: ArenaRequest) {
    this.limiter.check(`token:${req.ip}`);
    const input = parse(ResetPasswordRequest, body);
    return ok(await this.identity.redeem(input.token, 'reset', input.password));
  }
  @Get('profile')
  @Authenticated()
  async profile(@CurrentUser() user: SessionUser) {
    return ok(await this.identity.profile(user.id));
  }
  @Patch('profile')
  @Authenticated()
  async updateProfile(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    this.limiter.check(`profile:${user.id}`);
    return ok(await this.identity.updateProfile(user.id, parse(ProfileUpdateRequest, body)));
  }
  @Post('profile/password')
  @Authenticated()
  @HttpCode(200)
  async password(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.limiter.check(`password:${user.id}`);
    const input = parse(ChangePasswordRequest, body);
    const result = await this.identity.changePassword(user.id, input.currentPassword, input.password);
    clearSessionCookie(res, this.cfg.env === 'production');
    return ok(result);
  }
  @Post('teams/mine/captain')
  @Authenticated()
  async transfer(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return ok(await this.teams.transfer(user, parse(TransferCaptainRequest, body).accountId));
  }
  @Delete('teams/mine/members/:accountId')
  @Authenticated()
  async remove(@CurrentUser() user: SessionUser, @Param('accountId') accountId: string) {
    return ok(await this.teams.remove(user, accountId));
  }
  @Get('notifications')
  @Authenticated()
  async notifications(@CurrentUser() user: SessionUser, @Query('page') raw?: string) {
    const page = parse(z.coerce.number().int().min(1).max(10000).default(1), raw);
    const [items, unread, total] = await Promise.all([
      this.db.notification.findMany({
        where: { accountId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 25,
        take: 25,
      }),
      this.db.notification.count({ where: { accountId: user.id, readAt: null } }),
      this.db.notification.count({ where: { accountId: user.id } }),
    ]);
    return ok({ items, unread, total, page });
  }
  @Post('notifications/read-all')
  @Authenticated()
  async readAll(@CurrentUser() user: SessionUser) {
    await this.db.notification.updateMany({
      where: { accountId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok({ message: 'Đã đọc tất cả thông báo.' });
  }
  @Post('notifications/:id/read')
  @Authenticated()
  async read(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const result = await this.db.notification.updateMany({
      where: { id, accountId: user.id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw notFound('thông báo');
    return ok({ message: 'Đã đánh dấu đã đọc.' });
  }
  @Get('dev/mailbox')
  @Authenticated()
  async mailbox(@CurrentUser() user: SessionUser) {
    if (this.cfg.env === 'production' || this.cfg.mailTransport !== 'local')
      throw notFound('hộp thư thử nghiệm');
    const profile = await this.identity.profile(user.id);
    return ok(
      await this.db.emailMessage.findMany({
        where: { to: profile.email },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, to: true, subject: true, text: true, status: true, createdAt: true },
      }),
    );
  }
  @Get('publications') async publications() {
    return ok(await this.community.publications());
  }
  @Get('admin/publications') @Roles('admin') async adminPublications() {
    return ok(await this.community.publications(true));
  }
  @Post('admin/publications') @Roles('admin') async createPublication(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ) {
    return ok(await this.community.savePublication(user, undefined, parse(PublicationRequest, body)));
  }
  @Patch('admin/publications/:id') @Roles('admin') async updatePublication(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return ok(await this.community.savePublication(user, id, parse(PublicationRequest, body)));
  }
  @Delete('admin/publications/:id') @Roles('admin') async deletePublication(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ) {
    return ok(await this.community.deletePublication(user, id));
  }
  @Get('admin/accounts') @Roles('admin') async accounts(
    @Query('search') search = '',
    @Query('page') raw?: string,
  ) {
    return ok(
      await this.community.accounts(
        parse(z.string().max(150), search),
        parse(z.coerce.number().int().min(1).max(10000).default(1), raw),
      ),
    );
  }
  @Patch('admin/accounts/:id') @Roles('admin') async updateAccount(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return ok(await this.community.updateAccount(user, id, parse(AdminAccountRequest, body)));
  }
  @Get('admin/teams') @Roles('admin') async adminTeams() {
    return ok(await this.community.teams());
  }
  @Patch('admin/teams/:id') @Roles('admin') async updateTeam(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return ok(await this.community.updateTeam(user, id, parse(AdminTeamRequest, body)));
  }
  @Get('admin/tv1/audit') @Roles('admin') async audit() {
    return ok(
      await this.db.auditLog.findMany({
        where: {
          OR: [
            { action: { startsWith: 'account.' } },
            { action: { startsWith: 'team.' } },
            { action: { startsWith: 'publication.' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }
  @Get('admin/mail-status') @Roles('admin') async mailStatus() {
    return ok({
      transport: this.cfg.mailTransport,
      items: await this.db.emailMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          to: true,
          subject: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
        },
      }),
    });
  }
  @Post('admin/mail-status/:id/retry') @Roles('admin') async retryMail(@Param('id') id: string) {
    const result = await this.db.emailMessage.updateMany({
      where: { id, status: 'failed', dedupeKey: { startsWith: 'auth:' } },
      data: { status: 'pending', attempts: 0, availableAt: new Date() },
    });
    if (!result.count) throw forbidden('Chỉ gửi lại email đã thất bại.');
    return ok({ message: 'Đã xếp hàng gửi lại.' });
  }
  @Post('admin/notification-events') @Roles('admin') async notificationEvent(@Body() body: unknown) {
    const input = parse(EventRequest, body);
    return ok(
      await this.community.event(
        `${input.kind}:${input.sourceKey}`,
        input.accountIds,
        input.title,
        input.body,
        input.href,
      ),
    );
  }
}
