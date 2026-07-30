import { Body, Controller, Get, Patch, Param, Query, ForbiddenException, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { Role } from '@prisma/client';
import { BusinessSettingsService } from './business-settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('business-settings')
export class BusinessSettingsController {
  constructor(private readonly service: BusinessSettingsService) {}

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('my')
  async getMySettings(@CurrentUser() user: AuthUser, @Query('locationId') locationId?: string) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.getSettings(user.clinicId, locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Patch('my')
  async updateMySettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSettingsDto,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.updateSettings(user.clinicId, dto, locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Post('my/logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.service.uploadLogo(user.clinicId, file);
  }

  @Roles(Role.ADMIN)
  @Get(':clinicId')
  async getSettings(@Param('clinicId') clinicId: string) {
    return this.service.getSettings(clinicId);
  }

  @Roles(Role.ADMIN)
  @Patch(':clinicId')
  async updateSettings(@Param('clinicId') clinicId: string, @Body() dto: UpdateSettingsDto) {
    return this.service.updateSettings(clinicId, dto);
  }
}
