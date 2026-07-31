/*
  Warnings:

  - Made the column `locationId` on table `BusinessSetting` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('PENDING', 'TRANSCRIBING', 'READY_FOR_REVIEW', 'GENERATING_PDF', 'COMPLETED', 'FAILED');

-- DropIndex
DROP INDEX "Location_clinicId_idx";

-- DropIndex
DROP INDEX "QueueEntry_doctorId_serviceDay_calledAt_idx";

-- AlterTable
ALTER TABLE "BusinessSetting" ALTER COLUMN "allowOnlineBooking" SET DEFAULT false,
ALTER COLUMN "locationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "prescriptionAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "prescriptionEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Location" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "weight" TEXT,
    "height" TEXT,
    "bloodPressure" TEXT,
    "temperature" TEXT,
    "pulse" TEXT,
    "spo2" TEXT,
    "symptoms" TEXT,
    "allergies" TEXT,
    "clinicalNotes" TEXT,
    "diagnosis" TEXT,
    "investigationsOrdered" TEXT,
    "generalAdvice" TEXT,
    "referral" TEXT,
    "followUpDate" TIMESTAMP(3),
    "followUpNote" TEXT,
    "audioUrl" TEXT,
    "pdfUrl" TEXT,
    "rawTranscript" TEXT,
    "structuredJson" JSONB,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionMedicine" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicine" TEXT NOT NULL,
    "genericName" TEXT,
    "form" TEXT,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "frequencyPattern" TEXT,
    "timing" TEXT,
    "duration" TEXT NOT NULL,
    "totalQuantity" INTEGER,
    "notes" TEXT,

    CONSTRAINT "PrescriptionMedicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPrescriptionConfig" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "sectionOrder" TEXT[] DEFAULT ARRAY['vitals', 'symptoms', 'diagnosis', 'medicines', 'advice']::TEXT[],
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showPatientAge" BOOLEAN NOT NULL DEFAULT true,
    "showPatientMobile" BOOLEAN NOT NULL DEFAULT true,
    "showPatientAddress" BOOLEAN NOT NULL DEFAULT false,
    "showDate" BOOLEAN NOT NULL DEFAULT true,
    "showSignature" BOOLEAN NOT NULL DEFAULT true,
    "showVitals" BOOLEAN NOT NULL DEFAULT true,
    "showSymptoms" BOOLEAN NOT NULL DEFAULT true,
    "showDiagnosis" BOOLEAN NOT NULL DEFAULT true,
    "showAdvice" BOOLEAN NOT NULL DEFAULT true,
    "showInvestigations" BOOLEAN NOT NULL DEFAULT true,
    "headerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "footerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customHeaderText" TEXT,
    "customFooterText" TEXT,
    "signatureUrl" TEXT,

    CONSTRAINT "DoctorPrescriptionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_visitId_key" ON "Prescription"("visitId");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Prescription_doctorId_idx" ON "Prescription"("doctorId");

-- CreateIndex
CREATE INDEX "Prescription_locationId_idx" ON "Prescription"("locationId");

-- CreateIndex
CREATE INDEX "Prescription_createdAt_idx" ON "Prescription"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorPrescriptionConfig_doctorId_key" ON "DoctorPrescriptionConfig"("doctorId");

-- CreateIndex
CREATE INDEX "InviteCode_locationId_idx" ON "InviteCode"("locationId");

-- CreateIndex
CREATE INDEX "QueueEntry_appointmentTime_idx" ON "QueueEntry"("appointmentTime");

-- CreateIndex
CREATE INDEX "QueueEntry_doctorId_locationId_status_idx" ON "QueueEntry"("doctorId", "locationId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_patientId_doctorId_status_idx" ON "QueueEntry"("patientId", "doctorId", "status");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMedicine" ADD CONSTRAINT "PrescriptionMedicine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPrescriptionConfig" ADD CONSTRAINT "DoctorPrescriptionConfig_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "UsageSummary_businessId_locationId_professionalId_date_eventTyp" RENAME TO "UsageSummary_businessId_locationId_professionalId_date_even_key";
