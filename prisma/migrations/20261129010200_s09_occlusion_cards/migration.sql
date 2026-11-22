-- Picture-occlusion flashcards (s09-03): the masks of an authored occlusion card.
-- One nullable column; no data change.

-- AlterTable
ALTER TABLE "flashcard" ADD COLUMN     "occlusion" JSONB;
