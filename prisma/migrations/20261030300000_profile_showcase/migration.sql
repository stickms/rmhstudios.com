-- CreateTable
CREATE TABLE "game_profile_showcase" (
    "userId" TEXT NOT NULL,
    "achievementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_profile_showcase_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "game_profile_showcase_max_six" CHECK (cardinality("achievementIds") <= 6 AND cardinality("badges") <= 6)
);

-- AddForeignKey
ALTER TABLE "game_profile_showcase" ADD CONSTRAINT "game_profile_showcase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
