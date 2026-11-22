-- Deck folders (s07-09): a member's private, one-level folders for flashcard decks, with collapse state and order.
-- Adds the deck_folder table and a nullable flashcard_deck.folderId (deleting a folder sets it back to null).

-- AlterTable
ALTER TABLE "flashcard_deck" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "deck_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_folder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deck_folder_userId_position_idx" ON "deck_folder"("userId", "position");

-- AddForeignKey
ALTER TABLE "flashcard_deck" ADD CONSTRAINT "flashcard_deck_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "deck_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_folder" ADD CONSTRAINT "deck_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
