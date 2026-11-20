-- RMH Med Schools SDN: park a thread that is gone (404) or keeps failing; the live job retries it after 24 h.
-- Additive: one nullable column and one defaulted column.
-- AlterTable
ALTER TABLE "med_sdn_thread" ADD COLUMN     "failCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parkedAt" TIMESTAMP(3);
