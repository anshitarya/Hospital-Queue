import { Body, Controller, Get, Post, Param, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProfessionalScheduleService } from './professional-schedule.service';
import { SetScheduleDto } from './dto/update-schedule.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('schedules')
export class ProfessionalScheduleController {
  constructor(private readonly service: ProfessionalScheduleService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.DOCTOR, Role.ADMIN)
  @Get('doctor/:doctorId')
  async getDoctorSchedule(@CurrentUser() user: AuthUser, @Param('doctorId') doctorId: string) {
    return this.service.getDoctorSchedule(doctorId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN, Role.DOCTOR)
  @Post('doctor/:doctorId')
  async setDoctorSchedule(
    @CurrentUser() user: AuthUser,
    @Param('doctorId') doctorId: string,
    @Body() dto: SetScheduleDto,
  ) {
    return this.service.setDoctorSchedule(doctorId, dto);
  }
}
