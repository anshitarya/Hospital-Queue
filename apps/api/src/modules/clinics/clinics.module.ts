import { Module } from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { ClinicsController } from './clinics.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [PrismaModule, PatientsModule],
  controllers: [ClinicsController],
  providers: [ClinicsService],
  exports: [ClinicsService],
})
export class ClinicsModule {}
