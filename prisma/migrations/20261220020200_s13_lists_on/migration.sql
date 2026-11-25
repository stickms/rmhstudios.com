-- s13-11: a member who left a list stays off it. One row per (list, member); the owner can never add them again.
CREATE TABLE "custom_feed_leave" (
    "feedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_feed_leave_pkey" PRIMARY KEY ("feedId","userId")
);

-- CreateIndex
CREATE INDEX "custom_feed_leave_userId_idx" ON "custom_feed_leave"("userId");

-- AddForeignKey
ALTER TABLE "custom_feed_leave" ADD CONSTRAINT "custom_feed_leave_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "custom_feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_feed_leave" ADD CONSTRAINT "custom_feed_leave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
