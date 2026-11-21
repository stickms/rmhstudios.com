-- Tournament seeding: the method chosen for a tournament (default join = sign-up order, so old
-- tournaments are unchanged) and the host's hand order per entrant, both applied at start.

-- AlterTable
ALTER TABLE "tournament" ADD COLUMN     "seeding" VARCHAR(8) NOT NULL DEFAULT 'join';

-- AlterTable
ALTER TABLE "tournament_entrant" ADD COLUMN     "manualSeed" INTEGER;

