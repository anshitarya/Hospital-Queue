-- Change missedGap default from 3 → 4 so rejoin inserts "after 3 patients"
-- (same semantics as walkinGap=4 which also inserts after every 3 patients).
ALTER TABLE "Doctor" ALTER COLUMN "missedGap" SET DEFAULT 4;
UPDATE "Doctor" SET "missedGap" = 4 WHERE "missedGap" = 3;
