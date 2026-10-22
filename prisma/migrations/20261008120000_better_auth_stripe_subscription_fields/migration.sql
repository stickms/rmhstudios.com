-- @better-auth/stripe 1.7 tracks scheduled and completed cancellation, the
-- billing interval and subscription schedules on its `subscription` model, and
-- refuses to start ("Prisma schema mismatch") until the columns exist.
--
-- Safe under blue/green: five nullable columns with no default. The old image's
-- Prisma client never names them, and the new plugin treats NULL as unset.
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingInterval" TEXT,
ADD COLUMN     "cancelAt" TIMESTAMP(3),
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "stripeScheduleId" TEXT;
