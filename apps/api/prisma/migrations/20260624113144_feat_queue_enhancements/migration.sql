-- CreateEnum
CREATE TYPE "SlotType" AS ENUM ('NEW', 'FOLLOWUP');

-- AlterEnum
ALTER TYPE "EntryStatus" ADD VALUE 'MISSED';

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "breakNote" TEXT,
ADD COLUMN     "breakUntil" TIMESTAMP(3),
ADD COLUMN     "followUpEvery" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "missedGap" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "walkinGap" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN     "slotType" "SlotType" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "sortOrder" DOUBLE PRECISION;
