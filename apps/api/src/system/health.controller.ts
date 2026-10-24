// Sức khỏe dịch vụ. /health công khai chỉ trả trạng thái chung; /admin/health chi tiết cho BTC.
import { Controller, Get, Inject } from '@nestjs/common';
import type { PublicHealth, ServiceHealth } from '@arena/contracts';
import { Roles } from '../core/auth/guards.js';
import { APP_CONFIG, type AppConfig } from '../core/config.js';
import { ok } from '../core/http.js';
import { OutboxService } from '../core/outbox/outbox.service.js';
import { PrismaService } from '../core/prisma.service.js';
import { RedisService } from '../core/redis.service.js';
import { BotsRunnerService } from '../modules/bots-runner/bots-runner.service.js';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly outbox: OutboxService,
    private readonly bots: BotsRunnerService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Get('health')
  async health() {
    const [database, redis, worker] = await Promise.all([
      this.dbOk(),
      this.redis.ping(),
      this.bots.workerStatus(),
    ]);
    const body: PublicHealth = {
      status: database && redis ? 'ok' : 'degraded',
      workerAlive: worker.alive,
      demoMode: this.cfg.demoMode,
      serverTime: new Date().toISOString(),
    };
    return ok(body);
  }

  @Get('admin/health')
  @Roles('admin')
  async adminHealth() {
    const [database, redis, worker, queue] = await Promise.all([
      this.dbOk(),
      this.redis.ping(),
      this.bots.workerStatus(),
      this.bots.queueCounts(),
    ]);
    const outbox = database
      ? await this.outbox.stats()
      : { pending: 0, oldestPendingAt: null, replayedOnStartup: this.outbox.replayedOnStartup };
    const body: ServiceHealth = {
      status: database && redis && worker.alive ? 'ok' : 'degraded',
      database,
      redis,
      worker,
      queue,
      outbox,
      demoMode: this.cfg.demoMode,
      environment: this.cfg.env,
      serverTime: new Date().toISOString(),
    };
    return ok(body, { recovery: this.bots.recovery });
  }

  private async dbOk(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
