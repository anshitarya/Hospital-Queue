import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsModule } from '../patients/patients.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { EtaService } from './eta.service';
import { QueueGateway } from './gateway/queue.gateway';

@Module({
  imports: [AuthModule, ClinicsModule, NotificationsModule, PatientsModule],
  controllers: [QueueController],
  providers: [QueueService, EtaService, QueueGateway],
  exports: [QueueService, EtaService],
})
export class QueueModule {}
