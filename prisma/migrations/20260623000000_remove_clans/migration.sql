-- Remove the clans feature.
-- DropTable (member table first — it FKs into clan)
DROP TABLE IF EXISTS "clan_member";

-- DropTable
DROP TABLE IF EXISTS "clan";

-- DropEnum
DROP TYPE IF EXISTS "ClanRole";
