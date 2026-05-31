import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DoctorsService } from './doctors.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Public()
  @Get()
  list(@Query('departmentId') departmentId?: string) {
    return this.doctors.list(departmentId);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.doctors.get(id);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctors.update(id, dto);
  }
}
