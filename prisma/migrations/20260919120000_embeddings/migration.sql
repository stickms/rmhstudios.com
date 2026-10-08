-- Embeddings (M1): semantic retrieval beside the lexical search that has always
-- been the only one.
--
-- ## Why this whole migration is conditional
--
-- It needs pgvector, and the production database is NOT in docker-compose.yml
-- (the compose file has pgbouncer pointing at an external server), so nothing
-- in this repository can assert the extension is installed there. A migration
-- that hard-requires it would fail `prisma migrate deploy` — and because
-- migrations apply in order, that failure blocks every LATER migration too.
-- One unavailable extension would stop unrelated deploys indefinitely.
--
-- So: if pgvector is present, semantic search is fully set up. If it is not,
-- this migration applies cleanly and does nothing, and the site keeps exactly
-- the lexical search it has today. That matches how the FEATURE already
-- degrades — `isEmbeddingAvailable()` in lib/search/embeddings.server.ts is
-- false without EMBEDDING_API_KEY, and every caller falls back to lexical — so
-- the schema now degrades the same way the code does.
--
-- To turn it on: install pgvector on the server, then re-run this migration's
-- body (it is idempotent, every statement is IF NOT EXISTS).
--
-- migration-safety: acknowledged[create-index-not-concurrent] every index here
-- is on "embedding", a table this migration creates in the same transaction.
-- A SHARE lock on a table that does not yet exist outside this transaction
-- blocks nothing, and CREATE INDEX CONCURRENTLY cannot run inside the
-- transaction Prisma wraps a migration in anyway.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    RAISE NOTICE 'pgvector is not available; skipping the embedding table. Semantic search stays off and lexical search is unaffected.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS "embedding" (
      "id" TEXT NOT NULL,
      "kind" VARCHAR(24) NOT NULL,
      "entityId" VARCHAR(64) NOT NULL,
      "model" VARCHAR(64) NOT NULL,
      "dim" INTEGER NOT NULL,
      "vector" vector(1536) NOT NULL,
      "contentHash" VARCHAR(64) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,

      CONSTRAINT "embedding_pkey" PRIMARY KEY ("id")
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "embedding_kind_entityId_key" ON "embedding"("kind", "entityId");
  CREATE INDEX IF NOT EXISTS "embedding_kind_updatedAt_idx" ON "embedding"("kind", "updatedAt");

  -- The similarity index. HNSW rather than IVFFlat: IVFFlat needs a populated
  -- table to build meaningful lists, so building one here — against zero rows —
  -- produces an index that has to be rebuilt after the first backfill or it
  -- silently returns poor recall. HNSW builds incrementally and needs no such
  -- second step.
  --
  -- `vector_cosine_ops` because the query in embeddings.server.ts uses `<=>`
  -- (cosine distance). An index built for a different operator is simply not
  -- used and the query falls back to a sequential scan of every vector — which
  -- is fast enough to hide the mistake until the corpus grows.
  CREATE INDEX IF NOT EXISTS "embedding_vector_hnsw_idx" ON "embedding" USING hnsw ("vector" vector_cosine_ops);
END
$$;
