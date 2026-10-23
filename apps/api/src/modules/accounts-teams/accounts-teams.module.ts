import { Tv1Controller } from './tv1.controller.js';
import { IdentityService } from './identity.service.js';
import { TeamManagementService } from './team-management.service.js';
import { CommunityService } from './community.service.js';
import { MailService } from './mail.service.js';
import { NotificationsService } from './notifications.service.js';
import { Module } from '@nestjs/common';
import { TournamentsModule } from '../tournaments/tournaments.module.js';
import { AccountsTeamsRepository } from './accounts-teams.repository.js';
import { AccountsTeamsService } from './accounts-teams.service.js';
import { SessionController } from './session.controller.js';
import { SessionMiddleware } from './session.middleware.js';
import { TeamsController } from './teams.controller.js';

@Module({
  imports: [TournamentsModule],
  controllers: [SessionController, TeamsController, Tv1Controller],
  providers: [
    AccountsTeamsRepository,
    AccountsTeamsService,
    SessionMiddleware,
    IdentityService,
    TeamManagementService,
    CommunityService,
    MailService,
    NotificationsService,
  ],
  exports: [AccountsTeamsService, SessionMiddleware, NotificationsService],
})
export class AccountsTeamsModule {}
