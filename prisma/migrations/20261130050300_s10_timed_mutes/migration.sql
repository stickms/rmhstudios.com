-- s10-10: an account mute can end by itself. Null keeps today's meaning (until the member unmutes).
ALTER TABLE "user_mute" ADD COLUMN "expiresAt" TIMESTAMP(3);
