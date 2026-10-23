import { Module } from '@nestjs/common';
import { AccountsTeamsModule } from '../accounts-teams/accounts-teams.module.js';
import { BotsRunnerModule } from '../bots-runner/bots-runner.module.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsGateway } from './rooms.gateway.js';
import { RoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [AccountsTeamsModule, BotsRunnerModule],
  controllers: [RoomsController],
  providers: [RoomsRepository, RoomsService, RoomsGateway],
  exports: [RoomsService],
})
export class RoomsMatchesModule {}
