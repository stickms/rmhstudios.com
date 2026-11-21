-- Card types (s05-09): a flashcard is authored as basic, reversible or cloze; generated sibling rows (the reverse
-- side, one per cloze deletion) point back at their authored card, so each keeps its own spaced-repetition state.
-- AlterTable
ALTER TABLE "flashcard" ADD COLUMN     "clozeIndex" INTEGER,
ADD COLUMN     "kind" VARCHAR(10) NOT NULL DEFAULT 'basic',
ADD COLUMN     "sourceId" TEXT;

-- AddForeignKey
ALTER TABLE "flashcard" ADD CONSTRAINT "flashcard_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
