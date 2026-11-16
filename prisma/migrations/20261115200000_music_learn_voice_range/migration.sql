-- RMH Music: a voice learner's range (soprano, alto, tenor, bass). `instrument` is already a plain
-- string column, so the new instrument value `voice` needs no change. Additive and nullable: NULL
-- means "not chosen yet" (the app reads it as alto and asks), so no backfill is needed.
ALTER TABLE "music_learn_profile" ADD COLUMN "voiceRange" VARCHAR(16);
