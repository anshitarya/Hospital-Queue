import { PrismaClient, Role, DoctorStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { HOSPITAL_DEPARTMENTS } from '../src/config/departments';

const prisma = new PrismaClient();

async function main() {
  const pwd = await argon2.hash('password123');

  // ── Default clinic (used for seeded demo data) ──────────────────────────
  const clinic = await prisma.clinic.upsert({
    where: { id: 'seed-clinic-001' },
    update: { name: 'Demo Clinic' },
    create: { id: 'seed-clinic-001', name: 'Demo Clinic', address: 'Main Street, City' },
  });

  // ── Departments (global labels, not clinic-scoped) ───────────────────────
  // The full alphabetical hospital department list lives in
  // apps/api/src/config/departments.ts — edit there to add/remove.
  for (const name of HOSPITAL_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const general = await prisma.department.findUniqueOrThrow({ where: { name: 'General Medicine' } });
  const pediatrics = await prisma.department.findUniqueOrThrow({ where: { name: 'Pediatrics' } });

  // ── Admin (no clinic — manages all clinics) ──────────────────────────────
  await prisma.user.upsert({
    where: { email: 'admin@clinic.local' },
    update: { emailVerified: true, passwordHash: pwd },
    create: {
      email: 'admin@clinic.local',
      role: Role.ADMIN,
      name: 'Clinic Admin',
      passwordHash: pwd,
      emailVerified: true,
    },
  });

  // ── Receptionist (tied to demo clinic) ──────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'reception@clinic.local' },
    update: { clinicId: clinic.id, emailVerified: true, passwordHash: pwd },
    create: {
      email: 'reception@clinic.local',
      role: Role.RECEPTIONIST,
      name: 'Front Desk',
      passwordHash: pwd,
      clinicId: clinic.id,
      emailVerified: true,
    },
  });

  // ── Doctors ───────────────────────────────────────────────────────────────
  const seedDoctors = [
    { email: 'dr.sharma@clinic.local', name: 'Dr. Anjali Sharma', dept: general, avg: 7 },
    { email: 'dr.menon@clinic.local', name: 'Dr. Rahul Menon', dept: general, avg: 10 },
    { email: 'dr.iyer@clinic.local', name: 'Dr. Priya Iyer', dept: pediatrics, avg: 8 },
  ];
  for (const d of seedDoctors) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: { clinicId: clinic.id, emailVerified: true, passwordHash: pwd },
      create: {
        email: d.email,
        role: Role.DOCTOR,
        name: d.name,
        passwordHash: pwd,
        clinicId: clinic.id,
        emailVerified: true,
      },
    });
    await prisma.doctor.upsert({
      where: { userId: user.id },
      update: { avgConsultMinutes: d.avg, departmentId: d.dept.id, clinicId: clinic.id },
      create: {
        userId: user.id,
        departmentId: d.dept.id,
        clinicId: clinic.id,
        avgConsultMinutes: d.avg,
        status: DoctorStatus.AVAILABLE,
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  Departments:  ${HOSPITAL_DEPARTMENTS.length} loaded`);
  console.log('  Admin:        admin@clinic.local / password123');
  console.log('  Receptionist: reception@clinic.local / password123');
  console.log('  Doctors:      dr.sharma@ / dr.menon@ / dr.iyer@clinic.local / password123');
  console.log(`  Demo clinic:  id=${clinic.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
