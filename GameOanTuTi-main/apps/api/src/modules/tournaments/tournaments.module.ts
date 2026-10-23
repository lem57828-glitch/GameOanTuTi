import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller.js';
import { TournamentsRepository } from './tournaments.repository.js';
import { TournamentsService } from './tournaments.service.js';

@Module({
  controllers: [TournamentsController],
  providers: [TournamentsRepository, TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
