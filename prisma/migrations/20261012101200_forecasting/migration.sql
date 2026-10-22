-- AlterTable
ALTER TABLE "prediction_position" ADD COLUMN     "lastP" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "prediction_season" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_season_market" (
    "seasonId" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,

    CONSTRAINT "prediction_season_market_pkey" PRIMARY KEY ("seasonId","predictionId")
);

-- CreateTable
CREATE TABLE "prediction_comment" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "side" VARCHAR(3),
    "shares" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prediction_season_endsAt_idx" ON "prediction_season"("endsAt");

-- CreateIndex
CREATE INDEX "prediction_season_market_predictionId_idx" ON "prediction_season_market"("predictionId");

-- CreateIndex
CREATE INDEX "prediction_comment_predictionId_createdAt_idx" ON "prediction_comment"("predictionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "prediction_comment_userId_idx" ON "prediction_comment"("userId");

-- AddForeignKey
ALTER TABLE "prediction_season_market" ADD CONSTRAINT "prediction_season_market_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "prediction_season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_season_market" ADD CONSTRAINT "prediction_season_market_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_comment" ADD CONSTRAINT "prediction_comment_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_comment" ADD CONSTRAINT "prediction_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

