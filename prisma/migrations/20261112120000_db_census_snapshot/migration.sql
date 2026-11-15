-- The monthly table and product census for /admin/census (third-pass audit DT1). Additive only.

-- CreateTable
CREATE TABLE "db_census_snapshot" (
    "month" CHAR(7) NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "db_census_snapshot_pkey" PRIMARY KEY ("month")
);
