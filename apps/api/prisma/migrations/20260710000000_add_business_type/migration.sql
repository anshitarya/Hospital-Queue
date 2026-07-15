CREATE TYPE "BusinessType" AS ENUM ('CLINIC', 'SALON', 'BANK', 'GOVT');
ALTER TABLE "Clinic" ADD COLUMN "businessType" "BusinessType" NOT NULL DEFAULT 'CLINIC';
