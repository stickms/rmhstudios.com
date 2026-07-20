-- CreateTable
CREATE TABLE "profile_layout" (
    "userId" TEXT NOT NULL,
    "modules" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_layout_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "profile_layout" ADD CONSTRAINT "profile_layout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

