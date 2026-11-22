-- Earlier versions of a Studio cloud project: the data each save replaced, kept at most once per ten minutes
-- (lib/studio/project-history.server.ts). New table only.
-- CreateTable
CREATE TABLE "studio_project_revision" (
    "id" TEXT NOT NULL,
    "projectId" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "data" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "trackCount" INTEGER NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_project_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_project_revision_userId_savedAt_idx" ON "studio_project_revision"("userId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "studio_project_revision_projectId_revision_key" ON "studio_project_revision"("projectId", "revision");

-- AddForeignKey
ALTER TABLE "studio_project_revision" ADD CONSTRAINT "studio_project_revision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "studio_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

