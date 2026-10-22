import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  AppealDecisionRequest,
  AppealRequest,
  DemoTeamsRequest,
  Id,
  KnockoutPhase,
  LevelUpdateRequest,
  PairingResultRequest,
  QualifierPlanRequest,
  ReasonRequest,
  z,
  type SessionUser,
} from '@arena/contracts';
import { Authenticated, CurrentUser, DemoOnly, Roles } from '../../core/auth/guards.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { CompetitionService } from './competition.service.js';

const Ord = z.coerce.number().int().positive();
const StandingsQuery = z.object({ level: z.coerce.number().int().positive().optional() });
const AppealsQuery = z.object({ status: z.enum(['open', 'accepted', 'rejected']).optional() });
const actor = (user: SessionUser, req: ArenaRequest) => ({ id: user.id, requestId: req.requestId });

@Controller()
export class CompetitionController {
  constructor(private readonly competition: CompetitionService) {}

  // ---------------------------------------------------------------- công khai (khách xem được)

  @Get('tournaments/:id/competition')
  async overview(@Param('id') id: string) {
    return ok(await this.competition.overview(parse(Id, id)));
  }

  @Get('tournaments/:id/standings')
  async standings(@Param('id') id: string, @Query() query: unknown) {
    return ok(await this.competition.standings(parse(Id, id), parse(StandingsQuery, query).level));
  }

  @Get('tournaments/:id/bracket')
  async bracket(@Param('id') id: string) {
    return ok(await this.competition.bracket(parse(Id, id)));
  }

  // ---------------------------------------------------------------- đội thi

  @Get('tournaments/:id/my-pairings')
  @Authenticated()
  async myPairings(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return ok(await this.competition.myPairings(user, parse(Id, id)));
  }

  @Post('appeals')
  @Authenticated()
  async appeal(@CurrentUser() user: SessionUser, @Body() body: unknown, @Req() req: ArenaRequest) {
    return ok(await this.competition.submitAppeal(user, parse(AppealRequest, body), req.requestId));
  }

  @Get('appeals/mine')
  @Authenticated()
  async myAppeals(@CurrentUser() user: SessionUser) {
    return ok(await this.competition.myAppeals(user));
  }

  // ---------------------------------------------------------------- trọng tài / BTC

  @Get('admin/appeals')
  @Roles('admin', 'referee')
  async appeals(@Query() query: unknown) {
    return ok(await this.competition.listAppeals(parse(AppealsQuery, query).status));
  }

  @Post('admin/appeals/:id/decision')
  @Roles('admin', 'referee')
  async decide(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.decideAppeal(
        parse(Id, id),
        parse(AppealDecisionRequest, body),
        actor(user, req),
      ),
    );
  }

  @Post('admin/pairings/:id/result')
  @Roles('admin', 'referee')
  async result(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    const input = parse(PairingResultRequest, body);
    return ok(
      await this.competition.recordResult(
        parse(Id, id),
        input.games,
        'manual',
        actor(user, req),
        input.reason,
      ),
    );
  }

  @Post('admin/tournaments/:id/qualifier/rounds/:round/confirm')
  @Roles('admin', 'referee')
  async confirmRound(
    @Param('id') id: string,
    @Param('round') round: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.confirmRound(
        parse(Id, id),
        parse(Ord, round),
        actor(user, req),
        parse(ReasonRequest, body).reason,
      ),
    );
  }

  @Post('admin/tournaments/:id/knockout/:phase/confirm')
  @Roles('admin', 'referee')
  async confirmPhase(
    @Param('id') id: string,
    @Param('phase') phase: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.confirmPhase(
        parse(Id, id),
        parse(KnockoutPhase, phase),
        actor(user, req),
        parse(ReasonRequest, body).reason,
      ),
    );
  }

  // ---------------------------------------------------------------- chỉ BTC

  @Post('admin/tournaments/:id/qualifier/plan')
  @Roles('admin')
  async plan(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.plan(parse(Id, id), parse(QualifierPlanRequest, body), actor(user, req)),
    );
  }

  @Patch('admin/tournaments/:id/qualifier/levels/:ord')
  @Roles('admin')
  async updateLevel(
    @Param('id') id: string,
    @Param('ord') ord: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.updateLevel(
        parse(Id, id),
        parse(Ord, ord),
        parse(LevelUpdateRequest, body),
        actor(user, req),
      ),
    );
  }

  @Post('admin/tournaments/:id/qualifier/lock')
  @Roles('admin')
  async lock(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.lockNextLevel(
        parse(Id, id),
        actor(user, req),
        parse(ReasonRequest, body).reason,
      ),
    );
  }

  @Post('admin/tournaments/:id/qualifier/rounds')
  @Roles('admin')
  async startRound(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.startRound(parse(Id, id), actor(user, req), parse(ReasonRequest, body).reason),
    );
  }

  @Post('admin/tournaments/:id/qualifier/rounds/:round/rerun')
  @Roles('admin')
  async rerunRound(
    @Param('id') id: string,
    @Param('round') round: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.rerunRound(
        parse(Id, id),
        parse(Ord, round),
        actor(user, req),
        parse(ReasonRequest, body).reason,
      ),
    );
  }

  @Post('admin/tournaments/:id/qualifier/finish')
  @Roles('admin')
  async finish(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.finishLevel(parse(Id, id), actor(user, req), parse(ReasonRequest, body).reason),
    );
  }

  @Post('admin/tournaments/:id/knockout/:phase/start')
  @Roles('admin')
  async startPhase(
    @Param('id') id: string,
    @Param('phase') phase: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.startPhase(
        parse(Id, id),
        parse(KnockoutPhase, phase),
        actor(user, req),
        parse(ReasonRequest, body).reason,
      ),
    );
  }

  @Post('admin/tournaments/:id/competition/reset')
  @Roles('admin')
  async reset(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.resetCompetition(
        parse(Id, id),
        actor(user, req),
        parse(ReasonRequest, body).reason,
      ),
    );
  }

  // ---------------------------------------------------------------- demo (chỉ khi DEMO_MODE bật)

  @Post('admin/tournaments/:id/demo/teams')
  @DemoOnly()
  @Roles('admin')
  async demoTeams(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.competition.addDemoTeams(
        parse(Id, id),
        parse(DemoTeamsRequest, body).count,
        actor(user, req),
      ),
    );
  }

  @Post('admin/tournaments/:id/demo/simulate')
  @DemoOnly()
  @Roles('admin')
  async simulate(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() req: ArenaRequest) {
    return ok(await this.competition.simulatePending(parse(Id, id), actor(user, req)));
  }
}
