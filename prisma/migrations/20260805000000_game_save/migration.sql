-- Cloud saves for the single-player games (`/api/game-saves/:gameId`).
--
-- `GameSave` landed in the schema without a migration, so `prisma migrate
-- deploy` produced a database that the save endpoints 500 against. This is that
-- missing migration; it is exactly what `prisma migrate diff` proposes for the
-- model, so replaying the history now matches `schema.prisma`.
--
-- `IF NOT EXISTS` throughout: any environment that was patched by a `db push`
-- already has the table, and this has to be a no-op there rather than a failure.

CREATE TABLE IF NOT EXISTS "game_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_save_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "game_save_userId_idx" ON "game_save"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "game_save_userId_gameId_key" ON "game_save"("userId", "gameId");

DO $$
BEGIN
  ALTER TABLE "game_save" ADD CONSTRAINT "game_save_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
