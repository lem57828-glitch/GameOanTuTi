import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DevSessionRequest, type SessionUser } from '@arena/contracts';
import { CurrentUser, DemoOnly } from '../../core/auth/guards.js';
import { clearSessionCookie, encodeSession, setSessionCookie } from '../../core/auth/session-codec.js';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { AuditService } from '../../core/audit.service.js';
import { notImplemented } from '../../core/errors.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { AccountsTeamsService } from './accounts-teams.service.js';

@Controller()
export class SessionController {
  private readonly loginLimiter = new RateLimiter(20, 60_000);

  constructor(
    private readonly accounts: AccountsTeamsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Get('session')
  session(@CurrentUser() user: SessionUser | null) {
    return ok({ user });
  }

  @Delete('session')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res, this.cfg.env === 'production');
    return ok({ user: null });
  }

  // ---- Đăng nhập mẫu: chỉ khi DEMO_MODE bật ở development/test.

  @Get('dev/accounts')
  @DemoOnly()
  async demoAccounts() {
    return ok(await this.accounts.demoAccounts());
  }

  @Post('dev/session')
  @DemoOnly()
  async devSession(
    @Body() body: unknown,
    @Req() req: ArenaRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.loginLimiter.check(`dev-session:${req.ip}`);
    const { accountId } = parse(DevSessionRequest, body);
    await this.accounts.assertDemoAccount(accountId);
    const user = await this.accounts.sessionUser(accountId, true);
    setSessionCookie(
      res,
      encodeSession({ sub: accountId, demo: true, iat: Date.now() }, this.cfg.sessionSecret),
      false,
    );
    await this.audit.record({ actorId: accountId, action: 'dev.session.login', requestId: req.requestId });
    return ok({ user });
  }

  // ---- Chưa làm ở M0 (TV1).

  @Post('auth/register')
  register() {
    notImplemented('Đăng ký tài khoản bằng email trường', 'TV1');
  }

  @Post('auth/login')
  login() {
    notImplemented('Đăng nhập thật', 'TV1');
  }
}
