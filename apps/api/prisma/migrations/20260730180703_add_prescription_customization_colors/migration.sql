-- AlterTable
ALTER TABLE "DoctorPrescriptionConfig" ADD COLUMN     "clinicNameColor" TEXT NOT NULL DEFAULT '#1e293b',
ADD COLUMN     "doctorNameColor" TEXT NOT NULL DEFAULT '#b91c1c',
ADD COLUMN     "headerDetailsColor" TEXT NOT NULL DEFAULT '#475569';
