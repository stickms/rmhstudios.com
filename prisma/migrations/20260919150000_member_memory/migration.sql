-- Member memory (M3): one place the AI surfaces read a member from.

-- CreateTable
CREATE TABLE "member_memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" VARCHAR(400) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_memory_userId_key_key" ON "member_memory"("userId", "key");

-- CreateIndex
CREATE INDEX "member_memory_userId_updatedAt_idx" ON "member_memory"("userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "member_memory" ADD CONSTRAINT "member_memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
