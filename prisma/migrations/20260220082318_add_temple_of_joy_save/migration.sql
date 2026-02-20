-- CreateTable
CREATE TABLE "temple_of_joy_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temple_of_joy_save_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "temple_of_joy_save_userId_key" ON "temple_of_joy_save"("userId");

-- AddForeignKey
ALTER TABLE "temple_of_joy_save" ADD CONSTRAINT "temple_of_joy_save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
