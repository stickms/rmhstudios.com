-- CreateTable
CREATE TABLE "lights_out_score" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "moves" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lights_out_score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lights_out_score_userId_dateKey_key" ON "lights_out_score"("userId", "dateKey");

-- CreateIndex
CREATE INDEX "lights_out_score_dateKey_moves_idx" ON "lights_out_score"("dateKey", "moves" ASC);

-- AddForeignKey
ALTER TABLE "lights_out_score" ADD CONSTRAINT "lights_out_score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
