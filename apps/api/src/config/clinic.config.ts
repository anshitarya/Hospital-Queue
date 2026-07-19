/**
 * Clinic definitions used by the seed script.
 *
 * Each entry creates (or updates) one clinic with its own queue settings,
 * receptionist, and doctors when `npx prisma db seed` runs.
 *
 * For production: override the values here directly, or pull from env vars
 * if you prefer environment-driven config (see CLINIC_1_* vars in .env.example).
 *
 * Adding a new clinic:
 *   1. Copy the template block below and give it a unique `id` and `seedPrefix`.
 *   2. Fill in name, address, and staff details.
 *   3. Re-run `npx prisma db seed`.
 */

export interface ClinicSeedConfig {
  /** Stable, human-readable ID stored in the DB. Never change once seeded. */
  id: string;
  name: string;
  address: string;
  /** Prefix used to derive seed-user email addresses, e.g. "clinic1" → "reception.clinic1@clinic.local" */
  seedPrefix: string;
  queue: {
    walkinGap: number;
    missedGap: number;
    followUpEvery: number;
    avgConsultMinutes: number;
  };
  receptionist: {
    name: string;
    email: string;
  };
  clinicAdmin: {
    name: string;
    email: string;
  };
  doctors: Array<{
    name: string;
    email: string;
    department: string;
    avgConsultMinutes?: number;
  }>;
}

export const SEED_CLINICS: ClinicSeedConfig[] = [
  // ── Clinic 1 (primary / demo) ───────────────────────────────────────────
  {
    id: 'seed-clinic-001',
    name:    process.env.CLINIC_1_NAME    ?? 'Demo Clinic',
    address: process.env.CLINIC_1_ADDRESS ?? 'Main Street, City',
    seedPrefix: 'clinic1',
    queue: {
      walkinGap:         parseInt(process.env.CLINIC_1_WALKIN_GAP          ?? process.env.WALKIN_GAP          ?? '4', 10),
      missedGap:         parseInt(process.env.CLINIC_1_MISSED_GAP          ?? process.env.MISSED_GAP          ?? '4', 10),
      followUpEvery:     parseInt(process.env.CLINIC_1_FOLLOWUP_EVERY      ?? process.env.FOLLOWUP_EVERY      ?? '0', 10),
      avgConsultMinutes: parseInt(process.env.CLINIC_1_AVG_CONSULT_MINUTES ?? process.env.DEFAULT_AVG_CONSULT_MINUTES ?? '7', 10),
    },
    receptionist: {
      name:  'Front Desk',
      email: 'reception@clinic.local',
    },
    clinicAdmin: {
      name:  'Business Admin',
      email: 'admin.demo@clinic.local',
    },
    doctors: [
      { name: 'Dr. Anjali Sharma', email: 'dr.sharma@clinic.local',  department: 'General Medicine' },
      { name: 'Dr. Rahul Menon',   email: 'dr.menon@clinic.local',   department: 'General Medicine' },
      { name: 'Dr. Priya Iyer',    email: 'dr.iyer@clinic.local',    department: 'Pediatrics' },
    ],
  },

  // ── Clinic 2 ─────────────────────────────────────────────────────────────
  {
    id: 'seed-clinic-002',
    name:    process.env.CLINIC_2_NAME    ?? 'Second Clinic',
    address: process.env.CLINIC_2_ADDRESS ?? '42 Hospital Road, City',
    seedPrefix: 'clinic2',
    queue: {
      walkinGap:         parseInt(process.env.CLINIC_2_WALKIN_GAP          ?? '4', 10),
      missedGap:         parseInt(process.env.CLINIC_2_MISSED_GAP          ?? '4', 10),
      followUpEvery:     parseInt(process.env.CLINIC_2_FOLLOWUP_EVERY      ?? '0', 10),
      avgConsultMinutes: parseInt(process.env.CLINIC_2_AVG_CONSULT_MINUTES ?? '7', 10),
    },
    receptionist: {
      name:  'Reception Desk 2',
      email: 'reception2@clinic.local',
    },
    clinicAdmin: {
      name:  'Business Admin 2',
      email: 'admin2@clinic.local',
    },
    doctors: [
      { name: 'Dr. First Doctor',  email: 'dr.first@clinic2.local',  department: 'General Medicine' },
      { name: 'Dr. Second Doctor', email: 'dr.second@clinic2.local', department: 'General Medicine' },
    ],
  },

  // ── Clinic 3 ─────────────────────────────────────────────────────────────
  {
    id: 'seed-clinic-003',
    name:    process.env.CLINIC_3_NAME    ?? 'City Care Clinic',
    address: process.env.CLINIC_3_ADDRESS ?? '7 Wellness Avenue, City',
    seedPrefix: 'clinic3',
    queue: {
      walkinGap:         parseInt(process.env.CLINIC_3_WALKIN_GAP          ?? '4', 10),
      missedGap:         parseInt(process.env.CLINIC_3_MISSED_GAP          ?? '4', 10),
      followUpEvery:     parseInt(process.env.CLINIC_3_FOLLOWUP_EVERY      ?? '0', 10),
      avgConsultMinutes: parseInt(process.env.CLINIC_3_AVG_CONSULT_MINUTES ?? '7', 10),
    },
    receptionist: {
      name:  'Reception Desk 3',
      email: 'reception3@clinic.local',
    },
    clinicAdmin: {
      name:  'Business Admin 3',
      email: 'admin3@clinic.local',
    },
    doctors: [
      { name: 'Dr. Vikram Nair',    email: 'dr.nair@clinic3.local',    department: 'Orthopedics' },
      { name: 'Dr. Sneha Kulkarni', email: 'dr.kulkarni@clinic3.local', department: 'Dermatology' },
      { name: 'Dr. Arjun Das',      email: 'dr.das@clinic3.local',      department: 'General Medicine' },
    ],
  },
];

/**
 * Queue defaults for the first clinic — kept for backward-compat with
 * queue.service.ts which imports this as `clinicDefaults`.
 */
export const clinicDefaults = {
  name:    SEED_CLINICS[0].name,
  address: SEED_CLINICS[0].address,
  queue:   SEED_CLINICS[0].queue,
};
