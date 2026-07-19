-- Multi-location architecture: branches, staff links, location-scoped settings/queue

-- Location (branch) table
CREATE TABLE IF NOT EXISTS "Location" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "email" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Location_clinicId_idx" ON "Location"("clinicId");

DO $$ BEGIN
  ALTER TABLE "Location" ADD CONSTRAINT "Location_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed a default branch per clinic that has none
INSERT INTO "Location" ("id", "clinicId", "name", "address", "city", "state", "country", "postalCode", "contactNumber", "email", "status", "updatedAt")
SELECT c."id" || '-main', c."id", COALESCE(c."name", 'Main Branch') || ' Main', COALESCE(c."address", 'Address pending'), 'Bengaluru', 'Karnataka', 'India', '560001', '+919999999999', NULL, 'ACTIVE', NOW()
FROM "Clinic" c
WHERE NOT EXISTS (SELECT 1 FROM "Location" l WHERE l."clinicId" = c."id");

-- UserLocation
CREATE TABLE IF NOT EXISTS "UserLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserLocation_userId_locationId_key" ON "UserLocation"("userId", "locationId");
CREATE INDEX IF NOT EXISTS "UserLocation_userId_idx" ON "UserLocation"("userId");
CREATE INDEX IF NOT EXISTS "UserLocation_locationId_idx" ON "UserLocation"("locationId");

DO $$ BEGIN
  ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DoctorLocation
CREATE TABLE IF NOT EXISTS "DoctorLocation" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoctorLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DoctorLocation_doctorId_locationId_key" ON "DoctorLocation"("doctorId", "locationId");
CREATE INDEX IF NOT EXISTS "DoctorLocation_doctorId_idx" ON "DoctorLocation"("doctorId");
CREATE INDEX IF NOT EXISTS "DoctorLocation_locationId_idx" ON "DoctorLocation"("locationId");

DO $$ BEGIN
  ALTER TABLE "DoctorLocation" ADD CONSTRAINT "DoctorLocation_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DoctorLocation" ADD CONSTRAINT "DoctorLocation_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill staff location links
INSERT INTO "UserLocation" ("id", "userId", "locationId")
SELECT gen_random_uuid()::text, u."id", l."id"
FROM "User" u
JOIN LATERAL (
  SELECT l2."id" FROM "Location" l2
  WHERE l2."clinicId" = u."clinicId" AND l2."status" = 'ACTIVE'
  ORDER BY l2."createdAt" ASC LIMIT 1
) l ON true
WHERE u."clinicId" IS NOT NULL
  AND u."role" IN ('RECEPTIONIST', 'CLINIC_ADMIN', 'MANAGER')
  AND NOT EXISTS (SELECT 1 FROM "UserLocation" ul WHERE ul."userId" = u."id")
ON CONFLICT DO NOTHING;

INSERT INTO "DoctorLocation" ("id", "doctorId", "locationId")
SELECT gen_random_uuid()::text, d."id", l."id"
FROM "Doctor" d
JOIN LATERAL (
  SELECT l2."id" FROM "Location" l2
  WHERE l2."clinicId" = d."clinicId" AND l2."status" = 'ACTIVE'
  ORDER BY l2."createdAt" ASC LIMIT 1
) l ON true
WHERE d."clinicId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "DoctorLocation" dl WHERE dl."doctorId" = d."id")
ON CONFLICT DO NOTHING;

-- Migrate ReceptionistAssignment from clinicId to locationId if old column exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ReceptionistAssignment' AND column_name = 'clinicId'
  ) THEN
    ALTER TABLE "ReceptionistAssignment" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

    UPDATE "ReceptionistAssignment" ra
    SET "locationId" = l."id"
    FROM LATERAL (
      SELECT l2."id" FROM "Location" l2
      WHERE l2."clinicId" = ra."clinicId"
      ORDER BY l2."createdAt" ASC LIMIT 1
    ) l
    WHERE ra."locationId" IS NULL;

    ALTER TABLE "ReceptionistAssignment" DROP CONSTRAINT IF EXISTS "ReceptionistAssignment_clinicId_fkey";
    DROP INDEX IF EXISTS "ReceptionistAssignment_clinicId_idx";
    DROP INDEX IF EXISTS "ReceptionistAssignment_receptionistId_doctorId_key";
    ALTER TABLE "ReceptionistAssignment" DROP COLUMN IF EXISTS "clinicId";

    ALTER TABLE "ReceptionistAssignment" ALTER COLUMN "locationId" SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS "ReceptionistAssignment_receptionistId_doctorId_locationId_key"
      ON "ReceptionistAssignment"("receptionistId", "doctorId", "locationId");
    CREATE INDEX IF NOT EXISTS "ReceptionistAssignment_locationId_idx" ON "ReceptionistAssignment"("locationId");

    ALTER TABLE "ReceptionistAssignment" ADD CONSTRAINT "ReceptionistAssignment_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Migrate BusinessSetting from clinicId to locationId
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BusinessSetting' AND column_name = 'clinicId'
  ) THEN
    ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

    INSERT INTO "BusinessSetting" ("id", "locationId", "businessType", "queueMode", "appointmentMode", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, l."id", COALESCE(bs."businessType", 'CLINIC'), COALESCE(bs."queueMode", 'LIVE_QUEUE'), COALESCE(bs."appointmentMode", 'HYBRID'), NOW(), NOW()
    FROM "Location" l
    LEFT JOIN "BusinessSetting" bs ON bs."clinicId" = l."clinicId"
    WHERE NOT EXISTS (SELECT 1 FROM "BusinessSetting" b2 WHERE b2."locationId" = l."id");

    ALTER TABLE "BusinessSetting" DROP CONSTRAINT IF EXISTS "BusinessSetting_clinicId_fkey";
    DROP INDEX IF EXISTS "BusinessSetting_clinicId_key";
    ALTER TABLE "BusinessSetting" DROP COLUMN IF EXISTS "clinicId";

    CREATE UNIQUE INDEX IF NOT EXISTS "BusinessSetting_locationId_key" ON "BusinessSetting"("locationId");
    ALTER TABLE "BusinessSetting" ADD CONSTRAINT "BusinessSetting_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- QueueEntry.locationId backfill
ALTER TABLE "QueueEntry" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "QueueEntry" qe
SET "locationId" = dl."locationId"
FROM "DoctorLocation" dl
WHERE qe."doctorId" = dl."doctorId" AND qe."locationId" IS NULL;

UPDATE "QueueEntry" qe
SET "locationId" = l."id"
FROM "Doctor" d
JOIN LATERAL (
  SELECT l2."id" FROM "Location" l2
  WHERE l2."clinicId" = d."clinicId"
  ORDER BY l2."createdAt" ASC LIMIT 1
) l ON true
WHERE qe."doctorId" = d."id" AND qe."locationId" IS NULL;

DO $$ BEGIN
  ALTER TABLE "QueueEntry" ALTER COLUMN "locationId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "QueueEntry_locationId_idx" ON "QueueEntry"("locationId");

DO $$ BEGIN
  ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- InviteCode locationId migration
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'InviteCode' AND column_name = 'clinicId'
  ) THEN
    ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
    UPDATE "InviteCode" ic SET "locationId" = l."id"
    FROM LATERAL (
      SELECT l2."id" FROM "Location" l2 WHERE l2."clinicId" = ic."clinicId" ORDER BY l2."createdAt" ASC LIMIT 1
    ) l WHERE ic."locationId" IS NULL;
    ALTER TABLE "InviteCode" DROP CONSTRAINT IF EXISTS "InviteCode_clinicId_fkey";
    DROP INDEX IF EXISTS "InviteCode_clinicId_idx";
    ALTER TABLE "InviteCode" DROP COLUMN IF EXISTS "clinicId";
    ALTER TABLE "InviteCode" ALTER COLUMN "locationId" SET NOT NULL;
    ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Location optional email + geo columns on existing tables
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "Location" ALTER COLUMN "email" DROP NOT NULL;
