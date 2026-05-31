import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Health module — no service, just the controller. Prisma/Redis services are
 * global so they're already available via DI.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
