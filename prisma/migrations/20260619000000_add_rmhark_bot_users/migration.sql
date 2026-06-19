-- AlterTable: RMHark AI bot users (generated + driven by the bot-worker)
ALTER TABLE "user" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN "botPersona" TEXT;
ALTER TABLE "user" ADD COLUMN "botLastPostAt" TIMESTAMP(3);

-- Index to quickly find bot accounts (pool maintenance + posting loop).
CREATE INDEX "user_isBot_idx" ON "user"("isBot");
