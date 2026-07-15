-- Add customerPin column and backfill existing patients with unique 4-digit PINs.
ALTER TABLE "User" ADD COLUMN "customerPin" TEXT;

DO $$
DECLARE
  r RECORD;
  new_pin TEXT;
BEGIN
  FOR r IN SELECT id FROM "User" WHERE role = 'PATIENT' AND "customerPin" IS NULL LOOP
    LOOP
      new_pin := lpad((floor(random() * 9000 + 1000))::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE "customerPin" = new_pin);
    END LOOP;
    UPDATE "User" SET "customerPin" = new_pin WHERE id = r.id;
  END LOOP;
END $$;

-- Remove the old argon2-hashed patient PIN column.
ALTER TABLE "User" DROP COLUMN IF EXISTS "patientPin";

-- Enforce global uniqueness of Customer PINs.
CREATE UNIQUE INDEX "User_customerPin_key" ON "User"("customerPin");
