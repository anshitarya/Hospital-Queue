import { PrismaClient, Role, DoctorStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { HOSPITAL_DEPARTMENTS } from '../src/config/departments';
import { SEED_CLINICS } from '../src/config/clinic.config';

const prisma = new PrismaClient();

async function main() {
  const pwd = await argon2.hash('password123');

  // ── Departments (global labels, shared across all clinics) ───────────────
  for (const name of HOSPITAL_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // ── Admin (not tied to any clinic — manages all) ─────────────────────────
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

  // ── Seed each clinic ─────────────────────────────────────────────────────
  for (const cfg of SEED_CLINICS) {
    // Create/update the clinic record.
    const clinic = await prisma.clinic.upsert({
      where: { id: cfg.id },
      update: { name: cfg.name, address: cfg.address },
      create: { id: cfg.id, name: cfg.name, address: cfg.address },
    });

    // Receptionist for this clinic.
    await prisma.user.upsert({
      where: { email: cfg.receptionist.email },
      update: { clinicId: clinic.id, emailVerified: true, passwordHash: pwd },
      create: {
        email: cfg.receptionist.email,
        role: Role.RECEPTIONIST,
        name: cfg.receptionist.name,
        passwordHash: pwd,
        clinicId: clinic.id,
        emailVerified: true,
      },
    });

    // Doctors for this clinic.
    for (const d of cfg.doctors) {
      const dept = await prisma.department.findUniqueOrThrow({ where: { name: d.department } });
      const avg  = d.avgConsultMinutes ?? cfg.queue.avgConsultMinutes;

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
        update: {
          avgConsultMinutes: avg,
          departmentId: dept.id,
          clinicId: clinic.id,
          walkinGap: cfg.queue.walkinGap,
          missedGap: cfg.queue.missedGap,
          followUpEvery: cfg.queue.followUpEvery,
        },
        create: {
          userId: user.id,
          departmentId: dept.id,
          clinicId: clinic.id,
          avgConsultMinutes: avg,
          walkinGap: cfg.queue.walkinGap,
          missedGap: cfg.queue.missedGap,
          followUpEvery: cfg.queue.followUpEvery,
          status: DoctorStatus.AVAILABLE,
        },
      });
    }

    console.log(`  ✓ ${cfg.name} (${cfg.id})`);
    console.log(`      Reception: ${cfg.receptionist.email} / password123`);
    cfg.doctors.forEach((d) => console.log(`      Doctor:    ${d.email} / password123`));
  }

  console.log('');
  console.log('Seed complete.');
  console.log(`  Departments: ${HOSPITAL_DEPARTMENTS.length} loaded`);
  console.log('  Admin:       admin@clinic.local / password123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
