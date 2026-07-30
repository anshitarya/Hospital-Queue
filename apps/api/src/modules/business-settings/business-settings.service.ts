import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeBusinessType } from '../../common/utils/business-type';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class BusinessSettingsService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly prisma: PrismaService) {
    this.bucketName = process.env.S3_BUCKET_NAME ?? 'hospital-prescriptions';
    this.s3Client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? 'mock',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? 'mock',
      },
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
  }

  async uploadLogo(clinicId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > 100 * 1024) {
      throw new BadRequestException('Logo file size must be less than 100 KB');
    }

    const ext = file.originalname.split('.').pop() ?? 'png';
    const key = `logos/${clinicId}-${Date.now()}.${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      const logoUrl = process.env.S3_PUBLIC_URL
        ? `${process.env.S3_PUBLIC_URL}/${key}`
        : `${process.env.S3_ENDPOINT ?? 'https://s3.amazonaws.com'}/${this.bucketName}/${key}`;

      await this.prisma.clinic.update({
        where: { id: clinicId },
        data: { logoUrl },
      });

      return { logoUrl };
    } catch (err) {
      throw new BadRequestException(`Failed to upload logo: ${(err as Error).message}`);
    }
  }

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
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { logoUrl: true },
    });

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
        allowOnlineBooking: false,
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
        maxSelfBookingNoShowsPerMonth: 3,
        autoQueueAssignment: true,
        bookingControl: 'CUSTOMER_CONTROLLED',
        appointmentInterval: 15,
        maxCustomersPerSlot: 1,
        logoUrl: clinic?.logoUrl ?? '',
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
          allowOnlineBooking: false,
        },
      });
    }
    return {
      ...settings,
      logoUrl: clinic?.logoUrl ?? '',
    };
  }

  async updateSettings(clinicId: string, dto: UpdateSettingsDto, locationId?: string) {
    const targetLocationId = locationId ?? (await this.resolveLocationId(clinicId));
    if (!targetLocationId) throw new Error('No location found for clinic');
    await this.getSettings(clinicId, targetLocationId);

    const { logoUrl, ...restDto } = dto;

    const updated = await this.prisma.businessSetting.update({
      where: { locationId: targetLocationId },
      data: restDto,
    });
    if (dto.businessType) {
      await this.prisma.clinic.update({
        where: { id: clinicId },
        data: { businessType: normalizeBusinessType(dto.businessType) },
      });
    }
    if (logoUrl !== undefined) {
      await this.prisma.clinic.update({
        where: { id: clinicId },
        data: { logoUrl },
      });
    }
    return {
      ...updated,
      logoUrl: logoUrl ?? '',
    };
  }
}
