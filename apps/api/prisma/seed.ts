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

    // Create/update business settings.
    await prisma.businessSetting.upsert({
      where: { clinicId: clinic.id },
      update: {},
      create: {
        clinicId: clinic.id,
        businessType: 'CLINIC',
        queueMode: 'LIVE_QUEUE',
        appointmentMode: 'HYBRID',
      },
    });

    // Business admin — full reception portal access for the clinic owner.
    await prisma.user.upsert({
      where: { email: cfg.clinicAdmin.email },
      update: { clinicId: clinic.id, emailVerified: true, passwordHash: pwd, role: Role.CLINIC_ADMIN },
      create: {
        email: cfg.clinicAdmin.email,
        role: Role.CLINIC_ADMIN,
        name: cfg.clinicAdmin.name,
        passwordHash: pwd,
        clinicId: clinic.id,
        emailVerified: true,
      },
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

      const doctor = await prisma.doctor.upsert({
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

      // Default schedules for the doctor.
      await prisma.professionalSchedule.deleteMany({ where: { doctorId: doctor.id } });
      await prisma.professionalSchedule.createMany({
        data: [
          { doctorId: doctor.id, dayOfWeek: 1, startTime: '09:00', endTime: '13:00' },
          { doctorId: doctor.id, dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
          { doctorId: doctor.id, dayOfWeek: 2, startTime: '09:00', endTime: '18:00' },
          { doctorId: doctor.id, dayOfWeek: 3, startTime: '09:00', endTime: '18:00' },
          { doctorId: doctor.id, dayOfWeek: 4, startTime: '09:00', endTime: '18:00' },
          { doctorId: doctor.id, dayOfWeek: 5, startTime: '09:00', endTime: '18:00' },
          { doctorId: doctor.id, dayOfWeek: 6, startTime: '09:00', endTime: '14:00' },
        ],
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
