-- RMH Music: the learner's retention target and how many new cards Practice may introduce a day.
-- Both have defaults equal to what the scheduler always did (90%) and a modest allowance (10), so
-- existing rows stay valid.
ALTER TABLE "music_learn_profile" ADD COLUMN "retention" DOUBLE PRECISION NOT NULL DEFAULT 0.9;
ALTER TABLE "music_learn_profile" ADD COLUMN "newPerDay" INTEGER NOT NULL DEFAULT 10;
