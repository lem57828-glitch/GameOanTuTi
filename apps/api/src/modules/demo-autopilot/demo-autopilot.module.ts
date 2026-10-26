// Tách module riêng: dùng service công khai của TV1 (đội), TV3 (thi đấu) và TV4 (phòng/trận) mà không tạo vòng phụ thuộc.
import { Module } from '@nestjs/common';
import { AccountsTeamsModule } from '../accounts-teams/accounts-teams.module.js';
import { BotsRunnerModule } from '../bots-runner/bots-runner.module.js';
import { RoomsMatchesModule } from '../rooms-matches/rooms-matches.module.js';
import { CompetitionModule } from '../tournaments/competition.module.js';
import { DemoAutopilotController } from './demo-autopilot.controller.js';
import { DemoAutopilotService } from './demo-autopilot.service.js';

@Module({
  imports: [AccountsTeamsModule, BotsRunnerModule, CompetitionModule, RoomsMatchesModule],
  controllers: [DemoAutopilotController],
  providers: [DemoAutopilotService],
})
export class DemoAutopilotModule {}
