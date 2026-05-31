import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  searchByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: { role: Role.PATIENT, phone: { contains: phone } },
    });
  }

  // Idempotent on phone: returns existing patient or creates a new one.
  // Used by reception's "fast add" flow — typing a phone twice never creates a duplicate.
  upsertByPhone(dto: CreatePatientDto) {
    return this.prisma.user.upsert({
      where: { phone: dto.phone },
      update: { name: dto.name },
      create: { role: Role.PATIENT, name: dto.name, phone: dto.phone },
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== Role.PATIENT) throw new NotFoundException('Patient not found');
    return user;
  }

  history(patientId: string) {
    return this.prisma.queueEntry.findMany({
      where: { patientId },
      orderBy: { joinedAt: 'desc' },
      // Clinic is included so the patient app can show "Clinic name" above
      // "Doctor name" on each active queue card.
      include: {
        doctor: { include: { user: true, department: true, clinic: true } },
      },
      take: 50,
    });
  }
}
