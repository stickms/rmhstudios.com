-- s15-13 jam-suggestions: a member's suggested theme for a theme-voted jam. A new table, so the change is additive.
CREATE TABLE "game_jam_theme_suggestion" (
    "id" TEXT NOT NULL,
    "jamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_jam_theme_suggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_jam_theme_suggestion_jamId_userId_text_key" ON "game_jam_theme_suggestion"("jamId", "userId", "text");

CREATE INDEX "game_jam_theme_suggestion_jamId_createdAt_idx" ON "game_jam_theme_suggestion"("jamId", "createdAt");

ALTER TABLE "game_jam_theme_suggestion" ADD CONSTRAINT "game_jam_theme_suggestion_jamId_fkey" FOREIGN KEY ("jamId") REFERENCES "game_jam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "game_jam_theme_suggestion" ADD CONSTRAINT "game_jam_theme_suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
