-- Partial index for the vibe-worker poll (go-services/internal/vibeworker/repo.go
-- SelectStale), which runs every 10 s (8,640 a day):
--
--   SELECT "id","slug","html","updatedAt" FROM "vibe_page"
--    WHERE "thumbnailStale" = true ORDER BY "updatedAt" ASC LIMIT $1
--
-- Only rows awaiting a screenshot are indexed, so the index is nearly empty in
-- steady state and the poll becomes a one-buffer probe instead of a Seq Scan.
-- Write cost: an insert or an update that flips thumbnailStale true/false adds
-- or removes one entry; the vast majority of vibe_page writes touch no indexed
-- row. See docs/server-perf-2026-10-21/results/ws-9.md.
--
-- NOT mirrored in schema.prisma: Prisma cannot express partial indexes (same as
-- rmheet_feed_scan_idx). A local `migrate dev` may propose dropping
-- vibe_page_stale_updated_idx; do not accept that.
--
-- CONCURRENTLY cannot run inside a multi-statement migration transaction, so
-- this file holds exactly ONE statement and nothing else.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "vibe_page_stale_updated_idx"
  ON "vibe_page" ("updatedAt")
  WHERE "thumbnailStale" = true;
