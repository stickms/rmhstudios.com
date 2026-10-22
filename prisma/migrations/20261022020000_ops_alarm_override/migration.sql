-- Admin overrides of the metric alarm rules in lib/ops/alarm-rules.ts.
-- Additive only: a new, small table.

-- CreateTable
CREATE TABLE "ops_alarm_override" (
    "key" VARCHAR(160) NOT NULL,
    "threshold" DOUBLE PRECISION,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_alarm_override_pkey" PRIMARY KEY ("key")
);
