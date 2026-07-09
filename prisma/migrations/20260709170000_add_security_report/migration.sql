-- CreateEnum
CREATE TYPE "SecurityReportStatus" AS ENUM ('NEW', 'TRIAGING', 'ACCEPTED', 'RESOLVED', 'DUPLICATE', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "security_report" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "affectedArea" TEXT,
    "description" TEXT NOT NULL,
    "reporterName" TEXT,
    "reporterEmail" TEXT,
    "status" "SecurityReportStatus" NOT NULL DEFAULT 'NEW',
    "adminNotes" TEXT,
    "userId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_report_status_createdAt_idx" ON "security_report"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "security_report_userId_idx" ON "security_report"("userId");
