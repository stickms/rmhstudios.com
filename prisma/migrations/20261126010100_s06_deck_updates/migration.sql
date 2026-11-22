-- Copied study decks remember which source card each copied card came from (and its hash), when the copy
-- last synced, when the deck last had a card changed, and whether its owner wants to hear about updates.
-- AlterTable
ALTER TABLE "flashcard_deck" ADD COLUMN     "cardsChangedAt" TIMESTAMP(3),
ADD COLUMN     "notifyUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sourceSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "flashcard" ADD COLUMN     "originCardId" VARCHAR(30),
ADD COLUMN     "originHash" VARCHAR(64);

