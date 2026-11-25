-- RMHLadder own jobs (s13-08): a member can track a job they found elsewhere. The row is a normal ladder_job /
-- ladder_company row with an owner; the shared catalogue keeps a NULL owner, so every catalogue reader filters on it.
-- Additive and nullable: no backfill, no rewrite of the existing rows.
ALTER TABLE "ladder_job" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "ladder_company" ADD COLUMN "ownerId" TEXT;

ALTER TABLE "ladder_job" ADD CONSTRAINT "ladder_job_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_company" ADD CONSTRAINT "ladder_company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
