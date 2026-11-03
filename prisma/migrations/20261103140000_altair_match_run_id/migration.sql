-- migration-safety: acknowledged[create-index-not-concurrent] altair_match is empty in every environment: nothing wrote it before this change (POST /api/altair/match was never called), so the build takes no measurable lock.

-- AlterTable
ALTER TABLE "altair_match" ADD COLUMN "runId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "altair_match_runId_key" ON "altair_match"("runId");
