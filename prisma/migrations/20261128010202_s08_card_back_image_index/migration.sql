-- Pictures on flashcards (s08-15): the same reference count for backImageUrl. Built CONCURRENTLY so it never blocks
-- writes to flashcard, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_backImageUrl_idx"
  ON "flashcard" ("backImageUrl");
