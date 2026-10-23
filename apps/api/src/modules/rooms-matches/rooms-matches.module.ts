import { Module } from '@nestjs/common';
import { AccountsTeamsModule } from '../accounts-teams/accounts-teams.module.js';
import { BotsRunnerModule } from '../bots-runner/bots-runner.module.js';
import { CompetitionModule } from '../tournaments/competition.module.js';
import { MatchesController } from './matches.controller.js';
import { MatchesRepository } from './matches.repository.js';
import { MatchesService } from './matches.service.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsGateway } from './rooms.gateway.js';
import { RoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [AccountsTeamsModule, BotsRunnerModule, CompetitionModule],
  controllers: [RoomsController, MatchesController],
  providers: [RoomsRepository, RoomsService, RoomsGateway, MatchesRepository, MatchesService],
  exports: [RoomsService, MatchesService],
})
export class RoomsMatchesModule {}
