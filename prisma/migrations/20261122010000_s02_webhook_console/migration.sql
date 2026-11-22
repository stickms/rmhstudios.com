-- Webhook console: a rotated secret keeps signing for 24 hours (previousSecret), and each
-- delivery records its latency and, for a redelivery, the delivery it re-sent.

-- AlterTable
ALTER TABLE "webhook_endpoint" ADD COLUMN     "previousSecret" VARCHAR(128),
ADD COLUMN     "previousSecretExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webhook_delivery" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "redeliveryOfId" VARCHAR(32);
