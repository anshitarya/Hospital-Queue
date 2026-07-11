import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics/clinics.module';
import { SignupRequestsController } from './signup-requests.controller';
import { SignupRequestsService } from './signup-requests.service';

@Module({
  imports: [ClinicsModule],
  controllers: [SignupRequestsController],
  providers: [SignupRequestsService],
  exports: [SignupRequestsService],
})
export class SignupRequestsModule {}
