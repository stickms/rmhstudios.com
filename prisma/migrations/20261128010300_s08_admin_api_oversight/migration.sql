-- Admin oversight of developer API keys: a suspension (when and why, shown to the owner only)
-- and an admin per-minute rate cap. Additive nullable columns; no data change.

-- AlterTable
ALTER TABLE "developer_api_key" ADD COLUMN     "adminRateLimitPerMinute" INTEGER,
ADD COLUMN     "suspendReason" VARCHAR(500),
ADD COLUMN     "suspendedAt" TIMESTAMP(3);
