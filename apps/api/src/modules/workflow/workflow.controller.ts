import { Body, Controller, Get, Post, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { WorkflowService } from './workflow.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.DOCTOR, Role.ADMIN)
  @Get('my')
  async getMyWorkflow(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.getWorkflow(user.clinicId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Post('my')
  async setMyWorkflow(@CurrentUser() user: AuthUser, @Body('steps') steps: any[]) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.setWorkflow(user.clinicId, steps);
  }
}
