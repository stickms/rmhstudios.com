-- Retire the Alex Discord bot.
--
-- The discord-bot worker is now the Liquid Globe bot: one command (/liquid) that
-- re-makes an uploaded image in the site's design language. It keeps no
-- conversational state, no per-guild persona and no virtual pet, so every table
-- that existed only to hold Alex's is dropped.
--
-- The bot's one remaining table is "image_gen_budget", which it shares with the
-- bot-worker and which is untouched here.

DROP TABLE IF EXISTS "discord_alex_caretaker";
DROP TABLE IF EXISTS "discord_alex_pet";
DROP TABLE IF EXISTS "discord_alex_guild";
DROP TABLE IF EXISTS "discord_alex_channel_memory";
DROP TABLE IF EXISTS "discord_chat_session";
