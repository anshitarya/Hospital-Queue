-- CreateEnum
CREATE TYPE "SignupRequestStatus" AS ENUM ('PENDING', 'CONTACTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "BusinessSignupRequest" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "SignupRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "clinicId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSignupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessSignupRequest_status_idx" ON "BusinessSignupRequest"("status");
CREATE INDEX "BusinessSignupRequest_createdAt_idx" ON "BusinessSignupRequest"("createdAt");
CREATE INDEX "BusinessSignupRequest_email_idx" ON "BusinessSignupRequest"("email");

-- AddForeignKey
ALTER TABLE "BusinessSignupRequest" ADD CONSTRAINT "BusinessSignupRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
