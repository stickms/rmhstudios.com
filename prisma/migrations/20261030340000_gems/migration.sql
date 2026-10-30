-- CreateTable
CREATE TABLE "user_gems" (
    "userId" TEXT NOT NULL,
    "gems" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_gems_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "user_gems_nonnegative" CHECK ("gems" >= 0)
);

-- CreateTable
CREATE TABLE "gem_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gem_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gem_entry_userId_createdAt_idx" ON "gem_entry"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "user_gems" ADD CONSTRAINT "user_gems_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gem_entry" ADD CONSTRAINT "gem_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
