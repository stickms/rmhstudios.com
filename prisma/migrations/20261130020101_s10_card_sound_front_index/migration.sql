-- Sound on flashcards (s10-02): the media sweep's reference check and the claim's reuse check look cards up by sound
-- address, so the lookup by frontSoundUrl must not be a table scan. Built CONCURRENTLY so it never blocks writes to
-- flashcard, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_frontSoundUrl_idx"
  ON "flashcard" ("frontSoundUrl");
