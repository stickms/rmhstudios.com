-- Discord stacks activities: a game, Spotify and a stream can all be live at
-- once, and its own client shows every one. The single `activityName` column
-- added with the watch tables could only ever describe one of them, which made
-- the profile card quietly wrong exactly when there was the most to say.
--
-- The custom status is separate again: activity type 4 is not an activity at
-- all but a line of text somebody typed about themselves. It never accrues
-- time, so it is kept out of `activities` and rendered as its own bubble.
--
-- A separate migration rather than an edit to 20260811140000: that one has
-- already shipped, and amending an applied migration breaks its checksum and
-- leaves every database that ran it without these columns.
ALTER TABLE "discord_watch_live" ADD COLUMN "activities" JSONB;
ALTER TABLE "discord_watch_live" ADD COLUMN "customStatus" TEXT;
ALTER TABLE "discord_watch_live" ADD COLUMN "customEmoji" TEXT;
