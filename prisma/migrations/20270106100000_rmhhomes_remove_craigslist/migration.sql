-- rmh:contract-ok Craigslist blocks scraping; removing the CRAIGSLIST provider and its unused region/category columns from home_source (a small admin-managed table; /admin/homes never selected region/category and homes-worker is updated in this release).
-- migration-safety: acknowledged[drop-column] home_source is a small admin-managed table (<50 rows), /admin/homes never selected region or category, and homes-worker is updated in this release
-- migration-safety: acknowledged[drop-type] recreating HomeSourceProvider with only RSS after removing all CRAIGSLIST sources

-- Expire any active listings imported from Craigslist sources so they no longer appear in RMH Homes.
UPDATE "home_listing"
SET "status" = 'REMOVED'
WHERE "source" = 'EXTERNAL'
  AND "status" = 'ACTIVE'
  AND "sourceRefId" IN (SELECT "id" FROM "home_source" WHERE "provider" = 'CRAIGSLIST');

-- Remove all Craigslist sources before narrowing the HomeSourceProvider enum.
DELETE FROM "home_source" WHERE "provider" = 'CRAIGSLIST';

-- AlterEnum
BEGIN;
CREATE TYPE "HomeSourceProvider_new" AS ENUM ('RSS');
ALTER TABLE "home_source" ALTER COLUMN "provider" TYPE "HomeSourceProvider_new" USING ("provider"::text::"HomeSourceProvider_new");
ALTER TYPE "HomeSourceProvider" RENAME TO "HomeSourceProvider_old";
ALTER TYPE "HomeSourceProvider_new" RENAME TO "HomeSourceProvider";
DROP TYPE "public"."HomeSourceProvider_old";
COMMIT;

-- AlterTable
ALTER TABLE "home_source" DROP COLUMN "category",
DROP COLUMN "region";
