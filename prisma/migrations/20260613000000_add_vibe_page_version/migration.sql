-- CreateTable
CREATE TABLE "vibe_page_version" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "html" TEXT NOT NULL,
    "conversationHistory" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vibe_page_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vibe_page_version_pageId_createdAt_idx" ON "vibe_page_version"("pageId", "createdAt");

-- AddForeignKey
ALTER TABLE "vibe_page_version" ADD CONSTRAINT "vibe_page_version_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "vibe_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed each existing page with an initial version snapshot from its
-- current state, so previously generated pages have browsable history.
INSERT INTO "vibe_page_version" ("id", "pageId", "prompt", "title", "description", "html", "conversationHistory", "createdAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "prompt",
    "title",
    "description",
    "html",
    "conversationHistory",
    "createdAt"
FROM "vibe_page";
