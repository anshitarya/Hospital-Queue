import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { findIntraDayOverlaps, shiftsOverlap } from '../../common/utils/schedule-overlap';
import { SetScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class ProfessionalScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDoctorAtLocation(doctorId: string, locationId: string) {
    await this.prisma.doctorLocation.upsert({
      where: { doctorId_locationId: { doctorId, locationId } },
      create: { doctorId, locationId },
      update: {},
    });
  }

  private async assertCallerCanManageLocation(caller: AuthUser | undefined, locationId: string) {
    if (!caller || caller.role === Role.ADMIN || caller.role === Role.PATIENT) return;
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { clinicId: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    if (caller.clinicId !== location.clinicId) {
      throw new ForbiddenException('Branch belongs to a different business');
    }
    if (caller.role === Role.CLINIC_ADMIN) return;
    if (caller.role === Role.MANAGER || caller.role === Role.RECEPTIONIST) {
      const assigned = await this.prisma.userLocation.findFirst({
        where: { userId: caller.id, locationId },
      });
      if (!assigned) throw new ForbiddenException('You are not assigned to this branch');
      return;
    }
    if (caller.role === Role.DOCTOR) {
      const doc = await this.prisma.doctor.findUnique({
        where: { userId: caller.id },
        select: { locations: { where: { locationId }, select: { locationId: true } } },
      });
      if (!doc?.locations.length) throw new ForbiddenException('You do not work at this branch');
      return;
    }
    throw new ForbiddenException('Not authorized to manage schedules at this branch');
  }

  private async validateNoCrossBranchOverlap(
    doctorId: string,
    locationId: string,
    incoming: SetScheduleDto['shifts'],
  ) {
    const intra = findIntraDayOverlaps(incoming);
    if (intra) throw new BadRequestException(intra);

    const other = await this.prisma.professionalSchedule.findMany({
      where: { doctorId, locationId: { not: locationId }, isHoliday: false },
    });

    for (const shift of incoming) {
      if (shift.isHoliday) continue;
      for (const existing of other) {
        if (shiftsOverlap(shift, existing)) {
          const branch = await this.prisma.location.findUnique({
            where: { id: existing.locationId },
            select: { name: true },
          });
          throw new BadRequestException(
            `Schedule overlaps with ${branch?.name ?? 'another branch'} on the same day (${existing.startTime}–${existing.endTime})`,
          );
        }
      }
    }
  }

  async getDoctorSchedule(doctorId: string, locationId: string, caller?: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    await this.assertCallerCanManageLocation(caller, locationId);

    return this.prisma.professionalSchedule.findMany({
      where: { doctorId, locationId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setDoctorSchedule(doctorId: string, locationId: string, dto: SetScheduleDto, caller?: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    await this.assertCallerCanManageLocation(caller, locationId);
    await this.validateNoCrossBranchOverlap(doctorId, locationId, dto.shifts);
    await this.ensureDoctorAtLocation(doctorId, locationId);

    return this.prisma.$transaction(async (tx) => {
      await tx.professionalSchedule.deleteMany({ where: { doctorId, locationId } });

      const created = [];
      for (const shift of dto.shifts) {
        const item = await tx.professionalSchedule.create({
          data: {
            doctorId,
            locationId,
            dayOfWeek: shift.dayOfWeek,
            startTime: shift.startTime,
            endTime: shift.endTime,
            isHoliday: shift.isHoliday,
          },
        });
        created.push(item);
      }
      return created;
    });
  }
}
