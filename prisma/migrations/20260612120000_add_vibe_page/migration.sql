-- CreateTable
CREATE TABLE "vibe_page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "conversationHistory" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vibe_page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vibe_page_slug_key" ON "vibe_page"("slug");

-- CreateIndex
CREATE INDEX "vibe_page_slug_idx" ON "vibe_page"("slug");
