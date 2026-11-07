-- CreateTable
CREATE TABLE "call_mute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedUserId" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_mute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_mute_userId_until_idx" ON "call_mute"("userId", "until");

-- CreateIndex
CREATE UNIQUE INDEX "call_mute_userId_mutedUserId_key" ON "call_mute"("userId", "mutedUserId");

-- AddForeignKey
ALTER TABLE "call_mute" ADD CONSTRAINT "call_mute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_mute" ADD CONSTRAINT "call_mute_mutedUserId_fkey" FOREIGN KEY ("mutedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

