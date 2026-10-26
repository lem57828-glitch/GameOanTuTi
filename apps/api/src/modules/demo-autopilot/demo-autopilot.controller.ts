import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { AutopilotAdvanceRequest, Id, type SessionUser } from '@arena/contracts';
import { Authenticated, CurrentUser, DemoOnly } from '../../core/auth/guards.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { DemoAutopilotService } from './demo-autopilot.service.js';

/** Demo một thí sinh (chỉ DEMO_MODE): xem bước kế tiếp và bấm "Tiếp theo" thay cho các bước BTC. */
@Controller()
export class DemoAutopilotController {
  private readonly limiter = new RateLimiter(30, 60_000);
  constructor(private readonly autopilot: DemoAutopilotService) {}

  @Get('tournaments/:id/demo/autopilot')
  @DemoOnly()
  @Authenticated()
  async status(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return ok(await this.autopilot.status(user, parse(Id, id)));
  }

  @Post('tournaments/:id/demo/autopilot/advance')
  @DemoOnly()
  @Authenticated()
  async advance(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    this.limiter.check(user.id);
    return ok(
      await this.autopilot.advance(
        user,
        parse(Id, id),
        parse(AutopilotAdvanceRequest, body ?? {}),
        req.requestId,
      ),
    );
  }
}
