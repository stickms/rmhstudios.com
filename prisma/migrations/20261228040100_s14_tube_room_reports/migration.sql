-- RMHTube room reports (s14-10): a moderator who removes a reported room stamps when. Additive and nullable: no
-- backfill, no rewrite of existing rows, and no index (the readers already filter on "closedAt" and "isPublic").
ALTER TABLE "rmhtube_room" ADD COLUMN "moderatedAt" TIMESTAMP(3);
