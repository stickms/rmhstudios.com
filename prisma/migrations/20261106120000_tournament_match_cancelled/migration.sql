-- A tournament cancelled mid-event closes its unplayed matches (PENDING /
-- READY / LIVE) instead of leaving them open forever.
ALTER TYPE "TournamentMatchState" ADD VALUE 'CANCELLED';
