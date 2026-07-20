import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { CustomerService } from './customer.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [PatientsController],
  providers: [PatientsService, CustomerService],
  exports: [PatientsService, CustomerService],
})
export class PatientsModule {}
