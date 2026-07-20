-- CreateTable
CREATE TABLE "layout_preference" (
    "userId" TEXT NOT NULL,
    "sidebar" JSONB NOT NULL DEFAULT '{}',
    "homeStack" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layout_preference_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "layout_preference" ADD CONSTRAINT "layout_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

