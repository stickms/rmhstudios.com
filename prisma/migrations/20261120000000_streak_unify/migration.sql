-- Expand step: one Streak model keyed by ("userId", "kind"). The account
-- check-in streak ("daily_streak") becomes kind 'daily' and the arcade
-- challenge streak ("arcade_streak") becomes kind 'arcade'. Field map:
--   daily_streak:  current, longest, lastDateKey -> lastDay, lastCheckIn,
--                  totalCheckIns -> totalDays, freezeTokens, createdAt, updatedAt
--   arcade_streak: current, best -> longest, lastDay, updatedAt -> lastCheckIn
--                  (it kept no timestamp of its own), totalDays 0 (it kept no
--                  total; nothing reads it for 'arcade'), updatedAt -> createdAt
--
-- Additive only. The previous release keeps reading and writing the old tables
-- while the blue/green swap runs, so they are dropped in a LATER release
-- (contract), which must first re-run both copy statements below. The key is
-- the natural one, ("userId", kind), so no ids are invented. A re-run is
-- idempotent and reconciles: a row whose old-table copy was written AFTER the
-- new row (old "updatedAt" later) takes the old row's state, because the old
-- release was the last to touch that streak, while "longest" and "totalDays"
-- keep the larger of the two. Equal "updatedAt" (nothing changed since the
-- copy) matches no row, so running this twice changes nothing.

-- CreateTable
CREATE TABLE "streak" (
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "lastDay" VARCHAR(10),
    "lastCheckIn" TIMESTAMP(3),
    "totalDays" INTEGER NOT NULL DEFAULT 0,
    "freezeTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streak_pkey" PRIMARY KEY ("userId","kind")
);

-- CreateIndex
CREATE INDEX "streak_kind_lastCheckIn_idx" ON "streak"("kind", "lastCheckIn");

-- AddForeignKey
ALTER TABLE "streak" ADD CONSTRAINT "streak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Copy (idempotent + reconciling; re-run it before the contract drops the old tables) ───

INSERT INTO "streak" (
  "userId", "kind", "current", "longest", "lastDay", "lastCheckIn",
  "totalDays", "freezeTokens", "createdAt", "updatedAt"
)
SELECT
  d."userId", 'daily', d."current", d."longest", d."lastDateKey", d."lastCheckIn",
  d."totalCheckIns", d."freezeTokens", d."createdAt", d."updatedAt"
FROM "daily_streak" AS d
ON CONFLICT ("userId", "kind") DO UPDATE SET
  "current"      = EXCLUDED."current",
  "lastDay"      = EXCLUDED."lastDay",
  "lastCheckIn"  = EXCLUDED."lastCheckIn",
  "freezeTokens" = EXCLUDED."freezeTokens",
  "longest"      = GREATEST("streak"."longest", EXCLUDED."longest"),
  "totalDays"    = GREATEST("streak"."totalDays", EXCLUDED."totalDays"),
  "updatedAt"    = EXCLUDED."updatedAt"
WHERE EXCLUDED."updatedAt" > "streak"."updatedAt";

INSERT INTO "streak" (
  "userId", "kind", "current", "longest", "lastDay", "lastCheckIn",
  "totalDays", "freezeTokens", "createdAt", "updatedAt"
)
SELECT
  a."userId", 'arcade', a."current", a."best", a."lastDay", a."updatedAt",
  0, 0, a."updatedAt", a."updatedAt"
FROM "arcade_streak" AS a
ON CONFLICT ("userId", "kind") DO UPDATE SET
  "current"     = EXCLUDED."current",
  "lastDay"     = EXCLUDED."lastDay",
  "lastCheckIn" = EXCLUDED."lastCheckIn",
  "longest"     = GREATEST("streak"."longest", EXCLUDED."longest"),
  "updatedAt"   = EXCLUDED."updatedAt"
WHERE EXCLUDED."updatedAt" > "streak"."updatedAt";
