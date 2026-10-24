// TV4 — trận nhiều hiệp: chọn kín của đội trưởng, mở phòng theo cặp, thao tác BTC.
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Id, z, type SessionUser } from '@arena/contracts';
import { Authenticated, CurrentUser, Roles } from '../../core/auth/guards.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { MatchesService } from './matches.service.js';

const Reason = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const actor = (user: SessionUser, req: ArenaRequest) => ({ id: user.id, requestId: req.requestId });

@Controller()
export class MatchesController {
  private readonly limiter = new RateLimiter(60, 60_000);

  constructor(private readonly matches: MatchesService) {}

  // ---- Đội trưởng

  /** Bot được phép và lựa chọn hiện tại của chính đội mình (không bao giờ trả lựa chọn của đối thủ). */
  @Get('rooms/:id/my-selection')
  @Authenticated()
  async mySelection(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return ok(await this.matches.mySelection(user, parse(Id, id)));
  }

  /** Chọn kín bot (+ quân thứ 10 ở loại trực tiếp) cho hiệp đang chọn; `ready: true` = xác nhận sẵn sàng. */
  @Post('rooms/:id/choices')
  @Authenticated()
  async choose(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    this.limiter.check(`choice:${user.id}`);
    return ok(await this.matches.choose(user, parse(Id, id), body, req.requestId));
  }

  // ---- BTC

  @Get('admin/tournaments/:id/matches/summary')
  @Roles('admin')
  async summary(@Param('id') id: string) {
    return ok(await this.matches.summary(parse(Id, id)));
  }

  @Post('admin/tournaments/:id/matches/open')
  @Roles('admin')
  async open(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() req: ArenaRequest) {
    return ok(await this.matches.openForTournament(parse(Id, id), actor(user, req)));
  }

  @Post('admin/tournaments/:id/matches/force-lock')
  @Roles('admin')
  async forceLockAll(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(await this.matches.forceLockAll(parse(Id, id), actor(user, req), parse(Reason, body).reason));
  }

  @Post('admin/matches/:id/force-lock')
  @Roles('admin')
  async forceLock(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(await this.matches.forceLock(parse(Id, id), actor(user, req), parse(Reason, body).reason));
  }

  @Post('admin/matches/:id/rerun-game')
  @Roles('admin')
  async rerunGame(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(await this.matches.rerunGame(parse(Id, id), actor(user, req), parse(Reason, body).reason));
  }
}
