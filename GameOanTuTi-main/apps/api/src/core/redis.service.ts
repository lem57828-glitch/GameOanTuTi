// Hai kết nối Redis: một cho lệnh thường, một cho subscribe (kết nối subscribe không chạy lệnh khác được).
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from './config.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger('Redis');
  readonly client: Redis;
  readonly subscriber: Redis;

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
    const opts = { maxRetriesPerRequest: null } as const;
    this.client = new Redis(cfg.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      commandTimeout: 2000,
    });
    this.subscriber = new Redis(cfg.redisUrl, opts);
    for (const c of [this.client, this.subscriber])
      c.on('error', (e) => this.log.warn(`Redis lỗi: ${e.message}`));
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
    this.subscriber.disconnect();
  }
}
