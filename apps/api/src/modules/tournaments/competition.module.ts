// Phần thi đấu của TV3 tách module riêng để dùng service công khai của TV1/TV2 mà không tạo vòng phụ thuộc
// (accounts-teams đã phụ thuộc tournaments để biết giải hiện tại).
import { Module } from '@nestjs/common';
import { AccountsTeamsModule } from '../accounts-teams/accounts-teams.module.js';
import { BotsRunnerModule } from '../bots-runner/bots-runner.module.js';
import { CompetitionController } from './competition.controller.js';
import { CompetitionNotices } from './competition-notices.js';
import { CompetitionRepository } from './competition.repository.js';
import { CompetitionService } from './competition.service.js';

@Module({
  imports: [AccountsTeamsModule, BotsRunnerModule],
  controllers: [CompetitionController],
  providers: [CompetitionRepository, CompetitionService, CompetitionNotices],
  exports: [CompetitionService],
})
export class CompetitionModule {}
