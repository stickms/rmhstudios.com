-- CreateEnum
CREATE TYPE "MedQaLimitStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'REVOKED');

-- CreateTable
CREATE TABLE "med_qa_limit_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MedQaLimitStatus" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "adminNote" VARCHAR(500) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "med_qa_limit_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "med_qa_limit_request_userId_createdAt_idx" ON "med_qa_limit_request"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "med_qa_limit_request_status_createdAt_idx" ON "med_qa_limit_request"("status", "createdAt");

-- One open request and one live grant per member. Prisma cannot express a partial unique index, so it is written here
-- (the pattern of card_buy_order_one_open_per_card); the schema comment on the model names them.
CREATE UNIQUE INDEX "med_qa_limit_request_one_pending" ON "med_qa_limit_request"("userId") WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "med_qa_limit_request_one_approved" ON "med_qa_limit_request"("userId") WHERE "status" = 'APPROVED';

-- AddForeignKey
ALTER TABLE "med_qa_limit_request" ADD CONSTRAINT "med_qa_limit_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
