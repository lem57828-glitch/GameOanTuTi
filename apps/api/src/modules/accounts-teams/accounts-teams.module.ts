import { Module } from '@nestjs/common';
import { TournamentsModule } from '../tournaments/tournaments.module.js';
import { AccountsTeamsRepository } from './accounts-teams.repository.js';
import { AccountsTeamsService } from './accounts-teams.service.js';
import { SessionController } from './session.controller.js';
import { SessionMiddleware } from './session.middleware.js';
import { TeamsController } from './teams.controller.js';

@Module({
  imports: [TournamentsModule],
  controllers: [SessionController, TeamsController],
  providers: [AccountsTeamsRepository, AccountsTeamsService, SessionMiddleware],
  exports: [AccountsTeamsService, SessionMiddleware],
})
export class AccountsTeamsModule {}
