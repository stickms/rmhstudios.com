-- Deck folders (s07-09): reads a member's decks by folder. Built CONCURRENTLY so it never blocks writes to flashcard_deck,
-- so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_deck_userId_folderId_idx"
  ON "flashcard_deck" ("userId", "folderId");
