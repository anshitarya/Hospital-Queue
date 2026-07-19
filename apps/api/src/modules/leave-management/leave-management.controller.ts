import { Body, Controller, Get, Post, Param, ForbiddenException, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LeaveManagementService } from './leave-management.service';
import { RequestLeaveDto } from './dto/request-leave.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('leaves')
export class LeaveManagementController {
  constructor(private readonly service: LeaveManagementService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Post('request')
  async requestLeave(@CurrentUser() user: AuthUser, @Body() dto: RequestLeaveDto) {
    return this.service.requestLeave(user.id, user.role, user.clinicId, dto);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Post(':id/approve')
  async approveLeave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approveLeave(id, user.id, user.role);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Post(':id/reject')
  async rejectLeave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.rejectLeave(id, user.id, user.role);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Post(':id/cancel')
  async cancelLeave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelLeave(id, user.id);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('my')
  async getMyLeaves(@CurrentUser() user: AuthUser) {
    return this.service.getMyLeaves(user.id);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Get('clinic')
  async getClinicLeaves(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.getClinicLeaves(user.clinicId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('analytics')
  async getLeaveAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.getLeaveAnalytics(user.clinicId, from, to);
  }
}
