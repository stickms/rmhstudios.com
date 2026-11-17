-- Slice It (18-19 February 2026) lists its library from the Song table; at launch that held the two tracks the
-- game shipped with (lib/game/tracks.ts at that commit). Runs after ../seed.sql, in the same session.
DO $$ BEGIN
  PERFORM pg_temp.seed_row('Song', '{"id":"rmh-afrosoul","title":"RMH Afrosoul","artist":"RMH Studios","duration":"180","bpm":"120","audioUrl":"/music/rmh_afrosoul.mp3","uploadedBy":"u1","isPublic":"true","createdAt":"sql:now()","updatedAt":"sql:now()"}');
  PERFORM pg_temp.seed_row('Song', '{"id":"rmh-official","title":"RMH Official","artist":"RMH Studios","duration":"180","bpm":"128","audioUrl":"/music/rmh_song_official.mp3","uploadedBy":"u1","isPublic":"true","createdAt":"sql:now() - interval ''1 minute''","updatedAt":"sql:now()"}');
END $$;
