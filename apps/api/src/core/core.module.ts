import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { APP_CONFIG, loadConfig } from './config.js';
import { OutboxService } from './outbox/outbox.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    PrismaService,
    RedisService,
    AuditService,
    OutboxService,
  ],
  exports: [APP_CONFIG, PrismaService, RedisService, AuditService, OutboxService],
})
export class CoreModule {}
