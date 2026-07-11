-- Backfill Customer PINs for any legacy patients that still lack one.
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
