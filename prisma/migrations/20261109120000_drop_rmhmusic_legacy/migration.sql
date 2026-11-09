-- rmh:contract-ok Owner-approved drop of the retired Spotify listening-party RMH Music tables (2026-11-09): the release before this one (#1489, the learning programme) already stopped reading and writing them, so a one-release rollback is unaffected; rolling back past #1489 loses the old rooms, comments and guess-the-song data — accepted, that app is deleted for good.
-- IRREVERSIBLE: `prisma migrate deploy` runs this in production and the rows are
-- not archived anywhere. Children before parents. The new learning programme's
-- tables (music_learn_profile, music_learn_lesson_progress, from
-- 20261108170000_music_learn) are NOT touched. None of these models used an enum,
-- so no type is dropped.

-- Listening-party rooms: members, queue and chat hang off rmh_music_room.
DROP TABLE IF EXISTS "rmh_music_chat_message";
DROP TABLE IF EXISTS "rmh_music_queue_item";
DROP TABLE IF EXISTS "rmh_music_room_member";
DROP TABLE IF EXISTS "rmh_music_room";

-- Timed comments on Spotify tracks (keyed on the track URI; only user FK).
DROP TABLE IF EXISTS "rmh_music_track_comment";

-- "Guess the song" (#33): attempts before puzzles.
DROP TABLE IF EXISTS "music_guess_attempt";
DROP TABLE IF EXISTS "music_guess_puzzle";
