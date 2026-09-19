-- Build manifests and consent (B1): what a build asks for, and what a member
-- actually agreed to give it.

-- CreateTable
CREATE TABLE "build_manifest" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_manifest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "build_manifest_versionId_key" ON "build_manifest"("versionId");

-- CreateIndex
CREATE INDEX "build_manifest_needsReview_reviewedAt_idx" ON "build_manifest"("needsReview", "reviewedAt");

-- CreateTable
CREATE TABLE "build_grant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "coinCap" INTEGER NOT NULL DEFAULT 0,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "build_grant_pkey" PRIMARY KEY ("id")
);

-- One grant per member per VERSION, not per build: a build that adds a
-- capability publishes a new version and is asked again. Consent carried
-- forward across a manifest change is consent to something nobody showed them.
CREATE UNIQUE INDEX "build_grant_userId_versionId_key" ON "build_grant"("userId", "versionId");

-- CreateIndex
CREATE INDEX "build_grant_buildId_revokedAt_idx" ON "build_grant"("buildId", "revokedAt");

-- AddForeignKey
ALTER TABLE "build_manifest" ADD CONSTRAINT "build_manifest_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "build_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_grant" ADD CONSTRAINT "build_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_grant" ADD CONSTRAINT "build_grant_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
