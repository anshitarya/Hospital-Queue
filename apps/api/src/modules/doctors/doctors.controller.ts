import { Body, Controller, Get, Param, Patch, Query, Req, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DoctorsService } from './doctors.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtService } from '@nestjs/jwt';

@Controller('doctors')
export class DoctorsController {
  constructor(
    private readonly doctors: DoctorsService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Get()
  async list(
    @Req() req: any,
    @Query('clinicId') clinicId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    let targetClinicId = clinicId;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload = this.jwt.verify(token);
        if (payload && payload.clinicId) {
          targetClinicId = payload.clinicId;
        }
      } catch {
        // ignore invalid token for public lookup
      }
    }
    if (!targetClinicId) {
      throw new BadRequestException('clinicId query parameter is required');
    }
    return this.doctors.list(targetClinicId, departmentId);
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
