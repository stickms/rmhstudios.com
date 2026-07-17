-- Search indexes: replace leading-wildcard ILIKE '%q%' scans (people search,
-- post search) with indexable trigram + full-text search.
--
-- NOTE: hand-written, intentionally NOT mirrored in schema.prisma (Prisma's DSL
-- cannot express pg_trgm GIN indexes or a GENERATED tsvector column). Like the
-- existing rmheet_feed_scan_idx migration, the production path (prisma migrate
-- deploy) applies this with no diffing; a local `prisma migrate dev` / `db push`
-- may propose DROPs for the trigram indexes and content_tsv column — DO NOT
-- accept those drops, keep them.
--
-- Consumed by app/routes/api/search.ts, app/routes/api/users/search.ts, and the
-- feed search branch via raw SQL (similarity() / websearch_to_tsquery).

-- Trigram matching for people search (name / username / handle).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "user_name_trgm_idx"
  ON "user" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "user_username_trgm_idx"
  ON "user" USING gin (lower("username") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "user_handle_trgm_idx"
  ON "user" USING gin (lower("handle") gin_trgm_ops);

-- Full-text search over post content. A STORED generated tsvector keeps the
-- index maintained automatically on insert/update with no application code.
ALTER TABLE "rmheet"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content", ''))) STORED;

CREATE INDEX IF NOT EXISTS "rmheet_content_tsv_idx"
  ON "rmheet" USING gin ("content_tsv");

-- Trigram over post content as a fallback for short / partial-token queries
-- (websearch_to_tsquery is word-boundary based; trigram catches substrings).
CREATE INDEX IF NOT EXISTS "rmheet_content_trgm_idx"
  ON "rmheet" USING gin (lower("content") gin_trgm_ops);
