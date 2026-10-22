-- Once-per-week reputation decay guard: the Go doctrine worker stamps this in the
-- same UPDATE that decays a row and skips rows already stamped in the current ISO
-- week, so the hourly Monday ticks (and restarts / multiple supervisors) decay at
-- most once per week. Additive nullable column: metadata-only, no table rewrite.
ALTER TABLE "doctrine_reputation" ADD COLUMN IF NOT EXISTS "lastDecayedAt" TIMESTAMP(3);
