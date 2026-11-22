-- Who gave a speedrun its human verdict, and when (the admin review queue, sprint 10 16). Additive and nullable.
ALTER TABLE "speedrun_entry" ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);
