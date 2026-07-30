-- AlterTable
ALTER TABLE "DoctorPrescriptionConfig" ADD COLUMN     "clinicNameFontSize" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "doctorNameFontSize" INTEGER NOT NULL DEFAULT 11,
ADD COLUMN     "headerDetailsFontSize" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "showFollowUp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "website" TEXT;
