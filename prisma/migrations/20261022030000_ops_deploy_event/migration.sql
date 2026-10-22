-- Production deploy results, for deploy markers on the /admin/alarms graphs.
-- Additive only: a new, small table.

-- CreateTable
CREATE TABLE "ops_deploy_event" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sha" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "detail" VARCHAR(300),

    CONSTRAINT "ops_deploy_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ops_deploy_event_at_idx" ON "ops_deploy_event"("at");
