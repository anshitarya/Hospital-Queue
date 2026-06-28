/**
 * Clinic-level defaults driven by environment variables.
 * Override any value in .env (local) or the deployment environment (production).
 */
export const clinicDefaults = {
  name:    process.env.CLINIC_NAME    ?? 'Demo Clinic',
  address: process.env.CLINIC_ADDRESS ?? 'Main Street, City',
  queue: {
    walkinGap:         parseInt(process.env.WALKIN_GAP          ?? '4', 10),
    missedGap:         parseInt(process.env.MISSED_GAP          ?? '4', 10),
    followUpEvery:     parseInt(process.env.FOLLOWUP_EVERY      ?? '0', 10),
    avgConsultMinutes: parseInt(process.env.DEFAULT_AVG_CONSULT_MINUTES ?? '7', 10),
  },
};
