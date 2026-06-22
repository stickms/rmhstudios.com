-- CreateTable
CREATE TABLE "image_gen_budget" (
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "image_gen_budget_pkey" PRIMARY KEY ("day")
);
