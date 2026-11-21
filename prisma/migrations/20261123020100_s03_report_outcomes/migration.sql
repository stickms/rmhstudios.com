-- Reporter outcomes: when the reporter was told a report was decided, and when they withdrew it.
-- The index behind "Your reports" is built concurrently by the next two migrations.

-- AlterTable
ALTER TABLE "content_report" ADD COLUMN     "reporterNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

-- Reports decided before this change are not announced retroactively.
UPDATE "content_report" SET "reporterNotifiedAt" = COALESCE("resolvedAt", "createdAt") WHERE "status" IN ('RESOLVED', 'DISMISSED');
