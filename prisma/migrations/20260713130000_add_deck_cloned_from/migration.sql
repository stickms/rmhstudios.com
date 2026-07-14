-- AlterTable
ALTER TABLE "flashcard_deck" ADD COLUMN     "clonedFromId" TEXT;

-- CreateIndex
CREATE INDEX "flashcard_deck_userId_clonedFromId_idx" ON "flashcard_deck"("userId", "clonedFromId");

