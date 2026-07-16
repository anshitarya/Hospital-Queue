import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SetScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class ProfessionalScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getDoctorSchedule(doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    return this.prisma.professionalSchedule.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setDoctorSchedule(doctorId: string, dto: SetScheduleDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.professionalSchedule.deleteMany({ where: { doctorId } });
      
      const created = [];
      for (const shift of dto.shifts) {
        const item = await tx.professionalSchedule.create({
          data: {
            doctorId,
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
