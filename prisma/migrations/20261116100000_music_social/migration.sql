-- RMH Music Phase 6: a learner's social consent (the Daily board and friends' progress switches).
-- Additive only: one new table. No row means both switches are off, so nothing is backfilled.

-- CreateTable
CREATE TABLE "music_social" (
    "userId" TEXT NOT NULL,
    "board" BOOLEAN NOT NULL DEFAULT false,
    "friends" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_social_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "music_social" ADD CONSTRAINT "music_social_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
