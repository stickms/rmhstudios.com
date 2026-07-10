-- Developer API overhaul: scoped/expiring keys, idempotency, and webhooks.

-- ─── DeveloperApiKey: scopes, expiry, display suffix ───────────────────────
ALTER TABLE "developer_api_key"
  ADD COLUMN "lastFour" VARCHAR(8),
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "expiresAt" TIMESTAMP(3);

-- ─── Idempotency replay store ──────────────────────────────────────────────
CREATE TABLE "api_idempotency_key" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "idempotency" VARCHAR(255) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_idempotency_key_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_idempotency_key_keyId_idempotency_key" ON "api_idempotency_key"("keyId", "idempotency");
CREATE INDEX "api_idempotency_key_createdAt_idx" ON "api_idempotency_key"("createdAt");
ALTER TABLE "api_idempotency_key" ADD CONSTRAINT "api_idempotency_key_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "developer_api_key"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Webhooks ──────────────────────────────────────────────────────────────
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "secret" VARCHAR(128) NOT NULL,
    "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" VARCHAR(200),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "webhook_endpoint_userId_idx" ON "webhook_endpoint"("userId");
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "error" VARCHAR(500),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "webhook_delivery_status_nextAttemptAt_idx" ON "webhook_delivery"("status", "nextAttemptAt");
CREATE INDEX "webhook_delivery_endpointId_createdAt_idx" ON "webhook_delivery"("endpointId", "createdAt" DESC);
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
