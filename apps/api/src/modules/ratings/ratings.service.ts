import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntryStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubmitRatingDto } from './dto/submit-rating.dto';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitRating(patientId: string, dto: SubmitRatingDto) {
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: dto.entryId },
      include: {
        doctor: { select: { id: true, clinicId: true, user: { select: { name: true } } } },
        rating: { select: { id: true } },
      },
    });
    if (!entry) throw new NotFoundException('Visit not found');
    if (entry.patientId !== patientId) {
      throw new ForbiddenException('You can only rate your own visits');
    }
    if (entry.status !== EntryStatus.COMPLETED) {
      throw new BadRequestException('You can rate only after your visit is completed');
    }
    if (entry.rating) {
      throw new BadRequestException('You have already rated this visit');
    }
    if (!entry.doctor.clinicId) {
      throw new BadRequestException('Professional is not linked to a clinic');
    }

    return this.prisma.professionalRating.create({
      data: {
        clinicId: entry.doctor.clinicId,
        doctorId: entry.doctor.id,
        patientId,
        entryId: entry.id,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
      },
    });
  }

  async getRatingForEntry(entryId: string, patientId: string) {
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      select: { patientId: true },
    });
    if (!entry || entry.patientId !== patientId) return null;
    return this.prisma.professionalRating.findUnique({ where: { entryId } });
  }

  async getClinicRatingsReport(clinicId: string, from: string, to: string, search?: string) {
    const ratings = await this.prisma.professionalRating.findMany({
      where: {
        clinicId,
        createdAt: {
          gte: new Date(`${from}T00:00:00+05:30`),
          lte: new Date(`${to}T23:59:59+05:30`),
        },
        ...(search
          ? {
              doctor: {
                user: { name: { contains: search, mode: 'insensitive' as const } },
              },
            }
          : {}),
      },
      include: {
        doctor: { include: { user: { select: { name: true } }, department: { select: { name: true } } } },
        patient: { select: { name: true } },
        entry: { select: { tokenNumber: true, serviceDay: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byDoctor = new Map<
      string,
      { doctorId: string; name: string; department: string; count: number; sum: number; avg: number }
    >();
    for (const r of ratings) {
      const key = r.doctorId;
      if (!byDoctor.has(key)) {
        byDoctor.set(key, {
          doctorId: r.doctorId,
          name: r.doctor.user.name,
          department: r.doctor.department?.name ?? '—',
          count: 0,
          sum: 0,
          avg: 0,
        });
      }
      const row = byDoctor.get(key)!;
      row.count += 1;
      row.sum += r.rating;
      row.avg = Math.round((row.sum / row.count) * 10) / 10;
    }

    return {
      from,
      to,
      total: ratings.length,
      average:
        ratings.length > 0
          ? Math.round((ratings.reduce((a, r) => a + r.rating, 0) / ratings.length) * 10) / 10
          : 0,
      byDoctor: Array.from(byDoctor.values()).sort((a, b) => b.avg - a.avg),
      entries: ratings.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        doctor: { name: r.doctor.user.name, department: r.doctor.department?.name ?? '—' },
        patient: { name: r.patient.name },
        tokenNumber: r.entry.tokenNumber,
        serviceDay: r.entry.serviceDay,
      })),
    };
  }
}
