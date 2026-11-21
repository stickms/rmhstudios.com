-- Cloud copies of RMH Studio projects: one row per member project, with a revision for checked saves
-- and the serialised size kept beside the JSON so listing never reads the blob.

-- CreateTable
CREATE TABLE "studio_project" (
    "id" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "data" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_project_userId_updatedAt_idx" ON "studio_project"("userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "studio_project" ADD CONSTRAINT "studio_project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

