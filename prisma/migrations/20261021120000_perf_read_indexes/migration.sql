-- Read-path indexes from the 2026-10 latency pass.
--
--   * rmheet_like (rmheetId, createdAt DESC) — "who liked this post" /
--     insights scans (where rmheetId, order by createdAt desc) had only the
--     (rmheetId, userId) unique index, which cannot serve the ordering.
--   * direct_message (conversationId, read, senderId) — the unread-badge count
--     (messages/unread-count, messages/stream, the conversation list groupBy)
--     filters on exactly these three columns.
--   * user_inventory (userId, equipped) — "what is this user wearing" reads.
--   * "user" btree on lower("handle") — @mention resolution matches
--     lower("handle") = ANY(...) (lib/handles/lookup.server.ts). The existing
--     user_handle_norm_trgm_idx is a trigram GIN and cannot serve equality.
--
-- NOT mirrored in schema.prisma: user_handle_lower_idx (Prisma cannot express
-- expression indexes — same as the *_norm_trgm_idx family). A local
-- `migrate dev` may propose dropping it; do not accept that.
--
-- The feed-root partial index (createdAt DESC, id DESC WHERE deletedAt IS NULL
-- AND communityId IS NULL AND threadRootId IS NULL) already ships as
-- rmheet_feed_scan_idx (20260716000000_add_rmhark_feed_partial_index).
--
-- migration-safety: acknowledged[create-index-not-concurrent] CREATE INDEX
-- CONCURRENTLY cannot run inside the transaction Prisma wraps a migration in.
-- These four builds hold short SHARE locks, but on a very large rmheet_like or
-- direct_message prefer building them out of band off-peak, e.g.
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "<name>" ON ... ;
-- then `prisma migrate resolve --applied 20261021120000_perf_read_indexes`.
-- Every statement is IF NOT EXISTS so re-running over a pre-built index is safe.

CREATE INDEX IF NOT EXISTS "rmheet_like_rmheetId_createdAt_idx"
  ON "rmheet_like"("rmheetId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "direct_message_conversationId_read_senderId_idx"
  ON "direct_message"("conversationId", "read", "senderId");

CREATE INDEX IF NOT EXISTS "user_inventory_userId_equipped_idx"
  ON "user_inventory"("userId", "equipped");

CREATE INDEX IF NOT EXISTS "user_handle_lower_idx"
  ON "user" (lower("handle"));
