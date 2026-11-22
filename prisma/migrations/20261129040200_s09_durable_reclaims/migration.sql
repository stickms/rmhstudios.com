-- Reclaims count attempts, not minutes (s09-13): when a runner last took the lease, and when a reclaim last counted.
ALTER TABLE "bulk_operation" ADD COLUMN "claimedAt" TIMESTAMP(3), ADD COLUMN "reclaimedAt" TIMESTAMP(3);
ALTER TABLE "fanout_run" ADD COLUMN "claimedAt" TIMESTAMP(3), ADD COLUMN "reclaimedAt" TIMESTAMP(3);
ALTER TABLE "moderation_sweep" ADD COLUMN "claimedAt" TIMESTAMP(3), ADD COLUMN "reclaimedAt" TIMESTAMP(3);
