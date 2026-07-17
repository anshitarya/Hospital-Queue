-- CreateTable
CREATE TABLE "ProfessionalRating" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalRating_entryId_key" ON "ProfessionalRating"("entryId");

-- CreateIndex
CREATE INDEX "ProfessionalRating_doctorId_createdAt_idx" ON "ProfessionalRating"("doctorId", "createdAt");

-- CreateIndex
CREATE INDEX "ProfessionalRating_clinicId_idx" ON "ProfessionalRating"("clinicId");

-- CreateIndex
CREATE INDEX "ProfessionalRating_patientId_idx" ON "ProfessionalRating"("patientId");

-- AddForeignKey
ALTER TABLE "ProfessionalRating" ADD CONSTRAINT "ProfessionalRating_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalRating" ADD CONSTRAINT "ProfessionalRating_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalRating" ADD CONSTRAINT "ProfessionalRating_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalRating" ADD CONSTRAINT "ProfessionalRating_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "QueueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
