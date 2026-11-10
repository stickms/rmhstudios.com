-- rmh:contract-ok the previous release (main @ 6c26b1d) has zero reads/writes of any table dropped here (no Prisma accessor, raw SQL, Go or script reference), so a rollback to it runs unchanged on this schema.
-- Drop 18 tables that no running code reads or writes (audit C3, owner decision
-- "completely drop unused or deprecated DB rows and/or tables").
--
-- Evidence per table (full table: docs/_generated/db-drop-candidates.md): zero
-- Prisma accessor uses (`<client>.<model>`), zero uses of the model's relation
-- fields from live models (include/select/nested create), zero raw-SQL / Go /
-- script references to the table name. Live-model changes are limited to
-- removing virtual back-relation fields (no column is dropped from any table
-- that survives).
--
--   referral_milestone, reading_room, quest_chain_progress, app_season_stat,
--   profile_block, creator_post, post_analytics_daily
--       Feature tables from the "next 100" batch (20260805150406) that never
--       got code.
--   march_signal, march_signal_vote
--       Async-games R18 idea (20261012102700); never got code.
--   SongRating, rmhtube_playlist, rmhtube_playlist_item, rmheet_view,
--   doctrine_sahur_participation
--       Marked "DEAD (rewrite R0-T7) ... Drop scheduled R1-T3" in the schema.
--       (doctrine_sahur_session stays: the Go doctrine worker uses it.)
--   ledger_artifact, ledger_plan_run, ledger_plan_step, ledger_step_input
--       Only user was go-services/internal/ledger, wired into no binary
--       (deleted in the same change).
--
-- Rows are not recoverable except from the nightly pg_dump.

-- DropForeignKey
ALTER TABLE "referral_milestone" DROP CONSTRAINT "referral_milestone_userId_fkey";

-- DropForeignKey
ALTER TABLE "reading_room" DROP CONSTRAINT "reading_room_hostId_fkey";

-- DropForeignKey
ALTER TABLE "doctrine_sahur_participation" DROP CONSTRAINT "doctrine_sahur_participation_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "doctrine_sahur_participation" DROP CONSTRAINT "doctrine_sahur_participation_userId_fkey";

-- DropForeignKey
ALTER TABLE "quest_chain_progress" DROP CONSTRAINT "quest_chain_progress_userId_fkey";

-- DropForeignKey
ALTER TABLE "SongRating" DROP CONSTRAINT "SongRating_songId_fkey";

-- DropForeignKey
ALTER TABLE "SongRating" DROP CONSTRAINT "SongRating_userId_fkey";

-- DropForeignKey
ALTER TABLE "app_season_stat" DROP CONSTRAINT "app_season_stat_userId_fkey";

-- DropForeignKey
ALTER TABLE "march_signal" DROP CONSTRAINT "march_signal_authorId_fkey";

-- DropForeignKey
ALTER TABLE "march_signal_vote" DROP CONSTRAINT "march_signal_vote_signalId_fkey";

-- DropForeignKey
ALTER TABLE "march_signal_vote" DROP CONSTRAINT "march_signal_vote_userId_fkey";

-- DropForeignKey
ALTER TABLE "profile_block" DROP CONSTRAINT "profile_block_userId_fkey";

-- DropForeignKey
ALTER TABLE "rmhtube_playlist" DROP CONSTRAINT "rmhtube_playlist_userId_fkey";

-- DropForeignKey
ALTER TABLE "rmhtube_playlist_item" DROP CONSTRAINT "rmhtube_playlist_item_playlistId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_plan_step" DROP CONSTRAINT "ledger_plan_step_runId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_plan_step" DROP CONSTRAINT "ledger_plan_step_outputArtifactId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_step_input" DROP CONSTRAINT "ledger_step_input_stepId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_step_input" DROP CONSTRAINT "ledger_step_input_artifactId_fkey";

-- DropForeignKey
ALTER TABLE "rmheet_view" DROP CONSTRAINT "rmheet_view_rmheetId_fkey";

-- DropForeignKey
ALTER TABLE "rmheet_view" DROP CONSTRAINT "rmheet_view_userId_fkey";

-- DropForeignKey
ALTER TABLE "creator_post" DROP CONSTRAINT "creator_post_authorId_fkey";

-- DropForeignKey
ALTER TABLE "creator_post" DROP CONSTRAINT "creator_post_minTierId_fkey";

-- DropForeignKey
ALTER TABLE "post_analytics_daily" DROP CONSTRAINT "post_analytics_daily_postId_fkey";

-- DropTable
DROP TABLE "referral_milestone";

-- DropTable
DROP TABLE "reading_room";

-- DropTable
DROP TABLE "doctrine_sahur_participation";

-- DropTable
DROP TABLE "quest_chain_progress";

-- DropTable
DROP TABLE "SongRating";

-- DropTable
DROP TABLE "app_season_stat";

-- DropTable
DROP TABLE "march_signal";

-- DropTable
DROP TABLE "march_signal_vote";

-- DropTable
DROP TABLE "profile_block";

-- DropTable
DROP TABLE "rmhtube_playlist";

-- DropTable
DROP TABLE "rmhtube_playlist_item";

-- DropTable
DROP TABLE "ledger_artifact";

-- DropTable
DROP TABLE "ledger_plan_run";

-- DropTable
DROP TABLE "ledger_plan_step";

-- DropTable
DROP TABLE "ledger_step_input";

-- DropTable
DROP TABLE "rmheet_view";

-- DropTable
DROP TABLE "creator_post";

-- DropTable
DROP TABLE "post_analytics_daily";

