-- AlterTable
ALTER TABLE "altair_match" ADD COLUMN "runId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "altair_match_runId_key" ON "altair_match"("runId");
