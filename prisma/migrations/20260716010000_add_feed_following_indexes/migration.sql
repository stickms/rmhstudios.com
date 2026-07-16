-- Feed read-path indexes (mirrors the @@index additions in schema.prisma).
--
-- 1. Following feed: `rMHark.findMany({ where: { userId: { in: [...] }, ... },
--    orderBy: [{ createdAt: desc }, { id: desc }] })` had no per-author ordered
--    index, so a followed-authors page fell back to sorting after a wider scan.
-- 2. Following reposts: same shape on the repost branch.
-- 3. Interest profile: `rMHarkLike.findMany({ where: { userId }, orderBy:
--    { createdAt: desc }, take: 80 })` had ONLY the (rmheetId, userId) unique
--    constraint to work with — no usable index for a per-viewer recent-likes
--    scan, so a cold profile build scanned the likes table.

CREATE INDEX "rmheet_userId_createdAt_id_idx" ON "rmheet"("userId", "createdAt" DESC, "id" DESC);

CREATE INDEX "rmheet_repost_userId_createdAt_id_idx" ON "rmheet_repost"("userId", "createdAt" DESC, "id" DESC);

CREATE INDEX "rmheet_like_userId_createdAt_idx" ON "rmheet_like"("userId", "createdAt" DESC);
