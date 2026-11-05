-- rmh:contract-ok Owner-approved removal of CookGame, Forest Explorer, Isleworks and RMH Farming Simulator (2026-11-04): the previous release still reads these tables; rolling back past this release loses those games' data — accepted, the games are deleted for good.
-- Hearthworks replaces the four games entirely. Their player data is
-- intentionally discarded — owner decision. Children before parents.
--
-- world_snapshot / world_postcard / garden_watering / farm_festival_entry were
-- the "share my island / garden / farm" and festival-contest tables; nothing but
-- the removed games wrote or read them.
DROP TABLE IF EXISTS "garden_watering" CASCADE;
DROP TABLE IF EXISTS "world_postcard" CASCADE;
DROP TABLE IF EXISTS "world_snapshot" CASCADE;
DROP TABLE IF EXISTS "farm_festival_entry" CASCADE;
DROP TABLE IF EXISTS "farming_sim_farm" CASCADE;
DROP TABLE IF EXISTS "forest_explorer_save" CASCADE;

-- CookGame and Isleworks kept their saves as rows on the SHARED game_save table,
-- which stays (other games use it): delete only those two games' rows.
DELETE FROM "game_save" WHERE "gameId" IN ('cookgame', 'isleworks');
