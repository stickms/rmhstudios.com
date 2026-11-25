-- Card history (s12-09): one card's reviews for one member, newest first, read by (userId, cardId).
-- Built CONCURRENTLY so it never blocks writes to the large review log, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_review_log_userId_cardId_reviewedAt_idx"
  ON "flashcard_review_log" ("userId", "cardId", "reviewedAt");
