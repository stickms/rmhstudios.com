-- Replace the boolean ambientEnabled with a three-way messageLevel per server:
--   'all'  — random ambient posts + care alerts + life events (default)
--   'care' — care alerts + life events only (no random chatter)
--   'off'  — completely silent (no proactive messages at all)
-- Backfill: servers that had ambient turned off map to 'care' (they kept getting
-- care alerts + life events under the old behaviour); everyone else maps to 'all'.

ALTER TABLE "discord_alex_guild" ADD COLUMN "messageLevel" TEXT NOT NULL DEFAULT 'all';

UPDATE "discord_alex_guild" SET "messageLevel" = CASE WHEN "ambientEnabled" THEN 'all' ELSE 'care' END;

ALTER TABLE "discord_alex_guild" DROP COLUMN "ambientEnabled";
