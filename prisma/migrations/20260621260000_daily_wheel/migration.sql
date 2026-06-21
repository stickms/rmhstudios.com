-- CreateTable
CREATE TABLE "daily_wheel_spin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" VARCHAR(16) NOT NULL,
    "reward" INTEGER NOT NULL,
    "segment" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_wheel_spin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "daily_wheel_spin_userId_dateKey_key" ON "daily_wheel_spin"("userId", "dateKey");
CREATE INDEX "daily_wheel_spin_userId_idx" ON "daily_wheel_spin"("userId");
ALTER TABLE "daily_wheel_spin" ADD CONSTRAINT "daily_wheel_spin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
