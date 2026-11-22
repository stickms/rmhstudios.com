-- Pictures on flashcards (s08-15): releasing a picture counts the cards that still reference its address, so the
-- lookup by frontImageUrl must not be a table scan. Built CONCURRENTLY so it never blocks writes to flashcard,
-- so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_frontImageUrl_idx"
  ON "flashcard" ("frontImageUrl");
