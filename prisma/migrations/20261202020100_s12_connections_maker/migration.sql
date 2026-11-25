-- s12 06: drafts, a publish time and an edit time on Connections grids. Additive only: the NOT NULL column has a default,
-- the other two are nullable, and no index is added (the existing authorId + createdAt index serves a member's list).
ALTER TABLE "connections_grid" ADD COLUMN "draft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "connections_grid" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "connections_grid" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Every grid that exists today is published.
UPDATE "connections_grid" SET "publishedAt" = "createdAt";
