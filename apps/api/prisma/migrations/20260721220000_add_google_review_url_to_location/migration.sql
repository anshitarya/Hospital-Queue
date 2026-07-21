-- AlterTable Location: add googleReviewUrl column
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT;
