import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Health + readiness probes.
 *
 *   GET /api/health    — Liveness. Returns 200 as long as the process is up.
 *                        Use this in the container healthcheck — it's cheap
 *                        and doesn't depend on Postgres/Redis being reachable
 *                        (that would create cascading failure modes).
 *
 *   GET /api/ready     — Readiness. Pings Postgres and Redis. Used by load
 *                        balancers / orchestrators to decide whether to send
 *                        traffic to this instance. Returns 503 if either
 *                        dependency is down.
 *
 * Both endpoints are `@Public()` — no JWT required, otherwise the container
 * healthcheck would fail.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  health() {
    return {
      ok: true,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  async ready() {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);

    const [pg, redis] = checks;
    const pgOk = pg.status === 'fulfilled';
    const redisOk = redis.status === 'fulfilled';

    if (!pgOk || !redisOk) {
      throw new ServiceUnavailableException({
        ok: false,
        postgres: pgOk ? 'ok' : 'down',
        redis: redisOk ? 'ok' : 'down',
      });
    }

    return { ok: true, postgres: 'ok', redis: 'ok' };
  }
}
