import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EntryStatus, VisitStatus } from '@prisma/client';
import { formatHourLabel, istHour, serviceDay } from '../../common/utils/timezone';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardAnalytics(clinicId: string) {
    const serviceDayKey = serviceDay();

    const doctors = await this.prisma.doctor.findMany({
      where: { clinicId },
      select: { id: true },
    });
    const doctorIds = doctors.map((d) => d.id);

    if (doctorIds.length === 0) {
      return {
        todayStats: { completed: 0, waiting: 0, cancelled: 0, missed: 0 },
        averages: { avgWaitTime: 0, avgServiceTime: 0, maxWaitTime: 0, maxServiceTime: 0 },
        currentQueueLength: 0,
        peakHour: 'N/A',
        busyHours: [],
        avgCustomersPerHour: 0,
        avgCustomersPerProfessional: 0,
        returningCustomers: 0,
        newCustomers: 0,
        noShowPercentage: 0,
      };
    }

    const entries = await this.prisma.queueEntry.findMany({
      where: {
        doctorId: { in: doctorIds },
        serviceDay: serviceDayKey,
      },
      select: {
        status: true,
        joinedAt: true,
        calledAt: true,
        startedAt: true,
        completedAt: true,
        patientId: true,
      },
    });

    const stats = { completed: 0, waiting: 0, cancelled: 0, missed: 0 };
    let waitSum = 0;
    let waitCount = 0;
    let maxWait = 0;

    let serviceSum = 0;
    let serviceCount = 0;
    let maxService = 0;

    const hourlyCounts = Array(24).fill(0);
    const uniquePatients = new Set<string>();

    for (const e of entries) {
      if (e.status === EntryStatus.COMPLETED) stats.completed++;
      else if (e.status === EntryStatus.WAITING) stats.waiting++;
      else if (e.status === EntryStatus.CANCELLED) stats.cancelled++;
      else if (e.status === EntryStatus.MISSED) stats.missed++;

      uniquePatients.add(e.patientId);

      const hour = istHour(e.joinedAt);
      hourlyCounts[hour]++;

      if (e.calledAt || e.startedAt) {
        const waitStart = new Date(e.joinedAt).getTime();
        const waitEnd = new Date(e.calledAt ?? e.startedAt!).getTime();
        const waitTime = (waitEnd - waitStart) / 60_000;
        if (waitTime >= 0 && e.status === EntryStatus.COMPLETED) {
          waitSum += waitTime;
          waitCount++;
          if (waitTime > maxWait) maxWait = waitTime;
        }
      }

      if (e.status === EntryStatus.COMPLETED && e.completedAt) {
        const start = e.startedAt ?? e.calledAt;
        if (start) {
          const serviceTime = (new Date(e.completedAt).getTime() - new Date(start).getTime()) / 60_000;
          if (serviceTime >= 0) {
            serviceSum += serviceTime;
            serviceCount++;
            if (serviceTime > maxService) maxService = serviceTime;
          }
        }
      }
    }

    const avgWaitTime = waitCount > 0 ? Math.round(waitSum / waitCount) : 0;
    const avgServiceTime = serviceCount > 0 ? Math.round(serviceSum / serviceCount) : 0;

    let peakHourVal = 0;
    let maxHourCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourlyCounts[h] > maxHourCount) {
        maxHourCount = hourlyCounts[h];
        peakHourVal = h;
      }
    }
    const peakHour = maxHourCount > 0 ? formatHourLabel(peakHourVal) : 'N/A';

    const busyHours = hourlyCounts
      .map((count, hr) => ({ hr, count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((item) => formatHourLabel(item.hr));

    const totalEntriesToday = entries.length;
    const avgCustomersPerHour = totalEntriesToday / 8;
    const avgCustomersPerProfessional = doctorIds.length > 0 ? totalEntriesToday / doctorIds.length : 0;

    const patientIds = Array.from(uniquePatients);
    let returningCount = 0;
    let newCount = 0;

    if (patientIds.length > 0) {
      const visitCounts = await this.prisma.visit.groupBy({
        by: ['patientId'],
        where: {
          patientId: { in: patientIds },
          clinicId,
          status: VisitStatus.COMPLETED,
        },
        _count: { _all: true },
      });

      const returningSet = new Set(
        visitCounts.filter((item) => item._count._all > 1).map((item) => item.patientId),
      );

      for (const pId of patientIds) {
        if (returningSet.has(pId)) {
          returningCount++;
        } else {
          newCount++;
        }
      }
    }

    const noShowPercentage = totalEntriesToday > 0 ? Math.round((stats.missed / totalEntriesToday) * 100) : 0;

    return {
      todayStats: stats,
      averages: {
        avgWaitTime,
        avgServiceTime,
        maxWaitTime: Math.round(maxWait),
        maxServiceTime: Math.round(maxService),
      },
      currentQueueLength: stats.waiting,
      peakHour,
      busyHours,
      avgCustomersPerHour: Math.round(avgCustomersPerHour * 10) / 10,
      avgCustomersPerProfessional: Math.round(avgCustomersPerProfessional * 10) / 10,
      returningCustomers: returningCount,
      newCustomers: newCount,
      noShowPercentage,
    };
  }
}
