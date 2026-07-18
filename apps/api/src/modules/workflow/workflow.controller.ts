import { Body, Controller, Get, Query, Post, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { WorkflowService } from './workflow.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('my')
  async getMyWorkflow(@CurrentUser() user: AuthUser, @Query('locationId') locationId?: string) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const targetLocationId = locationId || await this.service.getDefaultLocationForUser(user.id);
    return this.service.getWorkflow(targetLocationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Post('my')
  async setMyWorkflow(
    @CurrentUser() user: AuthUser,
    @Body('steps') steps: any[],
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const targetLocationId = locationId || await this.service.getDefaultLocationForUser(user.id);
    return this.service.setWorkflow(targetLocationId, steps);
  }
}
