-- Sound on flashcards (s10-02): one optional recorded or uploaded sound per side of an authored card, with the
-- transcript that is its text alternative and its length in milliseconds. Six nullable columns; no data change.
-- A sound is private to the member who recorded it, so no copy or sync ever writes these columns.
-- The two lookup indexes are in the migrations after this one.

-- AlterTable
ALTER TABLE "flashcard" ADD COLUMN     "backSoundMs" INTEGER,
ADD COLUMN     "backSoundText" VARCHAR(500),
ADD COLUMN     "backSoundUrl" VARCHAR(500),
ADD COLUMN     "frontSoundMs" INTEGER,
ADD COLUMN     "frontSoundText" VARCHAR(500),
ADD COLUMN     "frontSoundUrl" VARCHAR(500);
