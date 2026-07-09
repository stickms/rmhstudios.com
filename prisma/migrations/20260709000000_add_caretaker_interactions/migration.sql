-- Track "interactions": replies to Alex's community prompts/events. This is a
-- separate way to earn caretaker leaderboard points, alongside the care actions.

ALTER TABLE "discord_alex_caretaker" ADD COLUMN "interactions" INTEGER NOT NULL DEFAULT 0;
