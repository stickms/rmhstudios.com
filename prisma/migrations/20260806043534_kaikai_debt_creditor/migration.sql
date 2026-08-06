-- Kaikai Debt Counter: who each line is owed TO.
--
-- Generated archive rows were authorless — "recovered from the archive", owed to
-- nobody in particular. They now name a real member picked at random, so the
-- history below the fold reads as debts to actual people. On a member-added row
-- the creditor is the person who added it; they are the creditor by construction.
--
-- `ON DELETE SET NULL`, deliberately not CASCADE like `addedById`: deleting an
-- account should erase what that person *wrote*, but a generated line was never
-- theirs — it merely pointed at them. Cascading here would silently delete
-- unrelated ledger history (and shrink the counter) every time an account went
-- away.
--
-- NOTE: the generated diff again proposed `DROP INDEX rmheet_content_tsv_idx` and
-- `ALTER TABLE rmheet DROP COLUMN content_tsv`. Both are removed here — that
-- column is a GENERATED tsvector Prisma cannot model, read by raw SQL in
-- lib/search/posts.server.ts, and accepting the drop destroys post full-text
-- search. `scripts/check-migration-safety.ts` fails on it by name
-- (rule `drop-protected-column`).
--
-- migration-safety: acknowledged[create-index-not-concurrent] kaikai_debt_entry is
-- a table created in the previous migration with no production rows and no writer
-- outside this feature, so the index build takes no lock anyone can observe.
-- Scoped to that rule so a DROP COLUMN added to this file later still fails.

-- AlterTable
ALTER TABLE "kaikai_debt_entry" ADD COLUMN     "creditorId" TEXT;

-- CreateIndex
CREATE INDEX "kaikai_debt_entry_creditorId_createdAt_idx" ON "kaikai_debt_entry"("creditorId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "kaikai_debt_entry" ADD CONSTRAINT "kaikai_debt_entry_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
