-- RMHCharacters: character sheets saved to the signed-in account (one row per sheet).
-- Additive only: a new table, its owner index and the cascade to "user".

-- CreateTable
CREATE TABLE "rmh_character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmh_character_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmh_character_userId_updatedAt_idx" ON "rmh_character"("userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "rmh_character" ADD CONSTRAINT "rmh_character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

