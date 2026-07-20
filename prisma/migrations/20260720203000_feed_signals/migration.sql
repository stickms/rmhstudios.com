-- CreateTable
CREATE TABLE "feed_signal" (
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "targetId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_signal_pkey" PRIMARY KEY ("userId","kind","targetId")
);

-- CreateIndex
CREATE INDEX "feed_signal_userId_kind_idx" ON "feed_signal"("userId", "kind");

-- AddForeignKey
ALTER TABLE "feed_signal" ADD CONSTRAINT "feed_signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

