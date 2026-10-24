import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CreateTeamRequest, JoinTeamRequest, Id, type SessionUser } from '@arena/contracts';
import { Authenticated, CurrentUser } from '../../core/auth/guards.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { AccountsTeamsService } from './accounts-teams.service.js';

@Controller('teams')
export class TeamsController {
  private readonly limiter = new RateLimiter(20, 60_000);
  constructor(private readonly accounts: AccountsTeamsService) {}

  /** Đội của người dùng, kể cả chưa đăng ký giải. */
  @Get('mine')
  @Authenticated()
  async mine(@CurrentUser() user: SessionUser) {
    return ok({ team: user.teamId ? await this.accounts.team(user.teamId) : null });
  }

  // Lập đội và tham gia đội bằng mã.

  @Post()
  @Authenticated()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown, @Req() req: ArenaRequest) {
    this.limiter.check(`team:${user.id}:${req.ip}`);
    return ok({ team: await this.accounts.createTeam(user, parse(CreateTeamRequest, body)) });
  }

  @Post('join')
  @Authenticated()
  async join(@CurrentUser() user: SessionUser, @Body() body: unknown, @Req() req: ArenaRequest) {
    this.limiter.check(`team:${user.id}:${req.ip}`);
    const { code } = parse(JoinTeamRequest, body);
    return ok({ team: await this.accounts.joinTeam(user, code) });
  }

  @Post('mine/tournaments/:tournamentId')
  @Authenticated()
  async register(
    @CurrentUser() user: SessionUser,
    @Param('tournamentId') tournamentId: string,
    @Req() req: ArenaRequest,
  ) {
    this.limiter.check(`team:${user.id}:${req.ip}`);
    return ok({ team: await this.accounts.registerTeam(user, parse(Id, tournamentId)) });
  }
}
