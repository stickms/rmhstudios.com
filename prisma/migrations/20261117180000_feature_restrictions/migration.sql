-- Per-feature moderation timeouts (admin bars a user from one feature, for a
-- while or permanently). Additive only.

-- CreateTable
CREATE TABLE "feature_restriction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "adminId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_restriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_restriction_userId_feature_idx" ON "feature_restriction"("userId", "feature");

-- CreateIndex
CREATE INDEX "feature_restriction_userId_createdAt_idx" ON "feature_restriction"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "feature_restriction" ADD CONSTRAINT "feature_restriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_restriction" ADD CONSTRAINT "feature_restriction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
