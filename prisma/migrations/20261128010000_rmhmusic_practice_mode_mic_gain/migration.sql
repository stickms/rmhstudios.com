-- RMH Music: Learning/Test mode and the microphone's input gain, kept on the learner's profile.
-- Both have defaults, so existing rows stay valid (Learning mode, gain 1 = the microphone as heard).
ALTER TABLE "music_learn_profile" ADD COLUMN "practiceMode" VARCHAR(8) NOT NULL DEFAULT 'learning';
ALTER TABLE "music_learn_profile" ADD COLUMN "micGain" DOUBLE PRECISION NOT NULL DEFAULT 1;
