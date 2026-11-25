-- Card history (s12-09): when the member last started a card over; null when never.
ALTER TABLE "flashcard_review" ADD COLUMN IF NOT EXISTS "resetAt" TIMESTAMP(3);
