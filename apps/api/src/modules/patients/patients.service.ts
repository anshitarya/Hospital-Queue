import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CustomerService } from './customer.service';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerService,
  ) {}

  searchByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: { role: Role.PATIENT, phone: { contains: phone } },
    });
  }

  // Idempotent on phone: returns existing customer or creates a new one with a permanent PIN.
  upsertByPhone(dto: CreatePatientDto) {
    return this.customers.upsertByPhone(dto.phone, dto.name);
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
      // Clinic and location are included so the patient app can show "Clinic name" and "Location" above
      // "Doctor name" on each active queue card.
      include: {
        doctor: { include: { user: true, department: true, clinic: true } },
        location: true,
      },
      take: 50,
    });
  }
}
