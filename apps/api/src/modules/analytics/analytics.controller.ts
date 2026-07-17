import { Controller, Get, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Get('dashboard')
  async getDashboardAnalytics(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.getDashboardAnalytics(user.clinicId);
  }
}
