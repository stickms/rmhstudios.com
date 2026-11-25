-- s12 16: a moderator's takedown of a deck, a persona or a listing sticks. Additive only: one nullable column on each of three tables.
ALTER TABLE "flashcard_deck" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "ai_persona" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "home_listing" ADD COLUMN "moderatedAt" TIMESTAMP(3);
