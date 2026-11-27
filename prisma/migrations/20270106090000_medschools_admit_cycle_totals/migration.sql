-- RMH Med Schools: Admit's published per-school cycle totals (applications, interviews, acceptances, rejections).
-- Additive: one new table, nothing changed or dropped. Counts only; no person is stored.

-- CreateTable
CREATE TABLE "med_admit_cycle_total" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "applications" INTEGER,
    "interviews" INTEGER,
    "acceptances" INTEGER,
    "rejections" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_admit_cycle_total_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "med_admit_cycle_total_schoolId_cycleYear_key" ON "med_admit_cycle_total"("schoolId", "cycleYear");

-- AddForeignKey
ALTER TABLE "med_admit_cycle_total" ADD CONSTRAINT "med_admit_cycle_total_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
