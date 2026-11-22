-- The key and params of a site-written SYSTEM notice, so the inbox can render it in the reader's language (s09-19).
-- Two nullable columns without a default: no table rewrite. `preview` stays the English fallback; old rows keep it.

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "previewKey" VARCHAR(64),
ADD COLUMN     "previewParams" JSONB;
