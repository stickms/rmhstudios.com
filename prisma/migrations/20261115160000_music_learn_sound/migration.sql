-- RMH Music: the sampled sound a learner trains with (piano, guitar, violin, flute).
-- Additive and nullable: NULL means "follow the learner's instrument", so existing rows keep
-- today's behaviour and no backfill is needed.
ALTER TABLE "music_learn_profile" ADD COLUMN "sound" VARCHAR(16);
