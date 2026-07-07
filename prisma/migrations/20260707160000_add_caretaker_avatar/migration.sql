-- Store each caretaker's Discord avatar hash so the /caretakers command can
-- render a leaderboard image with everyone's profile picture.

ALTER TABLE "discord_alex_caretaker" ADD COLUMN "avatarHash" TEXT;
