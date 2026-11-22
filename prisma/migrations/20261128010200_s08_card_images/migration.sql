-- Pictures on flashcards (s08-15): one optional picture and its description per side of an authored card.
-- Four nullable columns; no data change; the reference-count indexes are in the three migrations after this one.

-- AlterTable
ALTER TABLE "flashcard" ADD COLUMN     "backImageAlt" VARCHAR(1000),
ADD COLUMN     "backImageUrl" VARCHAR(500),
ADD COLUMN     "frontImageAlt" VARCHAR(1000),
ADD COLUMN     "frontImageUrl" VARCHAR(500);
