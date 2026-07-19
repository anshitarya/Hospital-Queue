-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'ACTIVE',
    "serviceDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLog" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "transferredById" TEXT NOT NULL,
    "transferredFromId" TEXT NOT NULL,
    "transferredToId" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferReason" TEXT,

    CONSTRAINT "TransferLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN "visitId" TEXT;

-- CreateIndex
CREATE INDEX "Visit_clinicId_serviceDay_idx" ON "Visit"("clinicId", "serviceDay");
CREATE INDEX "Visit_patientId_idx" ON "Visit"("patientId");

-- CreateIndex
CREATE INDEX "TransferLog_visitId_idx" ON "TransferLog"("visitId");
CREATE INDEX "TransferLog_transferredFromId_idx" ON "TransferLog"("transferredFromId");
CREATE INDEX "TransferLog_transferredToId_idx" ON "TransferLog"("transferredToId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_transferredFromId_fkey" FOREIGN KEY ("transferredFromId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_transferredToId_fkey" FOREIGN KEY ("transferredToId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
