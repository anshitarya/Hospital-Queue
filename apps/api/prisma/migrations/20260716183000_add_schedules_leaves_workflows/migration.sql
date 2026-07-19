-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "appointmentDuration" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "followupPriority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxCustomersPerDay" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "roomNumber" TEXT,
ADD COLUMN     "specialization" TEXT,
ADD COLUMN     "walkinAllowed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN     "appointmentSlot" TEXT,
ADD COLUMN     "appointmentTime" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BusinessSetting" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'CLINIC',
    "queueMode" TEXT NOT NULL DEFAULT 'LIVE_QUEUE',
    "appointmentMode" TEXT NOT NULL DEFAULT 'HYBRID',
    "workingDays" TEXT[] DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']::TEXT[],
    "businessHolidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "queueStarts" TEXT NOT NULL DEFAULT '09:00',
    "queueEnds" TEXT NOT NULL DEFAULT '17:00',
    "walkinJoinRule" TEXT NOT NULL DEFAULT 'END_OF_QUEUE',
    "walkinJoinRuleParam" INTEGER NOT NULL DEFAULT 4,
    "followupJoinRule" TEXT NOT NULL DEFAULT 'END_OF_QUEUE',
    "followupJoinRuleParam" INTEGER NOT NULL DEFAULT 4,
    "emergencyJoinRule" TEXT NOT NULL DEFAULT 'TOP_PRIORITY',
    "vipJoinRule" TEXT NOT NULL DEFAULT 'SEPARATE_QUEUE',
    "allowWalkins" BOOLEAN NOT NULL DEFAULT true,
    "allowOnlineBooking" BOOLEAN NOT NULL DEFAULT true,
    "allowFollowups" BOOLEAN NOT NULL DEFAULT true,
    "maxDailyBookings" INTEGER NOT NULL DEFAULT 100,
    "emergencyQueueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vipQueueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tokenPrefix" TEXT NOT NULL DEFAULT 'TK',
    "queueNumberFormat" TEXT NOT NULL DEFAULT 'NUMBER',
    "etaCalculationMethod" TEXT NOT NULL DEFAULT 'MOVING_AVERAGE',
    "bufferTime" INTEGER NOT NULL DEFAULT 5,
    "gracePeriod" INTEGER NOT NULL DEFAULT 10,
    "noShowTimeout" INTEGER NOT NULL DEFAULT 15,
    "autoQueueAssignment" BOOLEAN NOT NULL DEFAULT true,
    "bookingControl" TEXT NOT NULL DEFAULT 'CUSTOMER_CONTROLLED',
    "appointmentInterval" INTEGER NOT NULL DEFAULT 15,
    "maxCustomersPerSlot" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalSchedule" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffLeave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowConfiguration" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSetting_clinicId_key" ON "BusinessSetting"("clinicId");

-- CreateIndex
CREATE INDEX "ProfessionalSchedule_doctorId_idx" ON "ProfessionalSchedule"("doctorId");

-- CreateIndex
CREATE INDEX "StaffLeave_userId_idx" ON "StaffLeave"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowConfiguration_clinicId_key" ON "WorkflowConfiguration"("clinicId");

-- AddForeignKey
ALTER TABLE "BusinessSetting" ADD CONSTRAINT "BusinessSetting_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalSchedule" ADD CONSTRAINT "ProfessionalSchedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeave" ADD CONSTRAINT "StaffLeave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeave" ADD CONSTRAINT "StaffLeave_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowConfiguration" ADD CONSTRAINT "WorkflowConfiguration_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
