import { BusinessType } from '@prisma/client';

/** Map settings/UI strings to the canonical Clinic.businessType enum. */
export function normalizeBusinessType(raw?: string | null): BusinessType {
  const v = (raw ?? 'CLINIC').toUpperCase();
  const map: Record<string, BusinessType> = {
    CLINIC: BusinessType.CLINIC,
    HOSPITAL: BusinessType.CLINIC,
    MEDICAL: BusinessType.CLINIC,
    SALON: BusinessType.SALON,
    SPA: BusinessType.SALON,
    BANK: BusinessType.BANK,
    FINANCE: BusinessType.BANK,
    GOVT: BusinessType.GOVT,
    GOVERNMENT: BusinessType.GOVT,
    GENERAL: BusinessType.GENERAL,
    CAFE: BusinessType.GENERAL,
    RESTAURANT: BusinessType.GENERAL,
    SERVICE_CENTER: BusinessType.GENERAL,
  };
  return map[v] ?? BusinessType.GENERAL;
}
