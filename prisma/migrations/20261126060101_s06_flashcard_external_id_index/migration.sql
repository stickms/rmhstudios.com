-- Developer API (s06-13): one card per (deckId, externalId); null external ids never collide.
-- Built CONCURRENTLY so it never blocks writes to the large flashcard table, so this file holds exactly ONE statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_deckId_externalId_key"
  ON "flashcard" ("deckId", "externalId");
