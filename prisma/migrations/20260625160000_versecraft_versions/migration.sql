-- VerseCraft generated versions: shareable seed-driven worlds + cached chapters.

CREATE TABLE "versecraft_world" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "mcPrompt" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'fallback',
    "world" JSONB NOT NULL,
    "createdBy" TEXT,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versecraft_world_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "versecraft_world_seed_key" ON "versecraft_world"("seed");
CREATE INDEX "versecraft_world_createdAt_idx" ON "versecraft_world"("createdAt" DESC);

CREATE TABLE "versecraft_gen_chapter" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fallback',
    "content" JSONB NOT NULL,

    CONSTRAINT "versecraft_gen_chapter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "versecraft_gen_chapter_seed_index_key" ON "versecraft_gen_chapter"("seed", "index");

ALTER TABLE "versecraft_gen_chapter"
    ADD CONSTRAINT "versecraft_gen_chapter_seed_fkey"
    FOREIGN KEY ("seed") REFERENCES "versecraft_world"("seed")
    ON DELETE CASCADE ON UPDATE CASCADE;
