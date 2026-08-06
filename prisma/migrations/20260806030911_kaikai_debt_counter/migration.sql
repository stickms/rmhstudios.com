-- The Kaikai Debt Counter (/kaikaidebtcounter).
--
-- One table serving one read: an infinite, newest-first walk over Kaikai's debt
-- log. Member-added entries and DeepSeek-generated historical receipts share it
-- (see `source`), because to the page they are the same thing — a dated line
-- item with an amount and a reason — and splitting them would mean merging two
-- keyset cursors in application code for no gain.
--
-- Generated rows are cached here permanently and back-dated away from the epoch,
-- which is what makes an "infinite" scroll affordable: each page of history is
-- conjured once, for everyone, ever.
--
-- NOTE: the generated diff proposed `DROP INDEX rmheet_content_tsv_idx` and
-- `ALTER TABLE rmheet DROP COLUMN content_tsv`. Both are removed here — same
-- reason as the three migrations before it. `content_tsv` is a GENERATED
-- tsvector created by 20260717110700_add_search_trgm_fts and consumed by raw SQL
-- in lib/search/posts.server.ts; Prisma cannot model it, so EVERY `migrate dev`
-- proposes the drop and accepting it destroys post full-text search. This is now
-- also enforced: `scripts/check-migration-safety.ts` fails on it by name
-- (rule `drop-protected-column`), so the next person does not have to notice.
--
-- Every index below is on the table created in this same migration, so the
-- plain (non-CONCURRENT) builds take no lock anyone can observe.

-- CreateTable
CREATE TABLE "kaikai_debt_entry" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(8) NOT NULL DEFAULT 'member',
    "item" VARCHAR(80) NOT NULL,
    "note" VARCHAR(180) NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "claim" VARCHAR(500),
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kaikai_debt_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kaikai_debt_entry_createdAt_id_idx" ON "kaikai_debt_entry"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "kaikai_debt_entry_addedById_createdAt_idx" ON "kaikai_debt_entry"("addedById", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "kaikai_debt_entry_source_createdAt_idx" ON "kaikai_debt_entry"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "kaikai_debt_entry" ADD CONSTRAINT "kaikai_debt_entry_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
