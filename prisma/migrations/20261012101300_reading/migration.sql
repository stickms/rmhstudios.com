-- P13 reading (L1 highlights, L3 goal, L5 stories, L6 glossary, L7 shelves, L8 passage counters).
-- Additive only: new enums and new tables; no existing table is altered.

-- CreateEnum
CREATE TYPE "ReadingDocKind" AS ENUM ('library', 'blog', 'news');

-- CreateEnum
CREATE TYPE "ReadingGoalUnit" AS ENUM ('books', 'pages');

-- CreateEnum
CREATE TYPE "ReadingShelf" AS ENUM ('want', 'reading', 'read');

-- CreateTable
CREATE TABLE "reading_highlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docKind" "ReadingDocKind" NOT NULL,
    "docKey" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(16) NOT NULL DEFAULT '',
    "exact" VARCHAR(2000) NOT NULL,
    "prefix" VARCHAR(64) NOT NULL DEFAULT '',
    "suffix" VARCHAR(64) NOT NULL DEFAULT '',
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "version" VARCHAR(16) NOT NULL DEFAULT '',
    "note" VARCHAR(2000),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_passage_stat" (
    "id" TEXT NOT NULL,
    "docKind" "ReadingDocKind" NOT NULL,
    "docKey" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(16) NOT NULL DEFAULT '',
    "passage" VARCHAR(24) NOT NULL,
    "sample" VARCHAR(400) NOT NULL,
    "start" INTEGER NOT NULL DEFAULT 0,
    "readers" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_passage_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_highlight_passage" (
    "highlightId" TEXT NOT NULL,
    "statId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "reading_highlight_passage_pkey" PRIMARY KEY ("highlightId","statId")
);

-- CreateTable
CREATE TABLE "reading_goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "unit" "ReadingGoalUnit" NOT NULL,
    "target" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_shelf_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docSlug" VARCHAR(200) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "shelf" "ReadingShelf" NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_shelf_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_prefs" (
    "userId" TEXT NOT NULL,
    "wantPublic" BOOLEAN NOT NULL DEFAULT false,
    "readingPublic" BOOLEAN NOT NULL DEFAULT false,
    "readPublic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "reading_prefs_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "news_story" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" VARCHAR(600) NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_story_article" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "articleSlug" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_story_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glossary_term" (
    "id" TEXT NOT NULL,
    "term" VARCHAR(80) NOT NULL,
    "termKey" VARCHAR(80) NOT NULL,
    "aliases" TEXT[],
    "definition" VARCHAR(600) NOT NULL,
    "linkUrl" VARCHAR(300),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glossary_term_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reading_highlight_userId_docKind_docKey_idx" ON "reading_highlight"("userId", "docKind", "docKey");

-- CreateIndex
CREATE INDEX "reading_highlight_userId_createdAt_idx" ON "reading_highlight"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reading_highlight_docKind_docKey_isPublic_idx" ON "reading_highlight"("docKind", "docKey", "isPublic");

-- CreateIndex
CREATE INDEX "reading_passage_stat_docKind_docKey_readers_idx" ON "reading_passage_stat"("docKind", "docKey", "readers");

-- CreateIndex
CREATE UNIQUE INDEX "reading_passage_stat_docKind_docKey_unit_passage_key" ON "reading_passage_stat"("docKind", "docKey", "unit", "passage");

-- CreateIndex
CREATE INDEX "reading_highlight_passage_statId_userId_idx" ON "reading_highlight_passage"("statId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_goal_userId_year_key" ON "reading_goal"("userId", "year");

-- CreateIndex
CREATE INDEX "reading_shelf_entry_userId_shelf_updatedAt_idx" ON "reading_shelf_entry"("userId", "shelf", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "reading_shelf_entry_userId_finishedAt_idx" ON "reading_shelf_entry"("userId", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "reading_shelf_entry_userId_docSlug_key" ON "reading_shelf_entry"("userId", "docSlug");

-- CreateIndex
CREATE UNIQUE INDEX "news_story_slug_key" ON "news_story"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "news_story_article_articleSlug_key" ON "news_story_article"("articleSlug");

-- CreateIndex
CREATE INDEX "news_story_article_storyId_idx" ON "news_story_article"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "glossary_term_termKey_key" ON "glossary_term"("termKey");

-- AddForeignKey
ALTER TABLE "reading_highlight" ADD CONSTRAINT "reading_highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_highlight_passage" ADD CONSTRAINT "reading_highlight_passage_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "reading_highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_highlight_passage" ADD CONSTRAINT "reading_highlight_passage_statId_fkey" FOREIGN KEY ("statId") REFERENCES "reading_passage_stat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_goal" ADD CONSTRAINT "reading_goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_shelf_entry" ADD CONSTRAINT "reading_shelf_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_prefs" ADD CONSTRAINT "reading_prefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_story" ADD CONSTRAINT "news_story_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_story_article" ADD CONSTRAINT "news_story_article_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "news_story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "glossary_term" ADD CONSTRAINT "glossary_term_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

