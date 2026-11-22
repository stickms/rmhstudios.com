-- Durable bulk clean-ups (s07-15): a heartbeat lease, a persisted cursor and a reclaim count on bulk_operation,
-- so a run that a restart interrupted is picked up where it stopped and never loops forever.
-- AlterTable
ALTER TABLE "bulk_operation" ADD COLUMN     "cursorId" VARCHAR(40),
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "reclaims" INTEGER NOT NULL DEFAULT 0;

