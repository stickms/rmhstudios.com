-- migration-safety: acknowledged[create-index-not-concurrent] altair_solo_run was created in 20261103160000 (same day) and holds one row per solo run, so the index build is instantaneous
-- AlterTable
ALTER TABLE "altair_solo_run" ADD COLUMN "firstClearBonus" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "altair_solo_run_userId_classId_firstClearBonus_idx" ON "altair_solo_run"("userId", "classId", "firstClearBonus");
