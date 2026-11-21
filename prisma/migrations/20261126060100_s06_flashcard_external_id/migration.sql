-- Developer API (s06-13): a card may carry the member's own external id, so a script can upsert cards by it.
-- Nullable, no default; the unique index on (deckId, externalId) is built CONCURRENTLY in the next migration.

-- AlterTable
ALTER TABLE "flashcard" ADD COLUMN     "externalId" VARCHAR(100);
