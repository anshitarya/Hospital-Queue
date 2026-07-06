import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { AddDoctorDto } from './dto/add-doctor.dto';
import { AddReceptionistDto } from './dto/add-receptionist.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ROUTE-ORDER WARNING                                                      │
 * │                                                                          │
 * │ NestJS / Express dispatches to the FIRST matching route declared on a   │
 * │ controller. That means `@Get(':id/doctors')` will happily match the URL │
 * │ `/clinics/my/doctors` with `id = "my"` — UNLESS the literal-prefix      │
 * │ route `@Get('my/doctors')` is declared first.                            │
 * │                                                                          │
 * │ All `my/...` (clinic-implicit) routes are therefore declared at the TOP │
 * │ of this controller. The parameterised `:id/...` (admin-targeted) routes │
 * │ live below. Do NOT reorder without thinking about this — it WILL break  │
 * │ "Requires role: ADMIN" errors for non-admins (issues 4 + 5).             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  /* ════════════════════════════════════════════════════════════════════════
   *  Caller-scoped routes ("my" = the caller's clinic)
   *  Declared first so the literal "my" segment wins the matcher.
   * ═══════════════════════════════════════════════════════════════════════ */

  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Get('my')
  getMyClinic(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.getMyClinic(user.clinicId);
  }

  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Get('my/departments')
  listDepartments() {
    return this.clinics.listDepartments();
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Get('my/dashboard')
  getMyDashboard(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.getClinicDashboard(user.clinicId);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Get('my/analytics')
  getMyAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('count') count?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const p = period === 'monthly' ? 'monthly' : 'daily';
    const n = count ? Math.min(Math.max(parseInt(count, 10) || 30, 7), 365) : (p === 'monthly' ? 12 : 30);
    return this.clinics.getClinicAnalytics(user.clinicId, p, n);
  }

  /**
   * Add a doctor to the caller's own clinic. Allowed to RECEPTIONIST, DOCTOR,
   * and ADMIN — receptionists need this for everyday onboarding; doctors may
   * onboard each other if the receptionist is unavailable.
   */
  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Post('my/doctors')
  addDoctor(@CurrentUser() user: AuthUser, @Body() dto: AddDoctorDto) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.addDoctor(clinicId, dto);
  }

  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Delete('my/doctors/:doctorId')
  removeDoctor(@CurrentUser() user: AuthUser, @Param('doctorId') doctorId: string) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.removeDoctor(clinicId, doctorId);
  }

  /**
   * Add a receptionist to the caller's own clinic. Allowed to RECEPTIONIST,
   * DOCTOR, and ADMIN — same reasoning as the doctor route. Admin-targeted
   * cross-clinic creation goes through `POST :id/receptionists` below.
   */
  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Post('my/receptionists')
  addReceptionistToMyClinic(@CurrentUser() user: AuthUser, @Body() dto: AddReceptionistDto) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.addReceptionist(clinicId, dto);
  }

  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN)
  @Get('my/receptionists')
  listMyClinicReceptionists(@CurrentUser() user: AuthUser) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.listReceptionistsInClinic(clinicId);
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Admin routes (parameterised by clinic id)
   *  Declared AFTER all `my/...` routes — see route-order warning above.
   * ═══════════════════════════════════════════════════════════════════════ */

  @Roles(Role.ADMIN)
  @Get()
  listAll() {
    return this.clinics.listAll();
  }

  /**
   * Aggregate stats for the admin landing page. Cheap counts only —
   * intentionally separate from the heavier `listAll()` which returns full
   * clinic records.
   */
  @Roles(Role.ADMIN)
  @Get('stats/overview')
  overviewStats() {
    return this.clinics.getOverviewStats();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateClinicDto) {
    return this.clinics.create(dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/invite-codes')
  generateInviteCode(@Param('id') id: string) {
    return this.clinics.generateInviteCode(id);
  }

  @Roles(Role.ADMIN)
  @Get(':id/invite-codes')
  listInviteCodes(@Param('id') id: string) {
    return this.clinics.listInviteCodes(id);
  }

  /**
   * Admin add-doctor for an arbitrary clinic. Re-uses the same service method
   * as the receptionist `my/doctors` flow above — identical validation,
   * uniqueness, and temp-password generation.
   */
  @Roles(Role.ADMIN)
  @Post(':id/doctors')
  addDoctorAsAdmin(@Param('id') id: string, @Body() dto: AddDoctorDto) {
    return this.clinics.addDoctor(id, dto);
  }

  @Roles(Role.ADMIN)
  @Get(':id/doctors')
  listClinicDoctors(@Param('id') id: string) {
    return this.clinics.listDoctorsInClinic(id);
  }

  /**
   * Admin add-receptionist for an arbitrary clinic. Direct alternative to the
   * invite-code self-signup flow.
   */
  @Roles(Role.ADMIN)
  @Post(':id/receptionists')
  addReceptionistAsAdmin(@Param('id') id: string, @Body() dto: AddReceptionistDto) {
    return this.clinics.addReceptionist(id, dto);
  }

  @Roles(Role.ADMIN)
  @Get(':id/receptionists')
  listClinicReceptionists(@Param('id') id: string) {
    return this.clinics.listReceptionistsInClinic(id);
  }

  /**
   * Reset a doctor's or receptionist's password to a new random temp value.
   * Returns the plaintext exactly once — the admin UI surfaces it in the
   * credentials modal so the admin can re-share with the user.
   *
   * We DO NOT store plaintext passwords anywhere (it's a HIPAA / OWASP
   * violation). The admin's operational need — "I want to share a working
   * password with this user" — is fulfilled by re-issuing on demand.
   */
  @Roles(Role.ADMIN)
  @Post(':id/staff/:userId/reset-password')
  resetStaffPassword(@Param('id') clinicId: string, @Param('userId') userId: string) {
    return this.clinics.resetStaffPassword(clinicId, userId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  updateClinic(@Param('id') id: string, @Body() dto: { name?: string; address?: string }) {
    return this.clinics.updateClinic(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  deleteClinic(@Param('id') id: string) {
    return this.clinics.deleteClinic(id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id/doctors/:doctorId')
  deleteDoctor(@Param('id') clinicId: string, @Param('doctorId') doctorId: string) {
    return this.clinics.adminDeleteDoctor(clinicId, doctorId);
  }

  @Roles(Role.ADMIN)
  @Delete(':id/receptionists/:userId')
  deleteReceptionist(@Param('id') clinicId: string, @Param('userId') userId: string) {
    return this.clinics.adminDeleteReceptionist(clinicId, userId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/staff/:userId/email')
  updateStaffEmail(
    @Param('id') clinicId: string,
    @Param('userId') userId: string,
    @Body('email') email: string,
  ) {
    return this.clinics.updateStaffEmail(clinicId, userId, email);
  }
}
