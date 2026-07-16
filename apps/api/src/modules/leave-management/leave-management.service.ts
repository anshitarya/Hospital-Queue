import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequestLeaveDto } from './dto/request-leave.dto';
import { Role, DoctorStatus, EntryStatus } from '@prisma/client';

@Injectable()
export class LeaveManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async requestLeave(userId: string, dto: RequestLeaveDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const shouldAutoApprove = ['BREAK', 'LUNCH', 'BUSY'].includes(dto.type) || user.role === Role.ADMIN;
    const status = shouldAutoApprove ? 'APPROVED' : 'PENDING';

    const leave = await this.prisma.staffLeave.create({
      data: {
        userId,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
        status,
        approvedById: shouldAutoApprove ? userId : null,
      },
    });

    if (status === 'APPROVED') {
      await this.applyLeaveSideEffects(leave.id);
    }

    return leave;
  }

  async approveLeave(leaveId: string, approvedById: string) {
    const leave = await this.prisma.staffLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') throw new BadRequestException('Leave is not pending');

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

  async rejectLeave(leaveId: string) {
    const leave = await this.prisma.staffLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') throw new BadRequestException('Leave is not pending');

    return this.prisma.staffLeave.update({
      where: { id: leaveId },
      data: { status: 'REJECTED' },
    });
  }

  async cancelLeave(leaveId: string, userId: string) {
    const leave = await this.prisma.staffLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    
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

    const settings = await this.prisma.businessSetting.findUnique({
      where: { clinicId: doctor.clinicId || '' },
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
        const todayStr = new Date().toISOString().slice(0, 10);
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
