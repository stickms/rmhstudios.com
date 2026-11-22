-- An admin can take a community out of discovery (s10-17). Additive: three nullable columns.
ALTER TABLE "community" ADD COLUMN "delistedAt" TIMESTAMP(3),
ADD COLUMN "delistedReason" VARCHAR(300),
ADD COLUMN "delistedById" TEXT;
