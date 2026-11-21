-- Admin lookup (s05-10): the audit page filters by "targetId" alone, which the (targetType, targetId) index cannot serve.
-- Built CONCURRENTLY so it never blocks audit writes; that cannot run inside a multi-statement migration transaction,
-- so this file holds exactly ONE statement. The _ensure_valid migration repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "admin_audit_log_targetId_idx"
  ON "admin_audit_log" ("targetId");
