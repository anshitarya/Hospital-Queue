import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { serviceDay } from '../../common/utils/timezone';
import { Role, DoctorStatus, EntryStatus } from '@prisma/client';
import { RequestLeaveDto } from './dto/request-leave.dto';

@Injectable()
export class LeaveManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async requestLeave(
    callerId: string,
    callerRole: Role,
    callerClinicId: string | null | undefined,
    dto: RequestLeaveDto,
  ) {
    let targetUserId = callerId;
    if (dto.userId && dto.userId !== callerId) {
      if (callerRole !== Role.CLINIC_ADMIN && callerRole !== Role.MANAGER && callerRole !== Role.ADMIN) {
        throw new ForbiddenException('Cannot request leave for another staff member');
      }
      targetUserId = dto.userId;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { doctorProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (callerRole !== Role.ADMIN) {
      if (!callerClinicId || user.clinicId !== callerClinicId) {
        throw new ForbiddenException('Staff member belongs to a different clinic');
      }
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('End time must be after start time');
    }

    const leave = await this.prisma.staffLeave.create({
      data: {
        userId: targetUserId,
        type: dto.type,
        startDate: start,
        endDate: end,
        reason: dto.reason,
        status: 'PENDING',
        approvedById: null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    return leave;
  }

  async approveLeave(leaveId: string, approvedById: string, callerRole: Role) {
    this.assertBusinessAdmin(callerRole);

    const leave = await this.prisma.staffLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') throw new BadRequestException('Leave is not pending');
    if (leave.userId === approvedById) {
      throw new ForbiddenException('You cannot approve your own leave request');
    }

    const updated = await this.prisma.staffLeave.update({
      where: { id: leaveId },
      data: {
        status: 'APPROVED',
        approvedById,
      },
    });

    await this.applyLeaveSideEffects(leaveId);
    return updated;
  }

  async rejectLeave(leaveId: string, rejectedById: string, callerRole: Role) {
    this.assertBusinessAdmin(callerRole);

    const leave = await this.prisma.staffLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') throw new BadRequestException('Leave is not pending');
    if (leave.userId === rejectedById) {
      throw new ForbiddenException('You cannot reject your own leave request');
    }

    return this.prisma.staffLeave.update({
      where: { id: leaveId },
      data: { status: 'REJECTED' },
    });
  }

  async cancelLeave(leaveId: string, userId: string) {
    const leave = await this.prisma.staffLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own leave request');
    }

    const updated = await this.prisma.staffLeave.update({
      where: { id: leaveId },
      data: { status: 'CANCELLED' },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: leave.userId },
      include: { doctorProfile: true },
    });
    if (user?.doctorProfile) {
      await this.prisma.doctor.update({
        where: { id: user.doctorProfile.id },
        data: { status: DoctorStatus.AVAILABLE, breakUntil: null, breakNote: null },
      });
    }

    return updated;
  }

  async getMyLeaves(userId: string) {
    return this.prisma.staffLeave.findMany({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getClinicLeaves(clinicId: string) {
    return this.prisma.staffLeave.findMany({
      where: {
        user: { clinicId },
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLeaveAnalytics(clinicId: string, from?: string, to?: string) {
    const rangeStart = from ? new Date(`${from}T00:00:00+05:30`) : new Date(Date.now() - 89 * 86_400_000);
    const rangeEnd = to ? new Date(`${to}T23:59:59+05:30`) : new Date();

    const leaves = await this.prisma.staffLeave.findMany({
      where: {
        user: { clinicId },
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byRole: Record<string, number> = {};
    const byStaff: Record<string, { name: string; role: string; count: number; days: number }> = {};

    for (const l of leaves) {
      byType[l.type] = (byType[l.type] || 0) + 1;
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      const role = l.user.role;
      byRole[role] = (byRole[role] || 0) + 1;

      const days = Math.max(
        1,
        Math.ceil((l.endDate.getTime() - l.startDate.getTime()) / 86_400_000),
      );
      if (!byStaff[l.userId]) {
        byStaff[l.userId] = { name: l.user.name, role: l.user.role, count: 0, days: 0 };
      }
      byStaff[l.userId].count += 1;
      byStaff[l.userId].days += days;
    }

    const pending = leaves.filter((l) => l.status === 'PENDING').length;
    const approved = leaves.filter((l) => l.status === 'APPROVED').length;

    return {
      from: from ?? serviceDay(rangeStart),
      to: to ?? serviceDay(rangeEnd),
      totals: {
        requests: leaves.length,
        pending,
        approved,
        rejected: leaves.filter((l) => l.status === 'REJECTED').length,
        cancelled: leaves.filter((l) => l.status === 'CANCELLED').length,
      },
      byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      byRole: Object.entries(byRole).map(([role, count]) => ({ role, count })),
      topStaff: Object.values(byStaff)
        .sort((a, b) => b.days - a.days)
        .slice(0, 10),
    };
  }

  private assertBusinessAdmin(role: Role) {
    if (role !== Role.CLINIC_ADMIN && role !== Role.MANAGER && role !== Role.ADMIN) {
      throw new ForbiddenException('Only a business admin can approve or reject leave requests');
    }
  }

  private async applyLeaveSideEffects(leaveId: string) {
    const leave = await this.prisma.staffLeave.findUnique({
      where: { id: leaveId },
      include: { user: { include: { doctorProfile: true } } },
    });
    if (!leave || !leave.user.doctorProfile) return;

    const doctor = leave.user.doctorProfile;

    let newStatus: DoctorStatus = DoctorStatus.PAUSED;
    if (leave.type === 'LEAVE' || leave.type === 'EMERGENCY_LEAVE') {
      newStatus = DoctorStatus.AWAY;
    }

    await this.prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        status: newStatus,
        breakUntil: leave.endDate,
        breakNote: leave.reason,
      },
    });

    const docLoc = await this.prisma.doctorLocation.findFirst({
      where: { doctorId: doctor.id },
      select: { locationId: true },
    });
    const locationId = docLoc?.locationId || '';

    const settings = await this.prisma.businessSetting.findUnique({
      where: { locationId },
    });

    if (settings?.autoQueueAssignment) {
      const fallbackDoctor = await this.prisma.doctor.findFirst({
        where: {
          clinicId: doctor.clinicId,
          departmentId: doctor.departmentId,
          status: DoctorStatus.AVAILABLE,
          id: { not: doctor.id },
        },
      });

      if (fallbackDoctor) {
        const todayStr = serviceDay();
        const waitingEntries = await this.prisma.queueEntry.findMany({
          where: {
            doctorId: doctor.id,
            serviceDay: todayStr,
            status: EntryStatus.WAITING,
          },
        });

        for (const entry of waitingEntries) {
          const last = await this.prisma.queueEntry.findFirst({
            where: { doctorId: fallbackDoctor.id, serviceDay: todayStr },
            orderBy: { tokenNumber: 'desc' },
            select: { tokenNumber: true },
          });
          const nextToken = (last?.tokenNumber ?? 0) + 1;

          await this.prisma.queueEntry.update({
            where: { id: entry.id },
            data: {
              doctorId: fallbackDoctor.id,
              tokenNumber: nextToken,
              sortOrder: null,
            },
          });
        }
      }
    }
  }
}
