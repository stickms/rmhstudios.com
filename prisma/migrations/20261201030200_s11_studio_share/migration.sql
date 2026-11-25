-- s11 07: Studio project shares (a snapshot behind a random link) and the first-open marks behind the opened count.
-- Additive only: two new tables, no change to an existing one.
CREATE TABLE "studio_project_share" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" VARCHAR(64) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "data" JSONB,
    "sizeBytes" INTEGER NOT NULL,
    "trackCount" INTEGER NOT NULL,
    "missingSamples" INTEGER NOT NULL,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_project_share_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studio_project_share_open" (
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_project_share_open_pkey" PRIMARY KEY ("shareId","userId")
);

CREATE UNIQUE INDEX "studio_project_share_token_key" ON "studio_project_share"("token");

CREATE INDEX "studio_project_share_userId_createdAt_idx" ON "studio_project_share"("userId", "createdAt");

CREATE INDEX "studio_project_share_open_userId_idx" ON "studio_project_share_open"("userId");

ALTER TABLE "studio_project_share" ADD CONSTRAINT "studio_project_share_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "studio_project_share_open" ADD CONSTRAINT "studio_project_share_open_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "studio_project_share"("id") ON DELETE CASCADE ON UPDATE CASCADE;
