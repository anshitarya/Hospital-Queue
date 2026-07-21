import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UsageEventService } from './usage-event.service';
import { BillingGateway } from './billing.gateway';

@Module({
  controllers: [BillingController],
  providers: [BillingService, UsageEventService, BillingGateway],
  exports: [UsageEventService, BillingService],
})
export class BillingModule {}
