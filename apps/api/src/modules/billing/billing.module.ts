import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UsageEventService } from './usage-event.service';
import { BillingGateway } from './billing.gateway';
import { RazorpayService } from './razorpay.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [BillingController],
  providers: [BillingService, UsageEventService, BillingGateway, RazorpayService],
  exports: [UsageEventService, BillingService, RazorpayService],
})
export class BillingModule {}
