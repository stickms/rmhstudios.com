-- Glass clarity slider (§5.46): nullable stop 0-4 (null → 2 Default).
-- AlterTable
ALTER TABLE "appearance_preference" ADD COLUMN     "glassLevel" INTEGER;
