-- CreateTable
CREATE TABLE "game_collection_item" (
    "userId" TEXT NOT NULL,
    "collection" VARCHAR(40) NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_collection_item_pkey" PRIMARY KEY ("userId","collection","gameId")
);

-- AddForeignKey
ALTER TABLE "game_collection_item" ADD CONSTRAINT "game_collection_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
