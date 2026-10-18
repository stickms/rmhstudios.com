-- CreateTable
CREATE TABLE "ndw_livery" (
    "userId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ndw_livery_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ndw_livery" ADD CONSTRAINT "ndw_livery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

