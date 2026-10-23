import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  DevSessionRequest,
  CompleteRegistrationRequest,
  RegistrationEmailRequest,
  LoginRequest,
  type SessionUser,
} from '@arena/contracts';
import { CurrentUser, DemoOnly } from '../../core/auth/guards.js';
import { clearSessionCookie, encodeSession, setSessionCookie } from '../../core/auth/session-codec.js';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { AuditService } from '../../core/audit.service.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { IdentityService } from './identity.service.js';
import { AccountsTeamsService } from './accounts-teams.service.js';

@Controller()
export class SessionController {
  private readonly codeLimiter = new RateLimiter(10, 10 * 60_000);
  private readonly loginLimiter = new RateLimiter(20, 60_000);

  constructor(
    private readonly accounts: AccountsTeamsService,
    private readonly identity: IdentityService,
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
    clearSessionCookie(res, this.cfg.env === 'production', this.cfg.sessionCookieName);
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
      this.cfg.sessionCookieName,
    );
    await this.audit.record({ actorId: accountId, action: 'dev.session.login', requestId: req.requestId });
    return ok({ user });
  }

  @Post('auth/registration-code')
  @HttpCode(200)
  async registrationCode(@Body() body: unknown, @Req() req: ArenaRequest) {
    this.codeLimiter.check(`registration-code:${req.ip}`);
    const { email } = parse(RegistrationEmailRequest, body);
    return ok(await this.identity.requestRegistrationCode(email));
  }

  @Post('auth/register')
  async register(@Body() body: unknown, @Req() req: ArenaRequest) {
    this.loginLimiter.check(`auth:${req.ip}`);
    const accountId = await this.identity.register(parse(CompleteRegistrationRequest, body));
    return ok({ accountId });
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: ArenaRequest, @Res({ passthrough: true }) res: Response) {
    this.loginLimiter.check(`auth:${req.ip}`);
    const accountId = await this.accounts.login(parse(LoginRequest, body));
    const user = await this.accounts.sessionUser(accountId, false);
    setSessionCookie(
      res,
      encodeSession(
        { sub: accountId, demo: false, v: await this.identity.version(accountId), iat: Date.now() },
        this.cfg.sessionSecret,
      ),
      this.cfg.env === 'production',
      this.cfg.sessionCookieName,
    );
    await this.audit.record({
      actorId: accountId,
      action: 'account.login',
      target: accountId,
      requestId: req.requestId,
    });
    return ok({ user });
  }
}
