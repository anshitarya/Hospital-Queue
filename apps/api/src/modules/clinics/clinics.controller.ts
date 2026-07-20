import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClinicsService } from './clinics.service';
import { serviceDay, serviceDaysAgo } from '../../common/utils/timezone';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { AddDoctorDto } from './dto/add-doctor.dto';
import { AddReceptionistDto } from './dto/add-receptionist.dto';
import { SetReceptionistAssignmentsDto } from './dto/set-receptionist-assignments.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
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
   *  Public routes (no auth required — must be declared BEFORE any route
   *  using a dynamic :id segment to avoid accidental matching).
   * ═══════════════════════════════════════════════════════════════════════ */

  /** Returns clinics that have self-booking enabled, with doctor queue info. */
  @Public()
  @Get('public/businesses')
  listPublicBusinesses(@Query('search') search?: string) {
    return this.clinics.listPublicBusinesses(search);
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Caller-scoped routes ("my" = the caller's clinic)
   *  Declared first so the literal "my" segment wins the matcher.
   * ═══════════════════════════════════════════════════════════════════════ */

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('my')
  getMyClinic(@CurrentUser() user: AuthUser, @Query('locationId') locationId?: string) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.getMyClinic(user.clinicId, user, locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('my/doctors')
  listMyDoctors(@CurrentUser() user: AuthUser, @Query('locationId') locationId?: string) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.listDoctorsInClinic(user.clinicId, user, locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Get('my/patient-lookup')
  lookupPatient(@CurrentUser() user: AuthUser, @Query('phone') phone: string) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.lookupPatient(user.clinicId, phone);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('my/departments')
  listDepartments() {
    return this.clinics.listDepartments();
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Post('my/departments')
  findOrCreateDepartment(@Body('name') name: string) {
    return this.clinics.findOrCreateDepartment(name);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Get('my/dashboard')
  getMyDashboard(@CurrentUser() user: AuthUser, @Query('locationId') locationId?: string) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.getClinicDashboard(user.clinicId, user, locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Get('my/analytics')
  getMyAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('count')  count?: string,
    @Query('date')   date?: string,
    @Query('from')   from?: string,
    @Query('to')     to?: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    if (period === 'hourly') {
      return this.clinics.getClinicAnalytics(user.clinicId, 'hourly', 24, date, undefined, undefined, user, locationId);
    }
    const p = period === 'monthly' ? 'monthly' : 'daily';
    const n = count ? Math.min(Math.max(parseInt(count, 10) || 30, 7), 366) : (p === 'monthly' ? 12 : 30);
    return this.clinics.getClinicAnalytics(user.clinicId, p, n, undefined, from, to, user, locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Get('my/doctor-analytics')
  getDoctorAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to')   to?: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const today = serviceDay();
    return this.clinics.getDoctorAnalytics(user.clinicId, from ?? today, to ?? today, user, locationId);
  }

  @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Get('my/history')
  getClinicHistory(
    @CurrentUser() user: AuthUser,
    @Query('from')      from?: string,
    @Query('to')        to?: string,
    @Query('page')      page?: string,
    @Query('limit')     limit?: string,
    @Query('doctorId')  doctorId?: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const today = serviceDay();
    const sevenAgo = serviceDaysAgo(6);
    return this.clinics.getClinicHistory(
      user.clinicId,
      from ?? sevenAgo,
      to ?? today,
      page  ? Math.max(1, parseInt(page,  10)) : 1,
      limit ? Math.min(500, parseInt(limit, 10)) : 50,
      doctorId,
      user,
      locationId,
    );
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Delete('my/history')
  deleteClinicHistory(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    if (!from || !to) throw new ForbiddenException('from and to dates are required');
    return this.clinics.deleteClinicHistory(user.clinicId, from, to, user, locationId);
  }

  /** Business admin / branch manager: map receptionists to the professionals they manage. */
  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Get('my/receptionist-assignments')
  async getReceptionistAssignments(@CurrentUser() user: AuthUser, @Query('locationId') locationId?: string) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const targetLocationId = locationId || await this.clinics.getDefaultLocationForUser(user.id);
    if (user.role === Role.MANAGER) {
      await this.clinics.assertCallerManagesLocation(user, targetLocationId);
    }
    return this.clinics.getReceptionistAssignments(targetLocationId);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Put('my/receptionist-assignments')
  async setReceptionistAssignments(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetReceptionistAssignmentsDto,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const targetLocationId = locationId || await this.clinics.getDefaultLocationForUser(user.id);
    return this.clinics.setReceptionistAssignments(targetLocationId, dto, user);
  }

  @Roles(Role.CLINIC_ADMIN, Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.DOCTOR)
  @Get('my/locations')
  getMyLocations(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.listLocations(user.clinicId, user);
  }

  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  @Post('my/locations')
  createMyLocation(@CurrentUser() user: AuthUser, @Body() dto: any) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.createLocation(user.clinicId, dto);
  }

  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  @Put('my/locations/:locationId')
  updateMyLocation(@CurrentUser() user: AuthUser, @Param('locationId') locationId: string, @Body() dto: any) {
    return this.clinics.updateLocation(locationId, dto);
  }

  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  @Delete('my/locations/:locationId')
  deleteMyLocation(@CurrentUser() user: AuthUser, @Param('locationId') locationId: string) {
    return this.clinics.deleteLocation(locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Get('my/reports/staff-performance')
  staffPerformanceReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const today = serviceDay();
    const sevenAgo = serviceDaysAgo(6);
    return this.clinics.getStaffPerformanceReport(
      user.clinicId,
      from ?? sevenAgo,
      to ?? today,
      search,
      user,
      locationId,
    );
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Get('my/reports/staff-performance/export')
  exportStaffPerformance(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const today = serviceDay();
    const sevenAgo = serviceDaysAgo(6);
    return this.clinics.exportStaffPerformanceCsv(
      user.clinicId,
      from ?? sevenAgo,
      to ?? today,
      search,
      user,
      locationId,
    );
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Get('my/history/export')
  exportClinicHistory(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const today = serviceDay();
    const sevenAgo = serviceDaysAgo(6);
    return this.clinics.exportClinicHistoryCsv(
      user.clinicId,
      from ?? sevenAgo,
      to ?? today,
      user,
    );
  }

  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  @Post('my/history/import')
  importClinicHistory(
    @CurrentUser() user: AuthUser,
    @Body('csv') csv: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    if (!csv?.trim()) throw new ForbiddenException('CSV content is required');
    return this.clinics.importClinicHistoryCsv(user.clinicId, csv, user);
  }

  /**
   * Add a doctor to the caller's own clinic. Allowed to RECEPTIONIST, DOCTOR,
   * and ADMIN — receptionists need this for everyday onboarding; doctors may
   * onboard each other if the receptionist is unavailable.
   */
  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Post('my/doctors')
  addDoctor(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddDoctorDto,
    @Query('locationId') locationId?: string,
  ) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    const targetLocationId = locationId || dto.locationIds?.[0];
    if (user.role === Role.MANAGER && targetLocationId) {
      return this.clinics.assertCallerManagesLocation(user, targetLocationId).then(() =>
        this.clinics.addDoctor(clinicId, dto, targetLocationId),
      );
    }
    return this.clinics.addDoctor(clinicId, dto, locationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Delete('my/doctors/:doctorId')
  removeDoctor(@CurrentUser() user: AuthUser, @Param('doctorId') doctorId: string) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.removeDoctor(clinicId, doctorId, user);
  }

  /**
   * Add a receptionist to the caller's own clinic. Allowed to RECEPTIONIST,
   * DOCTOR, and ADMIN — same reasoning as the doctor route. Admin-targeted
   * cross-clinic creation goes through `POST :id/receptionists` below.
   */
  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Post('my/receptionists')
  addReceptionistToMyClinic(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddReceptionistDto,
    @Query('locationId') locationId?: string,
  ) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    const targetLocationId = locationId || dto.locationId;
    if (user.role === Role.MANAGER && targetLocationId) {
      return this.clinics.assertCallerManagesLocation(user, targetLocationId).then(() =>
        this.clinics.addReceptionist(clinicId, dto, targetLocationId),
      );
    }
    return this.clinics.addReceptionist(clinicId, dto, locationId);
  }

  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  @Post('my/managers')
  addManagerToMyClinic(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddReceptionistDto,
    @Query('locationId') locationId?: string,
  ) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.addManager(clinicId, dto, locationId);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Get('my/managers')
  async listMyClinicManagers(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    let targetLocationId = locationId;
    if (user.role === Role.MANAGER || user.role === Role.RECEPTIONIST) {
      const managedLocs = await this.clinics.listLocations(clinicId, user);
      const managedIds = managedLocs.map(l => l.id);
      if (targetLocationId) {
        if (!managedIds.includes(targetLocationId)) {
          throw new ForbiddenException('You are not assigned to this branch');
        }
      } else {
        targetLocationId = managedIds[0];
      }
    }
    return this.clinics.listManagersInClinic(clinicId, targetLocationId);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.DOCTOR, Role.ADMIN)
  @Get('my/receptionists')
  async listMyClinicReceptionists(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    let targetLocationId = locationId;
    if (user.role === Role.MANAGER || user.role === Role.RECEPTIONIST) {
      const managedLocs = await this.clinics.listLocations(clinicId, user);
      const managedIds = managedLocs.map(l => l.id);
      if (targetLocationId) {
        if (!managedIds.includes(targetLocationId)) {
          throw new ForbiddenException('You are not assigned to this branch');
        }
      } else {
        targetLocationId = managedIds[0];
      }
    }
    return this.clinics.listReceptionistsInClinic(clinicId, targetLocationId);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Delete('my/receptionists/:userId')
  removeReceptionist(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.removeReceptionist(clinicId, userId, user);
  }

  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  @Delete('my/managers/:userId')
  removeManager(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.removeManager(clinicId, userId);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Post('my/staff/:userId/reset-password')
  resetMyStaffPassword(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.resetStaffPassword(clinicId, userId);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Patch('my/staff/:userId/email')
  updateMyStaffEmail(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body('email') email: string,
  ) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.updateStaffEmail(clinicId, userId, email);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Post('my/doctors/:doctorId/locations/:locationId')
  addDoctorToLocation(
    @CurrentUser() user: AuthUser,
    @Param('doctorId') doctorId: string,
    @Param('locationId') locationId: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.addDoctorToLocation(user.clinicId, doctorId, locationId, user);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Delete('my/doctors/:doctorId/locations/:locationId')
  removeDoctorFromLocation(
    @CurrentUser() user: AuthUser,
    @Param('doctorId') doctorId: string,
    @Param('locationId') locationId: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.removeDoctorFromLocation(user.clinicId, doctorId, locationId, user);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Put('my/doctors/:doctorId/locations')
  setDoctorLocations(
    @CurrentUser() user: AuthUser,
    @Param('doctorId') doctorId: string,
    @Body('locationIds') locationIds: string[],
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.setDoctorLocations(user.clinicId, doctorId, locationIds ?? [], user);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Post('my/staff/:userId/locations/:locationId')
  addStaffToLocation(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('locationId') locationId: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.addStaffToLocation(user.clinicId, userId, locationId, user);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Delete('my/staff/:userId/locations/:locationId')
  removeStaffFromLocation(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('locationId') locationId: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.removeStaffFromLocation(user.clinicId, userId, locationId, user);
  }

  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.ADMIN)
  @Put('my/staff/:userId/locations')
  setStaffLocations(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body('locationIds') locationIds: string[],
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    return this.clinics.setStaffLocations(user.clinicId, userId, locationIds ?? [], user);
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

  @Roles(Role.ADMIN)
  @Post(':id/managers')
  addManagerAsAdmin(
    @Param('id') id: string,
    @Body() dto: AddReceptionistDto,
    @Query('locationId') locationId?: string,
  ) {
    return this.clinics.addManager(id, dto, locationId || dto.locationId);
  }

  @Roles(Role.ADMIN)
  @Get(':id/managers')
  listClinicManagers(@Param('id') id: string, @Query('locationId') locationId?: string) {
    return this.clinics.listManagersInClinic(id, locationId);
  }

  @Roles(Role.ADMIN)
  @Post(':id/clinic-admins')
  addClinicAdminAsAdmin(@Param('id') id: string, @Body() dto: AddReceptionistDto) {
    return this.clinics.addClinicAdmin(id, dto);
  }

  @Roles(Role.ADMIN)
  @Get(':id/clinic-admins')
  listClinicAdmins(@Param('id') id: string) {
    return this.clinics.listClinicAdminsInClinic(id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id/clinic-admins/:userId')
  deleteClinicAdmin(@Param('id') clinicId: string, @Param('userId') userId: string) {
    return this.clinics.adminDeleteClinicAdmin(clinicId, userId);
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
  updateClinic(@Param('id') id: string, @Body() dto: { name?: string; address?: string; businessType?: string }) {
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
  @Delete(':id/managers/:userId')
  deleteManager(@Param('id') clinicId: string, @Param('userId') userId: string) {
    return this.clinics.adminDeleteManager(clinicId, userId);
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

  /**
   * Activate or disable a staff member.
   * Super Admin only — this immediately blocks or unblocks login.
   */
  @Roles(Role.ADMIN)
  @Patch(':id/staff/:userId/status')
  updateStaffStatus(
    @Param('id') clinicId: string,
    @Param('userId') userId: string,
    @Body('status') status: 'ACTIVE' | 'DISABLED',
  ) {
    if (!['ACTIVE', 'DISABLED'].includes(status)) {
      throw new BadRequestException('status must be ACTIVE or DISABLED');
    }
    return this.clinics.updateStaffStatus(clinicId, userId, status);
  }
}

