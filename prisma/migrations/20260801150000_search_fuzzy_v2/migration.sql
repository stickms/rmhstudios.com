-- Universal search v2: accent-folded trigram indexes across every searchable
-- corpus, and — the actual bug this fixes — an index on the column that holds a
-- user's *display name*.
--
-- `resolveUser()` renders `user_profile."displayName" ?? "user".name`, but the
-- people query only ever looked at "user".name/username/handle. A user who set a
-- display name was therefore unfindable by the only name the site ever shows for
-- them. `user_profile` is now joined into the people search, so it needs the same
-- trigram treatment the "user" columns already had.
--
-- NOTE: hand-written, intentionally NOT mirrored in schema.prisma (Prisma's DSL
-- cannot express pg_trgm GIN indexes, expression indexes, or extensions), exactly
-- like 20260717110700_add_search_trgm_fts. A local `prisma migrate dev` /
-- `db push` may propose DROPs for everything below — DO NOT accept those drops.
--
-- Consumed by lib/search/*.server.ts via raw SQL.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- `unaccent` is a trusted extension on PG13+, so the database owner can install
-- it without superuser. It is still wrapped: on a hardened cluster that refuses
-- the CREATE, search degrades to plain lower() folding rather than failing the
-- deploy.
DO $outer$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
    RAISE NOTICE 'unaccent unavailable — search normalisation falls back to lower()';
END
$outer$;

-- The normalisation used by BOTH the indexes below and every search query.
-- Index and query must call the identical function or the planner won't use the
-- index, so this is the single definition of "how text is folded for search".
--
-- IMMUTABLE is asserted, not proven: unaccent() is STABLE because its dictionary
-- could in principle be redefined. This is the standard documented workaround for
-- accent-insensitive indexes — it is safe as long as nobody redefines the
-- `unaccent` dictionary. If that ever happens, REINDEX the indexes below.
DO $outer$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'unaccent' AND p.pronargs = 2 AND n.nspname = 'public'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.rmh_search_norm(txt text)
      RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      AS $body$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, txt)) $body$;
    $fn$;
  ELSE
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.rmh_search_norm(txt text)
      RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      AS $body$ SELECT lower(txt) $body$;
    $fn$;
  END IF;
END
$outer$;

-- ─── People ──────────────────────────────────────────────────────────────────
-- Normalised replacements for the lower()-only indexes added in
-- 20260717110700. The originals are deliberately left in place: other callers
-- still issue lower()-based predicates, and dropping them would silently
-- de-index those.

CREATE INDEX IF NOT EXISTS "user_name_norm_trgm_idx"
  ON "user" USING gin (public.rmh_search_norm("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "user_username_norm_trgm_idx"
  ON "user" USING gin (public.rmh_search_norm("username") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "user_handle_norm_trgm_idx"
  ON "user" USING gin (public.rmh_search_norm("handle") gin_trgm_ops);

-- The fix: display names are searchable.
CREATE INDEX IF NOT EXISTS "user_profile_display_name_trgm_idx"
  ON "user_profile" USING gin (public.rmh_search_norm("displayName") gin_trgm_ops);
-- Bios make people discoverable by what they do, not just what they're called.
CREATE INDEX IF NOT EXISTS "user_profile_bio_trgm_idx"
  ON "user_profile" USING gin (public.rmh_search_norm("bio") gin_trgm_ops);

-- ─── Posts ───────────────────────────────────────────────────────────────────
-- content_tsv + rmheet_content_trgm_idx already exist (20260717110700). Add the
-- normalised trigram variant so accent-folded substring matching is indexed too.
CREATE INDEX IF NOT EXISTS "rmheet_content_norm_trgm_idx"
  ON "rmheet" USING gin (public.rmh_search_norm("content") gin_trgm_ops);

-- ─── Long-form corpora ───────────────────────────────────────────────────────
-- Blog, news, builds and library documents were only reachable through
-- `contains` (a leading-wildcard ILIKE — unindexable, and zero typo tolerance).
-- Trigram indexes on the normalised title/description make the fuzzy candidate
-- sweep indexable.

CREATE INDEX IF NOT EXISTS "blog_post_title_trgm_idx"
  ON "blog_post" USING gin (public.rmh_search_norm("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "blog_post_description_trgm_idx"
  ON "blog_post" USING gin (public.rmh_search_norm("description") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "news_article_title_trgm_idx"
  ON "news_article" USING gin (public.rmh_search_norm("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "news_article_description_trgm_idx"
  ON "news_article" USING gin (public.rmh_search_norm("description") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "user_build_title_trgm_idx"
  ON "user_build" USING gin (public.rmh_search_norm("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "user_build_description_trgm_idx"
  ON "user_build" USING gin (public.rmh_search_norm("description") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "library_document_title_trgm_idx"
  ON "library_document" USING gin (public.rmh_search_norm("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "library_document_description_trgm_idx"
  ON "library_document" USING gin (public.rmh_search_norm("description") gin_trgm_ops);
