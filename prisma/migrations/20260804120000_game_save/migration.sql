-- The shared single-player save: one row per (account, game).
--
-- Backs `/api/game-saves/:gameId` for the games that had no save table of their
-- own — the alternative being a dozen near-identical two-column models. Games
-- that already have one (Temple of Joy, Forest Explorer, Versecraft, Synapse
-- Storm, Signal Forge) keep it.
--
-- `saveData` is opaque JSON on purpose. Validating each game's save shape
-- server-side would mean editing this table every time a game gains a field,
-- and a save the server rejects is a save the player loses. The client owns the
-- schema and its own version check; the server owns identity, row size, and
-- which games may have a row at all (`SHARED_SAVE_GAMES` in
-- `lib/game-saves/registry.ts`).
--
-- The unique index is the access path: every read and every write is by
-- (userId, gameId), and the upsert depends on it. The plain `userId` index is
-- for the cascade delete when an account is removed.
--
-- Hand-written rather than taken from `prisma migrate diff`, which also
-- proposes dropping `rmheet.content_tsv` and its index: those are a generated
-- tsvector column Prisma cannot model, created by 20260717110700, whose own
-- header says not to apply that DROP.
--
-- IF NOT EXISTS throughout so re-running against a database that already has
-- the table is a no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "game_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_save_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "game_save_userId_idx" ON "game_save"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "game_save_userId_gameId_key" ON "game_save"("userId", "gameId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "game_save"
    ADD CONSTRAINT "game_save_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
