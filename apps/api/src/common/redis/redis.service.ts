import { Injectable, OnModuleDestroy, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Single shared Redis connection for ephemeral, short-lived data only.
 * Queue state lives in PostgreSQL — never store live queues here.
 *
 * Key inventory (all keys have TTLs except idempotency which expires in 10 min):
 *
 *   otp:{channel}:{target}           — 6-digit OTP during login (5 min)
 *   otp:rate:issue:{channel}:{target} — OTP send rate limit counter (10 min)
 *   otp:rate:verify:{channel}:{target} — OTP verify attempt counter (10 min)
 *   pin_lock:{userId}                — failed PIN attempts before lockout (15 min)
 *   idem:{idempotencyKey}            — queue join dedup → entry id (10 min)
 *   eta:avg:{doctorId}[:{serviceDay}] — cached moving consult average (10 min)
 *
 * Optional (disabled in production fly.toml to save Upstash commands):
 *   Socket.IO pub/sub via @socket.io/redis-adapter — only when scaling to 2+ API machines.
 *
 * Fly.io / Upstash: keep SOCKET_IO_REDIS_ADAPTER=false on single-instance deploys;
 * use /api/health (not /ready) for container healthchecks to avoid Redis PING costs.
 */
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
