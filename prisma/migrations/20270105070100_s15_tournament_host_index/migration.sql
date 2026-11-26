-- Your tournaments (s15-14): the hosted half of GET /api/tournaments/mine filters tournament by "createdById" and
-- orders by ("createdAt" desc, id desc). Without this index that read seq-scans the whole table. Built CONCURRENTLY so
-- it never blocks tournament writes; that cannot run inside a multi-statement migration transaction, so this file holds
-- exactly ONE statement. The _ensure_valid migration repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tournament_createdById_createdAt_idx"
  ON "tournament" ("createdById", "createdAt");
