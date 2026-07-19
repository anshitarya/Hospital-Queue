import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LeaveManagementController } from './leave-management.controller';
import { LeaveManagementService } from './leave-management.service';

@Module({
  imports: [PrismaModule],
  controllers: [LeaveManagementController],
  providers: [LeaveManagementService],
  exports: [LeaveManagementService],
})
export class LeaveManagementModule {}
