// Gắn req.user cho mọi yêu cầu HTTP từ cookie phiên. Cookie sai/hết hạn → khách (user = null).
import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, decodeSession, readCookie } from '../../core/auth/session-codec.js';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import type { ArenaRequest } from '../../core/http.js';
import { AccountsTeamsService } from './accounts-teams.service.js';

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(
    private readonly accounts: AccountsTeamsService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const claims = decodeSession(readCookie(req.headers.cookie, SESSION_COOKIE), this.cfg.sessionSecret);
    // Phiên demo hết hiệu lực khi tắt DEMO_MODE.
    const usable = claims && (!claims.demo || this.cfg.demoMode);
    (req as ArenaRequest).user = usable
      ? await this.accounts.sessionUser(claims.sub, claims.demo, claims.v ?? 0)
      : null;
    next();
  }
}
