-- Your tournaments (s15-14): the entered half of GET /api/tournaments/mine (and GET /api/v1/me/tournaments) filters
-- tournament_entrant by "userId", which the ("tournamentId", "userId") unique cannot serve, so it seq-scanned the
-- table. Built CONCURRENTLY so it never blocks joins; that cannot run inside a multi-statement migration transaction,
-- so this file holds exactly ONE statement. The _ensure_valid migration repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tournament_entrant_userId_idx"
  ON "tournament_entrant" ("userId");
