-- RMH Med Schools: Admit.org profile-history backfill progress and the persisted daily request budget. Additive only:
-- two tables, no change to any existing one.
-- It holds a keyed hash of an Admit member id (never the id) and whether that member's history was ingested, so a
-- deploy or restart resumes the backfill instead of restarting it, and the live feed never fetches a member twice.

-- CreateTable
CREATE TABLE "med_admit_member" (
    "memberHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DONE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "med_admit_member_pkey" PRIMARY KEY ("memberHash")
);

-- CreateIndex
CREATE INDEX "med_admit_member_updatedAt_idx" ON "med_admit_member"("updatedAt");

-- CreateTable: requests per source host (or per job quota) per UTC day; the day's budget survives a restart.
CREATE TABLE "med_request_budget" (
    "key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,

CONSTRAINT "med_request_budget_pkey" PRIMARY KEY ("key","day")
);
