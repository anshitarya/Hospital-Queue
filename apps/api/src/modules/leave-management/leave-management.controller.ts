import { Body, Controller, Get, Post, Param, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LeaveManagementService } from './leave-management.service';
import { RequestLeaveDto } from './dto/request-leave.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('leaves')
export class LeaveManagementController {
  constructor(private readonly service: LeaveManagementService) {}

  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Post('request')
  async requestLeave(@CurrentUser() user: AuthUser, @Body() dto: RequestLeaveDto) {
    return this.service.requestLeave(user.id, dto);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post(':id/approve')
  async approveLeave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approveLeave(id, user.id);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post(':id/reject')
  async rejectLeave(@Param('id') id: string) {
    return this.service.rejectLeave(id);
  }

  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Post(':id/cancel')
  async cancelLeave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelLeave(id, user.id);
  }

  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Get('my')
  async getMyLeaves(@CurrentUser() user: AuthUser) {
    return this.service.getMyLeaves(user.id);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Get('clinic')
  async getClinicLeaves(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.getClinicLeaves(user.clinicId);
  }
}
