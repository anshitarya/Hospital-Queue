import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class BusinessSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(clinicId: string) {
    let settings = await this.prisma.businessSetting.findUnique({
      where: { clinicId },
    });
    if (!settings) {
      settings = await this.prisma.businessSetting.create({
        data: {
          clinicId,
          businessType: 'CLINIC',
          queueMode: 'LIVE_QUEUE',
          appointmentMode: 'HYBRID',
        },
      });
    }
    return settings;
  }

  async updateSettings(clinicId: string, dto: UpdateSettingsDto) {
    await this.getSettings(clinicId);
    return this.prisma.businessSetting.update({
      where: { clinicId },
      data: dto,
    });
  }
}
