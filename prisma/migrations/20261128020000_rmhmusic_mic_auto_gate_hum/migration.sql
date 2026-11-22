-- RMH Music: automatic microphone sensitivity, the manual cutoff and the mains-hum filter, on the
-- learner's profile. All three have defaults, so existing rows stay valid.
ALTER TABLE "music_learn_profile" ADD COLUMN "micAuto" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "music_learn_profile" ADD COLUMN "micGate" DOUBLE PRECISION NOT NULL DEFAULT 0.01;
ALTER TABLE "music_learn_profile" ADD COLUMN "micHum" VARCHAR(3) NOT NULL DEFAULT 'off';

-- A learner who already raised the gain chose it by hand: keep them on manual rather than take it over.
UPDATE "music_learn_profile" SET "micAuto" = false WHERE "micGain" <> 1;
