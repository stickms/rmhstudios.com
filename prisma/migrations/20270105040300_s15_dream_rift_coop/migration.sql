-- Dream Rift co-op runs the hub vouches for (s15-09): the hub writes the row when a co-op game starts and the host
-- finishes it once. Additive: three nullable or defaulted columns, no rewrite of existing rows (rows written before
-- this have a NULL "startedAt" and an empty "memberIds").
ALTER TABLE "DreamRiftCoopRun" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "DreamRiftCoopRun" ADD COLUMN "finishedAt" TIMESTAMP(3);
ALTER TABLE "DreamRiftCoopRun" ADD COLUMN "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
