import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { serviceDay } from '../../common/utils/timezone';
import { EntryStatus } from '@prisma/client';

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list(clinicId?: string, departmentId?: string) {
    return this.prisma.doctor.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      include: { user: true, department: true },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async get(id: string) {
    const doc = await this.prisma.doctor.findUnique({
      where: { id },
      include: { user: true, department: true },
    });
    if (!doc) throw new NotFoundException(`Doctor ${id} not found`);
    return doc;
  }

  async update(id: string, dto: UpdateDoctorDto) {
    const oldDoc = await this.get(id);
    const updated = await this.prisma.doctor.update({
      where: { id },
      data: dto,
      include: { user: true, department: true },
    });

    if (
      dto.delayMinutes !== undefined &&
      dto.delayMinutes !== oldDoc.delayMinutes &&
      dto.delayMinutes > 0
    ) {
      void this.notifyQueueDelayed(id, dto.delayMinutes, updated.user.name);
    }

    return updated;
  }

  private async notifyQueueDelayed(doctorId: string, delayMinutes: number, doctorName: string) {
    try {
      const activeEntries = await this.prisma.queueEntry.findMany({
        where: {
          doctorId,
          status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
          serviceDay: serviceDay(),
        },
        include: {
          patient: { select: { phone: true } },
        },
      });

      for (const entry of activeEntries) {
        if (entry.patient?.phone) {
          void this.notifications
            .notifyDelayed(entry.patient.phone, delayMinutes, doctorName)
            .catch(() => {});
        }
      }
    } catch {
      /* ignore background notification errors */
    }
  }
}
