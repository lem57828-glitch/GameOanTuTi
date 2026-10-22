import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import {
  CreateTournamentRequest,
  UpdateTournamentRequest,
  StageConfigurationRequest,
  ConfigurationActionRequest,
  RevisionRequest,
  Id,
  type SessionUser,
} from '@arena/contracts';
import { Roles, CurrentUser } from '../../core/auth/guards.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { TournamentsService } from './tournaments.service.js';

@Controller()
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get('tournaments/current')
  async current() {
    return ok(await this.tournaments.current());
  }

  @Get('admin/tournaments')
  @Roles('admin', 'referee')
  async list() {
    return ok(await this.tournaments.list());
  }

  @Post('admin/tournaments')
  @Roles('admin')
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown, @Req() req: ArenaRequest) {
    return ok(await this.tournaments.create(user.id, parse(CreateTournamentRequest, body), req.requestId));
  }

  @Patch('admin/tournaments/:id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.tournaments.update(
        parse(Id, id),
        user.id,
        parse(UpdateTournamentRequest, body),
        req.requestId,
      ),
    );
  }

  @Post('admin/tournaments/:id/stages')
  @Roles('admin')
  async addStage(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.tournaments.saveStage(
        parse(Id, id),
        null,
        user.id,
        parse(StageConfigurationRequest, body),
        req.requestId,
      ),
    );
  }

  @Patch('admin/tournaments/:id/stages/:stageId')
  @Roles('admin')
  async editStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.tournaments.saveStage(
        parse(Id, id),
        parse(Id, stageId),
        user.id,
        parse(StageConfigurationRequest, body),
        req.requestId,
      ),
    );
  }

  @Post('admin/tournaments/:id/configuration')
  @Roles('admin')
  async configure(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.tournaments.transition(
        parse(Id, id),
        null,
        user.id,
        parse(ConfigurationActionRequest, body),
        req.requestId,
      ),
    );
  }

  @Post('admin/tournaments/:id/stages/:stageId/configuration')
  @Roles('admin')
  async configureStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.tournaments.transition(
        parse(Id, id),
        parse(Id, stageId),
        user.id,
        parse(ConfigurationActionRequest, body),
        req.requestId,
      ),
    );
  }

  @Post('admin/tournaments/:id/publish')
  @Roles('admin')
  async publish(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
  ) {
    return ok(
      await this.tournaments.publish(
        parse(Id, id),
        user.id,
        parse(RevisionRequest.strict(), body),
        req.requestId,
      ),
    );
  }

  @Get('admin/tournaments/:id/audit')
  @Roles('admin', 'referee')
  async history(@Param('id') id: string) {
    return ok(await this.tournaments.history(parse(Id, id)));
  }
}
