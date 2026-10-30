-- CreateTable
CREATE TABLE "user_card" (
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "cardIndex" SMALLINT NOT NULL,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_card_pkey" PRIMARY KEY ("userId","gameId","cardIndex","foil"),
    CONSTRAINT "user_card_count_positive" CHECK ("count" > 0)
);

-- CreateTable
CREATE TABLE "card_drop" (
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "dropIndex" SMALLINT NOT NULL,
    "cardIndex" SMALLINT NOT NULL,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_drop_pkey" PRIMARY KEY ("userId","gameId","dropIndex")
);

-- CreateTable
CREATE TABLE "game_badge" (
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "level" SMALLINT NOT NULL,
    "craftedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_badge_pkey" PRIMARY KEY ("userId","gameId","foil")
);

-- AddForeignKey
ALTER TABLE "user_card" ADD CONSTRAINT "user_card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_drop" ADD CONSTRAINT "card_drop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_badge" ADD CONSTRAINT "game_badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
