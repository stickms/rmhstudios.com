-- API key restrictions: an allowed-address list and an optional lower per-minute limit on
-- developer API keys, plus a per-key per-day count of requests refused by the list.
-- AlterTable
ALTER TABLE "developer_api_key" ADD COLUMN     "allowedCidrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rateLimitPerMinute" INTEGER;

-- CreateTable
CREATE TABLE "api_key_refusal_daily" (
    "keyId" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastPrefix" VARCHAR(64),

    CONSTRAINT "api_key_refusal_daily_pkey" PRIMARY KEY ("keyId","day")
);

-- AddForeignKey
ALTER TABLE "api_key_refusal_daily" ADD CONSTRAINT "api_key_refusal_daily_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "developer_api_key"("id") ON DELETE CASCADE ON UPDATE CASCADE;

