-- CreateTable
CREATE TABLE "study_plan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "examDate" VARCHAR(10) NOT NULL,
    "topics" JSONB NOT NULL,
    "hoursByWeekday" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calc_notebook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calc_notebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marathon_list" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "items" JSONB NOT NULL,
    "deadline" VARCHAR(10) NOT NULL,
    "shareId" VARCHAR(24) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marathon_list_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_plan_userId_updatedAt_idx" ON "study_plan"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "calc_notebook_userId_updatedAt_idx" ON "calc_notebook"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "marathon_list_shareId_key" ON "marathon_list"("shareId");

-- CreateIndex
CREATE INDEX "marathon_list_userId_updatedAt_idx" ON "marathon_list"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "study_plan" ADD CONSTRAINT "study_plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calc_notebook" ADD CONSTRAINT "calc_notebook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marathon_list" ADD CONSTRAINT "marathon_list_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

