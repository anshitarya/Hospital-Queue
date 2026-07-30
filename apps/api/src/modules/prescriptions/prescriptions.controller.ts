import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';
import { FinalizePrescriptionDto } from './dto/finalize-prescription.dto';
import { SaveConfigDto } from './dto/save-config.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptions: PrescriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  private async getDoctorId(userId: string): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
    });
    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }
    return doctor.id;
  }

  @Roles(Role.DOCTOR)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @CurrentUser() user: AuthUser,
    @Body('visitId') visitId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prescriptions.uploadAudio(visitId, doctorId, file);
  }

  @Roles(Role.DOCTOR, Role.PATIENT, Role.RECEPTIONIST)
  @Get('visit/:visitId')
  async getForVisit(@Param('visitId') visitId: string) {
    return this.prescriptions.getPrescriptionForVisit(visitId);
  }

  @Roles(Role.DOCTOR)
  @Post('finalize')
  async finalize(
    @CurrentUser() user: AuthUser,
    @Body() dto: FinalizePrescriptionDto,
  ) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prescriptions.finalizePrescription(doctorId, dto);
  }

  @Roles(Role.DOCTOR)
  @Get('config')
  async getConfig(@CurrentUser() user: AuthUser) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prescriptions.getDoctorConfig(doctorId);
  }

  @Roles(Role.DOCTOR)
  @Post('config')
  async saveConfig(
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveConfigDto,
  ) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prescriptions.saveDoctorConfig(doctorId, dto);
  }
}
