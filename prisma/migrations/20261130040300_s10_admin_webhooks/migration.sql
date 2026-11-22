-- Webhook oversight for admins (s10-15): an admin can switch an endpoint off with a reason the owner reads.
-- Three nullable columns, no default, no backfill.

-- AlterTable
ALTER TABLE "webhook_endpoint" ADD COLUMN     "adminDisabledAt" TIMESTAMP(3),
ADD COLUMN     "adminDisabledReason" VARCHAR(300),
ADD COLUMN     "adminDisabledById" TEXT;
