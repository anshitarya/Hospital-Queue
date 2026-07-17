import { Role } from '@prisma/client';

/** Clinic-scoped staff who use the reception portal (queue, analytics, settings). */
export const CLINIC_PORTAL_ROLES: Role[] = [Role.RECEPTIONIST, Role.CLINIC_ADMIN];

export function isClinicPortalRole(role: Role): boolean {
  return CLINIC_PORTAL_ROLES.includes(role);
}
