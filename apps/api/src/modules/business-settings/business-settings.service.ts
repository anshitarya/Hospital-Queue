import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeBusinessType } from '../../common/utils/business-type';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class BusinessSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the default locationId for a given clinicId (first active location). */
  private async resolveLocationId(clinicId: string): Promise<string | null> {
    const loc = await this.prisma.location.findFirst({
      where: { clinicId, status: 'ACTIVE' },
      select: { id: true },
    });
    return loc?.id ?? null;
  }

  async getSettings(clinicId: string, locationId?: string) {
    const targetLocationId = locationId ?? (await this.resolveLocationId(clinicId));
    if (!targetLocationId) {
      // Return sensible defaults when no location exists yet
      return {
        locationId: null,
        businessType: 'CLINIC',
        queueMode: 'LIVE_QUEUE',
        appointmentMode: 'HYBRID',
        workingDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'],
        businessHolidays: [],
        queueStarts: '09:00',
        queueEnds: '17:00',
        walkinJoinRule: 'END_OF_QUEUE',
        walkinJoinRuleParam: 4,
        followupJoinRule: 'END_OF_QUEUE',
        followupJoinRuleParam: 4,
        emergencyJoinRule: 'TOP_PRIORITY',
        vipJoinRule: 'SEPARATE_QUEUE',
        allowWalkins: true,
        allowOnlineBooking: true,
        allowFollowups: true,
        maxDailyBookings: 100,
        emergencyQueueEnabled: true,
        vipQueueEnabled: true,
        tokenPrefix: 'TK',
        queueNumberFormat: 'NUMBER',
        etaCalculationMethod: 'MOVING_AVERAGE',
        bufferTime: 5,
        gracePeriod: 10,
        noShowTimeout: 15,
        autoQueueAssignment: true,
        bookingControl: 'CUSTOMER_CONTROLLED',
        appointmentInterval: 15,
        maxCustomersPerSlot: 1,
      };
    }
    let settings = await this.prisma.businessSetting.findUnique({
      where: { locationId: targetLocationId },
    });
    if (!settings) {
      settings = await this.prisma.businessSetting.create({
        data: {
          locationId: targetLocationId,
          businessType: 'CLINIC',
          queueMode: 'LIVE_QUEUE',
          appointmentMode: 'HYBRID',
        },
      });
    }
    return settings;
  }

  async updateSettings(clinicId: string, dto: UpdateSettingsDto, locationId?: string) {
    const targetLocationId = locationId ?? (await this.resolveLocationId(clinicId));
    if (!targetLocationId) throw new Error('No location found for clinic');
    await this.getSettings(clinicId, targetLocationId);
    const updated = await this.prisma.businessSetting.update({
      where: { locationId: targetLocationId },
      data: dto,
    });
    if (dto.businessType) {
      await this.prisma.clinic.update({
        where: { id: clinicId },
        data: { businessType: normalizeBusinessType(dto.businessType) },
      });
    }
    return updated;
  }
}
