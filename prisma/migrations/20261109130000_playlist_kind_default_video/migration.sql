-- Every new playlist is a video playlist (the app always passed kind 'video');
-- the column default still said 'music', the kind only the retired RMHMusic
-- listening-party app used. Additive: existing rows are untouched, and legacy
-- 'music' rows stay in place as unread dead data.
ALTER TABLE "playlist" ALTER COLUMN "kind" SET DEFAULT 'video';
