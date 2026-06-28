-- RMH Farming Simulator — one persistent farm per user, stored as a JSON save
-- blob plus an indexed, shareable join code so players can return to their
-- farms (and rejoin others) across server restarts.

-- CreateTable
CREATE TABLE "farming_sim_farm" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "shippedValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farming_sim_farm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farming_sim_farm_ownerId_key" ON "farming_sim_farm"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "farming_sim_farm_code_key" ON "farming_sim_farm"("code");

-- AddForeignKey
ALTER TABLE "farming_sim_farm" ADD CONSTRAINT "farming_sim_farm_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
