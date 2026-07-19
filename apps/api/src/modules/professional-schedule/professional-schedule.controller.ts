import { BadRequestException, Body, Controller, Get, Post, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProfessionalScheduleService } from './professional-schedule.service';
import { SetScheduleDto } from './dto/update-schedule.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('schedules')
export class ProfessionalScheduleController {
  constructor(private readonly service: ProfessionalScheduleService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN, Role.PATIENT)
  @Get('doctor/:doctorId')
  async getDoctorSchedule(
    @CurrentUser() user: AuthUser,
    @Param('doctorId') doctorId: string,
    @Query('locationId') locationId: string,
  ) {
    if (!locationId) throw new BadRequestException('locationId query param is required');
    return this.service.getDoctorSchedule(doctorId, locationId, user);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN, Role.DOCTOR)
  @Post('doctor/:doctorId')
  async setDoctorSchedule(
    @CurrentUser() user: AuthUser,
    @Param('doctorId') doctorId: string,
    @Query('locationId') locationId: string,
    @Body() dto: SetScheduleDto,
  ) {
    if (!locationId) throw new BadRequestException('locationId query param is required');
    return this.service.setDoctorSchedule(doctorId, locationId, dto, user);
  }
}
