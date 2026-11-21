-- RMHLadder offer comparison: the compensation actually offered on one application,
-- with revisions kept when amounts change (sprint 03, feature 17).
-- CreateTable
CREATE TABLE "ladder_offer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "basePay" BIGINT NOT NULL,
    "payPeriod" VARCHAR(6) NOT NULL,
    "hoursPerWeek" INTEGER,
    "bonusAmount" BIGINT,
    "bonusPercent" INTEGER,
    "signOn" BIGINT,
    "equityGrant" BIGINT,
    "equityYears" INTEGER,
    "equityNote" VARCHAR(300),
    "location" VARCHAR(120),
    "remote" VARCHAR(8),
    "ptoDays" INTEGER,
    "startDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "notes" VARCHAR(2000),
    "state" VARCHAR(10) NOT NULL DEFAULT 'open',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ladder_offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ladder_offer_applicationId_key" ON "ladder_offer"("applicationId");

-- CreateIndex
CREATE INDEX "ladder_offer_userId_idx" ON "ladder_offer"("userId");

-- AddForeignKey
ALTER TABLE "ladder_offer" ADD CONSTRAINT "ladder_offer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_offer" ADD CONSTRAINT "ladder_offer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ladder_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

