-- AI personas get an AI-generated avatar (xAI image → webp in object storage).
-- Null until the background generation kicked off on create succeeds; the UI
-- falls back to the persona's emoji until then.

-- AlterTable
ALTER TABLE "ai_persona" ADD COLUMN "avatarUrl" VARCHAR(500);
