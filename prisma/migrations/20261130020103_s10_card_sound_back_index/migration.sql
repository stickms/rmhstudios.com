-- Sound on flashcards (s10-02): the same lookup for the back side. Built CONCURRENTLY so it never blocks writes to
-- flashcard, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_backSoundUrl_idx"
  ON "flashcard" ("backSoundUrl");
