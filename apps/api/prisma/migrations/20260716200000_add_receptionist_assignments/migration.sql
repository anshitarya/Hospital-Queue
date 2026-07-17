-- CreateTable
CREATE TABLE "ReceptionistAssignment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "receptionistId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceptionistAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceptionistAssignment_clinicId_idx" ON "ReceptionistAssignment"("clinicId");

-- CreateIndex
CREATE INDEX "ReceptionistAssignment_receptionistId_idx" ON "ReceptionistAssignment"("receptionistId");

-- CreateIndex
CREATE INDEX "ReceptionistAssignment_doctorId_idx" ON "ReceptionistAssignment"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceptionistAssignment_receptionistId_doctorId_key" ON "ReceptionistAssignment"("receptionistId", "doctorId");

-- AddForeignKey
ALTER TABLE "ReceptionistAssignment" ADD CONSTRAINT "ReceptionistAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptionistAssignment" ADD CONSTRAINT "ReceptionistAssignment_receptionistId_fkey" FOREIGN KEY ("receptionistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptionistAssignment" ADD CONSTRAINT "ReceptionistAssignment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
