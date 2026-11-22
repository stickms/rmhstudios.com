-- The reading highlight a flashcard was made from (s10-01). A new table; deleting either side removes the link.

-- CreateTable
CREATE TABLE "highlight_card_link" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "highlight_card_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "highlight_card_link_cardId_key" ON "highlight_card_link"("cardId");

-- CreateIndex
CREATE INDEX "highlight_card_link_highlightId_idx" ON "highlight_card_link"("highlightId");

-- AddForeignKey
ALTER TABLE "highlight_card_link" ADD CONSTRAINT "highlight_card_link_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "highlight_card_link" ADD CONSTRAINT "highlight_card_link_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "reading_highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
