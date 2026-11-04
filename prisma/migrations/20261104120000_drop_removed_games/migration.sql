-- Removes Bum's Rush and Massive March (games deleted 2026-11-04; their player
-- data is intentionally discarded — owner decision). Children before parents.
DROP TABLE IF EXISTS "bums_rush_run" CASCADE;
DROP TABLE IF EXISTS "bums_rush_showdown_player" CASCADE;
DROP TABLE IF EXISTS "bums_rush_showdown_match" CASCADE;
DROP TABLE IF EXISTS "bums_rush_level_clear" CASCADE;
DROP TABLE IF EXISTS "bums_rush_profile" CASCADE;
DROP TABLE IF EXISTS "massive_march_member" CASCADE;
DROP TABLE IF EXISTS "massive_march_campaign" CASCADE;
