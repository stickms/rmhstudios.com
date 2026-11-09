-- CreateTable
CREATE TABLE "music_learn_card" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" VARCHAR(64) NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_learn_card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_learn_card_userId_cardId_key" ON "music_learn_card"("userId", "cardId");

-- AddForeignKey
ALTER TABLE "music_learn_card" ADD CONSTRAINT "music_learn_card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
