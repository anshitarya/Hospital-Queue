-- Fix Visit, WorkflowConfiguration, and ProfessionalRating table schemas: migrate clinicId to locationId

-- 1. Visit table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Visit' AND column_name = 'clinicId'
  ) THEN
    ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

    UPDATE "Visit"
    SET "locationId" = (
      SELECT l."id" FROM "Location" l
      WHERE l."clinicId" = "Visit"."clinicId"
      ORDER BY l."createdAt" ASC LIMIT 1
    )
    WHERE "locationId" IS NULL;

    ALTER TABLE "Visit" DROP CONSTRAINT IF EXISTS "Visit_clinicId_fkey";
    DROP INDEX IF EXISTS "Visit_clinicId_serviceDay_idx";
    ALTER TABLE "Visit" DROP COLUMN IF EXISTS "clinicId";
  END IF;
END $$;

-- Ensure locationId column exists on Visit and is linked to Location
ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "Visit"
SET "locationId" = (
  SELECT l."id" FROM "Location" l
  LIMIT 1
)
WHERE "locationId" IS NULL;

DO $$ BEGIN
  ALTER TABLE "Visit" ALTER COLUMN "locationId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Visit_locationId_serviceDay_idx" ON "Visit"("locationId", "serviceDay");

DO $$ BEGIN
  ALTER TABLE "Visit" ADD CONSTRAINT "Visit_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 2. WorkflowConfiguration table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WorkflowConfiguration' AND column_name = 'clinicId'
  ) THEN
    ALTER TABLE "WorkflowConfiguration" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

    UPDATE "WorkflowConfiguration"
    SET "locationId" = (
      SELECT l."id" FROM "Location" l
      WHERE l."clinicId" = "WorkflowConfiguration"."clinicId"
      ORDER BY l."createdAt" ASC LIMIT 1
    )
    WHERE "locationId" IS NULL;

    ALTER TABLE "WorkflowConfiguration" DROP CONSTRAINT IF EXISTS "WorkflowConfiguration_clinicId_fkey";
    DROP INDEX IF EXISTS "WorkflowConfiguration_clinicId_key";
    ALTER TABLE "WorkflowConfiguration" DROP COLUMN IF EXISTS "clinicId";
  END IF;
END $$;

-- Ensure locationId column exists on WorkflowConfiguration and is unique
ALTER TABLE "WorkflowConfiguration" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "WorkflowConfiguration"
SET "locationId" = (
  SELECT l."id" FROM "Location" l
  LIMIT 1
)
WHERE "locationId" IS NULL;

DO $$ BEGIN
  ALTER TABLE "WorkflowConfiguration" ALTER COLUMN "locationId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowConfiguration_locationId_key" ON "WorkflowConfiguration"("locationId");

DO $$ BEGIN
  ALTER TABLE "WorkflowConfiguration" ADD CONSTRAINT "WorkflowConfiguration_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 3. ProfessionalRating table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProfessionalRating' AND column_name = 'clinicId'
  ) THEN
    ALTER TABLE "ProfessionalRating" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

    UPDATE "ProfessionalRating"
    SET "locationId" = (
      SELECT l."id" FROM "Location" l
      WHERE l."clinicId" = "ProfessionalRating"."clinicId"
      ORDER BY l."createdAt" ASC LIMIT 1
    )
    WHERE "locationId" IS NULL;

    ALTER TABLE "ProfessionalRating" DROP CONSTRAINT IF EXISTS "ProfessionalRating_clinicId_fkey";
    DROP INDEX IF EXISTS "ProfessionalRating_clinicId_idx";
    ALTER TABLE "ProfessionalRating" DROP COLUMN IF EXISTS "clinicId";
  END IF;
END $$;

-- Ensure locationId column exists on ProfessionalRating and is indexed
ALTER TABLE "ProfessionalRating" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "ProfessionalRating"
SET "locationId" = (
  SELECT l."id" FROM "Location" l
  LIMIT 1
)
WHERE "locationId" IS NULL;

DO $$ BEGIN
  ALTER TABLE "ProfessionalRating" ALTER COLUMN "locationId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProfessionalRating_locationId_idx" ON "ProfessionalRating"("locationId");

DO $$ BEGIN
  ALTER TABLE "ProfessionalRating" ADD CONSTRAINT "ProfessionalRating_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
