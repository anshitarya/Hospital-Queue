import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { Role } from '@prisma/client';
import { QueueService } from './queue.service';
import { CancelManyDto, ClearQueueDto, JoinQueueDto, MoveToPositionDto, PatientJoinQueueDto, ReorderEntryDto, StartBreakDto, TransferPatientDto } from './dto/queue.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  // No auth — used by the TV display board. Patient phone/email stripped from response.
  @Public()
  @Get('snapshot/:doctorId')
  async snapshot(@Param('doctorId') doctorId: string) {
    const snap = await this.queue.snapshot(doctorId);
    const stripPhone = (p: { id: string; name: string } | null | undefined) =>
      p ? { id: p.id, name: p.name } : null;
    return {
      ...snap,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entries:       snap.entries.map((e) => ({ ...e, patient: stripPhone((e as any).patient) })),
      missedEntries: snap.missedEntries?.map((e) => ({ ...e, patient: stripPhone(e.patient) })),
    };
  }

  @Get('entry/:id')
  getEntry(@Param('id') id: string) {
    return this.queue.getPatientView(id);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post('reception/join')
  receptionJoin(
    @Body() dto: JoinQueueDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') headerKey?: string,
  ) {
    return this.queue.joinByReception(
      { ...dto, idempotencyKey: dto.idempotencyKey ?? headerKey },
      user.id,
      user.clinicId,
    );
  }

  @Roles(Role.PATIENT)
  @Post('patient/join')
  patientJoin(@Body() dto: PatientJoinQueueDto, @CurrentUser() user: AuthUser) {
    return this.queue.joinByPatient(user.id, dto.doctorId, dto.notes);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('doctor/:doctorId/call-next')
  callNext(@Param('doctorId') doctorId: string, @CurrentUser() user: AuthUser) {
    return this.queue.callNext(doctorId, user.id, user.clinicId);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('entry/:id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.queue.complete(id, user.id);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('entry/:id/transfer')
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferPatientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.queue.transfer(id, dto, user.id, user.clinicId ?? '');
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('entry/:id/skip')
  skip(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.queue.skip(id, user.id);
  }

  // Patients can only cancel their own entry; staff can cancel any entry in their clinic.
  @Post('entry/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.queue.cancel(id, user);
  }

  /** Mark a called patient as missed (they didn't appear). Feature 2. */
  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('entry/:id/miss')
  miss(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.queue.markMissed(id, user.id);
  }

  /** Rejoin a previously-missed patient near the current position. Feature 2. */
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post('entry/:id/rejoin')
  rejoin(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.queue.rejoinQueue(id, user.id);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post('entry/:id/reorder')
  reorder(
    @Param('id') id: string,
    @Body() dto: ReorderEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.queue.reorder(id, dto, user.id);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post('entry/:id/move')
  moveToPosition(
    @Param('id') id: string,
    @Body() dto: MoveToPositionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.queue.moveToPosition(id, dto.position, user.id);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('doctor/:doctorId/pause')
  pause(@Param('doctorId') doctorId: string, @CurrentUser() user: AuthUser) {
    return this.queue.pauseDoctor(doctorId, user.id);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('doctor/:doctorId/resume')
  resume(@Param('doctorId') doctorId: string, @CurrentUser() user: AuthUser) {
    return this.queue.resumeDoctor(doctorId, user.id);
  }

  /**
   * Start a doctor break with an estimated return time. Feature 4.
   * Body: { estimatedMinutes: number, note?: string }
   */
  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('doctor/:doctorId/break')
  startBreak(
    @Param('doctorId') doctorId: string,
    @Body() dto: StartBreakDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.queue.startBreak(doctorId, dto.estimatedMinutes, dto.note, user.id);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('doctor/:doctorId/clear-queue')
  clearQueue(
    @Param('doctorId') doctorId: string,
    @Body() dto: ClearQueueDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.queue.clearQueue(doctorId, dto, user.id, user.clinicId);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Post('entries/cancel-many')
  cancelMany(@Body() dto: CancelManyDto, @CurrentUser() user: AuthUser) {
    return this.queue.cancelMany(dto.entryIds, user.id);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @Get('history')
  getHistory(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.queue.getHistory(user.role as Role, user.id, date, doctorId);
  }
}
