-- Embeddings (M1): semantic retrieval beside the lexical search that has always
-- been the only one.
--
-- migration-safety: acknowledged[create-index-not-concurrent] every index here
-- is on "embedding", a table this migration creates in the same transaction.
-- A SHARE lock on a table that does not yet exist outside this transaction
-- blocks nothing, and CREATE INDEX CONCURRENTLY cannot run inside the
-- transaction Prisma wraps a migration in anyway.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "embedding" (
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

-- CreateIndex
CREATE UNIQUE INDEX "embedding_kind_entityId_key" ON "embedding"("kind", "entityId");

-- CreateIndex
CREATE INDEX "embedding_kind_updatedAt_idx" ON "embedding"("kind", "updatedAt");

-- The similarity index. HNSW rather than IVFFlat: IVFFlat needs a populated
-- table to build meaningful lists, so building one here — against zero rows —
-- produces an index that has to be rebuilt after the first backfill or it
-- silently returns poor recall. HNSW builds incrementally and needs no such
-- second step.
--
-- `vector_cosine_ops` because the query in embeddings.server.ts uses `<=>`
-- (cosine distance). An index built for a different operator is simply not used
-- and the query falls back to a sequential scan of every vector — which is
-- fast enough to hide the mistake until the corpus grows.
CREATE INDEX "embedding_vector_hnsw_idx" ON "embedding" USING hnsw ("vector" vector_cosine_ops);
