import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN, Role.DOCTOR)
  @Get('search')
  search(@Query('phone') phone: string) {
    if (!phone) return null;
    return this.patients.searchByPhone(phone);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Post()
  upsert(@Body() dto: CreatePatientDto) {
    return this.patients.upsertByPhone(dto);
  }

  @Get(':id/history')
  history(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role === Role.PATIENT && user.id !== id) {
      throw new ForbiddenException('Patients can only view their own history');
    }
    return this.patients.history(id);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN, Role.DOCTOR)
  @Post(':id/phone')
  async updatePhone(
    @Param('id') id: string,
    @Body('phone') phone: string,
    @Body('queueEntryId') queueEntryId?: string,
  ) {
    return this.patients.updatePatientPhone(id, phone, queueEntryId);
  }
}
