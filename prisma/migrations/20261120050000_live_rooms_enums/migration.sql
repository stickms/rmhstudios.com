-- Expand step 1 of 2 for the one live room (Space folded into GroupCall).
--
-- The two enum values the copy in 20261120050100_live_rooms_expand writes. They
-- are their own migration because PostgreSQL will not let a transaction use an
-- enum value it added itself ("unsafe use of new value"), and a migration file
-- runs as one transaction.
--
-- Additive only: the previous release never meets these values (it reads the
-- space table, not group_call, for anything titled).

-- AlterEnum
ALTER TYPE "GroupCallOrigin" ADD VALUE IF NOT EXISTS 'PROFILE';

-- AlterEnum
ALTER TYPE "GroupCallStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
