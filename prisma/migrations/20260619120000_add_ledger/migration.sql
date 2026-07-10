CREATE TABLE "ledger_artifact" (
    "id"          TEXT    NOT NULL,
    "contentType" TEXT    NOT NULL,
    "sizeBytes"   BIGINT  NOT NULL,
    "storagePath" TEXT    NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_artifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_plan_run" (
    "id"          TEXT    NOT NULL,
    "bundleId"    TEXT    NOT NULL,
    "description" TEXT,
    "status"      TEXT    NOT NULL DEFAULT 'pending',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ledger_plan_run_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ledger_plan_run_bundleId_key" ON "ledger_plan_run"("bundleId");

CREATE TABLE "ledger_plan_step" (
    "id"               TEXT    NOT NULL,
    "runId"            TEXT    NOT NULL,
    "stepIndex"        INTEGER NOT NULL,
    "tool"             TEXT    NOT NULL,
    "toolVersion"      TEXT    NOT NULL,
    "imageDigest"      TEXT,
    "params"           JSONB   NOT NULL,
    "status"           TEXT    NOT NULL DEFAULT 'pending',
    "startedAt"        TIMESTAMP(3),
    "completedAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outputArtifactId" TEXT,
    CONSTRAINT "ledger_plan_step_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ledger_plan_step_runId_stepIndex_idx" ON "ledger_plan_step"("runId", "stepIndex");

CREATE TABLE "ledger_step_input" (
    "stepId"     TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "role"       TEXT NOT NULL,
    CONSTRAINT "ledger_step_input_pkey" PRIMARY KEY ("stepId", "artifactId")
);

ALTER TABLE "ledger_plan_step"
  ADD CONSTRAINT "ledger_plan_step_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ledger_plan_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledger_plan_step"
  ADD CONSTRAINT "ledger_plan_step_outputArtifactId_fkey"
  FOREIGN KEY ("outputArtifactId") REFERENCES "ledger_artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_step_input"
  ADD CONSTRAINT "ledger_step_input_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "ledger_plan_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledger_step_input"
  ADD CONSTRAINT "ledger_step_input_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "ledger_artifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
