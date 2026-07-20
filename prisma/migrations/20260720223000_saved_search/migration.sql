-- CreateTable
CREATE TABLE "saved_search" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" VARCHAR(200) NOT NULL,
    "types" JSONB NOT NULL DEFAULT '[]',
    "alerts" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_search_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_search_userId_idx" ON "saved_search"("userId");

-- AddForeignKey
ALTER TABLE "saved_search" ADD CONSTRAINT "saved_search_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

