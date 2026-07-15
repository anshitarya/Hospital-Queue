import { Injectable, OnModuleDestroy, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client!: Redis;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit() {
    const url = (this.config.get<string>('redis.url') ?? 'redis://localhost:6379').trim();
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
    this.client.on('connect', () => this.logger.log(`Redis connected (${url})`));
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }
}
