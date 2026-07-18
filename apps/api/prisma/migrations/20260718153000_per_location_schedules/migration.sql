-- Per-branch professional schedules
ALTER TABLE "ProfessionalSchedule" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "ProfessionalSchedule" ps
SET "locationId" = dl."locationId"
FROM "DoctorLocation" dl
WHERE ps."doctorId" = dl."doctorId" AND ps."locationId" IS NULL;

UPDATE "ProfessionalSchedule" ps
SET "locationId" = l."id"
FROM "Doctor" d
JOIN LATERAL (
  SELECT l2."id" FROM "Location" l2
  WHERE l2."clinicId" = d."clinicId" AND l2."status" = 'ACTIVE'
  ORDER BY l2."createdAt" ASC LIMIT 1
) l ON true
WHERE ps."doctorId" = d."id" AND ps."locationId" IS NULL;

DELETE FROM "ProfessionalSchedule" WHERE "locationId" IS NULL;

ALTER TABLE "ProfessionalSchedule" ALTER COLUMN "locationId" SET NOT NULL;

DROP INDEX IF EXISTS "ProfessionalSchedule_doctorId_idx";
CREATE INDEX IF NOT EXISTS "ProfessionalSchedule_doctorId_locationId_idx"
  ON "ProfessionalSchedule"("doctorId", "locationId");
CREATE INDEX IF NOT EXISTS "ProfessionalSchedule_locationId_idx"
  ON "ProfessionalSchedule"("locationId");

DO $$ BEGIN
  ALTER TABLE "ProfessionalSchedule" ADD CONSTRAINT "ProfessionalSchedule_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
