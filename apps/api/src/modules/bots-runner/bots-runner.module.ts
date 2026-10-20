import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller.js';
import { BotsRunnerRepository } from './bots-runner.repository.js';
import { BotsRunnerService } from './bots-runner.service.js';
import { BullmqQueueAdapter, QUEUE_ADAPTER } from './queue.adapter.js';

@Module({
  controllers: [BotsController],
  providers: [
    BotsRunnerRepository,
    BotsRunnerService,
    { provide: QUEUE_ADAPTER, useClass: BullmqQueueAdapter },
  ],
  exports: [BotsRunnerService],
})
export class BotsRunnerModule {}
