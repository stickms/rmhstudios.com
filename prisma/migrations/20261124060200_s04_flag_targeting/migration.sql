-- Per-member targeting for feature flags: an allow list and a deny list of member ids on each flag row.
-- Read server-side only by lib/flags/flags.server.ts; additive columns with an empty default.

-- AlterTable
ALTER TABLE "feature_flag" ADD COLUMN     "allowUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "denyUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

