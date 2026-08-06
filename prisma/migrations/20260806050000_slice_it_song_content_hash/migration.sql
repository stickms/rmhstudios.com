-- Slice It: duplicate-upload detection and a covering index for the library.
--
-- `contentHash` is the SHA-256 of a song's uploaded source bytes, taken before
-- transcoding so the same file hashes the same whether or not ffmpeg was
-- available. Re-uploading a track you already own used to create a second row
-- and a second copy in object storage, counted against both the global and the
-- per-account quota, with nothing in the library distinguishing the two.
--
-- Unique per uploader rather than globally: two people independently uploading
-- the same track is not an error, and deduping across accounts would let one
-- user's deletion take away another user's song. Postgres treats NULLs as
-- distinct in a unique index, so the rows that predate this column — which all
-- have NULL — do not collide with each other.
--
-- The index is for the library's default view (`isPublic = true ORDER BY
-- "createdAt" DESC`), which was a full scan and sort of the table on every open.
--
-- `IF NOT EXISTS` throughout so an environment already patched by `db push` is a
-- no-op rather than a failure.
--
-- migration-safety: acknowledged[create-index-not-concurrent] "Song" is the
-- user-uploaded track library — low thousands of rows at the 10 GB storage cap,
-- since a row is a whole audio file. Both indexes build in milliseconds, and
-- CREATE INDEX CONCURRENTLY cannot run inside the transaction Prisma wraps a
-- migration in, so taking it concurrently would mean splitting this into a
-- migration plus a manual step for a lock nobody would observe.

ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Song_uploadedBy_contentHash_key"
  ON "Song"("uploadedBy", "contentHash");

CREATE INDEX IF NOT EXISTS "Song_isPublic_createdAt_idx"
  ON "Song"("isPublic", "createdAt" DESC);
