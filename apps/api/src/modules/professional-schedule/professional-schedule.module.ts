import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ProfessionalScheduleController } from './professional-schedule.controller';
import { ProfessionalScheduleService } from './professional-schedule.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProfessionalScheduleController],
  providers: [ProfessionalScheduleService],
  exports: [ProfessionalScheduleService],
})
export class ProfessionalScheduleModule {}
