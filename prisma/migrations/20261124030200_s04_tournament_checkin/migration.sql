-- Optional tournament check-in: a window before startsAt, when the cron told entrants,
-- and when each entrant checked in. Additive: nullable columns; the cron's index is built CONCURRENTLY by the next migration.
-- AlterTable
ALTER TABLE "tournament" ADD COLUMN     "checkInMinutes" INTEGER,
ADD COLUMN     "checkInNoticeAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tournament_entrant" ADD COLUMN     "checkedInAt" TIMESTAMP(3);

