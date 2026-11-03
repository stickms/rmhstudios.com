-- AlterTable
ALTER TABLE "altair_solo_run" ADD COLUMN "firstClearBonus" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "altair_solo_run_userId_classId_firstClearBonus_idx" ON "altair_solo_run"("userId", "classId", "firstClearBonus");
