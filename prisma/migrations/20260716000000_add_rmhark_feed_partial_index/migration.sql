-- Partial index backing the For-You / Following feed scan.
--
-- The feed query orders by ("createdAt" DESC, "id" DESC) and then filters out
-- deleted posts, community posts, and thread follow-up segments. Those excluded
-- rows still live in the full "rmheet_createdAt_id_idx", so when the recent
-- window is dominated by them (a burst of thread segments or community posts),
-- the ordered index scan has to walk over many non-eligible entries to collect
-- one page of visible posts — the intermittent "feed takes forever" tail.
--
-- This partial index contains ONLY feed-eligible rows, already ordered, so the
-- scan reads a tight pre-filtered stream. Per-viewer predicates (audience,
-- muted/blocked authors) are still applied on top, but over a much smaller set.
--
-- NOTE: Prisma's schema DSL cannot express a partial (filtered) index, so this
-- is a hand-written migration and is intentionally NOT mirrored in
-- schema.prisma. `prisma migrate deploy` (the production path) applies it as a
-- pending migration with no schema diffing. A local `prisma migrate dev` /
-- `db push`, which DOES diff against schema.prisma, may try to generate a DROP
-- for this index — do not accept that drop; keep the index.
--
-- Uses a plain CREATE INDEX (not CONCURRENTLY) to match this repo's existing
-- index migrations on "rmheet" and to stay compatible with how Prisma applies
-- migrations. It briefly blocks writes to "rmheet" while building; run during a
-- low-traffic window, or build it manually with CREATE INDEX CONCURRENTLY and
-- then `prisma migrate resolve --applied` this migration if you need zero lock.
CREATE INDEX IF NOT EXISTS "rmheet_feed_scan_idx"
  ON "rmheet" ("createdAt" DESC, "id" DESC)
  WHERE "deletedAt" IS NULL AND "communityId" IS NULL AND "threadRootId" IS NULL;
