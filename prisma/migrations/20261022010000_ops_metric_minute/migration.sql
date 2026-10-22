-- One-minute rollups of app telemetry for /admin/alarms (graphs + threshold
-- alarms). Additive only: a new table, nothing existing changes.

-- CreateTable
CREATE TABLE "ops_metric_minute" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "metric" VARCHAR(60) NOT NULL,
    "dim" VARCHAR(80) NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "p50" DOUBLE PRECISION,
    "p95" DOUBLE PRECISION,
    "p99" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,

    CONSTRAINT "ops_metric_minute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ops_metric_minute_metric_dim_at_key" ON "ops_metric_minute"("metric", "dim", "at");

-- CreateIndex
CREATE INDEX "ops_metric_minute_at_idx" ON "ops_metric_minute"("at");
