-- Per-server override for Alex's personality/system prompt, set via the /prompt
-- command. NULL (the default) means Alex uses his built-in default persona for
-- both /chat and @mention replies in that server.
ALTER TABLE "discord_alex_guild" ADD COLUMN "customPrompt" TEXT;
