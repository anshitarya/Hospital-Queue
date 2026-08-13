import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CustomerService } from './customer.service';
import { normalizeIndianMobile } from '../../common/utils/phone';

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

  async updatePatientPhone(patientId: string, newPhone: string, queueEntryId?: string) {
    // 1. Normalize the new phone number
    const { e164 } = normalizeIndianMobile(newPhone);

    // 2. Check if a user with this phone number already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: e164 },
    });

    if (existingUser) {
      if (existingUser.role !== Role.PATIENT) {
        throw new ConflictException('This phone number is registered to a staff account');
      }
      
      // If an existing patient is found, we should re-link the QueueEntry and associated Visit/Prescription to this patient!
      if (queueEntryId) {
        const entry = await this.prisma.queueEntry.findUnique({
          where: { id: queueEntryId },
        });
        if (entry) {
          await this.prisma.$transaction(async (tx) => {
            await tx.queueEntry.update({
              where: { id: queueEntryId },
              data: { patientId: existingUser.id },
            });
            if (entry.visitId) {
              await tx.visit.update({
                where: { id: entry.visitId },
                data: { patientId: existingUser.id },
              });
            }
            await tx.prescription.updateMany({
              where: { visitId: entry.visitId || '' },
              data: { patientId: existingUser.id },
            });
          });
        }
      }
      return existingUser;
    }

    // 3. If no existing user, simply update the current user's phone number!
    return this.prisma.user.update({
      where: { id: patientId },
      data: { phone: e164 },
    });
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
        visit: {
          include: {
            prescription: {
              include: {
                medicines: true,
              },
            },
          },
        },
      },
      take: 50,
    });
  }
}
