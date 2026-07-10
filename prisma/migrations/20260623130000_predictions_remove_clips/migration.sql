-- Remove the RMHTube clips feature (storage).
DROP TABLE IF EXISTS "rmhtube_clip";

-- Prediction markets.
-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('PENDING', 'OPEN', 'RESOLVED_YES', 'RESOLVED_NO', 'DENIED');

-- CreateTable
CREATE TABLE "prediction" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "creatorId" TEXT,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "b" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "qYes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qNo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "closesAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prediction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prediction_status_createdAt_idx" ON "prediction"("status", "createdAt" DESC);

-- CreateTable
CREATE TABLE "prediction_position" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yesShares" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noShares" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spent" INTEGER NOT NULL DEFAULT 0,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prediction_position_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prediction_position_predictionId_userId_key" ON "prediction_position"("predictionId", "userId");
CREATE INDEX "prediction_position_userId_idx" ON "prediction_position"("userId");

-- AddForeignKey
ALTER TABLE "prediction" ADD CONSTRAINT "prediction_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prediction_position" ADD CONSTRAINT "prediction_position_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prediction_position" ADD CONSTRAINT "prediction_position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
